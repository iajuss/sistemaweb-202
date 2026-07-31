import { describe, expect, it } from "vitest";

import {
  dossierFrom,
  type DossierSpec,
} from "../../../../fixtures/policy/dossiers.js";

import { evaluatePolicy } from "./evaluate.js";
import { POLICY_2026_07_B } from "./policy-2026-07-b.js";

/**
 * Every expectation below was calculated by hand before the evaluator existed.
 *
 * Weights of policy `2026-07-B`, unchanged from `2026-07-A` — only the label
 * moved, and ADR 025 says why:
 *
 * | sinal                                 | peso  | sentido     |
 * |---------------------------------------|-------|-------------|
 * | divida_ativa_confirmada               |  0.40 | AGRAVANTE   |
 * | presenca_na_lista_de_devedores        |  0.25 | AGRAVANTE   |
 * | valor_elevado_em_aberto               |  0.20 | AGRAVANTE   |
 * | tres_ou_mais_titulos_em_aberto        |  0.15 | AGRAVANTE   |
 * | pgfn_regularidade_indiciada_por_delta | -0.30 | MITIGADOR   |
 * | vinculo_societario_qsa_contextual     |  0.00 | CONTEXTUAL  |
 *
 * Bands: `COBRANCA_INTENSIVA` ≥ 0.70, `COBRANCA_PADRAO` ≥ 0.30, below that
 * `MONITORAMENTO`. Insufficient coverage short-circuits to
 * `DADOS_INSUFICIENTES` whatever the score — a category, never a lower number.
 */

const CARTEIRA_PESADA = { cents: 8_000_000n, titulos: 3 } as const;
const CARTEIRA_LEVE = { cents: 1_000_000n, titulos: 3 } as const;

/** 0.40 + 0.25 + 0.20 + 0.15 = 1.00 */
const CASA_CHEIA: DossierSpec = {
  carteira: CARTEIRA_PESADA,
  dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
  lista: { status: "ENCONTRADO", link: "CONFIRMADO" },
};

/** 0.20 + 0.15 = 0.35 */
const SO_CARTEIRA: DossierSpec = {
  carteira: CARTEIRA_PESADA,
  dadosAbertos: { status: "NAO_ENCONTRADO" },
  lista: { status: "NAO_ENCONTRADO" },
};

/** 0.15 */
const UM_SINAL: DossierSpec = {
  carteira: CARTEIRA_LEVE,
  dadosAbertos: { status: "NAO_ENCONTRADO" },
  lista: { status: "NAO_ENCONTRADO" },
};

/** 0.40 + 0.20 + 0.15 - 0.30 = 0.45; without the delta it would be 0.75. */
const COM_DELTA: DossierSpec = {
  carteira: CARTEIRA_PESADA,
  dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
  lista: { status: "NAO_ENCONTRADO", escopoCompleto: true },
};

function evaluate(spec: DossierSpec) {
  return evaluatePolicy(dossierFrom(spec), POLICY_2026_07_B);
}

function contribution(
  result: ReturnType<typeof evaluate>,
  nome: string,
): number {
  const signal = result.signals.find((entry) => entry.nome === nome);
  if (!signal) {
    throw new Error(`SINAL_AUSENTE_NO_RESULTADO:${nome}`);
  }
  return signal.contribuicao;
}

function applied(result: ReturnType<typeof evaluate>, nome: string): boolean {
  return result.signals.find((entry) => entry.nome === nome)?.aplicado ?? false;
}

describe("hand-calculated cases", () => {
  it("scores a full house at 1.00 and escalates", () => {
    const result = evaluate(CASA_CHEIA);

    expect(result.score).toBeCloseTo(1, 10);
    expect(result.category).toBe("COBRANCA_INTENSIVA");
    expect(result.operational_priority).toBe(0);
    expect(result.primary_strategy).toBe("CONTATO_DIRETO_PRIORITARIO");
    expect(result.cobertura).toBe("SUFICIENTE");
    expect(result.confianca_global).toBeCloseTo(1, 10);
  });

  it("scores wallet facts alone at 0.35", () => {
    const result = evaluate(SO_CARTEIRA);

    expect(result.score).toBeCloseTo(0.35, 10);
    expect(result.category).toBe("COBRANCA_PADRAO");
    expect(result.operational_priority).toBe(1);
    expect(contribution(result, "divida_ativa_confirmada")).toBe(0);
  });

  it("scores a single signal at 0.15 and only monitors", () => {
    const result = evaluate(UM_SINAL);

    expect(result.score).toBeCloseTo(0.15, 10);
    expect(result.category).toBe("MONITORAMENTO");
    expect(result.operational_priority).toBe(2);
    expect(applied(result, "valor_elevado_em_aberto")).toBe(false);
  });

  it("declares every signal, applied or not", () => {
    const result = evaluate(UM_SINAL);

    expect(result.signals.map((entry) => entry.nome).sort()).toEqual(
      POLICY_2026_07_B.signals.map((entry) => entry.nome).sort(),
    );
  });
});

