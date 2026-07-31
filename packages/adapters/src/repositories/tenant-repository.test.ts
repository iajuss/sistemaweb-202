import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authorizeOperation,
  type AuthorizedWalletContext,
  type AuthorizedOperation,
  type WalletAuthorizationRepository,
} from "@panella/application";
import {
  DevInsecureIdentityProvider,
} from "../identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type IdentityActorRepository,
} from "../keycloak.js";
import type { TenantContext, WalletGrant } from "@panella/domain";

import {
  InMemoryTenantScopedRepository,
  InMemoryAuthorizedObservationRepository,
  TransactionalTenantScopedRepository,
  type TenantTransaction,
  type TenantTransactionDatabase,
  type TenantRecord,
} from "./tenant-repository.js";

interface ObservationFixture extends TenantRecord {
  readonly source: "PGFN_DADOS_ABERTOS";
}

class WalletRepositoryFixture implements WalletAuthorizationRepository {
  public constructor(private readonly action: WalletGrant["actions"][number]) {}

  public async findWallet(
    context: AuthorizedWalletContext,
    walletId: string,
  ): Promise<{ readonly id: string; readonly tenantId: string } | null> {
    return { id: walletId, tenantId: context.tenantId };
  }

  public async findGrant(
    context: AuthorizedWalletContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return {
      tenantId: context.tenantId,
      walletId,
      actions: [this.action],
    };
  }

  public async containsCpf(): Promise<boolean> {
    return false;
  }

  public async containsDebtor(): Promise<boolean> {
    return false;
  }
}

async function authorizedOperation(input: {
  readonly tenantId: string;
  readonly walletId: string;
  readonly kind: "AGENT" | "SYSTEM";
  readonly action: WalletGrant["actions"][number];
}): Promise<{
  readonly principal: ReturnType<DevInsecureIdentityProvider["authenticateSystemWorker"]>;
  readonly operation: AuthorizedOperation;
}> {
  vi.stubEnv("NODE_ENV", "development");
  const provider = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  });
  const identityInput = {
    issuer: "internal://workers",
    subject: `${input.kind.toLowerCase()}-${input.tenantId}`,
  };
  const principal = input.kind === "SYSTEM"
    ? provider.authenticateSystemWorker(identityInput)
    : provider.authenticateMachineAgent(identityInput);
  const identityRepository: IdentityActorRepository = {
    findByIdentity: async () => ({
      actorId: `${input.kind.toLowerCase()}-${input.tenantId}`,
      tenantId: input.tenantId,
      kind: input.kind,
      roles: [],
    }),
  };
  const identity = await mapVerifiedKeycloakActor(principal, identityRepository);
  const operation = await authorizeOperation(
    identity,
    input.walletId,
    input.action,
    new WalletRepositoryFixture(input.action),
  );
  if (!operation) {
    throw new Error("TEST_OPERATION_NOT_ISSUED");
  }
  return { principal, operation };
}

afterEach(() => vi.unstubAllEnvs());

class RlsTransactionFixture
  implements TenantTransaction<ObservationFixture>
{
  private tenantId: string | null = null;

  public constructor(
    private readonly records: Map<string, ObservationFixture>,
  ) {}

  public async assertApplicationRole(): Promise<void> {}

  public async setLocalTenant(tenantId: string): Promise<void> {
    this.tenantId = tenantId;
  }

  public async save(value: ObservationFixture): Promise<void> {
    if (!this.tenantId) throw new Error("RLS_TENANT_NOT_SET");
    this.records.set(value.id, value);
  }

  public async find(id: string): Promise<ObservationFixture | null> {
    if (!this.tenantId) throw new Error("RLS_TENANT_NOT_SET");
    const record = this.records.get(id);
    return record?.tenantId === this.tenantId ? record : null;
  }
}

class RlsDatabaseFixture
  implements TenantTransactionDatabase<ObservationFixture>
{
  private readonly records = new Map<string, ObservationFixture>();

  public async transaction<Result>(
    operation: (transaction: TenantTransaction<ObservationFixture>) => Promise<Result>,
  ): Promise<Result> {
    return operation(new RlsTransactionFixture(this.records));
  }
}

