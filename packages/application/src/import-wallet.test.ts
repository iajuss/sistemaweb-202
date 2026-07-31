import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DevInsecureIdentityProvider } from "../../adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../../adapters/src/keycloak.js";
import { parseWalletCsv } from "../../adapters/src/wallet-importers/csv.js";
import {
  createInMemoryWalletStore,
  type InMemoryWalletStore,
} from "../../adapters/src/repositories/wallet-store.js";
import type { TenantContext, WalletGrant } from "@panella/domain";

import {
  commitWalletImport,
  previewWalletImport,
  type WalletFileParser,
} from "./import-wallet.js";
import {
  authorizeOperation,
  type WalletAuthorizationRepository,
} from "./authorize-actor.js";

const parser: WalletFileParser = { parse: (bytes) => parseWalletCsv(bytes) };

function fixture(name: string): Uint8Array {
  return readFileSync(
    new URL(`../../../fixtures/wallet/${name}`, import.meta.url),
  );
}

class WalletFixture implements WalletAuthorizationRepository {
  public constructor(private readonly grants: readonly WalletGrant[]) {}

  public async findWallet(_context: TenantContext, walletId: string) {
    return walletId === "wallet-a"
      ? { id: "wallet-a", tenantId: "tenant-a" }
      : null;
  }

  public async findGrant(
    _context: TenantContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return this.grants.find((grant) => grant.walletId === walletId) ?? null;
  }

  public async containsCpf(): Promise<boolean> {
    return false;
  }

  public async containsDebtor(): Promise<boolean> {
    return true;
  }
}

const identityRepository: IdentityActorRepository = {
  findByIdentity: async () => ({
    actorId: "agent-a",
    tenantId: "tenant-a",
    kind: "AGENT",
    roles: [],
  }),
};

async function importingAgent(): Promise<AuthenticatedIdentity> {
  vi.stubEnv("NODE_ENV", "development");
  const principal = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  }).authenticateMachineAgent({
    issuer: "https://identity.example/realms/acme",
    subject: "service-account-agent-a",
  });
  return mapVerifiedKeycloakActor(principal, identityRepository);
}

function grantedWallet(
  actions: WalletGrant["actions"] = ["IMPORT_WALLET", "READ_ACTIONABLE"],
): WalletFixture {
  return new WalletFixture([
    { tenantId: "tenant-a", walletId: "wallet-a", actions },
  ]);
}

async function commit(
  store: InMemoryWalletStore,
  file = "valid-cp1252-semicolon.csv",
) {
  const identity = await importingAgent();
  return commitWalletImport({
    identity,
    walletId: "wallet-a",
    bytes: fixture(file),
    parser,
    authorization: grantedWallet(),
    store,
  });
}

async function listTitles(store: InMemoryWalletStore) {
  const identity = await importingAgent();
  const operation = await authorizeOperation(
    identity,
    "wallet-a",
    "READ_ACTIONABLE",
    grantedWallet(),
  );
  if (!operation) throw new Error("EXPECTED_OPERATION");
  return store.titles.listByWallet(operation.principal, operation);
}

afterEach(() => vi.unstubAllEnvs());

describe("previewWalletImport", () => {
  it("deduplicates by external title id, not by CPF", () => {
    const preview = previewWalletImport(
      fixture("valid-cp1252-semicolon.csv"),
      parser,
    );

    // TIT-001 and TIT-002 belong to the same person. Three instalments of one
    // debtor are three titles, never a duplicate.
    expect(preview.accepted).toHaveLength(3);
    expect(preview.accepted.map((row) => row.externalId)).toEqual([
      "TIT-001",
      "TIT-002",
      "TIT-003",
    ]);
  });

  it("quarantines an invalid CPF while accepting the valid rows", () => {
    const preview = previewWalletImport(fixture("invalid-cpf.csv"), parser);

    expect(preview.accepted).toHaveLength(2);
    expect(preview.quarantined).toEqual([
      { status: "QUARENTENA", rowNumber: 3, reason: "CPF_INVALIDO" },
    ]);
  });

  it("quarantines the second row carrying an external id already seen", () => {
    const preview = previewWalletImport(
      new TextEncoder().encode(
        [
          "id_externo;nome;cpf;valor;vencimento",
          "TIT-1;A;529.982.247-25;10,00;2026-01-01",
          "TIT-1;A;529.982.247-25;20,00;2026-02-01",
        ].join("\n"),
      ),
      parser,
    );

    expect(preview.accepted).toHaveLength(1);
    expect(preview.quarantined).toEqual([
      { status: "QUARENTENA", rowNumber: 3, reason: "ID_EXTERNO_DUPLICADO" },
    ]);
  });

  it("hashes the file bytes without carrying their content", () => {
    const preview = previewWalletImport(fixture("invalid-cpf.csv"), parser);

    expect(preview.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(preview.quarantined)).not.toContain("529");
  });

  it("cannot be handed anything to write through", () => {
    // Non-mutation is structural here, not behavioural: preview takes bytes and
    // a parser and nothing else. Asserting on an untouched store would be a
    // test that cannot fail, so the arity is what is guarded — adding a store
    // parameter breaks this line before it can break a wallet.
    expect(previewWalletImport).toHaveLength(2);
  });

  it("returns the same result for the same bytes after a wallet exists", async () => {
    const store = createInMemoryWalletStore();
    const before = previewWalletImport(fixture("invalid-cpf.csv"), parser);

    await commit(store, "invalid-cpf.csv");

    expect(previewWalletImport(fixture("invalid-cpf.csv"), parser)).toEqual(
      before,
    );
  });
});

