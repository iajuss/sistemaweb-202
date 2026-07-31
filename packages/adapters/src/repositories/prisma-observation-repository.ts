import {
  Prisma,
  PrismaClient,
  type SourceStatus,
} from "@prisma/client";

import {
  TransactionalTenantScopedRepository,
  assertReadOperation,
  type TenantRecord,
  type TenantTransaction,
  type TenantTransactionDatabase,
} from "./tenant-repository.js";

export interface ObservationPersistenceRecord extends TenantRecord {
  readonly debtorId: string;
  readonly source: string;
  /** Which slice of the source the query covered (ADR 014). */
  readonly sliceId: string;
  readonly status:
    | "ENCONTRADO"
    | "NAO_ENCONTRADO"
    | "NAO_CONSULTADO"
    | "ERRO_NA_FONTE";
  readonly queryParams: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly collectedAt: Date;
  /** Publication reference, where the source has one. */
  readonly referenceDate: Date | null;
}

interface ApplicationDatabaseRole {
  readonly isSuperuser: boolean;
  readonly canBypassRls: boolean;
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

class PrismaObservationTransaction
  implements TenantTransaction<ObservationPersistenceRecord>
{
  public constructor(private readonly transaction: Prisma.TransactionClient) {}

  public async assertApplicationRole(): Promise<void> {
    const roles = await this.transaction.$queryRaw<ApplicationDatabaseRole[]>`
      SELECT
        rol.rolsuper AS "isSuperuser",
        rol.rolbypassrls AS "canBypassRls"
      FROM pg_roles rol
      WHERE rol.rolname = current_user
    `;
    const role = roles[0];
    if (!role || role.isSuperuser || role.canBypassRls) {
      throw new Error("APPLICATION_DATABASE_ROLE_MUST_ENFORCE_RLS");
    }
  }

  public async setLocalTenant(tenantId: string): Promise<void> {
    await this.transaction.$queryRawUnsafe(
      "SELECT set_config('app.tenant_id', $1, true)",
      tenantId,
    );
  }

  public async save(value: ObservationPersistenceRecord): Promise<void> {
    await this.transaction.observation.upsert({
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
      update: {},
    });
  }

  public async find(id: string): Promise<ObservationPersistenceRecord | null> {
    const record = await this.transaction.observation.findUnique({ where: { id } });
    return record ? toObservationPersistenceRecord(record) : null;
  }

  /**
   * An observation is tenant+debtor data. A wallet authorizes exposure only
   * when it currently contains the debtor through at least one title.
   */
  public async findAuthorized(
    id: string,
    walletId: string,
  ): Promise<ObservationPersistenceRecord | null> {
    const record = await this.transaction.observation.findFirst({
      where: {
        id,
        debtor: { titles: { some: { walletId } } },
      },
    });
    return record ? toObservationPersistenceRecord(record) : null;
  }
}

function toObservationPersistenceRecord(record: {
  id: string;
  tenantId: string;
  debtorId: string;
  source: string;
  sliceId: string;
  status: SourceStatus;
  queryParams: Prisma.JsonValue;
  payload: Prisma.JsonValue | null;
  collectedAt: Date;
  referenceDate: Date | null;
}): ObservationPersistenceRecord {
  return {
    id: record.id,
    tenantId: record.tenantId,
    debtorId: record.debtorId,
    source: record.source,
    sliceId: record.sliceId,
    status: record.status,
    queryParams: fromJsonObject(record.queryParams),
    payload: record.payload === null ? null : fromJsonObject(record.payload),
    collectedAt: record.collectedAt,
    referenceDate: record.referenceDate,
  };
}

class PrismaObservationDatabase
  implements TenantTransactionDatabase<ObservationPersistenceRecord>
{
  public constructor(private readonly client: PrismaClient) {}

  public async transaction<Result>(
    operation: (
      transaction: TenantTransaction<ObservationPersistenceRecord>,
    ) => Promise<Result>,
  ): Promise<Result> {
    return this.client.$transaction((transaction) =>
      operation(new PrismaObservationTransaction(transaction)),
    );
  }

  public async findAuthorized(
    tenantId: string,
    walletId: string,
    id: string,
  ): Promise<ObservationPersistenceRecord | null> {
    return this.client.$transaction(async (transaction) => {
      const observationTransaction = new PrismaObservationTransaction(transaction);
      await observationTransaction.setLocalTenant(tenantId);
      await observationTransaction.assertApplicationRole();
      return observationTransaction.findAuthorized(id, walletId);
    });
  }
}

const repositoryConstructionAuthority = Object.freeze({});
const factoryIssuedRepositories =
  new WeakSet<PrismaAuthorizedObservationRepository>();

/**
 * Per-call authority. The constructor alone is not a trust boundary: an
 * `Object.create(prototype)` instance never runs it, so every data path
 * checks membership instead of trusting that construction happened.
 */
function assertFactoryIssuedRepository(candidate: unknown): void {
  if (!factoryIssuedRepositories.has(candidate as never)) {
    throw new Error("PRISMA_REPOSITORY_CONSTRUCTION_FORBIDDEN");
  }
}

export class PrismaAuthorizedObservationRepository {
  /**
   * ECMAScript `#` fields, not TypeScript `private`. `private` is erased at
   * runtime and leaves own properties on the object the factory hands out:
   * `writer` reaches a `find` that checks the tenant but no wallet, and
   * `database` reaches a `findAuthorized` whose tenant is a plain argument.
   * `#` fields are also immune to a prototype accessor shadowing the write.
   */
  readonly #database: PrismaObservationDatabase;
  readonly #writer: TransactionalTenantScopedRepository<ObservationPersistenceRecord>;

