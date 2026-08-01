import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DevInsecureIdentityProvider } from "../../../../packages/adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../../../../packages/adapters/src/keycloak.js";
import { parseWalletFile } from "../../../../packages/adapters/src/wallet-importers/wallet-file.js";
import { WALLET_COLUMNS } from "../../../../packages/adapters/src/wallet-importers/columns.js";
import { sourcePlanForUfs, type WalletGrant } from "@panella/domain";
import type {
  AuthorizedWalletContext,
  ImportedTitleRecord,
  WalletAuthorizationRepository,
  WalletImportAuditEntry,
  WalletImportStore,
} from "@panella/application";

import { createInMemoryImportStaging } from "./import-staging.js";
import { createRouter, type HttpRequest } from "./router.js";
import type { TenantTheme } from "./views.js";

/**
 * The third screen: importing a wallet over HTTP.
 *
 * Until now a wallet could only be loaded by running a script, which is the
 * wrong answer to "how does the client load their wallet" for a web system.
 * What this screen must not become is a second importer: it calls
 * `previewWalletImport` and `commitWalletImport` — the same handlers the demo
 * seeder calls — through the same authorization path as the API.
 */

const THEME: TenantTheme = {
  nomeDoProduto: "Triagem de Cobrança",
  corPrimaria: "#1F4E79",
  corSecundaria: "#F2F5F8",
  marca: "Cliente Demonstração",
};

const PLAN = sourcePlanForUfs(["SP"]);

/**
 * Three rows, one of them with a CPF whose check digit does not close. The
 * quarantine is the point of the screen, so the fixture that carries it is the
 * one the tests upload.
 */
const CARTEIRA = readFileSync(
  new URL("../../../../fixtures/wallet/invalid-cpf.csv", import.meta.url),
);
const CPF_ACEITO = "39053344705";
const CPF_QUARENTENADO = "52998224726";

class WalletFixture implements WalletAuthorizationRepository {
  public constructor(
    private readonly actions: WalletGrant["actions"] = ["IMPORT_WALLET"],
  ) {}

  public async findWallet(_context: AuthorizedWalletContext, walletId: string) {
    return walletId === "wallet-a"
      ? { id: "wallet-a", tenantId: "tenant-a" }
      : null;
  }

