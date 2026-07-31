import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  commitWalletImport,
  authorizeOperation,
  type WalletAuthorizationRepository,
  type WalletFileParser,
} from "@panella/application";
import type { TenantContext, WalletGrant } from "@panella/domain";

import { DevInsecureIdentityProvider } from "../identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../keycloak.js";
import { parseWalletCsv } from "../wallet-importers/csv.js";
import { createInMemoryCpfCrypto } from "../kms.js";
import { createPrismaWalletStore } from "./prisma-wallet-repository.js";

/**
 * These run against the real container, not a mock. Titles, debtors and the
 * import audit stop being values in a `Map`: idempotence is a unique index,
 * tenant isolation is a policy, and append-only is a revoked privilege.
 */

const workspaceRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const APP_DATABASE_URL =
  "postgresql://dossie_app:dossie_app_local_only@127.0.0.1:5433/dossie_triagem";

/**
 * Tenants of this file alone. The RLS contract suite owns `tenant-a` and
 * `tenant-b` and shares the same database, so these carry a suffix and every
 * clean-up below is scoped to them.
 */
const TENANT_A = "tenant-wallet-a";
const TENANT_B = "tenant-wallet-b";
const WALLET_A = "wallet-store-a";
const WALLET_A2 = "wallet-store-a2";
const WALLET_B = "wallet-store-b";

function ownerSql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "-e",
      "PGPASSWORD=dossie_owner_local_only",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "dossie_owner",
      "-d",
      "dossie_triagem",
      "-tA",
      "-c",
      sql,
    ],
    { cwd: workspaceRoot, encoding: "utf8" },
  );
}

function fixture(name: string): Uint8Array {
  return readFileSync(
    new URL(`../../../../fixtures/wallet/${name}`, import.meta.url),
  );
}

const parser: WalletFileParser = { parse: (bytes) => parseWalletCsv(bytes) };

class WalletFixture implements WalletAuthorizationRepository {
  public constructor(
    private readonly tenantId: string,
    private readonly walletId: string,
    private readonly actions: WalletGrant["actions"],
  ) {}

  public async findWallet(_context: TenantContext, walletId: string) {
    return walletId === this.walletId
      ? { id: this.walletId, tenantId: this.tenantId }
      : null;
  }

  public async findGrant(
    _context: TenantContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return walletId === this.walletId
      ? {
          tenantId: this.tenantId,
          walletId: this.walletId,
          actions: [...this.actions],
        }
      : null;
  }

  public async containsCpf(): Promise<boolean> {
    return false;
  }

  public async containsDebtor(): Promise<boolean> {
    return true;
  }
}

function identityRepositoryFor(tenantId: string): IdentityActorRepository {
  return {
    findByIdentity: async () => ({
      actorId: `agent-${tenantId}`,
      tenantId,
      kind: "AGENT",
      roles: [],
    }),
  };
}

async function agentOf(tenantId: string): Promise<AuthenticatedIdentity> {
  vi.stubEnv("NODE_ENV", "development");
  const principal = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  }).authenticateMachineAgent({
    issuer: "https://identity.example/realms/acme",
    subject: `service-account-agent-${tenantId}`,
  });
  return mapVerifiedKeycloakActor(principal, identityRepositoryFor(tenantId));
}

const ACTIONS: WalletGrant["actions"] = [
  "IMPORT_WALLET",
  "READ_ACTIONABLE",
  "READ_AUDIT",
  "READ_DOSSIER",
];

let store: ReturnType<typeof createPrismaWalletStore>;

beforeAll(() => {
  // The connection string comes from configuration, never from a parameter.
  // A caller-supplied datasource walks around the whole authority apparatus
  // with a string, which is why the observation factory refuses one too.
  vi.stubEnv("DATABASE_URL", APP_DATABASE_URL);
  store = createPrismaWalletStore(createInMemoryCpfCrypto());
});

afterAll(async () => {
  await store?.disconnect();
});