  /**
   * Only the factory holds the authority object, so an exported class value
   * cannot be turned into a repository over a caller-supplied database.
   */
  public constructor(authority: object, database: PrismaObservationDatabase) {
    if (authority !== repositoryConstructionAuthority) {
      throw new Error("PRISMA_REPOSITORY_CONSTRUCTION_FORBIDDEN");
    }
    this.#database = database;
    this.#writer = new TransactionalTenantScopedRepository(database);
    // Stops a caller from shadowing `find`/`save` with an own property on an
    // instance already handed to another consumer. The internals above are
    // out of reach regardless, so this is not what protects them.
    Object.freeze(this);
    factoryIssuedRepositories.add(this);
  }

  public async save(
    principal: import("../identity-middleware.js").VerifiedPrincipal,
    operation: import("@panella/application").AuthorizedOperation,
    value: ObservationPersistenceRecord,
  ): Promise<void> {
    assertFactoryIssuedRepository(this);
    await this.#writer.save(principal, operation, value);
  }

  public async find(
    principal: import("../identity-middleware.js").VerifiedPrincipal,
    operation: import("@panella/application").AuthorizedOperation,
    id: string,
  ): Promise<ObservationPersistenceRecord | null> {
    assertFactoryIssuedRepository(this);
    const context = assertReadOperation(principal, operation);
    const record = await this.#database.findAuthorized(
      context.tenantId,
      operation.walletId,
      id,
    );
    // RLS is the second barrier, never the only one (ADR 020): a record whose
    // tenant does not match the authorized operation is not readable here.
    return record?.tenantId === context.tenantId ? record : null;
  }
}

// A writable prototype lets an attacker install an accessor for a field name
// and capture the constructor's assignment. `#` fields close that, and freezing
// the prototype also stops `find`/`save` from being replaced wholesale.
Object.freeze(PrismaAuthorizedObservationRepository.prototype);

export interface PrismaObservationRepositoryBundle {
  readonly observations: PrismaAuthorizedObservationRepository;
  disconnect(): Promise<void>;
}

/**
 * Takes no arguments on purpose. A caller-supplied datasource walks around the
 * construction authority entirely: the returned repository is factory-issued
 * and fully functional, but points at a database the caller chose, where no
 * tenant policy applies. The connection string comes from configuration.
 */
export function createPrismaObservationRepository(
  ...overrides: readonly never[]
): PrismaObservationRepositoryBundle {
  if (overrides.length > 0) {
    throw new Error("PRISMA_CLIENT_OVERRIDE_FORBIDDEN");
  }
  const client = new PrismaClient();
  const database = new PrismaObservationDatabase(client);
  return {
    observations: new PrismaAuthorizedObservationRepository(
      repositoryConstructionAuthority,
      database,
    ),
    disconnect: () => client.$disconnect(),
  };
}
