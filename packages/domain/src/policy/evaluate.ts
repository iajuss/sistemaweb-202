import type { DossierSnapshot } from "../dossier.js";

import { regularidadeIndiciadaPorDelta } from "./policy-2026-07-a.js";
import type {
  AppliedSignal,
  PolicyCategory,
  PolicyClassification,
  PolicyDefinition,
  PolicyStrategy,
} from "./types.js";

/**
 * The evaluator is a function of dossier × policy and nothing else. No clock,
 * no randomness, no source access: re-running a policy over an old dossier has
 * to produce the same answer, which is what makes comparing two policy
 * versions meaningful (ADR 016).
 */

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Confidence is not a probability of payment. It is how much of the plan was
 * actually read, discounted by the weakest link the classification leaned on.
 */
function confiancaGlobal(
  dossier: DossierSnapshot,
  applied: readonly AppliedSignal[],
): number {
  const usedFields = new Set(
    applied
      .filter((signal) => signal.aplicado && signal.peso !== 0)
      .flatMap((signal) => signal.fonte.split("+")),
  );
  const linkConfidences = Object.values(dossier.campos)
    .filter((envelope) => usedFields.has(envelope.campo))
    .map((envelope) => envelope.confiancaVinculo);

  const cobertura =
    dossier.cobertura.slicesEsperadas === 0
      ? 0
      : dossier.cobertura.slicesConclusivas / dossier.cobertura.slicesEsperadas;
  // No signal leaned on a link, so nothing uncertain was used.
  const elo = linkConfidences.length === 0 ? 1 : Math.min(...linkConfidences);
  return round(cobertura * elo);
}

/**
 * Identity is confirmed when every source that actually returned records has a
 * confirmed link, and at least one does.
 *
 * A source that concluded `NAO_ENCONTRADO` is deliberately not counted: it
 * returned nobody, so there is no identity to resolve and its unresolved link
 * is not doubt. A source that *did* return records under an `AMBIGUO` or
 * `PROVAVEL` link is doubt, and it blocks escalation even when some other
 * source is certain — we would be escalating against a person we cannot say
 * those records belong to.
 */
function identidadeConfirmada(dossier: DossierSnapshot): boolean {
  const comRegistros = Object.values(dossier.campos).filter(
    (envelope) =>
      envelope.vinculoStatus !== "NAO_APLICAVEL" &&
      envelope.status === "ENCONTRADO",
  );
  return (
    comRegistros.length > 0 &&
    comRegistros.every((envelope) => envelope.vinculoConfirmado)
  );
}

function categoryFor(
  score: number,
  policy: PolicyDefinition,
  dossier: DossierSnapshot,
): PolicyCategory {
  if (score >= policy.thresholds.intensiva) {
    // Conservative asymmetry (ADR 016): intensive collection needs a confirmed
    // identity. Under doubt the lighter approach wins, never the heavier one.
    return identidadeConfirmada(dossier)
      ? "COBRANCA_INTENSIVA"
      : "COBRANCA_PADRAO";
  }
  return score >= policy.thresholds.padrao ? "COBRANCA_PADRAO" : "MONITORAMENTO";
}

const STRATEGY_BY_CATEGORY: Record<PolicyCategory, PolicyStrategy> = {
  COBRANCA_INTENSIVA: "CONTATO_DIRETO_PRIORITARIO",
  COBRANCA_PADRAO: "CONTATO_PADRAO",
  MONITORAMENTO: "ACOMPANHAR",
  DADOS_INSUFICIENTES: "COLETAR_MAIS_DADOS",
};

function explain(
  category: PolicyCategory,
  score: number,
  dossier: DossierSnapshot,
  signals: readonly AppliedSignal[],
): string {
  if (category === "DADOS_INSUFICIENTES") {
    const inconclusivas = dossier.cobertura.fontesObrigatoriasInconclusivas;
    return [
      `Cobertura insuficiente: ${inconclusivas.join(", ")} não concluiu.`,
      "Nenhuma classificação acionável é emitida sob cobertura incompleta;",
      "falha de fonte não é indício de mau pagador.",
      `Slices conclusivas: ${dossier.cobertura.slicesConclusivas} de ${dossier.cobertura.slicesEsperadas}.`,
    ].join(" ");
  }

  const aplicados = signals.filter((signal) => signal.aplicado);
  const linhas = aplicados.map(
    (signal) =>
      `${signal.nome} (${signal.sentido.toLowerCase()}, peso ${signal.peso}, fonte ${signal.fonte})`,
  );
  const nenhum = "Nenhum sinal se aplicou.";
  return [
    `Categoria ${category} com pontuação ${score}.`,
    linhas.length > 0 ? `Sinais aplicados: ${linhas.join("; ")}.` : nenhum,
    // Phrased so that the forbidden wording never appears at all, not even
    // inside its own denial: a ban a test can only check by substring has to
    // be checkable by substring.
    "A pontuação ordena esforço de cobrança e não prevê pagamento.",
  ].join(" ");
}

