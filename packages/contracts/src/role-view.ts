import {
  type DossierFieldEnvelope,
  type DossierSnapshot,
  type HumanRole,
  type LinkStatus,
  type PolicyClassification,
  type SourceStatus,
} from "@panella/domain";

import { formatBrlFromCents, formatIsoDate, formatIsoDateTime } from "./format.js";

/**
 * The human-facing projection of a dossier, redacted by role.
 *
 * Two `AGENTS.md` invariants live here, and both are enforced rather than
 * described.
 *
 * **`OPERADOR_COBRANCA` never sees a full CPF nor the full match evidence.**
 * Nobody does, in fact: no view carries a document in any form, and the
 * projection refuses to render at all if one appears in a free-text field it
 * was handed. Which rules tied this person to a published record is review
 * material, and the operator's job is to make a call, not to audit a match —
 * so the operator gets how many rules matched and not which.
 *
 * **The audit role reads the trail without operational access to the wallet.**
 * `ENCARREGADO_LGPD` holds `READ_AUDIT` and nothing else, and the view mirrors
 * the authorization: the trail, plus the decision skeleton the right of review
 * is about (date, rules version, sources, named signals, explanation) — never
 * the debtor, never the amounts.
 *
 * Visibility is a declared table, like the policy weights. A rule spread
 * through `if`s is a rule nobody can review.
 */

export const ROLE_VIEW_VERSION = "1.0.0";

export type ViewAudience = HumanRole;

export interface RoleVisibility {
  /** The wallet's own values: amounts, titles, published fields. */
  readonly campos: boolean;
  /** The person: name today, anything else identifying tomorrow. */
  readonly devedor: boolean;
  /** The decision skeleton: category, signals, explanation. */
  readonly classificacao: boolean;
  /** Which rules matched, as opposed to how many. */
  readonly evidenciaDetalhada: boolean;
  readonly trilha: boolean;
}

export const ROLE_VISIBILITY: Readonly<Record<ViewAudience, RoleVisibility>> =
  Object.freeze({
    ADMIN_TENANT: Object.freeze({
      // Administers grants; holds no read action over a dossier at all.
      campos: false,
      devedor: false,
      classificacao: false,
      evidenciaDetalhada: false,
      trilha: false,
    }),
    ANALISTA_DOSSIE: Object.freeze({
      campos: true,
      devedor: true,
      classificacao: true,
      evidenciaDetalhada: true,
      trilha: false,
    }),
    OPERADOR_COBRANCA: Object.freeze({
      campos: true,
      devedor: true,
      classificacao: true,
      evidenciaDetalhada: false,
      trilha: false,
    }),
    ENCARREGADO_LGPD: Object.freeze({
      campos: false,
      devedor: false,
      classificacao: true,
      evidenciaDetalhada: false,
      trilha: true,
    }),
  });

export interface AuditTrailEntry {
  readonly ocorridoEm: string;
  readonly atorId: string;
  readonly acao: string;
  readonly carteiraId: string;
  readonly devedorId: string;
  readonly fontes: readonly string[];
  readonly resultado: string;
}

export interface RoleViewField {
  readonly campo: string;
  readonly fonte: string;
  readonly status: SourceStatus;
  /** Already formatted for a person to read. Never parsed back. */
  readonly valor: string;
  readonly valorRetido: boolean;
  readonly vinculoStatus: LinkStatus;
  readonly vinculoConfirmado: boolean;
  readonly evidenciaDetalhada: boolean;
  readonly evidenciaVinculo: readonly string[];
  readonly regrasCorrespondentes: number;
  readonly coletadoEm: string | null;
}

export interface RoleViewSignal {
  readonly nome: string;
  readonly peso: number;
  readonly fonte: string;
  readonly aplicado: boolean;
}

export interface RoleViewClassification {
  readonly categoria: string;
  readonly estrategia: string;
  readonly pontuacao: number;
  readonly prioridadeOperacional: number;
  readonly cobertura: string;
  readonly versaoDaPolitica: string;
  readonly sinais: readonly RoleViewSignal[];
  readonly explicacao: string;
}

export interface RoleDossierView {
  readonly viewVersion: string;
  readonly papel: ViewAudience;
  readonly dossierId: string;
  readonly compostoEm: string;
  readonly devedor: { readonly nome: string } | null;
  readonly cobertura: {
    readonly veredito: string;
    readonly slicesConclusivas: number;
    readonly slicesEsperadas: number;
  };
  readonly campos: readonly RoleViewField[];
  readonly classificacao: RoleViewClassification | null;
  readonly trilha: readonly AuditTrailEntry[];
}

export interface ProjectDossierForRoleInput {
  readonly papel: ViewAudience;
  readonly dossier: DossierSnapshot;
  readonly classificacao: PolicyClassification | null;
  readonly devedor: { readonly nome: string; readonly cpf: string };
  readonly trilha?: readonly AuditTrailEntry[];
}

const VALOR_RETIDO = "(valor retido: vínculo não confirmado)";

/** Any document in the published punctuated form, whoever it belongs to. */
const DOCUMENTO_PONTUADO = /\d{3}\.\d{3}\.\d{3}-\d{2}/;

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