describe("tenant-scoped repository", () => {
  it("returns one tenant-debtor observation fact to two authorized wallets", async () => {
    const repository = new InMemoryAuthorizedObservationRepository<{
      readonly id: string;
      readonly tenantId: string;
      readonly debtorId: string;
      readonly source: "PGFN_DADOS_ABERTOS";
    }>((tenantId, walletId, debtorId) =>
      tenantId === "tenant-a" &&
      debtorId === "debtor-a" &&
      (walletId === "wallet-a" || walletId === "wallet-b"),
    );
    const ingestion = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-a", kind: "SYSTEM", action: "RUN_SOURCE",
    });
    const readerA = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-a", kind: "AGENT", action: "READ_DOSSIER",
    });
    const readerB = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-b", kind: "AGENT", action: "READ_DOSSIER",
    });
    const observation = {
      id: "observation-a",
      tenantId: "tenant-a",
      debtorId: "debtor-a",
      source: "PGFN_DADOS_ABERTOS" as const,
    };

    await repository.save(ingestion.principal, ingestion.operation, observation);

    await expect(
      repository.find(readerA.principal, readerA.operation, observation.id),
    ).resolves.toBe(observation);
    await expect(
      repository.find(readerB.principal, readerB.operation, observation.id),
    ).resolves.toBe(observation);
  });

  it("does not expose a tenant-debtor observation before wallet membership", async () => {
    const repository = new InMemoryAuthorizedObservationRepository<{
      readonly id: string;
      readonly tenantId: string;
      readonly debtorId: string;
      readonly source: "PGFN_DADOS_ABERTOS";
    }>((_tenantId, walletId, debtorId) =>
      walletId === "wallet-a" && debtorId === "debtor-a",
    );
    const ingestion = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-a", kind: "SYSTEM", action: "RUN_SOURCE",
    });
    const deniedReader = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-b", kind: "AGENT", action: "READ_DOSSIER",
    });
    await repository.save(ingestion.principal, ingestion.operation, {
      id: "observation-a",
      tenantId: "tenant-a",
      debtorId: "debtor-a",
      source: "PGFN_DADOS_ABERTOS",
    });

    await expect(
      repository.find(deniedReader.principal, deniedReader.operation, "observation-a"),
    ).resolves.toBeNull();
  });

  it("rejects a raw TenantContext when principal and operation are required", async () => {
    const repository = new InMemoryTenantScopedRepository<ObservationFixture>();
    const forgedContext = {
      tenantId: "tenant-a",
      actor: {
        id: "worker-a",
        kind: "SYSTEM",
        provider: "internal://workers",
        subject: "worker-tenant-a",
        issuanceOrigin: "SYSTEM_WORKER",
        tenantId: "tenant-a",
        roles: [],
        walletGrants: [],
      },
    } satisfies TenantContext;

    await expect(
      (repository.find as unknown as (
        principal: unknown,
        operation: unknown,
        id: string,
      ) => Promise<ObservationFixture | null>)(forgedContext, forgedContext, "observation-a"),
    ).rejects.toThrow("VERIFIED_PRINCIPAL_REQUIRED");
  });

  it("cannot read a tenant A observation through a tenant B operation", async () => {
    const repository = new InMemoryTenantScopedRepository<ObservationFixture>();
    const tenantA = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-a", kind: "SYSTEM", action: "RUN_SOURCE",
    });
    const tenantB = await authorizedOperation({
      tenantId: "tenant-b", walletId: "wallet-b", kind: "AGENT", action: "READ_DOSSIER",
    });
    const observation: ObservationFixture = {
      id: "observation-a",
      tenantId: "tenant-a",
      source: "PGFN_DADOS_ABERTOS",
    };

    await repository.save(tenantA.principal, tenantA.operation, observation);

    await expect(
      repository.find(tenantB.principal, tenantB.operation, observation.id),
    ).resolves.toBeNull();
  });

  it("rejects a write whose record tenant differs from the authorized operation", async () => {
    const repository = new InMemoryTenantScopedRepository<ObservationFixture>();
    const tenantB = await authorizedOperation({
      tenantId: "tenant-b", walletId: "wallet-b", kind: "SYSTEM", action: "RUN_SOURCE",
    });

    await expect(
      repository.save(tenantB.principal, tenantB.operation, {
        id: "observation-a",
        tenantId: "tenant-a",
        source: "PGFN_DADOS_ABERTOS",
      }),
    ).rejects.toThrow("TENANT_SCOPE_MISMATCH");
  });

  it("sets a fresh transaction-local RLS tenant for every authorized operation", async () => {
    const repository = new TransactionalTenantScopedRepository<ObservationFixture>(
      new RlsDatabaseFixture(),
    );
    const tenantA = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-a", kind: "SYSTEM", action: "RUN_SOURCE",
    });
    const tenantAReader = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-a", kind: "AGENT", action: "READ_DOSSIER",
    });
    const tenantB = await authorizedOperation({
      tenantId: "tenant-b", walletId: "wallet-b", kind: "AGENT", action: "READ_DOSSIER",
    });
    const observation: ObservationFixture = {
      id: "observation-a",
      tenantId: "tenant-a",
      source: "PGFN_DADOS_ABERTOS",
    };

    await repository.save(tenantA.principal, tenantA.operation, observation);

    await expect(
      repository.find(tenantB.principal, tenantB.operation, observation.id),
    ).resolves.toBeNull();
    await expect(
      repository.find(tenantAReader.principal, tenantAReader.operation, observation.id),
    ).resolves.toEqual(observation);
  });

  it("rejects a READ_DOSSIER capability used to save", async () => {
    const repository = new InMemoryTenantScopedRepository<ObservationFixture>();
    const reader = await authorizedOperation({
      tenantId: "tenant-a", walletId: "wallet-a", kind: "AGENT", action: "READ_DOSSIER",
    });

    await expect(
      repository.save(reader.principal, reader.operation, {
        id: "observation-a", tenantId: "tenant-a", source: "PGFN_DADOS_ABERTOS",
      }),
    ).rejects.toThrow("OPERATION_ACTION_FORBIDDEN");
  });
});
