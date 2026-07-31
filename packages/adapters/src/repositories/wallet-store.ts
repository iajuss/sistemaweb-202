import type { AuthorizedOperation } from "@panella/application";

import type { VerifiedPrincipal } from "../identity-middleware.js";
import { createInMemoryCpfCrypto, type CpfCryptoService } from "../kms.js";
import {
  assertActionableReadOperation,
  assertAuditReadOperation,
  assertWalletImportOperation,
} from "./tenant-repository.js";

/**
 * A stored title. The CPF is not here and never will be: the debtor emerges
 * from aggregation and the CPF lives encrypted in the debtor record, reachable
 * only through the crypto service.
 */
export interface StoredTitle {
  readonly id: string;
  readonly tenantId: string;
  readonly walletId: string;
  readonly debtorId: string;
  readonly externalId: string;
  readonly name: string;
  readonly amountCents: bigint;
  readonly dueDate: Date;
}

export interface StoredImportAudit {
  readonly importId: string;
  readonly tenantId: string;
  readonly walletId: string;
  readonly actorId: string;
  readonly fileHash: string;
  readonly importedAt: string;
  readonly acceptedRows: number;
  readonly quarantinedRows: number;
  readonly quarantineReasons: Readonly<Record<string, number>>;
}

export type UpsertOutcome = "CRIADO" | "ATUALIZADO";

function scopedKey(tenantId: string, walletId: string, externalId: string): string {
  // Length-prefixed so `a|b` and `a|` + `b` cannot collide into one title.
  return `${tenantId.length}:${tenantId}|${walletId.length}:${walletId}|${externalId}`;
}

function assertTenantScope(tenantId: string, contextTenantId: string): void {
  if (tenantId !== contextTenantId) {
    throw new Error("TENANT_SCOPE_MISMATCH");
  }
}

export class InMemoryWalletTitleRepository {
  readonly #titles = new Map<string, StoredTitle>();

  public constructor() {
    Object.freeze(this);
  }

  public async upsertByExternalId(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    title: StoredTitle,
  ): Promise<UpsertOutcome> {
    const context = assertWalletImportOperation(principal, operation);
    assertTenantScope(title.tenantId, context.tenantId);
    if (title.walletId !== operation.walletId) {
      throw new Error("WALLET_SCOPE_MISMATCH");
    }

    // Keyed on the external title id, never on the debtor: three instalments
    // of one person are three titles, not one overwritten three times.
    const key = scopedKey(title.tenantId, title.walletId, title.externalId);
    const existed = this.#titles.has(key);
    this.#titles.set(key, title);
    return existed ? "ATUALIZADO" : "CRIADO";
  }

  public async listByWallet(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
  ): Promise<readonly StoredTitle[]> {
    const context = assertActionableReadOperation(principal, operation);
    return [...this.#titles.values()].filter(
      (title) =>
        title.tenantId === context.tenantId &&
        title.walletId === operation.walletId,
    );
  }
}
Object.freeze(InMemoryWalletTitleRepository.prototype);

/**
 * Turns a CPF into a debtor id without ever storing the CPF in the clear. The
 * HMAC index is what deduplicates; the ciphertext is what operations decrypt.
 */
export class InMemoryDebtorRepository {
  readonly #debtorIdByIndex = new Map<string, string>();
  readonly #crypto: CpfCryptoService;

  public constructor(crypto: CpfCryptoService) {
    this.#crypto = crypto;
    Object.freeze(this);
  }

  public async resolveByCpf(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    cpf: string,
  ): Promise<string> {
    const context = assertWalletImportOperation(principal, operation);
    const cpfIndex = await this.#crypto.indexCpf(cpf, context.tenantId);
    const key = `${context.tenantId.length}:${context.tenantId}|${cpfIndex}`;

    const existing = this.#debtorIdByIndex.get(key);
    if (existing) {
      return existing;
    }

    // Derived from the index, so the same person imported twice is one debtor
    // without a lookup round trip, and the id itself reveals no CPF.
    const debtorId = `debtor-${cpfIndex.slice(0, 32)}`;
    await this.#crypto.encryptCpf(
      cpf,
      { tenantId: context.tenantId, debtorId },
      {
        pseudonymousDebtorId: debtorId,
        tenantId: context.tenantId,
        retainedAt: new Date().toISOString(),
        reason: "TITULAR_REQUEST",
      },
    );
    this.#debtorIdByIndex.set(key, debtorId);
    return debtorId;
  }
}
Object.freeze(InMemoryDebtorRepository.prototype);

export class InMemoryImportAuditRepository {
  readonly #entries: StoredImportAudit[] = [];

  public constructor() {
    Object.freeze(this);
  }

  public async record(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    entry: StoredImportAudit,
  ): Promise<void> {
    const context = assertWalletImportOperation(principal, operation);
    assertTenantScope(entry.tenantId, context.tenantId);
    // Append only: an import that happened cannot stop having happened.
    this.#entries.push(entry);
  }

  public async listByWallet(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
  ): Promise<readonly StoredImportAudit[]> {
    const context = assertAuditReadOperation(principal, operation);
    return this.#entries.filter(
      (entry) =>
        entry.tenantId === context.tenantId &&
        entry.walletId === operation.walletId,
    );
  }
}
Object.freeze(InMemoryImportAuditRepository.prototype);

export interface InMemoryWalletStore {
  readonly titles: InMemoryWalletTitleRepository;
  readonly debtors: InMemoryDebtorRepository;
  readonly imports: InMemoryImportAuditRepository;
}

export function createInMemoryWalletStore(
  crypto: CpfCryptoService = createInMemoryCpfCrypto(),
): InMemoryWalletStore {
  return Object.freeze({
    titles: new InMemoryWalletTitleRepository(),
    debtors: new InMemoryDebtorRepository(crypto),
    imports: new InMemoryImportAuditRepository(),
  });
}
