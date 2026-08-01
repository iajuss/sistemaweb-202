import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DevInsecureIdentityProvider } from "../../adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../../adapters/src/keycloak.js";
import type { TenantContext, WalletGrant } from "@panella/domain";

import {
  assertAuthorizedOperation,
  authorizeOperation,
  authorizeWalletCpfLookup,
  readAuthorizedObservation,
  type AuthorizedOperation,
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

/**
 * ADR 019 and defect I-4. `assertAuthorizedOperation` is the barrier that makes
 * every capability check downstream meaningful: if an object shaped like an
 * operation were accepted, every guard that reads `operation.action`,
 * `operation.principal` or `operation.context` would be reading attacker input.
 */
describe("assertAuthorizedOperation", () => {
  it("refuses an operation the issuer never issued", async () => {
    const identity = await authenticatedAgent();
    const forged = {
      principal: identity.principal,
      identity,
      context: { tenantId: "tenant-a", actor: identity.actor },
      walletId: "wallet-a",
      action: "READ_DOSSIER",
    };

    // Every field is correct, and one thing is missing: issuance. The check is
    // WeakSet membership, not shape, so there is nothing to imitate.
    expect(() =>
      assertAuthorizedOperation(forged as unknown as AuthorizedOperation),
    ).toThrow("AUTHORIZED_OPERATION_REQUIRED");
  });

  it("accepts the operation the issuer did issue", async () => {
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

    // Without this half the guard could be "throw always" and still pass.
    expect(() => assertAuthorizedOperation(operation!)).not.toThrow();
  });
});

/**
 * The `containsDebtor` post-filter, listed in defect I-4 as uncovered.
 *
 * An observation is a tenant + debtor fact and carries no `walletId` (ADR 020),
 * so the wallet grant that authorized the read does not by itself say this
 * debtor belongs to that wallet. Two wallets of one tenant are two clients'
 * books; answering across them is a leak between clients, not a defence-in-depth
 * regression.
 */
describe("readAuthorizedObservation wallet containment", () => {
  it("does not answer with an observation whose debtor the wallet does not hold", async () => {
    const identity = await authenticatedAgent();
    const repository = new WalletRepositoryFixture(
      // The wallet exists and grants the read; it just does not hold this
      // debtor. `debtorIds` deliberately names someone else.
      [{
        id: "wallet-a",
        tenantId: "tenant-a",
        cpfIndexes: [],
        debtorIds: ["debtor-b"],
      }],
      [{
        actorId: "agent-a",
        tenantId: "tenant-a",
        walletId: "wallet-a",
        actions: ["READ_DOSSIER"],
      }],
    );
    let observationRead = false;
    const observations = {
      find: async () => {
        observationRead = true;
        return { debtorId: "debtor-a" };
      },
    };

    await expect(
      readAuthorizedObservation(
        identity,
        "wallet-a",
        "observation-a",
        repository,
        observations,
      ),
    ).resolves.toBeNull();
    // The read did happen: this is a post-filter, and the test has to prove it
    // filters rather than prove the read was skipped for some earlier reason.
    expect(observationRead).toBe(true);
  });

  it("answers when the wallet does hold the debtor", async () => {
    const identity = await authenticatedAgent();
    const repository = new WalletRepositoryFixture(
      [{
        id: "wallet-a",
        tenantId: "tenant-a",
        cpfIndexes: [],
        debtorIds: ["debtor-a"],
      }],
      [{
        actorId: "agent-a",
        tenantId: "tenant-a",
        walletId: "wallet-a",
        actions: ["READ_DOSSIER"],
      }],
    );

    await expect(
      readAuthorizedObservation(
        identity,
        "wallet-a",
        "observation-a",
        repository,
        { find: async () => ({ debtorId: "debtor-a" }) },
      ),
    ).resolves.toEqual({ debtorId: "debtor-a" });
  });
});

/**
 * The invariant two deleted guards used to assert at runtime.
 *
 * `OPERATION_CONTEXT_IDENTITY_MISMATCH` and `AUTHORIZED_WALLET_CONTEXT_REQUIRED`
 * were unreachable: no caller could produce a value that made either fire. A
 * guard no test can drop is a guarantee nobody has checked, and writing a
 * "test" for a condition the code cannot produce would fabricate the proof.
 *
 * So the guards are gone and what made them unreachable is asserted instead:
 * **there is exactly one issuer of `AuthorizedOperation`, and it builds the
 * context and the identity from the same reference.** Add a second issuer, or
 * make the single one derive the context from anything but the identity it
 * carries, and these fail — which is the signal that the guards have to come
 * back. See ADR 026.
 */
describe("the single issuer of AuthorizedOperation", () => {
  const source = readFileSync(
    new URL("./authorize-actor.ts", import.meta.url),
    "utf8",
  );

  function occurrences(needle: string): number {
    return source.split(needle).length - 1;
  }

  it("constructs an authorized operation in exactly one place", () => {
    // A second construction site is a second issuer, and the moment one exists
    // an operation can arrive whose context was never derived from its
    // identity — which is precisely what the deleted guard checked for.
    expect(occurrences("new RuntimeAuthorizedOperation(")).toBe(1);
  });

  it("registers an operation as issued in exactly one place", () => {
    // The `WeakSet` is the barrier `assertAuthorizedOperation` reads. Adding to
    // it anywhere else would let an unissued operation pass as issued.
    expect(occurrences("authorizedOperations.add(")).toBe(1);
  });

  it("derives the operation's context from the identity it carries", () => {
    // Same reference on both sides, which is what makes a mismatch between
    // `operation.context.actor` and `operation.identity.actor` unrepresentable.
    expect(source).toContain("createTenantContext(identity.actor)");
    expect(occurrences("createTenantContext(")).toBe(2);
  });

  it("issues operations whose context and identity are the same actor", async () => {
    const identity = await authenticatedAgent();
    const repository = new WalletRepositoryFixture(
      [{ id: "wallet-a", tenantId: "tenant-a", cpfIndexes: [] }],
      [{
        actorId: "agent-a",
        tenantId: "tenant-a",
        walletId: "wallet-a",
        actions: ["READ_DOSSIER", "READ_ACTIONABLE", "READ_AUDIT", "IMPORT_WALLET"],
      }],
    );

    for (const action of [
      "READ_DOSSIER",
      "READ_ACTIONABLE",
      "READ_AUDIT",
      "IMPORT_WALLET",
    ] as const) {
      const operation = await authorizeOperation(
        identity,
        "wallet-a",
        action,
        repository,
      );

      // Object identity, not equality: the deleted guard compared references.
      expect(operation?.context.actor).toBe(operation?.identity.actor);
      expect(operation?.identity).toBe(identity);
    }
  });

  it("builds every wallet context from the caller's own identity", () => {
    const calls = [
      ...source.matchAll(/createAuthorizedWalletContext\(([^)]*)\)/g),
    ]
      .map((match) => match[1].trim())
      // Drops the declaration, whose parameter list is annotated with a type.
      .filter((argument) => argument !== "" && !argument.includes(":"));

    expect(calls.length).toBeGreaterThan(0);
    expect([...new Set(calls)]).toEqual(["identity"]);
  });

  it("lets no wallet context in through an exported function", () => {
    // The other deleted guard, `AUTHORIZED_WALLET_CONTEXT_REQUIRED`, protected
    // a module-private function from a foreign context. Private functions do
    // pass one along — `actorWithRuntimeGrant` takes it — and that is safe
    // exactly while no context can enter from outside. Export a function that
    // accepts one and a caller can hand over a context this module never
    // built, which is when the guard becomes necessary again.
    expect(source).not.toMatch(
      /export\s+(?:async\s+)?function\s+[A-Za-z]+\([^)]*:\s*AuthorizedWalletContext/,
    );
  });
});