describe("commitWalletImport", () => {
  it("refuses an actor without an import grant on the wallet", async () => {
    const identity = await importingAgent();

    await expect(
      commitWalletImport({
        identity,
        walletId: "wallet-a",
        bytes: fixture("valid-cp1252-semicolon.csv"),
        parser,
        authorization: grantedWallet(["READ_DOSSIER"]),
        store: createInMemoryWalletStore(),
      }),
    ).rejects.toThrow("IMPORTACAO_NAO_AUTORIZADA");
  });

  it("writes the accepted rows and reports the quarantined ones", async () => {
    const store = createInMemoryWalletStore();

    const report = await commit(store, "invalid-cpf.csv");

    expect(report).toMatchObject({ created: 2, updated: 0 });
    expect(report.quarantined).toHaveLength(1);
    await expect(listTitles(store)).resolves.toHaveLength(2);
  });

  it("is idempotent by external title id when the same file is committed twice", async () => {
    const store = createInMemoryWalletStore();

    const first = await commit(store);
    const second = await commit(store);

    expect(first).toMatchObject({ created: 3, updated: 0 });
    expect(second).toMatchObject({ created: 0, updated: 3 });
    await expect(listTitles(store)).resolves.toHaveLength(3);
  });

  it("aggregates the debtor by CPF while keeping the titles separate", async () => {
    const store = createInMemoryWalletStore();

    await commit(store);
    const titles = await listTitles(store);

    // Two titles for one person: two rows, one debtor.
    expect(new Set(titles.map((title) => title.debtorId)).size).toBe(2);
    expect(titles).toHaveLength(3);
  });

  it("stores the debtor CPF encrypted and never in clear", async () => {
    const store = createInMemoryWalletStore();

    await commit(store);
    const titles = await listTitles(store);

    // Money is bigint cents, which JSON refuses; rendering it as text keeps
    // the scan over the whole record rather than skipping the amounts.
    const rendered = JSON.stringify(titles, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );

    expect(rendered).not.toContain("52998224725");
    expect(rendered).not.toContain("529.982.247-25");
  });

  it("records who imported what, when, and with which file hash", async () => {
    const store = createInMemoryWalletStore();

    const report = await commit(store, "invalid-cpf.csv");
    const identity = await importingAgent();
    const operation = await authorizeOperation(
      identity,
      "wallet-a",
      "READ_AUDIT",
      grantedWallet(["READ_AUDIT"]),
    );
    if (!operation) throw new Error("EXPECTED_OPERATION");
    const entries = await store.imports.listByWallet(
      operation.principal,
      operation,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      importId: report.importId,
      tenantId: "tenant-a",
      walletId: "wallet-a",
      actorId: "agent-a",
      fileHash: report.fileHash,
      acceptedRows: 2,
      quarantinedRows: 1,
      quarantineReasons: { CPF_INVALIDO: 1 },
    });
    expect(JSON.stringify(entries)).not.toContain("529");
  });

  it("keeps the amount in integer cents all the way to the store", async () => {
    const store = createInMemoryWalletStore();

    await commit(store);
    const titles = await listTitles(store);

    expect(
      titles.find((title) => title.externalId === "TIT-001")?.amountCents,
    ).toBe(123456n);
  });
});
