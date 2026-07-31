import type { PolicyClassification } from "@panella/domain";

import type { Classification } from "./classification-schema.js";

/**
 * Projects a domain classification onto the published contract.
 *
 * Two things are deliberately not on the wire. `contribuicao` and `sentido`
 * exist inside the domain signal, but the published signal shape is strict and
 * fixed by the schema; the contribution of every applied signal is spelled out
 * in `explicacao`, which is the field the right-of-review requirement is about.
 * Adding them to the wire is a schema change with a version bump, and belongs
 * to the slice that designs the agent contract, not to this one.
 *
 * The timestamp is a parameter because evaluation is pure: the same dossier
 * under the same policy must classify identically forever, and a clock inside
 * the evaluator would quietly break re-execution.
 */

const CLASSIFICATION_SCHEMA_VERSION = "1.0.0";

const ISO_8601_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function toClassificationContract(
  classification: PolicyClassification,
  classifiedAt: string,
): Classification {
  if (!ISO_8601_UTC.test(classifiedAt)) {
    // The schema would reject it anyway; failing here names the caller's
    // mistake instead of surfacing it as a generic parse error later.
    throw new Error("CLASSIFIED_AT_NAO_E_ISO_8601");
  }

  const base = {
    schema_version: CLASSIFICATION_SCHEMA_VERSION,
    classification_id: classification.classification_id,
    dossier_id: classification.dossier_id,
    policy_version: classification.policy_version,
    classified_at: classifiedAt,
    operational_priority: classification.operational_priority,
    primary_strategy: classification.primary_strategy,
    confianca_global: classification.confianca_global,
    signals: classification.signals.map((signal) => ({
      nome: signal.nome,
      peso: signal.peso,
      fonte: signal.fonte,
      aplicado: signal.aplicado,
    })),
    explicacao: classification.explicacao,
  };

  // The contract's union ties the two together: only DADOS_INSUFICIENTES may
  // appear with INSUFICIENTE coverage, and it may appear with nothing else.
  return classification.cobertura === "INSUFICIENTE"
    ? {
        ...base,
        category: "DADOS_INSUFICIENTES" as const,
        cobertura: "INSUFICIENTE" as const,
      }
    : {
        ...base,
        category: classification.category,
        cobertura: "SUFICIENTE" as const,
      };
}
