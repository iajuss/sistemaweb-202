import { Prisma, PrismaClient, type SourceStatus } from "@prisma/client";

import type { AuthorizedOperation } from "@panella/application";

import type { VerifiedPrincipal } from "../identity-middleware.js";
import type { CpfCryptoService } from "../kms.js";
import {
  assertActionableReadOperation,
  assertAuditReadOperation,
  assertReadOperation,
  assertWalletImportOperation,
} from "./tenant-repository.js";
import type {
  StoredImportAudit,
  StoredTitle,
  UpsertOutcome,
} from "./wallet-store.js";

/**
 * The Prisma side of the wallet. Same authority pattern as the observation
 * repository: factory issuance checked per call, `#` fields, frozen prototypes
 * and frozen instances. What changes against the in-memory store of Task 4 is
 * where the guarantees live — idempotence is a unique index, tenant isolation
 * is an RLS policy, and the import audit is append-only because the
 * application role holds no UPDATE or DELETE on that table.
 */

export interface StoredObservation {
  readonly id: string;
  readonly tenantId: string;
  readonly debtorId: string;
  readonly source: string;
  readonly sliceId: string;
  readonly status:
    | "ENCONTRADO"
    | "NAO_ENCONTRADO"
    | "NAO_CONSULTADO"
    | "ERRO_NA_FONTE";
  readonly queryParams: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly collectedAt: Date;
  readonly referenceDate: Date | null;
}

const walletStoreAuthority = Object.freeze({});
const factoryIssued = new WeakSet<object>();

function assertFactoryIssued(candidate: object): void {
  if (!factoryIssued.has(candidate)) {
    throw new Error("PRISMA_REPOSITORY_CONSTRUCTION_FORBIDDEN");
  }
}

function assertAuthority(authority: object): void {
  if (authority !== walletStoreAuthority) {
    throw new Error("PRISMA_REPOSITORY_CONSTRUCTION_FORBIDDEN");
  }
}

function assertTenantScope(tenantId: string, contextTenantId: string): void {
  if (tenantId !== contextTenantId) {
    throw new Error("TENANT_SCOPE_MISMATCH");
  }
}

function toJsonInput(
  value: Readonly<Record<string, unknown>>,
): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function fromJsonObject(
  value: Prisma.JsonValue,
): Readonly<Record<string, unknown>> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("INVALID_OBSERVATION_JSON");
  }
  return value;
}

interface ApplicationDatabaseRole {
  readonly isSuperuser: boolean;
  readonly canBypassRls: boolean;
}

/**
 * Every statement runs inside a transaction that first pins `app.tenant_id`
 * and then proves the connected role cannot bypass RLS. The order matters: a
 * query issued before `set_config` runs with no tenant pinned at all.
 */
async function inTenantTransaction<Result>(
  client: PrismaClient,
  tenantId: string,
  body: (transaction: Prisma.TransactionClient) => Promise<Result>,
): Promise<Result> {
  return client.$transaction(async (transaction) => {
    await transaction.$queryRawUnsafe(
      "SELECT set_config('app.tenant_id', $1, true)",
      tenantId,
    );
    const roles = await transaction.$queryRaw<ApplicationDatabaseRole[]>`
      SELECT rol.rolsuper AS "isSuperuser", rol.rolbypassrls AS "canBypassRls"
      FROM pg_roles rol
      WHERE rol.rolname = current_user
    `;
    const role = roles[0];
    if (!role || role.isSuperuser || role.canBypassRls) {
      throw new Error("APPLICATION_DATABASE_ROLE_MUST_ENFORCE_RLS");
    }
    return body(transaction);
  });
}

export class PrismaWalletTitleRepository {
  readonly #client: PrismaClient;
  readonly #crypto: CpfCryptoService;

  public constructor(
    authority: object,
    client: PrismaClient,
    crypto: CpfCryptoService,
  ) {
    assertAuthority(authority);
    this.#client = client;
    this.#crypto = crypto;
    Object.freeze(this);
    factoryIssued.add(this);
  }

