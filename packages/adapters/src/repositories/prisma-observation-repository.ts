import {
  Prisma,
  PrismaClient,
  type SourceStatus,
} from "@prisma/client";

import {
  TransactionalTenantScopedRepository,
  type TenantRecord,
  type TenantTransaction,
  type TenantTransactionDatabase,
} from "./tenant-repository.js";

export interface ObservationPersistenceRecord extends TenantRecord {
  readonly debtorId: string;
  readonly source: string;
  readonly status:
    | "ENCONTRADO"
    | "NAO_ENCONTRADO"
    | "NAO_CONSULTADO"
    | "ERRO_NA_FONTE";
  readonly queryParams: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly collectedAt: Date;
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
        status: value.status as SourceStatus,
        queryParams: toJsonInput(value.queryParams),
        payload: value.payload
          ? toJsonInput(value.payload)
          : Prisma.JsonNull,
        collectedAt: value.collectedAt,
      },
      update: {},
    });
  }

  public async find(
    id: string,
  ): Promise<ObservationPersistenceRecord | null> {
    const record = await this.transaction.observation.findUnique({
      where: { id },
    });
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      tenantId: record.tenantId,
      debtorId: record.debtorId,
      source: record.source,
      status: record.status,
      queryParams: fromJsonObject(record.queryParams),
      payload:
        record.payload === null ? null : fromJsonObject(record.payload),
      collectedAt: record.collectedAt,
    };
  }
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
}

export interface PrismaObservationRepositoryBundle {
  readonly observations: TransactionalTenantScopedRepository<ObservationPersistenceRecord>;
  disconnect(): Promise<void>;
}

export function createPrismaObservationRepository(
  databaseUrl?: string,
): PrismaObservationRepositoryBundle {
  if (databaseUrl !== undefined && typeof databaseUrl !== "string") {
    throw new Error("PRISMA_CLIENT_OVERRIDE_FORBIDDEN");
  }
  const client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
  );
  return {
    observations:
      new TransactionalTenantScopedRepository<ObservationPersistenceRecord>(
        new PrismaObservationDatabase(client),
      ),
    disconnect: () => client.$disconnect(),
  };
}
