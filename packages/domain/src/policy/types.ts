import type { DossierSnapshot } from "../dossier.js";

/**
 * The triage policy is rules, declared and versioned, never a predictive model
 * (ADR 016). Nothing here carries the name or the semantics of a probability:
 * there is a score, and the score orders effort — it does not estimate whether
 * anyone will pay.
 */

export type SignalDirection = "AGRAVANTE" | "MITIGADOR" | "CONTEXTUAL";

export type PolicyCategory =
  | "COBRANCA_INTENSIVA"
  | "COBRANCA_PADRAO"
  | "MONITORAMENTO"
  | "DADOS_INSUFICIENTES";

export type PolicyStrategy =
  | "CONTATO_DIRETO_PRIORITARIO"
  | "CONTATO_PADRAO"
  | "ACOMPANHAR"
  | "RENEGOCIACAO_COLABORATIVA"
  | "COLETAR_MAIS_DADOS";

export interface SignalDefinition {
  readonly nome: string;
  readonly peso: number;
  readonly sentido: SignalDirection;
  /** The dossier fields the rule reads, named so the explanation can cite them. */
  readonly fonte: string;
  /** Pure: same dossier, same answer. No clock, no randomness, no I/O. */
  readonly aplica: (dossier: DossierSnapshot) => boolean;
}

export interface PolicyDefinition {
  readonly version: string;
  readonly signals: readonly SignalDefinition[];
  readonly thresholds: {
    readonly intensiva: number;
    readonly padrao: number;
  };
  /** R$ 50.000,00 in integer cents. Money never becomes a float. */
  readonly valorElevadoCentavos: bigint;
  readonly multiplosTitulos: number;
  readonly priorities: Readonly<Record<PolicyCategory, number>>;
}

export interface AppliedSignal {
  readonly nome: string;
  readonly peso: number;
  readonly sentido: SignalDirection;
  readonly fonte: string;
  readonly aplicado: boolean;
  readonly contribuicao: number;
}

export interface PolicyClassification {
  readonly classification_id: string;
  readonly dossier_id: string;
  readonly policy_version: string;
  readonly category: PolicyCategory;
  readonly cobertura: "SUFICIENTE" | "INSUFICIENTE";
  readonly operational_priority: number;
  readonly primary_strategy: PolicyStrategy;
  /** Ordering input, not a probability. ADR 016 forbids the second reading. */
  readonly score: number;
  readonly confianca_global: number;
  readonly signals: readonly AppliedSignal[];
  readonly explicacao: string;
}
