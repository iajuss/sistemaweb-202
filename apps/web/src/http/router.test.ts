import { afterEach, describe, expect, it, vi } from "vitest";

import { DevInsecureIdentityProvider } from "../../../../packages/adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../../../../packages/adapters/src/keycloak.js";
import {
  composeDossier,
  sourcePlanForUfs,
  type DossierSnapshot,
  type TenantContext,
  type WalletGrant,
} from "@panella/domain";
import type {
  AuthorizedOperation,
  OperationPrincipal,
  WalletAuthorizationRepository,
} from "@panella/application";

import { dossierFrom } from "../../../../fixtures/policy/dossiers.js";

import { createRouter, type HttpRequest } from "./router.js";
import type { TenantTheme } from "./views.js";

/** White label: every visible name, colour and mark belongs to the tenant. */
const THEME: TenantTheme = {
  nomeDoProduto: "Triagem de Cobrança",
  corPrimaria: "#1F4E79",
  corSecundaria: "#F2F5F8",
  marca: "Cliente Demonstração",
};

const PLAN = sourcePlanForUfs(["SP"]);
const DEBTOR = { debtorId: "debtor-a", name: "JOSE SILVA", cpf: "52998224725" };

class WalletFixture implements WalletAuthorizationRepository {
  public constructor(
    private readonly actions: WalletGrant["actions"] = [
      "READ_DOSSIER",
      "READ_ACTIONABLE",
    ],
  ) {}

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

/**
 * The repository is wired once, at construction. Nothing in a request can
 * choose it — that is precisely defect I-3, which stops being theoretical the
 * moment a handler exists, and the tests below hold it shut.
 */
const identityRepository: IdentityActorRepository = {
  findByIdentity: async () => ({
    actorId: "agent-a",
    tenantId: "tenant-a",
    kind: "AGENT",
    roles: [],
  }),
};

const foreignRepository: IdentityActorRepository = {
  findByIdentity: async () => ({
    actorId: "agent-b",
    tenantId: "tenant-b",
    kind: "AGENT",
    roles: [],
  }),
};

async function identityFor(
  repository: IdentityActorRepository,
): Promise<AuthenticatedIdentity> {
  vi.stubEnv("NODE_ENV", "development");
  const principal = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  }).authenticateMachineAgent({
    issuer: "https://identity.example/realms/acme",
    subject: "service-account-agent-a",
  });
  return mapVerifiedKeycloakActor(principal, repository);
}

const STORED: DossierSnapshot = composeDossier({
  dossierId: "dossier-1",
  tenantId: "tenant-a",
  debtorId: "debtor-a",
  composedAt: "2026-07-31T12:00:00.000Z",
  plan: PLAN,
  observations: [],
  resolutions: {},
});

function router(
  overrides: {
    readonly repository?: IdentityActorRepository;
    readonly actions?: WalletGrant["actions"];
    readonly stored?: readonly DossierSnapshot[];
    readonly theme?: TenantTheme | null;
    readonly debtorName?: string;
  } = {},
) {
  const authorization = new WalletFixture(overrides.actions);
  return createRouter({
    plan: PLAN,
    authorization,
    // Honours the credential, like a real authenticator: no bearer token, no
    // caller. The repository it consults is closed over here and is never
    // reachable from the request.
    authenticate: async (incoming) =>
      incoming.headers.authorization?.startsWith("Bearer ")
        ? identityFor(overrides.repository ?? identityRepository)
        : null,
    titles: {
      findDebtorByExternalId: async (
        _principal: OperationPrincipal,
        _operation: AuthorizedOperation,
        externalId: string,
      ) => (externalId === "TIT-001" ? DEBTOR.debtorId : null),
    },
    debtors: {
      findInWallet: async (_principal, _operation, debtorId) =>
        debtorId === DEBTOR.debtorId
          ? { ...DEBTOR, name: overrides.debtorName ?? DEBTOR.name }
          : null,
    },
    debtorNames: {
      findNameInWallet: async (_principal, _operation, debtorId) =>
        debtorId === DEBTOR.debtorId
          ? overrides.debtorName ?? DEBTOR.name
          : null,
    },
    theme: {
      read: async () =>
        overrides.theme === undefined ? THEME : overrides.theme,
    },
    observations: { listForDebtor: async () => [] },
    snapshots: {
      save: async () => undefined,
      find: async (_principal, _operation, dossierId) =>
        (overrides.stored ?? [STORED]).find(
          (entry) => entry.dossierId === dossierId,
        ) ?? null,
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
        {
          dossierId: "dossier-2",
          externalId: "TIT-002",
          category: "COBRANCA_PADRAO" as const,
          operationalPriority: 1,
          score: 0.35,
        },
      ],
    },
    now: () => new Date("2026-07-31T12:00:00.000Z"),
    newDossierId: () => "dossier-1",
  });
}