describe("uncertainty never becomes a fact", () => {
  it("does not count active debt behind a merely probable link", () => {
    const result = evaluate({
      ...SO_CARTEIRA,
      dadosAbertos: { status: "ENCONTRADO", link: "PROVAVEL" },
    });

    expect(applied(result, "divida_ativa_confirmada")).toBe(false);
    expect(result.score).toBeCloseTo(0.35, 10);
    expect(result.category).toBe("COBRANCA_PADRAO");
  });

  it("does not count active debt behind an ambiguous link", () => {
    const result = evaluate({
      ...SO_CARTEIRA,
      dadosAbertos: { status: "ENCONTRADO", link: "AMBIGUO" },
    });

    expect(applied(result, "divida_ativa_confirmada")).toBe(false);
    expect(result.category).toBe("COBRANCA_PADRAO");
  });

  it("refuses to escalate without a confirmed identity", () => {
    // Everything else says intensive; the identity does not. Conservative
    // asymmetry means the lighter approach wins (ADR 016).
    const result = evaluate({
      carteira: CARTEIRA_PESADA,
      dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
      lista: { status: "ENCONTRADO", link: "AMBIGUO" },
    });

    expect(result.category).not.toBe("COBRANCA_INTENSIVA");
  });
});

describe("coverage decides a category, never a number", () => {
  it("returns DADOS_INSUFICIENTES when a required source errored", () => {
    const result = evaluate({
      carteira: CARTEIRA_PESADA,
      dadosAbertos: { status: "ERRO_NA_FONTE" },
      lista: { status: "NAO_ENCONTRADO" },
    });

    expect(result.cobertura).toBe("INSUFICIENTE");
    expect(result.category).toBe("DADOS_INSUFICIENTES");
    expect(result.operational_priority).toBe(3);
    expect(result.primary_strategy).toBe("COLETAR_MAIS_DADOS");
  });

  it("returns DADOS_INSUFICIENTES when a source was never consulted", () => {
    const result = evaluate({ carteira: CARTEIRA_PESADA });

    expect(result.category).toBe("DADOS_INSUFICIENTES");
  });

  it("does not let a source failure read as a clean record", () => {
    const errored = evaluate({
      carteira: CARTEIRA_LEVE,
      dadosAbertos: { status: "ERRO_NA_FONTE" },
      lista: { status: "NAO_ENCONTRADO" },
    });
    const clean = evaluate(UM_SINAL);

    // Same wallet, same score, different answer: one concluded and one did
    // not, and the failure must never be the more comfortable outcome.
    expect(errored.score).toBeCloseTo(clean.score, 10);
    expect(errored.category).toBe("DADOS_INSUFICIENTES");
    expect(clean.category).toBe("MONITORAMENTO");
  });
});