beforeEach(() => {
  // Scoped to this file's own tenants, never `TRUNCATE`. The database is
  // shared with the RLS contract suite, and a global wipe makes the two races
  // whenever they run at the same time — a suite that passes only sometimes
  // is worse than one that fails.
  //
  // Every id written below is namespaced for the same reason: a primary key is
  // global while this clean-up is tenant-scoped, so an unprefixed `obs-1` would
  // collide with a row this file is not allowed to delete.
  ownerSql(
    `DELETE FROM "WalletImport" WHERE "tenantId" IN ('${TENANT_A}', '${TENANT_B}');
     DELETE FROM "Observation" WHERE "tenantId" IN ('${TENANT_A}', '${TENANT_B}');
     DELETE FROM "Title" WHERE "tenantId" IN ('${TENANT_A}', '${TENANT_B}');
     DELETE FROM "Debtor" WHERE "tenantId" IN ('${TENANT_A}', '${TENANT_B}');
     DELETE FROM "Wallet" WHERE "tenantId" IN ('${TENANT_A}', '${TENANT_B}');
     DELETE FROM "Tenant" WHERE "id" IN ('${TENANT_A}', '${TENANT_B}');
     INSERT INTO "Tenant" ("id") VALUES ('${TENANT_A}'), ('${TENANT_B}');
     INSERT INTO "Wallet" ("id", "tenantId", "name", "importedAt")
     VALUES ('${WALLET_A}', '${TENANT_A}', 'carteira a', CURRENT_TIMESTAMP),
            ('${WALLET_A2}', '${TENANT_A}', 'carteira a2', CURRENT_TIMESTAMP),
            ('${WALLET_B}', '${TENANT_B}', 'carteira b', CURRENT_TIMESTAMP);`,
  );
});

async function importInto(
  tenantId: string,
  walletId: string,
  file = "valid-cp1252-semicolon.csv",
) {
  return commitWalletImport({
    identity: await agentOf(tenantId),
    walletId,
    bytes: fixture(file),
    parser,
    authorization: new WalletFixture(tenantId, walletId, ACTIONS),
    store,
  });
}

describe("idempotence is a unique index, not a Map key", () => {
  it("lands a re-import on the same rows", async () => {
    const first = await importInto(TENANT_A, WALLET_A);
    const second = await importInto(TENANT_A, WALLET_A);

    expect(first.created).toBe(3);
    expect(first.updated).toBe(0);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(3);
    expect(
      ownerSql(
        `SELECT count(*) FROM "Title" WHERE "tenantId" = '${TENANT_A}';`,
      ).trim(),
    ).toBe("3");
  });

  it("keeps three instalments of one debtor as three titles", async () => {
    await importInto(TENANT_A, WALLET_A);

    // Deduplication keys on the external title id. Two of the three rows are
    // the same person, and collapsing them would delete a debt.
    expect(
      ownerSql(
        `SELECT count(DISTINCT "debtorId") FROM "Title" WHERE "tenantId" = '${TENANT_A}';`,
      ).trim(),
    ).toBe("2");
  });

  it("refuses a second title with the same external id in one wallet", async () => {
    await importInto(TENANT_A, WALLET_A);

    // The constraint is in the database, so a repository that forgot its key
    // derivation still cannot create a duplicate.
    expect(() =>
      ownerSql(
        `INSERT INTO "Title" ("id","tenantId","walletId","debtorId","externalId","name","amountCents","dueDate")
         SELECT 'forged', "tenantId", "walletId", "debtorId", "externalId", "name", "amountCents", "dueDate"
         FROM "Title" WHERE "tenantId" = '${TENANT_A}' LIMIT 1;`,
      ),
    ).toThrow();
  });
});

describe("tenant isolation with RLS active", () => {
  it("does not show tenant A a title imported by tenant B", async () => {
    await importInto(TENANT_B, WALLET_B);
    await importInto(TENANT_A, WALLET_A);

    const identity = await agentOf(TENANT_A);
    const operation = await authorizeOperation(
      identity,
      WALLET_A,
      "READ_ACTIONABLE",
      new WalletFixture(TENANT_A, WALLET_A, ACTIONS),
    );
    if (!operation) throw new Error("EXPECTED_OPERATION");

    const titles = await store.titles.listByWallet(
      operation.principal,
      operation,
    );

    expect(titles).toHaveLength(3);
    expect(titles.every((title) => title.tenantId === TENANT_A)).toBe(true);
    // Both tenants imported the same file, so six rows exist across the two:
    // the three that came back are a filter, not an empty database.
    expect(
      ownerSql(
        `SELECT count(*) FROM "Title" WHERE "tenantId" IN ('${TENANT_A}', '${TENANT_B}');`,
      ).trim(),
    ).toBe("6");
  });
});