  public async upsertByExternalId(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    title: StoredTitle,
  ): Promise<UpsertOutcome> {
    assertFactoryIssued(this);
    const context = assertWalletImportOperation(principal, operation);
    assertTenantScope(title.tenantId, context.tenantId);
    if (title.walletId !== operation.walletId) {
      throw new Error("WALLET_SCOPE_MISMATCH");
    }

    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      // Keyed on the external title id under a real unique index: three
      // instalments of one person are three titles, and a re-import lands on
      // the same rows without a read-before-write.
      const existing = await tx.title.findFirst({
        where: {
          tenantId: title.tenantId,
          walletId: title.walletId,
          externalId: title.externalId,
        },
        select: { id: true },
      });

      await tx.title.upsert({
        where: {
          tenantId_walletId_externalId: {
            tenantId: title.tenantId,
            walletId: title.walletId,
            externalId: title.externalId,
          },
        },
        create: {
          id: title.id,
          tenantId: title.tenantId,
          walletId: title.walletId,
          debtorId: title.debtorId,
          externalId: title.externalId,
          name: title.name,
          amountCents: title.amountCents,
          dueDate: title.dueDate,
        },
        update: {
          debtorId: title.debtorId,
          name: title.name,
          amountCents: title.amountCents,
          dueDate: title.dueDate,
        },
      });

      return existing ? "ATUALIZADO" : "CRIADO";
    });
  }

  public async listByWallet(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
  ): Promise<readonly StoredTitle[]> {
    assertFactoryIssued(this);
    const context = assertActionableReadOperation(principal, operation);
    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      const rows = await tx.title.findMany({
        where: { tenantId: context.tenantId, walletId: operation.walletId },
        orderBy: { externalId: "asc" },
      });
      // RLS is the second barrier and never the only one (ADR 020).
      return rows
        .filter((row) => row.tenantId === context.tenantId)
        .map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          walletId: row.walletId,
          debtorId: row.debtorId,
          externalId: row.externalId,
          name: row.name,
          amountCents: row.amountCents,
          dueDate: row.dueDate,
        }));
    });
  }

  /**
   * The only handle the agent-facing read path holds. It is the external title
   * id and never a CPF, so a caller can only ask about a title the client
   * already imported.
   *
   * Scoped to the wallet as well as the tenant: two wallets of one tenant sit
   * on the same side of RLS, so the wallet check is the application's and may
   * never be delegated to the policy standing behind it (ADR 020).
   */
  public async findDebtorByExternalId(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    externalId: string,
  ): Promise<string | null> {
    assertFactoryIssued(this);
    const context = assertReadOperation(principal, operation);
    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      const title = await tx.title.findFirst({
        where: {
          tenantId: context.tenantId,
          walletId: operation.walletId,
          externalId,
        },
        select: { debtorId: true, tenantId: true },
      });
      // The wallet scope is in the query above and stated once: a second copy
      // here would mean neither could be knocked down by a test, and a guard
      // no test can falsify is a false guarantee (defect I-4). RLS remains the
      // second barrier for the tenant, never the only one.
      if (!title || title.tenantId !== context.tenantId) {
        return null;
      }
      return title.debtorId;
    });
  }

  /**
   * The wallet-scoped debtor lookup the dossier composition needs. A debtor
   * absent from this wallet has no answer: the wallet is what authorizes the
   * read, and holding a capability for it is not holding one for the tenant.
   */
  /**
   * The debtor's name, and deliberately nothing else.
   *
   * `findInWallet` decrypts the CPF and therefore demands `READ_DOSSIER`; the
   * operational screen holds `READ_ACTIONABLE` and has no business decrypting
   * anything. The CPF exists for the matcher and a screen is not the matcher,
   * so this reads the name off the wallet's own titles and never touches the
   * debtor row. A page cannot leak a document it was never handed.
   */
  public async findNameInWallet(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    debtorId: string,
  ): Promise<string | null> {
    assertFactoryIssued(this);
    const context = assertActionableReadOperation(principal, operation);
    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      const title = await tx.title.findFirst({
        where: {
          tenantId: context.tenantId,
          walletId: operation.walletId,
          debtorId,
        },
        select: { name: true, tenantId: true },
      });
      // RLS is the second barrier and never the only one (ADR 020).
      return title && title.tenantId === context.tenantId ? title.name : null;
    });
  }

  public async findInWallet(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    debtorId: string,
  ): Promise<{
    readonly debtorId: string;
    readonly name: string;
    readonly cpf: string;
  } | null> {
    assertFactoryIssued(this);
    const context = assertReadOperation(principal, operation);
    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      const title = await tx.title.findFirst({
        where: {
          tenantId: context.tenantId,
          walletId: operation.walletId,
          debtorId,
        },
        select: { name: true, tenantId: true },
      });
      if (!title || title.tenantId !== context.tenantId) {
        return null;
      }

      const debtor = await tx.debtor.findFirst({
        where: { tenantId: context.tenantId, id: debtorId },
      });
      if (!debtor || debtor.tenantId !== context.tenantId) {
        return null;
      }

      return {
        debtorId,
        name: title.name,
        cpf: await this.#decryptCpf(debtor),
      };
    });
  }

  async #decryptCpf(debtor: {
    id: string;
    tenantId: string;
    cpfCiphertext: Uint8Array;
    cpfIv: Uint8Array;
    cpfAuthTag: Uint8Array;
    cpfHmac: string;
    hmacKeyReference: string;
    keyReference: string;
    createdAt: Date;
  }): Promise<string> {
    return this.#crypto.decryptCpf({
      tenantId: debtor.tenantId,
      debtorId: debtor.id,
      ciphertext: Buffer.from(debtor.cpfCiphertext).toString("base64"),
      iv: Buffer.from(debtor.cpfIv).toString("base64"),
      authTag: Buffer.from(debtor.cpfAuthTag).toString("base64"),
      keyReference: debtor.keyReference,
      cpfHmac: debtor.cpfHmac,
      hmacKeyReference: debtor.hmacKeyReference,
      audit: {
        pseudonymousDebtorId: debtor.id,
        tenantId: debtor.tenantId,
        retainedAt: debtor.createdAt.toISOString(),
        reason: "TITULAR_REQUEST",
      },
    });
  }
}
Object.freeze(PrismaWalletTitleRepository.prototype);

