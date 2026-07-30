import {
  assertTenantContext,
  type TenantContext,
  type TenantScopedRepository,
} from "@panella/domain";

export interface TenantRecord {
  readonly id: string;
  readonly tenantId: string;
}

export interface TenantTransaction<T extends TenantRecord> {
  assertApplicationRole(): Promise<void>;
  setLocalTenant(tenantId: string): Promise<void>;
  save(value: T): Promise<void>;
  find(id: string): Promise<T | null>;
}

export interface TenantTransactionDatabase<T extends TenantRecord> {
  transaction<Result>(
    operation: (transaction: TenantTransaction<T>) => Promise<Result>,
  ): Promise<Result>;
}

function assertContext(context: TenantContext): void {
  assertTenantContext(context);
}

function assertWriteScope(
  context: TenantContext,
  value: TenantRecord,
): void {
  assertContext(context);
  if (value.tenantId !== context.tenantId) {
    throw new Error("TENANT_SCOPE_MISMATCH");
  }
}

export class InMemoryTenantScopedRepository<T extends TenantRecord>
  implements TenantScopedRepository<T>
{
  private readonly records = new Map<string, T>();

  public async save(context: TenantContext, value: T): Promise<void> {
    assertWriteScope(context, value);
    this.records.set(value.id, value);
  }

  public async find(
    context: TenantContext,
    id: string,
  ): Promise<T | null> {
    assertContext(context);
    const record = this.records.get(id);
    return record?.tenantId === context.tenantId ? record : null;
  }
}

export class TransactionalTenantScopedRepository<T extends TenantRecord>
  implements TenantScopedRepository<T>
{
  public constructor(
    private readonly database: TenantTransactionDatabase<T>,
  ) {}

  public async save(context: TenantContext, value: T): Promise<void> {
    assertWriteScope(context, value);
    await this.database.transaction(async (transaction) => {
      await transaction.setLocalTenant(context.tenantId);
      await transaction.assertApplicationRole();
      await transaction.save(value);
    });
  }

  public async find(
    context: TenantContext,
    id: string,
  ): Promise<T | null> {
    assertContext(context);
    return this.database.transaction(async (transaction) => {
      await transaction.setLocalTenant(context.tenantId);
      await transaction.assertApplicationRole();
      const record = await transaction.find(id);
      return record?.tenantId === context.tenantId ? record : null;
    });
  }
}
