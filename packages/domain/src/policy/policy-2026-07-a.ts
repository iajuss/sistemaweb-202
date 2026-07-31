import { factValue, type DossierFieldEnvelope, type DossierSnapshot } from "../dossier.js";

import type { PolicyDefinition, SignalDefinition } from "./types.js";

/**
 * Policy `2026-07-A`. Weights live here, declared and versioned, never as `if`
 * statements scattered through the engine — a weight nobody can point at is a
 * weight nobody can review, and the right to review an automated decision is a
 * legal requirement rather than a feature.
 */

const VALOR_ELEVADO_CENTAVOS = 5_000_000n;
const MULTIPLOS_TITULOS = 3;

function campo(
  dossier: DossierSnapshot,
  key: string,
): DossierFieldEnvelope | undefined {
  return dossier.campos[key];
}

/** Only a confirmed link yields a value. Everything else is evidence. */
function fato(dossier: DossierSnapshot, key: string) {
  const envelope = campo(dossier, key);
  return envelope ? factValue(envelope) : null;
}

function centavos(dossier: DossierSnapshot, key: string): bigint | null {
  const value = fato(dossier, key);
  return value?.tipo === "MONETARIO_CENTAVOS" ? value.centavos : null;
}

function lista(dossier: DossierSnapshot, key: string): readonly string[] {
  const value = fato(dossier, key);
  return value?.tipo === "LISTA_TEXTO" ? value.lista : [];
}

function encontradoConfirmado(
  dossier: DossierSnapshot,
  key: string,
): boolean {
  const envelope = campo(dossier, key);
  if (!envelope || envelope.status !== "ENCONTRADO") {
    return false;
  }
  // The link decides, never a flag handed in with the value.
  const value = factValue(envelope);
  return value?.tipo === "BOOLEANO" && value.booleano;
}

/**
 * ADR 014, and the tightest gate in the policy. The delta says "present in the
 * open data, absent from the list, therefore probably paying an instalment
 * agreement" — an inference that only holds when **both** sources concluded.
 * Open data must have found the debt under a confirmed link, and the list must
 * have genuinely looked and found nothing, across its full scope. Any other
 * combination — unread, failed, filtered, ambiguous — is silence, and silence
 * is not evidence of regularity.
 */
function regularidadeIndiciadaPorDelta(dossier: DossierSnapshot): boolean {
  const abertos = campo(dossier, "pgfn_dados_abertos_presente");
  const listaCampo = campo(dossier, "pgfn_lista_presente");
  if (!abertos || !listaCampo) {
    return false;
  }

  if (!encontradoConfirmado(dossier, "pgfn_dados_abertos_presente")) {
    return false;
  }
  // Exactly `NAO_ENCONTRADO`, not merely "anything but found". Unread and
  // failed are silence, and silence is not evidence of regularity.
  if (listaCampo.status !== "NAO_ENCONTRADO") {
    return false;
  }

  // A manual export is a cut under operator-chosen filters. "Not found under a
  // filter" is not "not on the list", so only a full-scope export qualifies.
  const escopo = Object.values(listaCampo.parametrosConsulta)
    .map((params) => (params as { queryScope?: { complete?: boolean } }).queryScope)
    .filter((scope): scope is { complete?: boolean } => Boolean(scope));
  return escopo.length > 0 && escopo.every((scope) => scope.complete === true);
}

const SIGNALS: readonly SignalDefinition[] = [
    {
      nome: "divida_ativa_confirmada",
      peso: 0.4,
      sentido: "AGRAVANTE",
      fonte: "pgfn_dados_abertos_presente",
      aplica: (dossier) =>
        encontradoConfirmado(dossier, "pgfn_dados_abertos_presente"),
    },
    {
      nome: "presenca_na_lista_de_devedores",
      peso: 0.25,
      sentido: "AGRAVANTE",
      fonte: "pgfn_lista_presente",
      aplica: (dossier) => encontradoConfirmado(dossier, "pgfn_lista_presente"),
    },
    {
      nome: "valor_elevado_em_aberto",
      peso: 0.2,
      sentido: "AGRAVANTE",
      fonte: "carteira_valor_em_aberto",
      aplica: (dossier) => {
        const valor = centavos(dossier, "carteira_valor_em_aberto");
        return valor !== null && valor >= VALOR_ELEVADO_CENTAVOS;
      },
    },
    {
      nome: "multiplos_titulos_em_aberto",
      peso: 0.15,
      sentido: "AGRAVANTE",
      fonte: "carteira_titulos",
      aplica: (dossier) =>
        lista(dossier, "carteira_titulos").length >= MULTIPLOS_TITULOS,
    },
    {
      nome: "pgfn_regularidade_indiciada_por_delta",
      peso: -0.3,
      sentido: "MITIGADOR",
      fonte: "pgfn_dados_abertos_presente+pgfn_lista_presente",
      aplica: regularidadeIndiciadaPorDelta,
    },
    {
      // ADR 012: weight zero and contribution zero. Being a partner in a
      // company demonstrates no income, no liquidity and no alternative
      // channel; any other use needs a new purpose, evidence and ADR.
      nome: "vinculo_societario_qsa_contextual",
      peso: 0,
      sentido: "CONTEXTUAL",
      fonte: "qsa_vinculo",
      aplica: () => false,
    },
];

export const POLICY_2026_07_A: PolicyDefinition = Object.freeze({
  version: "2026-07-A",
  valorElevadoCentavos: VALOR_ELEVADO_CENTAVOS,
  multiplosTitulos: MULTIPLOS_TITULOS,
  thresholds: Object.freeze({ intensiva: 0.7, padrao: 0.3 }),
  priorities: Object.freeze({
    COBRANCA_INTENSIVA: 0,
    COBRANCA_PADRAO: 1,
    MONITORAMENTO: 2,
    DADOS_INSUFICIENTES: 3,
  }),
  signals: Object.freeze(SIGNALS.map((signal) => Object.freeze(signal))),
});

export { regularidadeIndiciadaPorDelta };
