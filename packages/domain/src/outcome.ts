/**
 * Collection outcomes. An outcome is an append-only observation linked to a
 * classification, never an edit of it (ADR 016): overwriting the classification
 * with what happened afterwards destroys both re-execution of an old dossier
 * under a new policy and the comparison between the two versions.
 *
 * These are the labels a future model would need, and recording them honestly
 * now is what would make that possible later. Nothing here trains anything.
 */

export const COLLECTION_OUTCOMES = [
  "CONTATO_FEITO",
  "RESPOSTA",
  "PAGAMENTO",
  "PARCELAMENTO",
  "SILENCIO",
] as const;

export type CollectionOutcomeKind = (typeof COLLECTION_OUTCOMES)[number];

export interface CollectionOutcome {
  readonly outcomeId: string;
  readonly classificationId: string;
  readonly tenantId: string;
  readonly tipo: CollectionOutcomeKind;
  readonly actorId: string;
  readonly recordedAt: string;
  /** Operator note. Never a place for personal data about third parties. */
  readonly observacao: string | null;
}

export function recordOutcome(
  history: readonly CollectionOutcome[],
  outcome: CollectionOutcome,
): readonly CollectionOutcome[] {
  if (outcome.classificationId.length === 0) {
    throw new Error("DESFECHO_SEM_CLASSIFICACAO");
  }
  if (history.some((entry) => entry.outcomeId === outcome.outcomeId)) {
    // Append-only is not "write whatever twice": the same id arriving again is
    // a retry or a bug, and silently keeping both would double a payment.
    throw new Error("DESFECHO_DUPLICADO");
  }

  const sameClassification = history.filter(
    (entry) => entry.classificationId === outcome.classificationId,
  );
  if (sameClassification.some((entry) => entry.tenantId !== outcome.tenantId)) {
    throw new Error("DESFECHO_DE_OUTRO_TENANT");
  }

  return Object.freeze([...history, Object.freeze({ ...outcome })]);
}

/** Outcomes for one classification, oldest first. Nothing is collapsed. */
export function outcomesFor(
  history: readonly CollectionOutcome[],
  classificationId: string,
): readonly CollectionOutcome[] {
  return history.filter(
    (entry) => entry.classificationId === classificationId,
  );
}
