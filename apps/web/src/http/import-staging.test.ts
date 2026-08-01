import { afterEach, describe, expect, it, vi } from "vitest";

import { DevInsecureIdentityProvider } from "../../../../packages/adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type IdentityActorRepository,
} from "../../../../packages/adapters/src/keycloak.js";
import {
  authorizeOperation,
  type AuthorizedOperation,
  type AuthorizedWalletContext,
  type WalletAuthorizationRepository,
} from "@panella/application";
import type { WalletGrant } from "@panella/domain";

import { createInMemoryImportStaging } from "./import-staging.js";

/**
 * The preview must not write, and the commit must import the very bytes the
 * operator saw previewed. That leaves the file somewhere between two requests,
 * and this is that somewhere.
 *
 * Every operation below is issued by the real issuer. Forging one would make
 * the call die at a guard the staging area never reaches, and the test would
 * pass for the wrong reason.
 */

class WalletFixture implements WalletAuthorizationRepository {
  public constructor(private readonly tenantId: string) {}

  public async findWallet(_context: AuthorizedWalletContext, walletId: string) {
    return { id: walletId, tenantId: this.tenantId };
  }

  public async findGrant(
    _context: AuthorizedWalletContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return {
      tenantId: this.tenantId,
      walletId,
      actions: ["IMPORT_WALLET"],
    };
  }

  public async containsCpf(): Promise<boolean> {
    return false;
  }

  public async containsDebtor(): Promise<boolean> {
    return true;
  }
}

async function operationFor(
  tenantId: string,
  walletId: string,
): Promise<AuthorizedOperation> {
  vi.stubEnv("NODE_ENV", "development");
  const principal = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  }).authenticateMachineAgent({
    issuer: "https://identity.example/realms/acme",
    subject: `service-account-${tenantId}`,
  });
  const repository: IdentityActorRepository = {
    findByIdentity: async () => ({
      actorId: `agent-${tenantId}`,
      tenantId,
      kind: "AGENT",
      roles: [],
    }),
  };
  const operation = await authorizeOperation(
    await mapVerifiedKeycloakActor(principal, repository),
    walletId,
    "IMPORT_WALLET",
    new WalletFixture(tenantId),
  );
  if (!operation) {
    throw new Error("TEST_OPERATION_NOT_ISSUED");
  }
  return operation;
}

const FILE = {
  filename: "carteira.xlsx",
  bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
};

afterEach(() => vi.unstubAllEnvs());

describe("staging a previewed wallet file", () => {
  it("hands the same bytes back to the operation that staged them", async () => {
    const staging = createInMemoryImportStaging();
    const operation = await operationFor("tenant-a", "wallet-a");

    const token = staging.stage(operation, FILE);

    expect([...(staging.take(operation, token)?.bytes ?? [])]).toEqual([
      ...FILE.bytes,
    ]);
  });

  it("spends the token, so one preview commits at most once", async () => {
    const staging = createInMemoryImportStaging();
    const operation = await operationFor("tenant-a", "wallet-a");
    const token = staging.stage(operation, FILE);

    staging.take(operation, token);

    expect(staging.take(operation, token)).toBeNull();
  });

  it("does not hand a staged file to another tenant", async () => {
    // The token is the only thing the second request carries. If holding it
    // were enough, an uploaded wallet would cross a tenant boundary.
    const staging = createInMemoryImportStaging();
    const token = staging.stage(await operationFor("tenant-a", "wallet-a"), FILE);

    const stolen = staging.take(
      await operationFor("tenant-b", "wallet-a"),
      token,
    );

    expect(stolen).toBeNull();
  });

  it("does not hand a staged file to another wallet of the same tenant", async () => {
    const staging = createInMemoryImportStaging();
    const token = staging.stage(await operationFor("tenant-a", "wallet-a"), FILE);

    const crossed = staging.take(
      await operationFor("tenant-a", "wallet-b"),
      token,
    );

    expect(crossed).toBeNull();
  });

  it("forgets a file the operator never committed", async () => {
    // The bytes hold CPFs of real people. An abandoned preview must not keep
    // them in memory for the life of the process.
    const clock = { now: 0 };
    const staging = createInMemoryImportStaging({
      ttlMs: 1_000,
      now: () => clock.now,
    });
    const operation = await operationFor("tenant-a", "wallet-a");
    const token = staging.stage(operation, FILE);

    clock.now = 1_001;

    expect(staging.take(operation, token)).toBeNull();
  });

  it("refuses an operation that is not a wallet import", async () => {
    const staging = createInMemoryImportStaging();
    vi.stubEnv("NODE_ENV", "development");
    const principal = new DevInsecureIdentityProvider({
      allowInsecureDevelopmentIdentity: true,
    }).authenticateMachineAgent({
      issuer: "https://identity.example/realms/acme",
      subject: "service-account-tenant-a",
    });
    const reading = await authorizeOperation(
      await mapVerifiedKeycloakActor(principal, {
        findByIdentity: async () => ({
          actorId: "agent-tenant-a",
          tenantId: "tenant-a",
          kind: "AGENT",
          roles: [],
        }),
      }),
      "wallet-a",
      "READ_ACTIONABLE",
      {
        findWallet: async () => ({ id: "wallet-a", tenantId: "tenant-a" }),
        findGrant: async () => ({
          tenantId: "tenant-a",
          walletId: "wallet-a",
          actions: ["READ_ACTIONABLE"],
        }),
        containsCpf: async () => false,
        containsDebtor: async () => true,
      },
    );

    expect(() => staging.stage(reading as AuthorizedOperation, FILE)).toThrow(
      "OPERATION_ACTION_FORBIDDEN",
    );
  });

  it("drops the oldest staged file rather than growing without bound", async () => {
    const staging = createInMemoryImportStaging({ capacity: 2 });
    const operation = await operationFor("tenant-a", "wallet-a");
    const first = staging.stage(operation, FILE);
    staging.stage(operation, FILE);
    staging.stage(operation, FILE);

    expect(staging.take(operation, first)).toBeNull();
  });
});
