import { describe, expect, it, vi } from "vitest";

import {
  authorizeOperation,
  type AuthorizedOperation,
  type WalletAuthorizationRepository,
} from "@panella/application";
import {
  DevInsecureIdentityProvider,
  type VerifiedPrincipal,
} from "../identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type IdentityActorRepository,
} from "../keycloak.js";
import type { PrismaClient } from "@prisma/client";

const prismaClientFixture = vi.hoisted(() => ({
  client: undefined as PrismaClient | undefined,
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    public constructor() {
      return prismaClientFixture.client as PrismaClient;
    }
  },
  Prisma: { JsonNull: null },
}));

import {
  createPrismaObservationRepository,
  PrismaAuthorizedObservationRepository,
} from "./prisma-observation-repository.js";

async function authorizedOperation(input: {
  readonly kind: "AGENT" | "SYSTEM";
  readonly action: "READ_DOSSIER" | "RUN_SOURCE";
  readonly walletId?: string;
} = { kind: "SYSTEM", action: "RUN_SOURCE" }): Promise<{
  readonly principal: VerifiedPrincipal;
  readonly operation: AuthorizedOperation;
}> {
  vi.stubEnv("NODE_ENV", "development");
  const provider = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  });
  const walletId = input.walletId ?? "wallet-a";
  const identityInput = {
    issuer: "internal://workers",
    subject: input.kind === "SYSTEM" ? "worker-a" : `agent-${walletId}`,
  };
  const principal = input.kind === "SYSTEM"
    ? provider.authenticateSystemWorker(identityInput)
    : provider.authenticateMachineAgent(identityInput);
  const identities: IdentityActorRepository = {
    findByIdentity: async () => ({
      actorId: input.kind === "SYSTEM" ? "worker-a" : `agent-${walletId}`,
      tenantId: "tenant-a",
      kind: input.kind,
      roles: [],
    }),
  };
  const identity = await mapVerifiedKeycloakActor(principal, identities);
  const authorizationRepository: WalletAuthorizationRepository = {
    findWallet: async () => ({ id: walletId, tenantId: "tenant-a" }),
    findGrant: async () => ({
      tenantId: "tenant-a",
      walletId,
      actions: [input.action],
    }),
    containsCpf: async () => false,
    containsDebtor: async () => false,
  };
  const operation = await authorizeOperation(
    identity,
    walletId,
    input.action,
    authorizationRepository,
  );
  if (!operation) throw new Error("TEST_OPERATION_NOT_ISSUED");
  return { principal, operation };
}

const observationFixture = {
  id: "observation-a",
  tenantId: "tenant-a",
  debtorId: "debtor-a",
  source: "PGFN_DADOS_ABERTOS",
  status: "ENCONTRADO" as const,
  queryParams: { scope: "fixture" },
  payload: { value: "public-source-fact" },
  collectedAt: new Date("2026-07-30T12:00:00.000Z"),
};