export class PrismaDebtorRepository {
  readonly #client: PrismaClient;
  readonly #crypto: CpfCryptoService;

  public constructor(
    authority: object,
    client: PrismaClient,
    crypto: CpfCryptoService,
  ) {
    assertAuthority(authority);
    this.#client = client;
    this.#crypto = crypto;
    Object.freeze(this);
    factoryIssued.add(this);
  }

  public async resolveByCpf(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    cpf: string,
  ): Promise<string> {
    assertFactoryIssued(this);
    const context = assertWalletImportOperation(principal, operation);

    // The HMAC is what the query carries. The CPF itself never reaches a
    // statement parameter, a log line or an error message.
    const cpfIndex = await this.#crypto.indexCpf(cpf, context.tenantId);
    const debtorId = `debtor-${cpfIndex.slice(0, 32)}`;

    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      const existing = await tx.debtor.findFirst({
        where: { tenantId: context.tenantId, cpfHmac: cpfIndex },
        select: { id: true },
      });
      if (existing) {
        return existing.id;
      }

      const encrypted = await this.#crypto.encryptCpf(
        cpf,
        { tenantId: context.tenantId, debtorId },
        {
          pseudonymousDebtorId: debtorId,
          tenantId: context.tenantId,
          retainedAt: new Date().toISOString(),
          reason: "TITULAR_REQUEST",
        },
      );