export function evaluatePolicy(
  dossier: DossierSnapshot,
  policy: PolicyDefinition,
): PolicyClassification {
  const signals: AppliedSignal[] = policy.signals.map((definition) => {
    const aplicado = definition.aplica(dossier);
    return {
      nome: definition.nome,
      peso: definition.peso,
      sentido: definition.sentido,
      fonte: definition.fonte,
      aplicado,
      contribuicao: aplicado ? definition.peso : 0,
    };
  });

  const raw = signals.reduce((total, signal) => total + signal.contribuicao, 0);
  const score = round(Math.min(Math.max(raw, 0), 1));
  const insuficiente = dossier.cobertura.veredito === "DADOS_INSUFICIENTES";

  // Insufficient coverage is a category, never a lower number: the score is
  // still reported, and it is still not what decides the answer.
  const scored = categoryFor(score, policy, dossier);
  const category: PolicyCategory = insuficiente ? "DADOS_INSUFICIENTES" : scored;

  const delta = regularidadeIndiciadaPorDelta(dossier);
  const capped: PolicyCategory =
    delta && category === "COBRANCA_INTENSIVA" ? "COBRANCA_PADRAO" : category;

  // ADR 014: the delta recommends a collaborative tone and preserving or
  // renegotiating an agreement, never aggressive escalation.
  const primary_strategy: PolicyStrategy =
    delta && capped !== "DADOS_INSUFICIENTES"
      ? "RENEGOCIACAO_COLABORATIVA"
      : STRATEGY_BY_CATEGORY[capped];

  return Object.freeze({
    classification_id: `${dossier.dossierId}|${policy.version}`,
    dossier_id: dossier.dossierId,
    policy_version: policy.version,
    category: capped,
    cobertura: insuficiente ? ("INSUFICIENTE" as const) : ("SUFICIENTE" as const),
    operational_priority: policy.priorities[capped],
    primary_strategy,
    score,
    confianca_global: confiancaGlobal(dossier, signals),
    signals: Object.freeze(signals.map((signal) => Object.freeze(signal))),
    explicacao: explain(capped, score, dossier, signals),
  });
}

/**
 * Ordering for a finite team. Category first, then score, then dossier id so
 * the result never depends on input order. Priority orders effort; it is not a
 * probability and nothing downstream may read it as one.
 */
export function orderByPriority(
  classifications: readonly PolicyClassification[],
): readonly PolicyClassification[] {
  return [...classifications].sort(
    (left, right) =>
      left.operational_priority - right.operational_priority ||
      right.score - left.score ||
      left.dossier_id.localeCompare(right.dossier_id),
  );
}

export interface PolicyComparison {
  readonly dossier_id: string;
  readonly left: PolicyClassification;
  readonly right: PolicyClassification;
  readonly categoryChanged: boolean;
  readonly priorityDelta: number;
}

/**
 * Runs two policy versions over the same dossiers without touching either
 * stored classification. A new version is compared, never applied in place —
 * that is what keeps re-execution and comparability alive (ADR 016).
 */
export function comparePolicies(
  dossiers: readonly DossierSnapshot[],
  left: PolicyDefinition,
  right: PolicyDefinition,
): readonly PolicyComparison[] {
  return dossiers.map((dossier) => {
    const leftResult = evaluatePolicy(dossier, left);
    const rightResult = evaluatePolicy(dossier, right);
    return Object.freeze({
      dossier_id: dossier.dossierId,
      left: leftResult,
      right: rightResult,
      categoryChanged: leftResult.category !== rightResult.category,
      priorityDelta:
        rightResult.operational_priority - leftResult.operational_priority,
    });
  });
}
