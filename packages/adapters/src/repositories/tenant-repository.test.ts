import { describe, expect, it } from "vitest";

import type { Actor, TenantContext } from "@panella/domain";

import {
  InMemoryTenantScopedRepository,
  TransactionalTenantScopedRepository,
  type TenantTransaction,
  type TenantTransactionDatabase,
  type TenantRecord,
} from "./tenant-repository.js";

interface ObservationFixture extends TenantRecord {
  readonly source: "PGFN_DADOS_ABERTOS";
}

const actor = (tenantId: string): Actor => ({
  id: `worker-${tenantId}`,
  kind: "SYSTEM",
  provider: "internal://workers",
  subject: `pgfn-${tenantId}`,
  tenantId,
  roles: [],
  walletGrants: [],
});

const context = (tenantId: string): TenantContext => ({
  tenantId,
  actor: actor(tenantId),
});

class RlsTransactionFixture
  implements TenantTransaction<ObservationFixture>
{
  private tenantId: string | null = null;
  private applicationRoleChecked = false;

  public constructor(
    private readonly records: Map<string, ObservationFixture>,
  ) {}

  public async assertApplicationRole(): Promise<void> {
    this.applicationRoleChecked = true;
  }

  public async setLocalTenant(tenantId: string): Promise<void> {
    if (!this.applicationRoleChecked) {
      throw new Error("APPLICATION_ROLE_NOT_CHECKED");
    }
    this.tenantId = tenantId;
  }

  public async save(value: ObservationFixture): Promise<void> {
    if (!this.tenantId) {
      throw new Error("RLS_TENANT_NOT_SET");
    }
    this.records.set(value.id, value);
  }

  public async find(id: string): Promise<ObservationFixture | null> {
    if (!this.tenantId) {
      throw new Error("RLS_TENANT_NOT_SET");
    }
    const record = this.records.get(id);
    return record?.tenantId === this.tenantId ? record : null;
  }
}

class RlsDatabaseFixture
  implements TenantTransactionDatabase<ObservationFixture>
{
  private readonly records = new Map<string, ObservationFixture>();

  public async transaction<Result>(
    operation: (
      transaction: TenantTransaction<ObservationFixture>,
    ) => Promise<Result>,
  ): Promise<Result> {
    return operation(new RlsTransactionFixture(this.records));
  }
}

describe("tenant-scoped repository", () => {
  it("cannot read a tenant A observation through tenant B context", async () => {
    const repository =
      new InMemoryTenantScopedRepository<ObservationFixture>();
    const observation: ObservationFixture = {
      id: "observation-a",
      tenantId: "tenant-a",
      source: "PGFN_DADOS_ABERTOS",
    };

    await repository.save(context("tenant-a"), observation);

    await expect(
      repository.find(context("tenant-b"), observation.id),
    ).resolves.toBeNull();
  });

  it("rejects a write whose record tenant differs from the runtime context", async () => {
    const repository =
      new InMemoryTenantScopedRepository<ObservationFixture>();

    await expect(
      repository.save(context("tenant-b"), {
        id: "observation-a",
        tenantId: "tenant-a",
        source: "PGFN_DADOS_ABERTOS",
      }),
    ).rejects.toThrow("TENANT_SCOPE_MISMATCH");
  });

  it("sets a fresh transaction-local RLS tenant for every operation", async () => {
    const repository =
      new TransactionalTenantScopedRepository<ObservationFixture>(
        new RlsDatabaseFixture(),
      );
    const observation: ObservationFixture = {
      id: "observation-a",
      tenantId: "tenant-a",
      source: "PGFN_DADOS_ABERTOS",
    };

    await repository.save(context("tenant-a"), observation);

    await expect(
      repository.find(context("tenant-b"), observation.id),
    ).resolves.toBeNull();
    await expect(
      repository.find(context("tenant-a"), observation.id),
    ).resolves.toEqual(observation);
  });
});