describe("the PGFN regularity delta", () => {
  it("applies when open data found the debt and the full list did not", () => {
    const result = evaluate(COM_DELTA);

    expect(applied(result, "pgfn_regularidade_indiciada_por_delta")).toBe(true);
    expect(contribution(result, "pgfn_regularidade_indiciada_por_delta")).toBe(
      -0.3,
    );
    expect(result.score).toBeCloseTo(0.45, 10);
  });

  /**
   * The case the running system produced, and the reason this signal was
   * silently unreachable for the people who most deserve it.
   *
   * In the demo the list comes back `ENCONTRADO` with the link `REJEITADO`:
   * rows arrived, the resolver looked at every one of them and refused them
   * all. For the delta that is **absence** — this person is not on the list —
   * and keying on the raw source state reads it as presence, so the positive
   * signal fails to fire for exactly the people it exists for.
   */
  it("applies when the list returned records and the resolver refused every one", () => {
    const result = evaluate({
      ...COM_DELTA,
      lista: { status: "ENCONTRADO", link: "REJEITADO", escopoCompleto: true },
    });

    expect(applied(result, "pgfn_regularidade_indiciada_por_delta")).toBe(true);
    expect(result.score).toBeCloseTo(0.45, 10);
    expect(result.primary_strategy).toBe("RENEGOCIACAO_COLABORATIVA");
  });

  it("applies when the list published nobody whose mask fits this person", () => {
    // Same shape, different reason: rows came back and the mask excluded them
    // before any name was scored. Absence, again, rather than presence.
    const result = evaluate({
      ...COM_DELTA,
      lista: {
        status: "ENCONTRADO",
        link: "SEM_CANDIDATO",
        escopoCompleto: true,
      },
    });

    expect(applied(result, "pgfn_regularidade_indiciada_por_delta")).toBe(true);
  });

  it("does not confuse a refused link with an uncertain one", () => {
    // `REJEITADO` is an answer; `AMBIGUO` and `PROVAVEL` are doubt. Doubt is
    // silence, and silence is not evidence of regularity.
    for (const link of ["AMBIGUO", "PROVAVEL"] as const) {
      const result = evaluate({
        ...COM_DELTA,
        lista: { status: "ENCONTRADO", link, escopoCompleto: true },
      });

      expect(applied(result, "pgfn_regularidade_indiciada_por_delta")).toBe(
        false,
      );
    }
  });

  it("recommends renegotiation and never escalation", () => {
    const withDelta = evaluate(COM_DELTA);
    const withoutDelta = evaluate({
      ...COM_DELTA,
      lista: { status: "NAO_ENCONTRADO", escopoCompleto: false },
    });

    // The same debtor scores 0.75 and escalates when the list cannot support
    // the inference, and 0.45 with a collaborative strategy when it can.
    expect(withoutDelta.score).toBeCloseTo(0.75, 10);
    expect(withoutDelta.category).toBe("COBRANCA_INTENSIVA");
    expect(withDelta.category).toBe("COBRANCA_PADRAO");
    expect(withDelta.primary_strategy).toBe("RENEGOCIACAO_COLABORATIVA");
  });

  // `escopoCompleto: true` on the inconclusive cases is deliberate. Without it
  // they would be refused by the scope check and pass while saying nothing
  // about the status rule — the mutation that accepts any status other than
  // ENCONTRADO survived exactly that way.
  it.each([
    ["a filtered list export", { status: "NAO_ENCONTRADO", escopoCompleto: false }],
    ["an unread list", { status: "NAO_CONSULTADO", escopoCompleto: true }],
    ["a failed list", { status: "ERRO_NA_FONTE", escopoCompleto: true }],
    [
      "the debtor being on the list",
      { status: "ENCONTRADO", link: "CONFIRMADO", escopoCompleto: true },
    ],
  ] as const)("does not apply with %s", (_case, lista) => {
    const result = evaluate({ ...COM_DELTA, lista });

    expect(applied(result, "pgfn_regularidade_indiciada_por_delta")).toBe(false);
  });

  it.each([
    ["unread open data", { status: "NAO_CONSULTADO" }],
    ["failed open data", { status: "ERRO_NA_FONTE" }],
    ["open data that found nothing", { status: "NAO_ENCONTRADO" }],
    ["an ambiguous open-data link", { status: "ENCONTRADO", link: "AMBIGUO" }],
    ["a merely probable open-data link", { status: "ENCONTRADO", link: "PROVAVEL" }],
  ] as const)("does not apply with %s", (_case, dadosAbertos) => {
    const result = evaluate({ ...COM_DELTA, dadosAbertos });

    expect(applied(result, "pgfn_regularidade_indiciada_por_delta")).toBe(false);
  });

  it("does not apply when the observation declared no scope at all", () => {
    // The scope now comes from the export's own preamble rather than from a
    // constant, so the signal is reachable. What is still refused is silence:
    // an observation that says nothing about which query produced it cannot
    // authorise the inference, and absence of a declaration is not a
    // declaration of integrality.
    const result = evaluate({
      ...COM_DELTA,
      lista: { status: "NAO_ENCONTRADO" },
    });

    expect(applied(result, "pgfn_regularidade_indiciada_por_delta")).toBe(false);
  });
});

/**
 * Found by running the system: a wallet listing `DEMO-001` and `DEMO-002` did
 * not get the signal. The evaluation is right — the policy declares a minimum
 * of three — and the **name** was wrong: "múltiplos" reads as two or more.
 *
 * A named signal is the unit a person reviews an automated decision by, which
 * is a legal requirement rather than a feature, so a name that misdescribes
 * its own rule is a defect in the explanation itself. The weights were
 * hand-calibrated at three and are not moved here; the label is.
 */
describe("the recurrence signal is named after the rule it applies", () => {
  it("applies at three open titles and not at two", () => {
    const dois = evaluate({
      ...UM_SINAL,
      carteira: { cents: 1_000_000n, titulos: 2 },
    });
    const tres = evaluate({
      ...UM_SINAL,
      carteira: { cents: 1_000_000n, titulos: 3 },
    });

    expect(applied(dois, "tres_ou_mais_titulos_em_aberto")).toBe(false);
    expect(applied(tres, "tres_ou_mais_titulos_em_aberto")).toBe(true);
  });

  it("promises no threshold the policy does not apply", () => {
    expect(POLICY_2026_07_B.signals.map((signal) => signal.nome)).not.toContain(
      "multiplos_titulos_em_aberto",
    );
    expect(POLICY_2026_07_B.minimoDeTitulos).toBe(3);
  });
});