function punctuate(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/**
 * The executable form of "no role ever sees the document".
 *
 * It runs over the finished view because that is the thing that reaches a
 * screen, and it knows the debtor's actual CPF because the projection was
 * handed it — so the check is exact rather than a pattern that guesses. The
 * 4-9 fragment is included: it is derived in memory for the matcher and a
 * screen is not the matcher. Matching that specific six-digit string by
 * accident inside an opaque identifier is possible and vanishingly unlikely,
 * and the failure is a named refusal rather than a leak.
 */
function assertNoDocument(view: RoleDossierView, cpf: string): void {
  const rendered = JSON.stringify(view);
  const digits = digitsOf(cpf);
  const forms = [digits, punctuate(digits), digits.slice(3, 9)].filter(
    (form) => form.length > 0,
  );

  if (
    forms.some((form) => rendered.includes(form)) ||
    DOCUMENTO_PONTUADO.test(rendered)
  ) {
    throw new Error("DOCUMENTO_EM_VISAO_DE_PAPEL");
  }
}

function renderValue(envelope: DossierFieldEnvelope): string {
  if (!envelope.vinculoConfirmado) {
    return VALOR_RETIDO;
  }
  const valor = envelope.valor;
  if (valor === null) {
    return "(sem valor)";
  }
  switch (valor.tipo) {
    case "MONETARIO_CENTAVOS":
      return formatBrlFromCents(valor.centavos);
    case "TEXTO":
      return valor.texto;
    case "BOOLEANO":
      return valor.booleano ? "sim" : "não";
    case "DATA_HORA":
      return formatIsoDateTime(valor.dataHora);
    case "LISTA_TEXTO":
      return valor.lista.length === 0 ? "(lista vazia)" : valor.lista.join(", ");
  }
}

function projectField(
  envelope: DossierFieldEnvelope,
  visibility: RoleVisibility,
): RoleViewField {
  return Object.freeze({
    campo: envelope.campo,
    fonte: envelope.fonte,
    status: envelope.status,
    valor: renderValue(envelope),
    valorRetido: !envelope.vinculoConfirmado,
    vinculoStatus: envelope.vinculoStatus,
    vinculoConfirmado: envelope.vinculoConfirmado,
    evidenciaDetalhada: visibility.evidenciaDetalhada,
    evidenciaVinculo: visibility.evidenciaDetalhada
      ? Object.freeze([...envelope.evidenciaVinculo])
      : Object.freeze([]),
    // How many, never which: enough to say the match was examined, not enough
    // to reconstruct what about this person matched what public record.
    regrasCorrespondentes: envelope.evidenciaVinculo.length,
    coletadoEm: envelope.coletadoEm ? formatIsoDate(envelope.coletadoEm) : null,
  });
}

function projectClassification(
  classification: PolicyClassification,
): RoleViewClassification {
  return Object.freeze({
    categoria: classification.category,
    estrategia: classification.primary_strategy,
    pontuacao: classification.score,
    prioridadeOperacional: classification.operational_priority,
    cobertura: classification.cobertura,
    versaoDaPolitica: classification.policy_version,
    sinais: Object.freeze(
      classification.signals.map((signal) =>
        Object.freeze({
          nome: signal.nome,
          peso: signal.peso,
          fonte: signal.fonte,
          aplicado: signal.aplicado,
        }),
      ),
    ),
    // The right to review an automated decision is about this text, so it
    // reaches every role that may see the decision at all.
    explicacao: classification.explicacao,
  });
}

export function projectDossierForRole(
  input: ProjectDossierForRoleInput,
): RoleDossierView {
  const visibility = ROLE_VISIBILITY[input.papel];
  if (!visibility) {
    throw new Error("PAPEL_DESCONHECIDO");
  }

  const view: RoleDossierView = Object.freeze({
    viewVersion: ROLE_VIEW_VERSION,
    papel: input.papel,
    dossierId: input.dossier.dossierId,
    compostoEm: formatIsoDateTime(input.dossier.composedAt),
    devedor: visibility.devedor
      ? Object.freeze({ nome: input.devedor.nome })
      : null,
    cobertura: Object.freeze({
      veredito: input.dossier.cobertura.veredito,
      slicesConclusivas: input.dossier.cobertura.slicesConclusivas,
      slicesEsperadas: input.dossier.cobertura.slicesEsperadas,
    }),
    campos: Object.freeze(
      visibility.campos
        ? Object.keys(input.dossier.campos)
            .sort()
            .map((key) => projectField(input.dossier.campos[key], visibility))
        : [],
    ),
    classificacao:
      visibility.classificacao && input.classificacao
        ? projectClassification(input.classificacao)
        : null,
    trilha: Object.freeze(
      visibility.trilha
        ? (input.trilha ?? []).map((entry) =>
            Object.freeze({
              ...entry,
              ocorridoEm: formatIsoDateTime(entry.ocorridoEm),
              fontes: Object.freeze([...entry.fontes]),
            }),
          )
        : [],
    ),
  });

  assertNoDocument(view, input.devedor.cpf);
  return view;
}