function request(overrides: Partial<HttpRequest>): HttpRequest {
  return {
    method: "GET",
    path: "/",
    query: {},
    headers: { authorization: "Bearer dev-token" },
    body: null,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("POST lookup", () => {
  const path = "/api/v1/carteiras/wallet-a/dossies/lookup";

  it("answers a dossier and a classification for an external title id", async () => {
    const response = await router()(
      request({ method: "POST", path, body: { id_externo: "TIT-001" } }),
    );

    expect(response.status).toBe(200);
    const body = response.body as { dossier: { dossier_id: string } };
    expect(body.dossier.dossier_id).toBe("dossier-1");
  });

  it("refuses a CPF in the body", async () => {
    const response = await router()(
      request({ method: "POST", path, body: { cpf: "52998224725" } }),
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain("52998224725");
  });

  it("has no route that takes a CPF in the path", async () => {
    const response = await router()(
      request({ method: "POST", path: "/api/v1/dossies/52998224725" }),
    );

    expect(response.status).toBe(404);
  });

  it("never echoes the CPF into any response", async () => {
    const response = await router()(
      request({ method: "POST", path, body: { id_externo: "TIT-001" } }),
    );

    expect(JSON.stringify(response.body)).not.toContain("52998224725");
    expect(JSON.stringify(response.body)).not.toContain("982247");
  });

  it("refuses a title the wallet does not hold", async () => {
    const response = await router()(
      request({ method: "POST", path, body: { id_externo: "TIT-999" } }),
    );

    expect(response.status).toBe(404);
  });

  it("refuses a wallet outside the actor's tenant", async () => {
    // The actor belongs to tenant-b and the wallet to tenant-a. The HTTP
    // layer must not become the place where that stops being checked.
    const response = await router({ repository: foreignRepository })(
      request({ method: "POST", path, body: { id_externo: "TIT-001" } }),
    );

    expect(response.status).toBe(403);
  });

  it("refuses an actor without the wallet capability", async () => {
    const response = await router({ actions: ["READ_AUDIT"] })(
      request({ method: "POST", path, body: { id_externo: "TIT-001" } }),
    );

    expect(response.status).toBe(403);
  });

  it("refuses an unauthenticated request", async () => {
    const response = await router()(
      request({ method: "POST", path, headers: {}, body: { id_externo: "TIT-001" } }),
    );

    expect(response.status).toBe(401);
  });

  it("does not answer a GET on the lookup route", async () => {
    // A GET would put the identifier in a URL, where it lands in access logs.
    const response = await router()(request({ method: "GET", path }));

    expect(response.status).toBe(405);
  });
});

describe("GET priorities", () => {
  const path = "/api/v1/carteiras/wallet-a/prioridades";

  it("returns an ordered page and a cursor", async () => {
    const response = await router()(request({ path, query: { limit: "1" } }));
    const body = response.body as {
      items: { dossier_id: string }[];
      next_cursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    // Ordered by operational priority, so dossier-2 comes first.
    expect(body.items[0].dossier_id).toBe("dossier-2");
    expect(body.next_cursor).not.toBeNull();
  });

  it("follows its own cursor without repeating an entry", async () => {
    const first = (await router()(request({ path, query: { limit: "1" } })))
      .body as { next_cursor: string };
    const second = (await router()(
      request({ path, query: { limit: "1", cursor: first.next_cursor } }),
    )).body as { items: { dossier_id: string }[] };

    expect(second.items[0].dossier_id).toBe("dossier-1");
  });

  it("refuses a cursor the caller invented", async () => {
    const response = await router()(
      request({ path, query: { cursor: "inventado" } }),
    );

    expect(response.status).toBe(400);
  });

  it("refuses an actor without the wallet capability", async () => {
    const response = await router({ actions: ["READ_AUDIT"] })(
      request({ path }),
    );

    expect(response.status).toBe(403);
  });
});

describe("GET prompt", () => {
  const path = "/api/v1/dossies/dossier-1/prompt";

  it("renders the stored snapshot as text", async () => {
    const response = await router()(request({ path }));

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/markdown; charset=utf-8");
    expect(String(response.body)).toContain("prompt_version");
    expect(String(response.body)).toContain("DADOS_INSUFICIENTES");
  });

  it("carries no CPF", async () => {
    const response = await router()(request({ path }));

    expect(String(response.body)).not.toContain("52998224725");
  });

  it("answers 404 for a dossier this wallet cannot reach", async () => {
    const response = await router({ stored: [] })(request({ path }));

    expect(response.status).toBe(404);
  });

  it("refuses a stored snapshot that claims a fact under an unconfirmed link", async () => {
    // The reader is the boundary `assertDossierFactDiscipline` was written
    // for: a snapshot arriving from storage or from an older schema is not
    // something composition vouched for.
    const forged = {
      ...STORED,
      campos: {
        ...STORED.campos,
        pgfn_dados_abertos_presente: {
          ...STORED.campos.pgfn_dados_abertos_presente,
          vinculoStatus: "PROVAVEL" as const,
          vinculoConfirmado: true,
        },
      },
    } as DossierSnapshot;

    const response = await router({ stored: [forged] })(request({ path }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).toContain(
      "VINCULO_NAO_CONFIRMADO_MARCADO_COMO_FATO",
    );
  });
});

/**
 * The delivery layer of Task 12: two server-rendered pages, no framework and
 * no new dependency, over the **same** authorization path the API uses. The
 * view a caller gets is derived from the grant the repository returned — never
 * from anything the request said about itself.
 */
const RICO: DossierSnapshot = dossierFrom({
  carteira: { cents: 2_917_588_644n, titulos: 3 },
  dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
  lista: { status: "ENCONTRADO", link: "PROVAVEL" },
});

describe("UI — página de prioridades da carteira", () => {
  const path = "/carteiras/wallet-a/prioridades";

  it("renders the queue as HTML", async () => {
    const response = await router()(request({ path }));

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/html; charset=utf-8");
    const html = response.body as string;
    expect(html).toContain("COBRANCA_PADRAO");
    expect(html).toContain("TIT-002");
    // Ordered queue, priority first: the standard-collection entry outranks
    // the monitoring one whatever order the reader returned them in.
    expect(html.indexOf("TIT-002")).toBeLessThan(html.indexOf("TIT-001"));
  });

  it("takes its name, mark and colours from the tenant", async () => {
    const html = (await router()(request({ path }))).body as string;

    expect(html).toContain("Triagem de Cobrança");
    expect(html).toContain("Cliente Demonstração");
    expect(html).toContain("#1F4E79");
  });

  it("carries no branding of whoever built it", async () => {
    const html = (await router()(request({ path }))).body as string;

    // The workspace scope is the developer's name. If it ever reaches a page —
    // footer, meta tag, title — this fails.
    expect(html.toLowerCase()).not.toContain("panella");
  });

  it("refuses to invent a theme when the tenant configured none", async () => {
    // A default product name is developer branding with extra steps.
    const response = await router({ theme: null })(request({ path }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).toContain("TEMA_NAO_CONFIGURADO");
  });

  it("asks the browser for a credential instead of just refusing", async () => {
    const response = await router()(
      request({ path, headers: {} }),
    );

    expect(response.status).toBe(401);
    expect(response.headers?.["www-authenticate"]).toContain("Basic");
  });

  it("refuses a wallet the caller holds no grant on", async () => {
    const response = await router()(request({ path: "/carteiras/wallet-b/prioridades" }));

    expect(response.status).toBe(403);
  });
});

describe("UI — página de dossiê", () => {
  const path = "/carteiras/wallet-a/dossies/dossier-1";

  function uiRouter(actions?: WalletGrant["actions"], debtorName?: string) {
    return router({ actions, stored: [RICO], debtorName });
  }

  it("shows the named signals and the explanation", async () => {
    const html = (await uiRouter()(request({ path }))).body as string;

    expect(html).toContain("divida_ativa_confirmada");
    expect(html).toContain("tres_ou_mais_titulos_em_aberto");
    // The right to review an automated decision is about this text.
    expect(html).toContain("A pontuação ordena esforço de cobrança");
  });

  it("renders money and dates the way a Brazilian reads them", async () => {
    const html = (await uiRouter()(request({ path }))).body as string;

    expect(html).toContain("R$ 29.175.886,44");
    expect(html).toContain("25/07/2026");
    expect(html).not.toContain("29175886.44");
  });

  it("never shows the CPF", async () => {
    const html = (await uiRouter()(request({ path }))).body as string;

    expect(html).not.toContain("52998224725");
    expect(html).not.toContain("982247");
  });

  it("withholds a value whose link is not confirmed", async () => {
    const html = (await uiRouter()(request({ path }))).body as string;

    expect(html).toContain("valor retido");
  });

  it("redacts the match evidence for a caller holding only READ_ACTIONABLE", async () => {
    // The audience follows the grant. An operator sees how many rules matched
    // and not which, because deciding an approach is not auditing a match.
    const html = (await uiRouter(["READ_ACTIONABLE"])(request({ path })))
      .body as string;

    expect(html).not.toContain("todos_os_tokens_presentes");
    expect(html).toContain("OPERADOR_COBRANCA");
  });

  it("shows the match evidence to a caller holding READ_DOSSIER", async () => {
    const html = (await uiRouter(["READ_ACTIONABLE", "READ_DOSSIER"])(
      request({ path }),
    )).body as string;

    expect(html).toContain("todos_os_tokens_presentes");
    expect(html).toContain("ANALISTA_DOSSIE");
  });

  it("escapes what came from the data instead of trusting it", async () => {
    const html = (await uiRouter(undefined, "JOSE <script>alert(1)</script>"))
      .call(null, request({ path }));

    expect(((await html).body as string)).not.toContain("<script>alert(1)</script>");
    expect(((await html).body as string)).toContain("&lt;script&gt;");
  });

  it("answers 404 for a dossier nobody stored", async () => {
    const response = await uiRouter()(
      request({ path: "/carteiras/wallet-a/dossies/dossier-9" }),
    );

    expect(response.status).toBe(404);
  });
});