      await tx.debtor.create({
        data: {
          id: debtorId,
          tenantId: context.tenantId,
          cpfCiphertext: Buffer.from(encrypted.ciphertext, "base64"),
          cpfIv: Buffer.from(encrypted.iv, "base64"),
          cpfAuthTag: Buffer.from(encrypted.authTag, "base64"),
          cpfHmac: encrypted.cpfHmac,
          hmacKeyReference: encrypted.hmacKeyReference,
          keyReference: encrypted.keyReference,
        },
      });
      return debtorId;
    });
  }
}
Object.freeze(PrismaDebtorRepository.prototype);

export class PrismaImportAuditRepository {
  readonly #client: PrismaClient;

  public constructor(authority: object, client: PrismaClient) {
    assertAuthority(authority);
    this.#client = client;
    Object.freeze(this);
    factoryIssued.add(this);
  }

  public async record(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    entry: StoredImportAudit,
  ): Promise<void> {
    assertFactoryIssued(this);
    const context = assertWalletImportOperation(principal, operation);
    assertTenantScope(entry.tenantId, context.tenantId);

    await inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      // Insert only. The role holds no UPDATE and no DELETE on this table, so
      // append-only survives a repository that forgets it.
      await tx.walletImport.create({
        data: {
          id: entry.importId,
          tenantId: entry.tenantId,
          walletId: entry.walletId,
          actorId: entry.actorId,
          fileHash: entry.fileHash,
          importedAt: new Date(entry.importedAt),
          acceptedRows: entry.acceptedRows,
          quarantinedRows: entry.quarantinedRows,
          quarantineReasons: toJsonInput(entry.quarantineReasons),
        },
      });
    });
  }

  public async listByWallet(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
  ): Promise<readonly StoredImportAudit[]> {
    assertFactoryIssued(this);
    const context = assertAuditReadOperation(principal, operation);
    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      const rows = await tx.walletImport.findMany({
        where: { tenantId: context.tenantId, walletId: operation.walletId },
        orderBy: { importedAt: "asc" },
      });
      return rows
        .filter((row) => row.tenantId === context.tenantId)
        .map((row) => ({
          importId: row.id,
          tenantId: row.tenantId,
          walletId: row.walletId,
          actorId: row.actorId,
          fileHash: row.fileHash,
          importedAt: row.importedAt.toISOString(),
          acceptedRows: row.acceptedRows,
          quarantinedRows: row.quarantinedRows,
          quarantineReasons: fromJsonObject(row.quarantineReasons) as Readonly<
            Record<string, number>
          >,
        }));
    });
  }
}
Object.freeze(PrismaImportAuditRepository.prototype);

/**
 * Observations are tenant + debtor facts with no `walletId` (ADR 020). The
 * wallet authorizes the read through its current link with the debtor, which
 * the caller has already established; nothing about the wallet is written into
 * the fact.
 */
export class PrismaDebtorObservationRepository {
  readonly #client: PrismaClient;

  public constructor(authority: object, client: PrismaClient) {
    assertAuthority(authority);
    this.#client = client;
    Object.freeze(this);
    factoryIssued.add(this);
  }

  public async save(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    value: StoredObservation,
  ): Promise<void> {
    assertFactoryIssued(this);
    const context = assertWalletImportOperation(principal, operation);
    assertTenantScope(value.tenantId, context.tenantId);

    await inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      await tx.observation.upsert({
        where: { id: value.id },
        create: {
          id: value.id,
          tenantId: value.tenantId,
          debtorId: value.debtorId,
          source: value.source,
          sliceId: value.sliceId,
          status: value.status as SourceStatus,
          queryParams: toJsonInput(value.queryParams),
          payload: value.payload ? toJsonInput(value.payload) : Prisma.JsonNull,
          collectedAt: value.collectedAt,
          referenceDate: value.referenceDate,
        },
        // An observation is an immutable fact: re-reading a slice produces a
        // new one, it does not rewrite the old.
        update: {},
      });
    });
  }

  public async listForDebtor(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    debtorId: string,
  ): Promise<readonly StoredObservation[]> {
    assertFactoryIssued(this);
    const context = assertReadOperation(principal, operation);
    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      const rows = await tx.observation.findMany({
        where: { tenantId: context.tenantId, debtorId },
        orderBy: [{ source: "asc" }, { sliceId: "asc" }],
      });
      return rows
        .filter((row) => row.tenantId === context.tenantId)
        .map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          debtorId: row.debtorId,
          source: row.source,
          sliceId: row.sliceId,
          status: row.status,
          queryParams: fromJsonObject(row.queryParams),
          payload: row.payload === null ? null : fromJsonObject(row.payload),
          collectedAt: row.collectedAt,
          referenceDate: row.referenceDate,
        }));
    });
  }
}
Object.freeze(PrismaDebtorObservationRepository.prototype);

