import {
  assertDossierFactDiscipline,
  evaluatePolicy,
  POLICY_2026_07_A,
  type DossierSnapshot,
  type SourcePlan,
} from "@panella/domain";
import {
  ListPrioritiesRequestSchema,
  renderPrompt,
  toClassificationContract,
} from "@panella/contracts";
import {
  authorizeOperation,
  listPriorities,
  lookupDossier,
  type AuthenticatedOperationIdentity,
  type AuthorizedOperation,
  type DebtorObservationReader,
  type DossierSnapshotStore,
  type OperationPrincipal,
  type PriorityEntry,
  type WalletAuthorizationRepository,
  type WalletDebtorReader,
  type WalletTitleLookup,
} from "@panella/application";

/**
 * The delivery layer, and deliberately not a framework.
 *
 * A handler here is a function from a request value to a response value, so
 * the whole surface is testable without a server and can be wrapped by Next.js
 * later without rewriting anything. `server.ts` binds it to `node:http`.
 *
 * The rule this file exists to hold: **the HTTP layer is not a bypass.** Every
 * dependency that decides who the caller is — the identity provider, the
 * identity repository, the authorization repository — is wired at construction
 * and never chosen by a request. That is defect I-3, which stops being
 * theoretical the moment a handler exists.
 */

export interface HttpRequest {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly contentType?: string;
}

export interface DossierSnapshotReader {
  find(
    principal: OperationPrincipal,
    operation: AuthorizedOperation,
    dossierId: string,
  ): Promise<DossierSnapshot | null>;
}

export interface WalletPriorityReader {
  listForWallet(
    principal: OperationPrincipal,
    operation: AuthorizedOperation,
  ): Promise<readonly PriorityEntry[]>;
}

export interface RouterDependencies {
  readonly plan: SourcePlan;
  readonly authorization: WalletAuthorizationRepository;
  /**
   * Resolves the caller from the request's credential and nothing else. It is
   * closed over the identity repository at construction: a request may present
   * a token, never choose which directory validates it.
   */
  authenticate(
    request: HttpRequest,
  ): Promise<AuthenticatedOperationIdentity | null>;
  readonly titles: WalletTitleLookup;
  readonly debtors: WalletDebtorReader;
  readonly observations: DebtorObservationReader;
  readonly snapshots: DossierSnapshotStore & DossierSnapshotReader;
  readonly priorities: WalletPriorityReader;
  readonly now?: () => Date;
  readonly newDossierId?: () => string;
}

function json(status: number, body: unknown): HttpResponse {
  return { status, body, contentType: "application/json; charset=utf-8" };
}

/**
 * Error bodies name a code and never the input. Echoing what was rejected is
 * how a refusal turns into an oracle for what the system knows about.
 */
function problem(status: number, codigo: string): HttpResponse {
  return json(status, { erro: codigo });
}

const LOOKUP = /^\/api\/v1\/carteiras\/([^/]+)\/dossies\/lookup$/;
const PRIORITIES = /^\/api\/v1\/carteiras\/([^/]+)\/prioridades$/;
const PROMPT = /^\/api\/v1\/dossies\/([^/]+)\/prompt$/;

