import {
  assertAuthorizedOperation,
  type AuthorizedOperation,
} from "@panella/application";
import {
  assertTenantContext,
  type TenantContext,
} from "@panella/domain";

import {
  assertAuthenticatedIdentity,
  type AuthenticatedIdentity,
} from "../keycloak.js";
import {
  assertVerifiedPrincipal,
  type VerifiedPrincipal,
} from "../identity-middleware.js";

export interface TenantRecord {
  readonly id: string;
  readonly tenantId: string;
}

export interface DebtorScopedTenantRecord extends TenantRecord {
  readonly debtorId: string;
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

function assertOperation(
  principal: VerifiedPrincipal,
  operation: AuthorizedOperation,
  requiredAction: "READ_DOSSIER" | "RUN_SOURCE",
): TenantContext {
  assertVerifiedPrincipal(principal);
  assertAuthorizedOperation(operation);
  assertAuthenticatedIdentity(operation.identity as AuthenticatedIdentity);
  if (
    operation.principal !== principal ||
    operation.identity.principal !== principal
  ) {
    throw new Error("OPERATION_PRINCIPAL_MISMATCH");
  }
  assertTenantContext(operation.context);
  if (operation.context.actor !== operation.identity.actor) {
    throw new Error("OPERATION_CONTEXT_IDENTITY_MISMATCH");
  }
  if (operation.action !== requiredAction) {
    throw new Error("OPERATION_ACTION_FORBIDDEN");
  }
  if (
    requiredAction === "RUN_SOURCE" &&
    operation.identity.actor.kind !== "SYSTEM"
  ) {
    throw new Error("SYSTEM_INGESTION_CAPABILITY_REQUIRED");
  }
  return operation.context;
}

export function assertReadOperation(
  principal: VerifiedPrincipal,
  operation: AuthorizedOperation,
): TenantContext {
  return assertOperation(principal, operation, "READ_DOSSIER");
}

export function assertSourceIngestionOperation(
  principal: VerifiedPrincipal,
  operation: AuthorizedOperation,
): TenantContext {
  return assertOperation(principal, operation, "RUN_SOURCE");
}

function assertWriteScope(
  principal: VerifiedPrincipal,
  operation: AuthorizedOperation,
  value: TenantRecord,
): TenantContext {
  const context = assertSourceIngestionOperation(principal, operation);
  if (value.tenantId !== context.tenantId) {
    throw new Error("TENANT_SCOPE_MISMATCH");
  }
  return context;
}

export class InMemoryTenantScopedRepository<T extends TenantRecord> {
  private readonly records = new Map<string, T>();

  public async save(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    value: T,
  ): Promise<void> {
    assertWriteScope(principal, operation, value);
    this.records.set(value.id, value);
  }

  public async find(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    id: string,
  ): Promise<T | null> {
    const context = assertReadOperation(principal, operation);
    const record = this.records.get(id);
    return record?.tenantId === context.tenantId ? record : null;
  }
}

export class TransactionalTenantScopedRepository<T extends TenantRecord> {
  public constructor(
    private readonly database: TenantTransactionDatabase<T>,
  ) {}

  public async save(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    value: T,
  ): Promise<void> {
    const context = assertWriteScope(principal, operation, value);
    await this.database.transaction(async (transaction) => {
      await transaction.setLocalTenant(context.tenantId);
      await transaction.assertApplicationRole();
      await transaction.save(value);
    });
  }

  public async find(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    id: string,
  ): Promise<T | null> {
    const context = assertReadOperation(principal, operation);
    return this.database.transaction(async (transaction) => {
      await transaction.setLocalTenant(context.tenantId);
      await transaction.assertApplicationRole();
      const record = await transaction.find(id);
      return record?.tenantId === context.tenantId ? record : null;
    });
  }
}

/**
 * Observations are tenant+debtor facts. Wallet topology is checked at the
 * access boundary and never copied into the immutable source fact.
 */
export class InMemoryAuthorizedObservationRepository<
  T extends DebtorScopedTenantRecord,
> {
  private readonly records = new Map<string, T>();

  public constructor(
    private readonly walletContainsDebtor: (
      tenantId: string,
      walletId: string,
      debtorId: string,
    ) => boolean,
  ) {}

  public async save(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    value: T,
  ): Promise<void> {
    assertWriteScope(principal, operation, value);
    this.records.set(value.id, value);
  }

  public async find(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    id: string,
  ): Promise<T | null> {
    const context = assertReadOperation(principal, operation);
    const record = this.records.get(id);
    if (
      !record ||
      record.tenantId !== context.tenantId ||
      !this.walletContainsDebtor(
        context.tenantId,
        operation.walletId,
        record.debtorId,
      )
    ) {
      return null;
    }
    return record;
  }
}
