import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

import { DevInsecureIdentityProvider } from "../../../../packages/adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type IdentityActorRepository,
} from "../../../../packages/adapters/src/keycloak.js";
import {
  composeDossier,
  sourcePlanForUfs,
  type TenantContext,
  type WalletGrant,
} from "@panella/domain";
import type { WalletAuthorizationRepository } from "@panella/application";

import { parseWalletFile } from "../../../../packages/adapters/src/wallet-importers/wallet-file.js";

import { createInMemoryImportStaging } from "./import-staging.js";
import { createHttpServer } from "./server.js";

/**
 * End to end over a real socket. The router is already covered as a pure
 * function; what this proves is that the three endpoints actually answer,
 * which is the difference between a design and a running surface.
 */

const PLAN = sourcePlanForUfs(["SP"]);
const DEBTOR = { debtorId: "debtor-a", name: "JOSE SILVA", cpf: "52998224725" };

const STORED = composeDossier({
  dossierId: "dossier-1",
  tenantId: "tenant-a",
  debtorId: "debtor-a",
  composedAt: "2026-07-31T12:00:00.000Z",
  plan: PLAN,
  observations: [],
  resolutions: {},
});

const authorization: WalletAuthorizationRepository = {
  findWallet: async (_context: TenantContext, walletId: string) =>
    walletId === "wallet-a" ? { id: "wallet-a", tenantId: "tenant-a" } : null,
  findGrant: async (
    _context: TenantContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> =>
    walletId === "wallet-a"
      ? {
          tenantId: "tenant-a",
          walletId,
          actions: ["READ_DOSSIER", "READ_ACTIONABLE", "IMPORT_WALLET"],
        }
      : null,
  containsCpf: async () => false,
  containsDebtor: async () => true,
};

const identityRepository: IdentityActorRepository = {
  findByIdentity: async () => ({
    actorId: "agent-a",
    tenantId: "tenant-a",
    kind: "AGENT",
    roles: [],
  }),
};

/** What the wallet import actually wrote, so the socket test can check it. */
const imported: string[] = [];

let baseUrl = "";
let server: ReturnType<typeof createHttpServer>;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "development");
  server = createHttpServer({
    plan: PLAN,
    authorization,
    authenticate: async (request) =>
      request.headers.authorization?.startsWith("Bearer ")
        ? mapVerifiedKeycloakActor(
            new DevInsecureIdentityProvider({
              allowInsecureDevelopmentIdentity: true,
            }).authenticateMachineAgent({
              issuer: "https://identity.example/realms/acme",
              subject: "service-account-agent-a",
            }),
            identityRepository,
          )
        : null,
    titles: {
      findDebtorByExternalId: async (_principal, _operation, externalId) =>
        externalId === "TIT-001" ? DEBTOR.debtorId : null,
    },
    debtors: {
      findInWallet: async (_principal, _operation, debtorId) =>
        debtorId === DEBTOR.debtorId ? DEBTOR : null,
    },
    observations: { listForDebtor: async () => [] },
    snapshots: {
      save: async () => undefined,
      find: async (_principal, _operation, dossierId) =>
        dossierId === "dossier-1" ? STORED : null,
    },
    priorities: {
      listForWallet: async () => [
        {
          dossierId: "dossier-1",
          externalId: "TIT-001",
          category: "MONITORAMENTO" as const,
          operationalPriority: 2,
          score: 0.15,
        },
      ],
    },
    debtorNames: { findNameInWallet: async () => "JOSE SILVA" },
    walletFiles: { parse: (bytes) => parseWalletFile(bytes) },
    staging: createInMemoryImportStaging(),
    imports: {
      titles: {
        upsertByExternalId: async (_principal, _operation, title) => {
          imported.push(title.externalId);
          return "CRIADO";
        },
      },
      debtors: { resolveByCpf: async (_principal, _operation, cpf) => `d-${cpf}` },
      imports: { record: async () => undefined },
    },
    theme: {
      read: async () => ({
        nomeDoProduto: "Triagem de Cobrança",
        corPrimaria: "#1F4E79",
        corSecundaria: "#F2F5F8",
        marca: "Cliente Demonstração",
      }),
    },
    now: () => new Date("2026-07-31T12:00:00.000Z"),
    newDossierId: () => "dossier-1",
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});

const AUTH = { authorization: "Bearer dev-token" };

describe("the three endpoints answer over a socket", () => {
  it("looks a dossier up by external title id", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/carteiras/wallet-a/dossies/lookup`,
      {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ id_externo: "TIT-001" }),
      },
    );
    const body = (await response.json()) as {
      dossier: { dossier_id: string };
      classification: { category: string };
    };

    expect(response.status).toBe(200);
    expect(body.dossier.dossier_id).toBe("dossier-1");
    expect(body.classification.category).toBe("DADOS_INSUFICIENTES");
  });

  it("lists priorities", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/carteiras/wallet-a/prioridades?limit=10`,
      { headers: AUTH },
    );
    const body = (await response.json()) as { items: unknown[] };

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
  });

  it("renders the prompt as markdown", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/dossies/dossier-1/prompt?carteira=wallet-a`,
      { headers: AUTH },
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(text).toContain("prompt_version");
  });
});

/**
 * The upload is the one body `node:http` hands over raw, and the one the
 * transport must not decode as JSON. Nothing below is a fixture of an upload:
 * it is `FormData` over a socket, which is what a browser sends.
 */
describe("the import screen answers over a socket", () => {
  const carteira = readFileSync(
    new URL("../../../../fixtures/wallet/invalid-cpf.csv", import.meta.url),
  );

  it("previews an uploaded wallet without importing it", async () => {
    const form = new FormData();
    form.set("arquivo", new Blob([carteira]), "carteira.csv");

    const response = await fetch(
      `${baseUrl}/carteiras/wallet-a/importacoes`,
      { method: "POST", headers: AUTH, body: form },
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("TIT-010");
    expect(html).toContain("CPF_INVALIDO");
    expect(html).not.toContain("390.533.447-05");
    expect(imported).toEqual([]);
  });

  it("imports the previewed file when the operator confirms", async () => {
    const form = new FormData();
    form.set("arquivo", new Blob([carteira]), "carteira.csv");
    const preview = await (
      await fetch(`${baseUrl}/carteiras/wallet-a/importacoes`, {
        method: "POST",
        headers: AUTH,
        body: form,
      })
    ).text();
    const token = /name="preparo" value="([^"]+)"/.exec(preview)?.[1] ?? "";

    const response = await fetch(
      `${baseUrl}/carteiras/wallet-a/importacoes/confirmar`,
      {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ preparo: token }).toString(),
      },
    );

    expect(response.status).toBe(200);
    expect(imported).toEqual(["TIT-010", "TIT-012"]);
  });
});

describe("what the transport must not do", () => {
  it("never lets a response be cached by a proxy", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/dossies/dossier-1/prompt?carteira=wallet-a`,
      { headers: AUTH },
    );

    // The dossier is personal data about a named person.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses an unauthenticated request", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/carteiras/wallet-a/prioridades`,
    );

    expect(response.status).toBe(401);
  });

  it("does not echo an unparseable body back", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/carteiras/wallet-a/dossies/lookup`,
      {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: "{ cpf: 52998224725",
      },
    );
    const text = await response.text();

    // A body that failed to parse may hold a CPF, and echoing it would put it
    // in a log the moment anyone records responses.
    expect(response.status).toBe(400);
    expect(text).not.toContain("52998224725");
  });
});