export interface StoredTenantTheme {
  readonly nomeDoProduto: string;
  readonly corPrimaria: string;
  readonly corSecundaria: string;
  readonly marca: string;
}

function readThemeString(
  theme: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = theme[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * White label is a tenant fact, so it is read from the tenant row like any
 * other. There is deliberately no default product name, colour or mark here:
 * a fallback would be developer branding with extra steps, and the invariant
 * is that none exists anywhere. A tenant with no theme configured reads
 * `null`, and the delivery layer refuses to render rather than inventing one.
 */
export class PrismaTenantThemeRepository {
  readonly #client: PrismaClient;

  public constructor(authority: object, client: PrismaClient) {
    assertAuthority(authority);
    this.#client = client;
    Object.freeze(this);
    factoryIssued.add(this);
  }

  public async read(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
  ): Promise<StoredTenantTheme | null> {
    assertFactoryIssued(this);
    const context = assertActionableReadOperation(principal, operation);
    return inTenantTransaction(this.#client, context.tenantId, async (tx) => {
      const row = await tx.tenant.findFirst({
        where: { id: context.tenantId },
        select: { id: true, theme: true },
      });
      // RLS is the second barrier and never the only one (ADR 020).
      if (!row || row.id !== context.tenantId || row.theme === null) {
        return null;
      }

      const theme = fromJsonObject(row.theme);
      const nomeDoProduto = readThemeString(theme, "nome_do_produto");
      const corPrimaria = readThemeString(theme, "cor_primaria");
      const corSecundaria = readThemeString(theme, "cor_secundaria");
      const marca = readThemeString(theme, "marca");
      if (!nomeDoProduto || !corPrimaria || !corSecundaria || !marca) {
        return null;
      }

      return Object.freeze({
        nomeDoProduto,
        corPrimaria,
        corSecundaria,
        marca,
      });
    });
  }
}
Object.freeze(PrismaTenantThemeRepository.prototype);

export interface PrismaWalletStoreBundle {
  readonly titles: PrismaWalletTitleRepository;
  readonly debtors: PrismaDebtorRepository;
  readonly imports: PrismaImportAuditRepository;
  readonly observations: PrismaDebtorObservationRepository;
  readonly theme: PrismaTenantThemeRepository;
  disconnect(): Promise<void>;
}

/**
 * Takes the crypto service and nothing else. There is deliberately no
 * datasource parameter: a caller-supplied connection string walks around the
 * whole authority apparatus, since the returned repositories would be
 * factory-issued and fully functional while pointing at a database where no
 * tenant policy applies. The connection string comes from configuration.
 */
export function createPrismaWalletStore(
  crypto: CpfCryptoService,
): PrismaWalletStoreBundle {
  const client = new PrismaClient();
  return Object.freeze({
    titles: new PrismaWalletTitleRepository(
      walletStoreAuthority,
      client,
      crypto,
    ),
    debtors: new PrismaDebtorRepository(walletStoreAuthority, client, crypto),
    imports: new PrismaImportAuditRepository(walletStoreAuthority, client),
    observations: new PrismaDebtorObservationRepository(
      walletStoreAuthority,
      client,
    ),
    theme: new PrismaTenantThemeRepository(walletStoreAuthority, client),
    disconnect: () => client.$disconnect(),
  });
}