describe("Prisma observation repository", () => {
  it("rejects a Prisma client override at the production repository factory", () => {
    expect(() =>
      createPrismaObservationRepository({
        client: {} as PrismaClient,
      } as unknown as string),
    ).toThrow("PRISMA_CLIENT_OVERRIDE_FORBIDDEN");
  });

  it("refuses to construct the authorized repository outside its factory", () => {
    const RepositoryConstructor =
      PrismaAuthorizedObservationRepository as unknown as new (
        ...args: readonly unknown[]
      ) => unknown;

    expect(
      () =>
        new RepositoryConstructor({
          $transaction: async () => null,
        }),
    ).toThrow("PRISMA_REPOSITORY_CONSTRUCTION_FORBIDDEN");
  });

  it("refuses to read from a repository instance that never ran the factory constructor", async () => {
    const { principal, operation } = await authorizedOperation({
      kind: "AGENT",
      action: "READ_DOSSIER",
    });
    const rogue = Object.create(
      PrismaAuthorizedObservationRepository.prototype,
    ) as PrismaAuthorizedObservationRepository;
    Object.assign(rogue, {
      database: { findAuthorized: async () => observationFixture },
    });

    await expect(
      rogue.find(principal, operation, "observation-a"),
    ).rejects.toThrow("PRISMA_REPOSITORY_CONSTRUCTION_FORBIDDEN");
  });

  it("refuses to write through a repository instance that never ran the factory constructor", async () => {
    const { principal, operation } = await authorizedOperation();
    const persisted: unknown[] = [];
    const rogue = Object.create(
      PrismaAuthorizedObservationRepository.prototype,
    ) as PrismaAuthorizedObservationRepository;
    Object.assign(rogue, {
      writer: { save: async (value: unknown) => void persisted.push(value) },
    });

    await expect(
      rogue.save(principal, operation, observationFixture),
    ).rejects.toThrow("PRISMA_REPOSITORY_CONSTRUCTION_FORBIDDEN");
    expect(persisted).toEqual([]);
  });

  it("does not return an observation whose tenant differs from the authorized operation", async () => {
    const transaction = {
      $queryRaw: async () => [{ isSuperuser: false, canBypassRls: false }],
      $queryRawUnsafe: async () => [],
      observation: {
        findFirst: async () => ({ ...observationFixture, tenantId: "tenant-b" }),
      },
    };
    prismaClientFixture.client = {
      $transaction: async <Result>(callback: (tx: typeof transaction) => Promise<Result>) =>
        callback(transaction),
    } as unknown as PrismaClient;
    const repository = createPrismaObservationRepository();
    const { principal, operation } = await authorizedOperation({
      kind: "AGENT",
      action: "READ_DOSSIER",
    });

    await expect(
      repository.observations.find(principal, operation, "observation-a"),
    ).resolves.toBeNull();
  });

  it("sets the transaction-local tenant before every role or authorized observation query", async () => {
    const { principal, operation } = await authorizedOperation({
      kind: "AGENT",
      action: "READ_DOSSIER",
    });
    const events: string[] = [];
    let localTenant: string | undefined;
    const transaction = {
      $queryRaw: async () => {
        if (localTenant !== "tenant-a") throw new Error("RLS_TENANT_NOT_SET");
        events.push("ROLE_CHECK");
        return [{ isSuperuser: false, canBypassRls: false }];
      },
      $queryRawUnsafe: async (_statement: string, tenantId: string) => {
        events.push(`SET_LOCAL:${tenantId}`);
        localTenant = tenantId;
        return [{ set_config: tenantId }];
      },
      observation: {
        findFirst: async () => {
          if (localTenant !== "tenant-a") throw new Error("RLS_TENANT_NOT_SET");
          events.push("FIND_AUTHORIZED");
          return observationFixture;
        },
      },
    };
    prismaClientFixture.client = {
      $transaction: async <Result>(callback: (tx: typeof transaction) => Promise<Result>) =>
        callback(transaction),
    } as unknown as PrismaClient;
    const repository = createPrismaObservationRepository();

    await expect(repository.observations.find(principal, operation, "observation-a"))
      .resolves.toMatchObject({ id: "observation-a", tenantId: "tenant-a" });
    expect(events).toEqual(["SET_LOCAL:tenant-a", "ROLE_CHECK", "FIND_AUTHORIZED"]);
  });

  it("rejects a database role with BYPASSRLS before an observation query", async () => {
    const { principal, operation } = await authorizedOperation({
      kind: "AGENT",
      action: "READ_DOSSIER",
    });
    const events: string[] = [];
    const transaction = {
      $queryRaw: async () => {
        events.push("ROLE_CHECK");
        return [{ isSuperuser: false, canBypassRls: true }];
      },
      $queryRawUnsafe: async () => {
        events.push("SET_LOCAL");
        return [];
      },
      observation: {
        findFirst: async () => {
          events.push("FIND_AUTHORIZED");
          return null;
        },
      },
    };
    prismaClientFixture.client = {
      $transaction: async <Result>(callback: (tx: typeof transaction) => Promise<Result>) =>
        callback(transaction),
    } as unknown as PrismaClient;
    const repository = createPrismaObservationRepository();

    await expect(repository.observations.find(principal, operation, "observation-a"))
      .rejects.toThrow("APPLICATION_DATABASE_ROLE_MUST_ENFORCE_RLS");
    expect(events).toEqual(["SET_LOCAL", "ROLE_CHECK"]);
  });

  it("persists a tenant-debtor fact without wallet scope", async () => {
    const { principal, operation } = await authorizedOperation();
    let persisted: Record<string, unknown> | undefined;
    const transaction = {
      $queryRaw: async () => [{ isSuperuser: false, canBypassRls: false }],
      $queryRawUnsafe: async () => [],
      observation: {
        upsert: async ({ create }: { readonly create: Record<string, unknown> }) => {
          persisted = create;
        },
      },
    };
    prismaClientFixture.client = {
      $transaction: async <Result>(callback: (tx: typeof transaction) => Promise<Result>) =>
        callback(transaction),
    } as unknown as PrismaClient;
    const repository = createPrismaObservationRepository();

    await repository.observations.save(principal, operation, observationFixture);

    expect(persisted).toMatchObject({
      id: "observation-a",
      tenantId: "tenant-a",
      debtorId: "debtor-a",
    });
    expect(persisted).not.toHaveProperty("walletId");
  });

  it("returns the same tenant-debtor fact to two wallets that contain its debtor", async () => {
    const walletQueries: unknown[] = [];
    const transaction = {
      $queryRaw: async () => [{ isSuperuser: false, canBypassRls: false }],
      $queryRawUnsafe: async () => [],
      observation: {
        findFirst: async (query: unknown) => {
          walletQueries.push(query);
          return observationFixture;
        },
      },
    };
    prismaClientFixture.client = {
      $transaction: async <Result>(callback: (tx: typeof transaction) => Promise<Result>) =>
        callback(transaction),
    } as unknown as PrismaClient;
    const repository = createPrismaObservationRepository();
    const readerA = await authorizedOperation({
      kind: "AGENT", action: "READ_DOSSIER", walletId: "wallet-a",
    });
    const readerB = await authorizedOperation({
      kind: "AGENT", action: "READ_DOSSIER", walletId: "wallet-b",
    });

    const fromA = await repository.observations.find(readerA.principal, readerA.operation, "observation-a");
    const fromB = await repository.observations.find(readerB.principal, readerB.operation, "observation-a");

    expect(fromA).toEqual(fromB);
    expect(walletQueries).toEqual([
      { where: { id: "observation-a", debtor: { titles: { some: { walletId: "wallet-a" } } } } },
      { where: { id: "observation-a", debtor: { titles: { some: { walletId: "wallet-b" } } } } },
    ]);
  });

  it("does not expose an observation when the requested wallet lacks its debtor", async () => {
    const findFirst = vi.fn(async () => null);
    const transaction = {
      $queryRaw: async () => [{ isSuperuser: false, canBypassRls: false }],
      $queryRawUnsafe: async () => [],
      observation: { findFirst },
    };
    prismaClientFixture.client = {
      $transaction: async <Result>(callback: (tx: typeof transaction) => Promise<Result>) =>
        callback(transaction),
    } as unknown as PrismaClient;
    const repository = createPrismaObservationRepository();
    const { principal, operation } = await authorizedOperation({
      kind: "AGENT", action: "READ_DOSSIER", walletId: "wallet-without-debtor",
    });

    await expect(repository.observations.find(principal, operation, "observation-a"))
      .resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "observation-a",
        debtor: { titles: { some: { walletId: "wallet-without-debtor" } } },
      },
    });
  });
});