describe("the CPF never lands in the clear", () => {
  it("stores ciphertext and an HMAC index, and no plaintext column", async () => {
    await importInto(TENANT_A, WALLET_A);

    const row = ownerSql(
      `SELECT encode("cpfCiphertext",'hex') || '|' || "cpfHmac"
       FROM "Debtor" WHERE "tenantId" = '${TENANT_A}' LIMIT 1;`,
    ).trim();
    const [ciphertext, hmac] = row.split("|");

    expect(ciphertext).not.toContain("52998224725");
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
    // No column anywhere holds the digits: casting the whole row to text
    // would find them if one did.
    expect(
      ownerSql(
        `SELECT count(*) FROM "Debtor"
         WHERE "tenantId" = '${TENANT_A}' AND "Debtor"::text LIKE '%52998224725%';`,
      ).trim(),
    ).toBe("0");
  });
});

describe("the import audit is append-only in the database", () => {
  it("records the import", async () => {
    const report = await importInto(TENANT_A, WALLET_A);

    expect(
      ownerSql(
        `SELECT "acceptedRows" FROM "WalletImport" WHERE "id" = '${report.importId}';`,
      ).trim(),
    ).toBe("3");
  });

  it("denies the application role UPDATE and DELETE", async () => {
    await importInto(TENANT_A, WALLET_A);

    const privileges = ownerSql(
      `SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
       FROM information_schema.table_privileges
       WHERE grantee = 'dossie_app' AND table_name = 'WalletImport';`,
    ).trim();

    expect(privileges).toBe("INSERT,SELECT");
  });
});

describe("the read path resolves a debtor from the external title id", () => {
  async function readOperation(tenantId: string, walletId: string) {
    const operation = await authorizeOperation(
      await agentOf(tenantId),
      walletId,
      "READ_DOSSIER",
      new WalletFixture(tenantId, walletId, ACTIONS),
    );
    if (!operation) throw new Error("EXPECTED_OPERATION");
    return operation;
  }

  it("answers with the debtor the wallet holds under that id", async () => {
    await importInto(TENANT_A, WALLET_A);
    const operation = await readOperation(TENANT_A, WALLET_A);

    const debtorId = await store.titles.findDebtorByExternalId(
      operation.principal,
      operation,
      "TIT-001",
    );

    expect(debtorId).toBe(
      ownerSql(
        `SELECT "debtorId" FROM "Title" WHERE "tenantId" = '${TENANT_A}' AND "externalId" = 'TIT-001';`,
      ).trim(),
    );
  });

  it("does not answer for a title held by another wallet of the same tenant", async () => {
    await importInto(TENANT_A, WALLET_A);
    const operation = await readOperation(TENANT_A, WALLET_A2);

    // Same tenant on both sides, so RLS sees nothing wrong. The wallet scope
    // is the application's job, and per ADR 020 it may never be delegated to
    // the policy that stands behind it.
    expect(
      await store.titles.findDebtorByExternalId(
        operation.principal,
        operation,
        "TIT-001",
      ),
    ).toBeNull();
  });

  it("does not answer for a title of another tenant", async () => {
    await importInto(TENANT_B, WALLET_B);
    const operation = await readOperation(TENANT_A, WALLET_A);

    expect(
      await store.titles.findDebtorByExternalId(
        operation.principal,
        operation,
        "TIT-001",
      ),
    ).toBeNull();
  });
});

describe("an observation belongs to the debtor, never to a wallet", () => {
  it("is readable from a second wallet that contains the same debtor", async () => {
    await importInto(TENANT_A, WALLET_A);
    await importInto(TENANT_A, WALLET_A2);

    const debtorId = ownerSql(
      `SELECT "debtorId" FROM "Title" WHERE "walletId" = '${WALLET_A}' LIMIT 1;`,
    ).trim();
    ownerSql(
      `INSERT INTO "Observation"
         ("id","tenantId","debtorId","source","sliceId","status","queryParams","collectedAt")
       VALUES ('obs-wallet-store-1','${TENANT_A}','${debtorId}','PGFN_DADOS_ABERTOS','SIDA|SP','ENCONTRADO','{}','2026-07-20T00:00:00Z');`,
    );

    const identity = await agentOf(TENANT_A);
    const operation = await authorizeOperation(
      identity,
      WALLET_A2,
      "READ_DOSSIER",
      new WalletFixture(TENANT_A, WALLET_A2, ACTIONS),
    );
    if (!operation) throw new Error("EXPECTED_OPERATION");

    const observations = await store.observations.listForDebtor(
      operation.principal,
      operation,
      debtorId,
    );

    // The fact was collected once and belongs to the person. A second wallet
    // holding the same debtor reuses it; it is not recollected or copied.
    expect(observations.map((entry) => entry.sliceId)).toEqual(["SIDA|SP"]);
    expect(
      ownerSql(
        `SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'Observation' AND column_name = 'walletId';`,
      ).trim(),
    ).toBe("0");
  });
});