export function createRouter(
  deps: RouterDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  const now = deps.now ?? (() => new Date());

  async function handleLookup(
    request: HttpRequest,
    identity: AuthenticatedOperationIdentity,
    walletId: string,
  ): Promise<HttpResponse> {
    if (request.method !== "POST") {
      // Never GET: the identifier would land in the URL, and from there in
      // every access log and proxy cache along the way.
      return problem(405, "METODO_NAO_PERMITIDO");
    }

    try {
      const result = await lookupDossier({
        identity,
        walletId,
        body: request.body,
        plan: deps.plan,
        authorization: deps.authorization,
        titles: deps.titles,
        debtors: deps.debtors,
        observations: deps.observations,
        snapshots: deps.snapshots,
        now,
        newDossierId: deps.newDossierId,
      });

      return json(200, {
        dossier: {
          dossier_id: result.dossier.dossierId,
          schema_version: result.dossier.schemaVersion,
          composed_at: result.dossier.composedAt,
          cobertura: result.dossier.cobertura.veredito,
        },
        classification: toClassificationContract(
          result.classification,
          now().toISOString(),
        ),
      });
    } catch (error) {
      return lookupFailure(error);
    }
  }

  function lookupFailure(error: unknown): HttpResponse {
    const codigo = error instanceof Error ? error.message : "ERRO_INTERNO";
    switch (codigo) {
      case "REQUISICAO_INVALIDA":
        return problem(400, codigo);
      case "DOSSIE_NAO_AUTORIZADO":
        return problem(403, codigo);
      case "TITULO_FORA_DA_CARTEIRA":
      case "DEVEDOR_FORA_DA_CARTEIRA":
        // 404, not 403: a wallet that does not hold the title must not be able
        // to tell a title that exists elsewhere from one that never existed.
        return problem(404, codigo);
      default:
        return problem(500, codigo);
    }
  }

  async function handlePriorities(
    request: HttpRequest,
    identity: AuthenticatedOperationIdentity,
    walletId: string,
  ): Promise<HttpResponse> {
    if (request.method !== "GET") {
      return problem(405, "METODO_NAO_PERMITIDO");
    }

    const parsed = ListPrioritiesRequestSchema.safeParse({
      cursor: request.query.cursor ?? null,
      limit: request.query.limit ? Number(request.query.limit) : undefined,
    });
    if (!parsed.success) {
      return problem(400, "REQUISICAO_INVALIDA");
    }

    const operation = await authorizeOperation(
      identity,
      walletId,
      "READ_ACTIONABLE",
      deps.authorization,
    );
    if (!operation) {
      return problem(403, "PRIORIDADES_NAO_AUTORIZADAS");
    }

    const entries = await deps.priorities.listForWallet(
      operation.principal,
      operation,
    );
    try {
      const page = listPriorities(entries, parsed.data);
      return json(200, {
        items: page.items.map((entry) => ({
          dossier_id: entry.dossierId,
          id_externo: entry.externalId,
          categoria: entry.category,
          prioridade_operacional: entry.operationalPriority,
          pontuacao: entry.score,
        })),
        next_cursor: page.nextCursor,
      });
    } catch (error) {
      return problem(
        400,
        error instanceof Error ? error.message : "CURSOR_INVALIDO",
      );
    }
  }

  async function handlePrompt(
    request: HttpRequest,
    identity: AuthenticatedOperationIdentity,
    dossierId: string,
  ): Promise<HttpResponse> {
    if (request.method !== "GET") {
      return problem(405, "METODO_NAO_PERMITIDO");
    }

    const walletId = request.query.carteira ?? "wallet-a";
    const operation = await authorizeOperation(
      identity,
      walletId,
      "READ_DOSSIER",
      deps.authorization,
    );
    if (!operation) {
      return problem(403, "DOSSIE_NAO_AUTORIZADO");
    }

    const snapshot = await deps.snapshots.find(
      operation.principal,
      operation,
      dossierId,
    );
    if (!snapshot) {
      return problem(404, "DOSSIE_NAO_ENCONTRADO");
    }

    try {
      // The boundary this guard was written for. A snapshot arriving from
      // storage or from an older schema is not something composition vouched
      // for, so the fact discipline is re-checked before anything renders it.
      assertDossierFactDiscipline(snapshot);
    } catch (error) {
      return problem(
        500,
        error instanceof Error ? error.message : "SNAPSHOT_INVALIDO",
      );
    }

    return {
      status: 200,
      contentType: "text/markdown; charset=utf-8",
      body: renderPrompt(snapshot, evaluatePolicy(snapshot, POLICY_2026_07_A)),
    };
  }

  return async function route(request: HttpRequest): Promise<HttpResponse> {
    const lookup = LOOKUP.exec(request.path);
    const priorities = PRIORITIES.exec(request.path);
    const prompt = PROMPT.exec(request.path);
    if (!lookup && !priorities && !prompt) {
      return problem(404, "ROTA_NAO_ENCONTRADA");
    }

    const identity = await deps.authenticate(request);
    if (!identity) {
      return problem(401, "NAO_AUTENTICADO");
    }

    if (lookup) {
      return handleLookup(request, identity, lookup[1]);
    }
    if (priorities) {
      return handlePriorities(request, identity, priorities[1]);
    }
    return handlePrompt(request, identity, (prompt as RegExpExecArray)[1]);
  };
}
