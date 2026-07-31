import {
  evaluatePolicy,
  POLICY_2026_07_B,
  type DossierSnapshot,
  type PolicyCategory,
  type PolicyClassification,
  type PolicyDefinition,
  type SourcePlan,
} from "@panella/domain";
import { LookupDossierRequestSchema } from "@panella/contracts";

import {
  authorizeOperation,
  type AuthenticatedOperationIdentity,
  type AuthorizedOperation,
  type OperationPrincipal,
  type WalletAuthorizationRepository,
} from "./authorize-actor.js";
import {
  composeDossierForDebtor,
  type DebtorObservationReader,
  type DossierSnapshotStore,
  type WalletDebtorReader,
} from "./compose-dossier.js";

/**
 * The agent-facing read path. Two properties are the whole point.
 *
 * **The only handle is the external title id.** There is no lookup by CPF, in
 * a body or anywhere else: a query runs over a title the client already
 * imported, and the caller never holds anything that could address a person
 * directly. The request schema is strict, so `cpf` is refused by shape rather
 * than by anyone remembering to check for it.
 *
 * **Pagination is keyset, and the cursor is opaque.** An offset would shift a
 * page already served the moment a new dossier landed above it.
 */

export interface WalletTitleLookup {
  findDebtorByExternalId(
    principal: OperationPrincipal,
    operation: AuthorizedOperation,
    externalId: string,
  ): Promise<string | null>;
}

export interface LookupDossierInput {
  readonly identity: AuthenticatedOperationIdentity;
  readonly walletId: string;
  /** Unparsed on purpose: validation is the boundary, not the caller's job. */
  readonly body: unknown;
  readonly plan: SourcePlan;
  readonly authorization: WalletAuthorizationRepository;
  readonly titles: WalletTitleLookup;
  readonly debtors: WalletDebtorReader;
  readonly observations: DebtorObservationReader;
  readonly snapshots: DossierSnapshotStore;
  readonly policy?: PolicyDefinition;
  readonly now?: () => Date;
  readonly newDossierId?: () => string;
}

export interface LookupDossierResult {
  readonly dossier: DossierSnapshot;
  readonly classification: PolicyClassification;
}

export async function lookupDossier(
  input: LookupDossierInput,
): Promise<LookupDossierResult> {
  const parsed = LookupDossierRequestSchema.safeParse(input.body);
  if (!parsed.success) {
    // Deliberately uninformative: echoing which key was rejected would confirm
    // to a caller that `cpf` is a field the system knows about.
    throw new Error("REQUISICAO_INVALIDA");
  }

  const operation = await authorizeOperation(
    input.identity,
    input.walletId,
    "READ_DOSSIER",
    input.authorization,
  );
  if (!operation) {
    throw new Error("DOSSIE_NAO_AUTORIZADO");
  }

  const debtorId = await input.titles.findDebtorByExternalId(
    operation.principal,
    operation,
    parsed.data.id_externo,
  );
  if (!debtorId) {
    throw new Error("TITULO_FORA_DA_CARTEIRA");
  }

  const dossier = await composeDossierForDebtor({
    identity: input.identity,
    walletId: input.walletId,
    debtorId,
    plan: input.plan,
    authorization: input.authorization,
    debtors: input.debtors,
    observations: input.observations,
    snapshots: input.snapshots,
    now: input.now,
    newDossierId: input.newDossierId,
  });

  return Object.freeze({
    dossier,
    classification: evaluatePolicy(dossier, input.policy ?? POLICY_2026_07_B),
  });
}

export interface PriorityEntry {
  readonly dossierId: string;
  readonly externalId: string;
  readonly category: PolicyCategory;
  readonly operationalPriority: number;
  readonly score: number;
}

export interface PriorityPage {
  readonly items: readonly PriorityEntry[];
  readonly nextCursor: string | null;
}

interface CursorPosition {
  readonly p: number;
  readonly s: number;
  readonly d: string;
}

function encodeCursor(entry: PriorityEntry): string {
  // Base64url of the sort key, and nothing else. The key is priority, score
  // and dossier id — no CPF, no debtor id, nothing about a person.
  return Buffer.from(
    JSON.stringify({
      p: entry.operationalPriority,
      s: entry.score,
      d: entry.dossierId,
    } satisfies CursorPosition),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): CursorPosition {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as CursorPosition).p !== "number" ||
      typeof (parsed as CursorPosition).s !== "number" ||
      typeof (parsed as CursorPosition).d !== "string"
    ) {
      throw new Error("CURSOR_INVALIDO");
    }
    return parsed as CursorPosition;
  } catch {
    throw new Error("CURSOR_INVALIDO");
  }
}

function compare(left: PriorityEntry, right: PriorityEntry): number {
  return (
    left.operationalPriority - right.operationalPriority ||
    right.score - left.score ||
    left.dossierId.localeCompare(right.dossierId)
  );
}

function isAfter(entry: PriorityEntry, position: CursorPosition): boolean {
  return (
    compare(entry, {
      dossierId: position.d,
      externalId: "",
      category: "MONITORAMENTO",
      operationalPriority: position.p,
      score: position.s,
    }) > 0
  );
}

/**
 * Keyset pagination over the deterministic ordering. Because the sort is total
 * — priority, then score, then id — a cursor names an exact position, and a
 * dossier appearing later cannot push an already-served page around.
 */
export function listPriorities(
  entries: readonly PriorityEntry[],
  request: { readonly cursor: string | null; readonly limit: number },
): PriorityPage {
  const ordered = [...entries].sort(compare);
  const after = request.cursor === null ? null : decodeCursor(request.cursor);
  const remaining =
    after === null ? ordered : ordered.filter((entry) => isAfter(entry, after));
  const items = remaining.slice(0, request.limit);

  return Object.freeze({
    items: Object.freeze(items),
    nextCursor:
      remaining.length > items.length && items.length > 0
        ? encodeCursor(items[items.length - 1])
        : null,
  });
}
