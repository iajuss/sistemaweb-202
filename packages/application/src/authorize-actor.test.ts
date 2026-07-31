import { afterEach, describe, expect, it, vi } from "vitest";

import { DevInsecureIdentityProvider } from "../../adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../../adapters/src/keycloak.js";
import type { TenantContext, WalletGrant } from "@panella/domain";

import {
  authorizeOperation,
  authorizeWalletCpfLookup,
  readAuthorizedObservation,
  type WalletAuthorizationRepository,
} from "./authorize-actor.js";

interface WalletFixture {
  readonly id: string;
  readonly tenantId: string;
  readonly cpfIndexes: readonly string[];
  readonly debtorIds?: readonly string[];
}

class WalletRepositoryFixture implements WalletAuthorizationRepository {
  public constructor(
    private readonly wallets: readonly WalletFixture[],
    private readonly grants: readonly (WalletGrant & {
      readonly actorId: string;
    })[],
  ) {}

  public async findWallet(
    context: TenantContext,
    walletId: string,
  ): Promise<{ readonly id: string; readonly tenantId: string } | null> {
    return this.wallets.find(
      (wallet) => wallet.id === walletId && wallet.tenantId === context.tenantId,
    ) ?? null;
  }

  public async findGrant(
    context: TenantContext,
    actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return this.grants.find(
      (grant) =>
        grant.actorId === actorId &&
        grant.walletId === walletId &&
        grant.tenantId === context.tenantId,
    ) ?? null;
  }

  public async containsCpf(): Promise<boolean> {
    return false;
  }

  public async containsDebtor(
    context: TenantContext,
    walletId: string,
    debtorId: string,
  ): Promise<boolean> {
    return Boolean(this.wallets.find(
      (wallet) =>
        wallet.id === walletId &&
        wallet.tenantId === context.tenantId &&
        wallet.debtorIds?.includes(debtorId),
    ));
  }
}

const identityRepository: IdentityActorRepository = {
  findByIdentity: async ({ subject }) => ({
    actorId: subject === "system-worker" ? "worker-a" : "agent-a",
    tenantId: "tenant-a",
    kind: subject === "system-worker" ? "SYSTEM" : "AGENT",
    roles: [],
  }),
};

async function authenticatedAgent(): Promise<AuthenticatedIdentity> {
  vi.stubEnv("NODE_ENV", "development");
  const principal = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  }).authenticateMachineAgent({
    issuer: "https://identity.example/realms/acme",
    subject: "service-account-agent-a",
  });
  return mapVerifiedKeycloakActor(principal, identityRepository);
}

afterEach(() => vi.unstubAllEnvs());

describe("authorizeActor", () => {
  it("rejects a structural human identity before wallet lookup or CPF indexing", async () => {
    let walletLookups = 0;
    let cpfIndexes = 0;
    const repository: WalletAuthorizationRepository = {
      findWallet: async () => {
        walletLookups += 1;
        return { id: "wallet-a", tenantId: "tenant-a" };
      },
      findGrant: async () => null,
      containsCpf: async () => true,
      containsDebtor: async () => false,
    };

    await expect(
      authorizeWalletCpfLookup(
        {
          principal: {
            issuer: "https://identity.example/realms/acme",
            subject: "attacker-subject",
            origin: "HUMAN_KEYCLOAK",
          },
          actor: {
            id: "attacker",
            kind: "HUMAN",
            provider: "https://identity.example/realms/acme",
            subject: "attacker-subject",
            issuanceOrigin: "HUMAN_KEYCLOAK",
            tenantId: "tenant-a",
            roles: ["ANALISTA_DOSSIE"],
            walletGrants: [],
          },
        } as unknown as AuthenticatedIdentity,
        "wallet-a",
        "synthetic-cpf-input",
        repository,
        {
          indexCpf: async () => {
            cpfIndexes += 1;
            return "hmac:synthetic";
          },
        },
      ),
    ).rejects.toThrow("AUTHENTICATED_IDENTITY_REQUIRED");
    expect(walletLookups).toBe(0);
    expect(cpfIndexes).toBe(0);
  });

  it("issues an opaque operation only after a wallet grant permits the action", async () => {
    const identity = await authenticatedAgent();
    const repository = new WalletRepositoryFixture(
      [{ id: "wallet-a", tenantId: "tenant-a", cpfIndexes: [] }],
      [{
        actorId: "agent-a",
        tenantId: "tenant-a",
        walletId: "wallet-a",
        actions: ["READ_DOSSIER"],
      }],
    );

    await expect(
      authorizeOperation(identity, "wallet-a", "READ_DOSSIER", repository),
    ).resolves.toMatchObject({
      walletId: "wallet-a",
      action: "READ_DOSSIER",
      principal: identity.principal,
      context: { tenantId: "tenant-a", actor: identity.actor },
    });
  });

  it("preserves the immutable mapped actor in the operation context", async () => {
    const identity = await authenticatedAgent();
    const repository = new WalletRepositoryFixture(
      [{ id: "wallet-a", tenantId: "tenant-a", cpfIndexes: [] }],
      [{
        actorId: "agent-a",
        tenantId: "tenant-a",
        walletId: "wallet-a",
        actions: ["READ_DOSSIER"],
      }],
    );

    const operation = await authorizeOperation(
      identity,
      "wallet-a",
      "READ_DOSSIER",
      repository,
    );

    expect(() => {
      (identity.actor as { tenantId: string }).tenantId = "tenant-b";
    }).toThrow();
    expect(operation?.context.actor).toBe(identity.actor);
  });
});

describe("readAuthorizedObservation", () => {
  it("does not read an observation when a wallet grant is absent", async () => {
    const identity = await authenticatedAgent();
    const repository = new WalletRepositoryFixture(
      [{ id: "wallet-a", tenantId: "tenant-a", cpfIndexes: [], debtorIds: ["debtor-a"] }],
      [],
    );
    let observationRead = false;
    const observations = {
      find: async () => {
        observationRead = true;
        return { debtorId: "debtor-a" };
      },
    };

    await expect(
      readAuthorizedObservation(identity, "wallet-a", "observation-a", repository, observations),
    ).resolves.toBeNull();
    expect(observationRead).toBe(false);
  });
});