describe("the QSA signal carries no weight", () => {
  it("declares zero weight and zero contribution", () => {
    const result = evaluate(CASA_CHEIA);
    const qsa = result.signals.find(
      (entry) => entry.nome === "vinculo_societario_qsa_contextual",
    );

    // ADR 012: being a partner in a company demonstrates no income, no
    // liquidity and no alternative channel. Any future use needs a new ADR.
    expect(qsa?.peso).toBe(0);
    expect(qsa?.contribuicao).toBe(0);
  });
});

describe("the classification explains itself", () => {
  it("names every applied signal in readable text", () => {
    const result = evaluate(CASA_CHEIA);

    for (const signal of result.signals.filter((entry) => entry.aplicado)) {
      expect(result.explicacao).toContain(signal.nome);
    }
    expect(result.explicacao.length).toBeGreaterThan(0);
  });

  it("says which sources were inconclusive when coverage fails", () => {
    const result = evaluate({
      carteira: CARTEIRA_LEVE,
      dadosAbertos: { status: "ERRO_NA_FONTE" },
      lista: { status: "NAO_ENCONTRADO" },
    });

    expect(result.explicacao).toContain("PGFN_DADOS_ABERTOS");
  });

  it("carries the policy version and the dossier it judged", () => {
    const result = evaluate(CASA_CHEIA);

    expect(result.policy_version).toBe("2026-07-B");
    expect(result.dossier_id).toBe("dossier-1");
  });

  it("is deterministic: the same dossier yields the same classification", () => {
    const first = evaluate(CASA_CHEIA);
    const second = evaluate(CASA_CHEIA);

    expect({ ...first, classification_id: null }).toEqual({
      ...second,
      classification_id: null,
    });
  });
});

/**
 * ADR 025. A policy version identifies **behaviour**, not intent. Before the
 * delta correction the mitigating signal could never fire, and the recurrence
 * signal answered to another name in the published output; two runs both
 * labelled `2026-07-A` would therefore disagree, which is the same false
 * guarantee this project removed everywhere else.
 *
 * The declared weights and thresholds did not move, and the table below is what
 * says so — it is the same table this file's header carries, asserted rather
 * than described.
 */
describe("the policy version identifies the behaviour that ships", () => {
  it("is 2026-07-B, and every classification says so", () => {
    expect(POLICY_2026_07_B.version).toBe("2026-07-B");
    expect(evaluate(CASA_CHEIA).policy_version).toBe("2026-07-B");
  });

  it("kept every declared weight and threshold of 2026-07-A", () => {
    expect(
      Object.fromEntries(
        POLICY_2026_07_B.signals.map((signal) => [signal.nome, signal.peso]),
      ),
    ).toEqual({
      divida_ativa_confirmada: 0.4,
      presenca_na_lista_de_devedores: 0.25,
      valor_elevado_em_aberto: 0.2,
      tres_ou_mais_titulos_em_aberto: 0.15,
      pgfn_regularidade_indiciada_por_delta: -0.3,
      vinculo_societario_qsa_contextual: 0,
    });
    expect(POLICY_2026_07_B.thresholds).toEqual({
      intensiva: 0.7,
      padrao: 0.3,
    });
    expect(POLICY_2026_07_B.minimoDeTitulos).toBe(3);
    expect(POLICY_2026_07_B.valorElevadoCentavos).toBe(5_000_000n);
  });
});

/**
 * `confianca_global` collapses to 0 whenever the delta applies: the signal
 * declares a dependency on `pgfn_lista_presente`, and an unresolved or refused
 * link carries confidence 0, so the weakest link is 0. That reading is a
 * recorded pendency and is deliberately left alone here.
 *
 * What this pins is the containment: the zero cannot leak sideways. The
 * coverage verdict is decided during composition, before any classification
 * exists, and `confianca_global` is written once at the end of the evaluation
 * and read by nothing that decides anything.
 */
describe("confianca_global is an output, never an input", () => {
  it("does not drag the coverage verdict or the category down with it", () => {
    const result = evaluate(COM_DELTA);

    expect(result.confianca_global).toBe(0);
    expect(dossierFrom(COM_DELTA).cobertura.veredito).toBe("SUFICIENTE");
    expect(result.cobertura).toBe("SUFICIENTE");
    expect(result.category).toBe("COBRANCA_PADRAO");
    expect(result.explicacao).not.toContain("Cobertura insuficiente");
  });
});
