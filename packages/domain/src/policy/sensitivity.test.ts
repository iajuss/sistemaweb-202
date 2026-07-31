import { describe, expect, it } from "vitest";

import {
  dossierFrom,
  type DossierSpec,
} from "../../../../fixtures/policy/dossiers.js";

import { evaluatePolicy } from "./evaluate.js";
import { POLICY_2026_07_B } from "./policy-2026-07-b.js";
import type { PolicyDefinition } from "./types.js";

/**
 * ADR 016 requires validation without labels, and this is one of its three
 * legs: perturbing **one** weight at a time by ±20% must not move a fixture
 * from one category to another. A boundary that a 20% nudge can cross is a
 * boundary drawn on nothing, and calling it a decision would be false
 * precision — exactly what the no-predictive-model decision exists to avoid.
 *
 * One weight at a time is the point. Moving every weight together is not a
 * sensitivity analysis, it is a different policy.
 */

const CASOS: Readonly<Record<string, DossierSpec>> = {
  /** 1.00 — every aggravating signal. */
  casa_cheia: {
    carteira: { cents: 8_000_000n, titulos: 3 },
    dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
    lista: { status: "ENCONTRADO", link: "CONFIRMADO" },
  },
  /** 0.35 — wallet facts alone. */
  so_carteira: {
    carteira: { cents: 8_000_000n, titulos: 3 },
    dadosAbertos: { status: "NAO_ENCONTRADO" },
    lista: { status: "NAO_ENCONTRADO" },
  },
  /** 0.15 — a single signal. */
  um_sinal: {
    carteira: { cents: 1_000_000n, titulos: 3 },
    dadosAbertos: { status: "NAO_ENCONTRADO" },
    lista: { status: "NAO_ENCONTRADO" },
  },
  /** 0.45 — the delta pulling an otherwise intensive case down. */
  com_delta: {
    carteira: { cents: 8_000_000n, titulos: 3 },
    dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
    lista: { status: "NAO_ENCONTRADO", escopoCompleto: true },
  },
  /** Insufficient coverage, which no weight may rescue. */
  cobertura_falha: {
    carteira: { cents: 8_000_000n, titulos: 3 },
    dadosAbertos: { status: "ERRO_NA_FONTE" },
    lista: { status: "NAO_ENCONTRADO" },
  },
};

function withPerturbedWeight(
  nome: string,
  factor: number,
): PolicyDefinition {
  return {
    ...POLICY_2026_07_B,
    signals: POLICY_2026_07_B.signals.map((signal) =>
      signal.nome === nome ? { ...signal, peso: signal.peso * factor } : signal,
    ),
  };
}

const PERTURBATIONS = [
  ["-20%", 0.8],
  ["+20%", 1.2],
] as const;

describe("each weight perturbed by ±20%, one at a time", () => {
  for (const signal of POLICY_2026_07_B.signals) {
    for (const [label, factor] of PERTURBATIONS) {
      it(`keeps every category with ${signal.nome} at ${label}`, () => {
        const perturbed = withPerturbedWeight(signal.nome, factor);

        for (const [nome, spec] of Object.entries(CASOS)) {
          const dossier = dossierFrom(spec);
          const baseline = evaluatePolicy(dossier, POLICY_2026_07_B);
          const shifted = evaluatePolicy(dossier, perturbed);

          expect(
            shifted.category,
            `${nome} moved from ${baseline.category} to ${shifted.category}`,
          ).toBe(baseline.category);
        }
      });
    }
  }
});

describe("what the perturbation may and may not move", () => {
  it("moves the score, so the test is not passing on a frozen number", () => {
    const dossier = dossierFrom(CASOS.so_carteira);
    const baseline = evaluatePolicy(dossier, POLICY_2026_07_B);
    const shifted = evaluatePolicy(
      dossier,
      withPerturbedWeight("valor_elevado_em_aberto", 0.8),
    );

    // 0.20 → 0.16, so 0.35 → 0.31: the weight really is in play, and the
    // category holds because the band is wide enough to absorb it.
    expect(shifted.score).toBeCloseTo(0.31, 10);
    expect(shifted.score).not.toBeCloseTo(baseline.score, 10);
    expect(shifted.category).toBe(baseline.category);
  });

  it("cannot rescue insufficient coverage at any weight", () => {
    const dossier = dossierFrom(CASOS.cobertura_falha);

    for (const signal of POLICY_2026_07_B.signals) {
      for (const factor of [0, 0.8, 1.2, 5]) {
        expect(
          evaluatePolicy(dossier, withPerturbedWeight(signal.nome, factor))
            .category,
        ).toBe("DADOS_INSUFICIENTES");
      }
    }
  });

  it("cannot let the QSA signal contribute, whatever the weight", () => {
    // ADR 012 fixes contribution at zero. Multiplying zero keeps it zero, and
    // the rule that never applies is what makes that structural.
    const dossier = dossierFrom(CASOS.casa_cheia);
    const inflated = evaluatePolicy(
      dossier,
      withPerturbedWeight("vinculo_societario_qsa_contextual", 1000),
    );

    expect(
      inflated.signals.find(
        (signal) => signal.nome === "vinculo_societario_qsa_contextual",
      )?.contribuicao,
    ).toBe(0);
  });
});