  public async findGrant(
    _context: AuthorizedWalletContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return walletId === "wallet-a"
      ? { tenantId: "tenant-a", walletId, actions: [...this.actions] }
      : null;
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

async function identityFor(
  repository: IdentityActorRepository,
): Promise<AuthenticatedIdentity> {
  vi.stubEnv("NODE_ENV", "development");
  return mapVerifiedKeycloakActor(
    new DevInsecureIdentityProvider({
      allowInsecureDevelopmentIdentity: true,
    }).authenticateMachineAgent({
      issuer: "https://identity.example/realms/acme",
      subject: "service-account-agent-a",
    }),
    repository,
  );
}

interface Written {
  readonly titles: ImportedTitleRecord[];
  readonly audits: WalletImportAuditEntry[];
}

function recordingStore(written: Written): WalletImportStore {
  return {
    titles: {
      upsertByExternalId: async (_principal, _operation, title) => {
        written.titles.push(title);
        return "CRIADO";
      },
    },
    debtors: {
      resolveByCpf: async (_principal, _operation, cpf) => `debtor-${cpf}`,
    },
    imports: {
      record: async (_principal, _operation, entry) => {
        written.audits.push(entry);
      },
    },
  };
}

function harness(
  overrides: {
    readonly actions?: WalletGrant["actions"];
    readonly theme?: TenantTheme | null;
  } = {},
) {
  const actions = overrides.actions ?? ["IMPORT_WALLET", "READ_ACTIONABLE"];
  const written: Written = { titles: [], audits: [] };
  const staging = createInMemoryImportStaging();
  const route = createRouter({
    plan: PLAN,
    authorization: new WalletFixture(actions),
    authenticate: async (incoming) =>
      incoming.headers.authorization?.startsWith("Bearer ")
        ? identityFor(identityRepository)
        : null,
    titles: { findDebtorByExternalId: async () => null },
    debtors: { findInWallet: async () => null },
    debtorNames: { findNameInWallet: async () => null },
    observations: { listForDebtor: async () => [] },
    snapshots: { save: async () => undefined, find: async () => null },
    priorities: { listForWallet: async () => [] },
    theme: {
      // Mirrors `PrismaTenantThemeRepository`, which demands a READ_ACTIONABLE
      // operation. A fixture that accepted any operation would hide the very
      // mismatch this screen can produce: it authorizes IMPORT_WALLET.
      read: async (_principal, operation) => {
        if (operation.action !== "READ_ACTIONABLE") {
          throw new Error("OPERATION_ACTION_FORBIDDEN");
        }
        return overrides.theme === undefined ? THEME : overrides.theme;
      },
    },
    walletFiles: { parse: (bytes) => parseWalletFile(bytes) },
    imports: recordingStore(written),
    staging,
    now: () => new Date("2026-08-01T09:00:00.000Z"),
  });
  return { route, written };
}

const BOUNDARY = "----limiteDeTeste";

function upload(bytes: Uint8Array, filename = "carteira.csv"): HttpRequest {
  const body = Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="arquivo"; ` +
        `filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      "utf8",
    ),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`, "utf8"),
  ]);
  return {
    method: "POST",
    path: "/carteiras/wallet-a/importacoes",
    query: {},
    headers: {
      authorization: "Bearer dev-token",
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
    },
    body,
  };
}

function confirm(token: string): HttpRequest {
  return {
    method: "POST",
    path: "/carteiras/wallet-a/importacoes/confirmar",
    query: {},
    headers: {
      authorization: "Bearer dev-token",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: { preparo: token },
  };
}

function request(overrides: Partial<HttpRequest>): HttpRequest {
  return {
    method: "GET",
    path: "/carteiras/wallet-a/importacoes",
    query: {},
    headers: { authorization: "Bearer dev-token" },
    body: null,
    ...overrides,
  };
}

/** The token the preview page hands to the confirm form. */
function tokenFrom(html: string): string {
  const found = /name="preparo" value="([^"]+)"/.exec(html);
  if (!found) {
    throw new Error("PREVIEW_SEM_TOKEN");
  }
  return found[1];
}

afterEach(() => vi.unstubAllEnvs());

describe("UI — tela de importação de carteira", () => {
  it("offers a form to upload a wallet file", async () => {
    const response = await harness().route(request({}));

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/html; charset=utf-8");
    const html = response.body as string;
    expect(html).toContain('enctype="multipart/form-data"');
    expect(html).toContain('type="file"');
  });

  it("takes its name, mark and colours from the tenant", async () => {
    const html = (await harness().route(request({}))).body as string;

    expect(html).toContain("Triagem de Cobrança");
    expect(html).toContain("Cliente Demonstração");
    expect(html.toLowerCase()).not.toContain("panella");
  });

  it("refuses to invent a theme when the tenant configured none", async () => {
    const response = await harness({ theme: null }).route(request({}));

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).toContain("TEMA_NAO_CONFIGURADO");
  });

  it("states the columns the file must have, taken from the parser", async () => {
    // Derived, not typed out: the screen and the parser cannot disagree about
    // the format, which is the whole reason the declaration is shared.
    const html = (await harness().route(request({}))).body as string;

    for (const column of WALLET_COLUMNS) {
      expect(html).toContain(column.header);
    }
    expect(html).toContain("obrigatória");
  });

  it("offers an example file the operator can start from", async () => {
    const html = (await harness().route(request({}))).body as string;

    expect(html).toContain("exemplo-carteira.csv");
  });
});

describe("a file whose columns do not match", () => {
  function csv(header: string): Uint8Array {
    return Buffer.from(`${header}\nTIT-1;JOSE;529.982.247-25;10,00;2026-03-10\n`, "utf8");
  }

  it("names what was expected and what was missing", async () => {
    const response = await harness().route(
      upload(csv("id_externo;nome;cpf;valor")),
    );
    const html = response.body as string;

    expect(response.status).toBe(400);
    // Not merely "the column names appear somewhere on the page" — the form
    // always lists them. The refusal has to say which one was absent.
    expect(html).toContain("Faltou no arquivo");
    expect(html).toContain("Colunas encontradas no arquivo");
    const faltou = html.slice(html.indexOf("Faltou no arquivo"));
    expect(faltou.slice(0, 200)).toContain("vencimento");
  });

  it("never echoes a CPF back from a file exported without its header", async () => {
    // The commonest mistake there is: the first data line becomes the header,
    // and repeating it verbatim would print a CPF onto the screen.
    const semCabecalho = Buffer.from(
      "TIT-001;JOSE DA SILVA;529.982.247-25;1.234,56;2026-03-10\n",
      "utf8",
    );

    const html = (await harness().route(upload(semCabecalho))).body as string;

    // The page must be the detailed refusal, so the absence below is a real
    // absence and not the absence of a report.
    expect(html).toContain("Colunas encontradas no arquivo");
    expect(html).toContain("coluna não reconhecida");
    expect(html).not.toContain("529.982.247-25");
    expect(html).not.toContain("529982247");
    expect(html).not.toContain("982247");
    expect(html).not.toContain("JOSE DA SILVA");
  });
});

describe("a preview writes nothing", () => {
  it("lists the accepted titles without saving one", async () => {
    const { route, written } = harness();

    const response = await route(upload(CARTEIRA));

    expect(response.status).toBe(200);
    const html = response.body as string;
    expect(html).toContain("TIT-010");
    expect(html).toContain("TIT-012");
    // The invariant the dry run exists for: nothing reached the store.
    expect(written.titles).toEqual([]);
    expect(written.audits).toEqual([]);
  });

  it("shows the quarantined line by number and by reason", async () => {
    const html = (await harness().route(upload(CARTEIRA))).body as string;

    // Physical line 3 of the file, the one whose check digit does not close.
    expect(html).toContain("CPF_INVALIDO");
    expect(/linha[^<]*<\/td>\s*<td[^>]*>3</i.test(html) || html.includes(">3<"))
      .toBe(true);
  });

  it("never shows a CPF, accepted or quarantined", async () => {
    const response = await harness().route(upload(CARTEIRA));
    const html = response.body as string;

    // Asserted first so the absence below cannot be the absence of a page: a
    // refusal carries no CPF either, and would pass for the wrong reason.
    expect(response.status).toBe(200);
    expect(html).toContain("TIT-010");
    expect(html).not.toContain(CPF_ACEITO);
    expect(html).not.toContain("390.533.447-05");
    expect(html).not.toContain(CPF_QUARENTENADO);
    expect(html).not.toContain("529.982.247-26");
    // Not even the fragment the matcher is allowed to derive in memory.
    expect(html).not.toContain("053344");
  });

  it("renders money and dates the way a Brazilian reads them", async () => {
    const html = (await harness().route(upload(CARTEIRA))).body as string;

    expect(html).toContain("R$ 1.500,00");
    expect(html).toContain("R$ 700,00");
    expect(html).toContain("15/06/2026");
    expect(html).not.toContain("1500.00");
  });

  it("refuses a file that is not a wallet, naming the fault and not the file", async () => {
    const response = await harness().route(
      upload(Buffer.from("isto nao e uma carteira\n", "utf8")),
    );
    const html = response.body as string;

    expect(response.status).toBe(400);
    expect(html).toContain("as colunas não batem");
    // Every declared column is missing, and the operator is told so.
    expect(html).toContain("Faltou no arquivo");
    expect(html).toContain("vencimento");
  });

  it("refuses an upload carrying no file", async () => {
    const response = await harness().route(
      request({
        method: "POST",
        headers: {
          authorization: "Bearer dev-token",
          "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
        },
        body: Buffer.from(`--${BOUNDARY}--\r\n`, "utf8"),
      }),
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("ARQUIVO_AUSENTE");
  });
});

describe("committing what was previewed", () => {
  it("imports exactly the rows the operator saw accepted", async () => {
    const { route, written } = harness();
    const preview = (await route(upload(CARTEIRA))).body as string;

    const response = await route(confirm(tokenFrom(preview)));

    expect(response.status).toBe(200);
    expect(written.titles.map((title) => title.externalId)).toEqual([
      "TIT-010",
      "TIT-012",
    ]);
    expect(written.titles[0].amountCents).toBe(150_000n);
  });

  it("records who imported what, and counts the quarantine", async () => {
    const { route, written } = harness();
    const preview = (await route(upload(CARTEIRA))).body as string;

    await route(confirm(tokenFrom(preview)));

    expect(written.audits).toHaveLength(1);
    expect(written.audits[0].acceptedRows).toBe(2);
    expect(written.audits[0].quarantinedRows).toBe(1);
    expect(written.audits[0].quarantineReasons).toEqual({ CPF_INVALIDO: 1 });
    expect(written.audits[0].actorId).toBe("agent-a");
  });

  it("reports what was created back to the operator", async () => {
    const { route } = harness();
    const preview = (await route(upload(CARTEIRA))).body as string;

    const html = (await route(confirm(tokenFrom(preview)))).body as string;

    expect(html).toContain("2");
    expect(html).toContain("quarentena");
    // From the report the operator goes to the queue that now has the wallet.
    expect(html).toContain("/carteiras/wallet-a/prioridades");
  });

  it("refuses a token the caller invented", async () => {
    const response = await harness().route(confirm("nao-existe"));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("PREPARO_NAO_ENCONTRADO");
  });

  it("refuses to replay a token already committed", async () => {
    const { route, written } = harness();
    const preview = (await route(upload(CARTEIRA))).body as string;
    const token = tokenFrom(preview);
    await route(confirm(token));

    const replay = await route(confirm(token));

    expect(replay.status).toBe(400);
    expect(written.titles).toHaveLength(2);
  });

  it("does not answer a GET on the confirm route", async () => {
    const response = await harness().route(
      request({ path: "/carteiras/wallet-a/importacoes/confirmar" }),
    );

    expect(response.status).toBe(405);
  });
});

describe("the same authorization path as everything else", () => {
  it("refuses an actor without the import capability", async () => {
    const response = await harness({ actions: ["READ_ACTIONABLE"] }).route(
      request({}),
    );

    expect(response.status).toBe(403);
  });

  it("refuses an actor who may import but may not read the wallet", async () => {
    // The page is rendered in the tenant's own branding, and reading that
    // configuration is an operational read. The theme repository demands a
    // READ_ACTIONABLE operation, so the screen asks for one — rather than
    // widening what the repository accepts.
    const response = await harness({ actions: ["IMPORT_WALLET"] }).route(
      request({}),
    );

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).toContain("PRIORIDADES_NAO_AUTORIZADAS");
  });

  it("refuses to preview for an actor without the import capability", async () => {
    const { route, written } = harness({ actions: ["READ_ACTIONABLE"] });

    const response = await route(upload(CARTEIRA));

    expect(response.status).toBe(403);
    expect(written.titles).toEqual([]);
  });

  it("refuses a wallet the caller holds no grant on", async () => {
    const response = await harness().route(
      request({ path: "/carteiras/wallet-b/importacoes" }),
    );

    expect(response.status).toBe(403);
  });

  it("asks the browser for a credential instead of just refusing", async () => {
    const response = await harness().route(request({ headers: {} }));

    expect(response.status).toBe(401);
    expect(response.headers?.["www-authenticate"]).toContain("Basic");
  });

  it("escapes what came from the uploaded file instead of trusting it", async () => {
    const hostile = Buffer.from(
      "id_externo;nome;cpf;valor;vencimento\n" +
        '<script>alert(1)</script>;JOSE;390.533.447-05;10,00;2026-06-15\n',
      "utf8",
    );

    const html = (await harness().route(upload(hostile))).body as string;

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
