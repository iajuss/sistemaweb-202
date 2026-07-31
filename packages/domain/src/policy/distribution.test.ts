import { describe, expect, it } from "vitest";

import {
  dossierFrom,
  type DossierSpec,
} from "../../../../fixtures/policy/dossiers.js";

import { comparePolicies, evaluatePolicy, orderByPriority } from "./evaluate.js";
import { POLICY_2026_07_A } from "./policy-2026-07-a.js";
import type { PolicyDefinition } from "./types.js";

/**
 * The third leg of ADR 016's label-free validation: inspect the distribution
 * over a synthetic portfolio. A policy that answers the same thing for
 * everyone allocates nothing, and one that answers `DADOS_INSUFICIENTES` for
 * everyone is a coverage bug wearing a policy costume.
 */

const CARTEIRA_SINTETICA: readonly DossierSpec[] = [
  {
    dossierId: "d-01",
    carteira: { cents: 9_000_000n, titulos: 4 },
    dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
    lista: { status: "ENCONTRADO", link: "CONFIRMADO" },
  },
  {
    dossierId: "d-02",
    carteira: { cents: 7_500_000n, titulos: 3 },
    dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
    lista: { status: "NAO_ENCONTRADO" },
  },
  {
    dossierId: "d-03",
    carteira: { cents: 6_000_000n, titulos: 3 },
    dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
    lista: { status: "NAO_ENCONTRADO", escopoCompleto: true },
  },
  {
    dossierId: "d-04",
    carteira: { cents: 8_000_000n, titulos: 3 },
    dadosAbertos: { status: "NAO_ENCONTRADO" },
    lista: { status: "NAO_ENCONTRADO" },
  },
  {
    dossierId: "d-05",
    carteira: { cents: 500_000n, titulos: 1 },
    dadosAbertos: { status: "NAO_ENCONTRADO" },
    lista: { status: "NAO_ENCONTRADO" },
  },
  {
    dossierId: "d-06",
    carteira: { cents: 2_000_000n, titulos: 3 },
    dadosAbertos: { status: "NAO_ENCONTRADO" },
    lista: { status: "NAO_ENCONTRADO" },
  },
  {
    dossierId: "d-07",
    carteira: { cents: 9_500_000n, titulos: 5 },
    dadosAbertos: { status: "ERRO_NA_FONTE" },
    lista: { status: "NAO_ENCONTRADO" },
  },
  {
    dossierId: "d-08",
    carteira: { cents: 4_000_000n, titulos: 2 },
    dadosAbertos: { status: "ENCONTRADO", link: "AMBIGUO" },
    lista: { status: "NAO_ENCONTRADO" },
  },
];

function classify() {
  return CARTEIRA_SINTETICA.map((spec) =>
    evaluatePolicy(dossierFrom(spec), POLICY_2026_07_A),
  );
}

describe("distribution over a synthetic portfolio", () => {
  it("produces more than one actionable category", () => {
    const categories = new Set(
      classify()
        .filter((entry) => entry.category !== "DADOS_INSUFICIENTES")
        .map((entry) => entry.category),
    );

    expect(categories.size).toBeGreaterThan(1);
  });

  it("does not put the whole portfolio in one bucket", () => {
    const counts = new Map<string, number>();
    for (const entry of classify()) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }

    expect(Math.max(...counts.values())).toBeLessThan(
      CARTEIRA_SINTETICA.length,
    );
  });

  it("reaches every category the policy can produce", () => {
    const produced = new Set(classify().map((entry) => entry.category));

    expect([...produced].sort()).toEqual([
      "COBRANCA_INTENSIVA",
      "COBRANCA_PADRAO",
      "DADOS_INSUFICIENTES",
      "MONITORAMENTO",
    ]);
  });
});

describe("ordering a finite team's day", () => {
  it("sorts by category, then score, then id, and never by input order", () => {
    const forward = orderByPriority(classify()).map((entry) => entry.dossier_id);
    const backward = orderByPriority([...classify()].reverse()).map(
      (entry) => entry.dossier_id,
    );

    expect(backward).toEqual(forward);
  });

  it("puts insufficient coverage last, not first", () => {
    const ordered = orderByPriority(classify());
    const insuficientes = ordered.filter(
      (entry) => entry.category === "DADOS_INSUFICIENTES",
    );

    // A dossier nobody could complete is not the most urgent call to make; it
    // is a data problem, and it sits at the back of the queue.
    expect(ordered.slice(-insuficientes.length)).toEqual(insuficientes);
  });
});

describe("comparing two policy versions", () => {
  const MAIS_SEVERA: PolicyDefinition = {
    ...POLICY_2026_07_A,
    version: "2026-08-EXPERIMENTAL",
    thresholds: { intensiva: 0.3, padrao: 0.1 },
  };

  it("runs both over the same dossiers without touching either result", () => {
    const dossiers = CARTEIRA_SINTETICA.map((spec) => dossierFrom(spec));
    const comparison = comparePolicies(
      dossiers,
      POLICY_2026_07_A,
      MAIS_SEVERA,
    );

    expect(comparison).toHaveLength(dossiers.length);
    for (const entry of comparison) {
      expect(entry.left.policy_version).toBe("2026-07-A");
      expect(entry.right.policy_version).toBe("2026-08-EXPERIMENTAL");
    }
    // Re-running the original after the comparison yields the same answers:
    // a new version is compared, never applied in place.
    expect(
      dossiers.map((dossier) => evaluatePolicy(dossier, POLICY_2026_07_A)),
    ).toEqual(comparison.map((entry) => entry.left));
  });

  it("reports which dossiers changed category", () => {
    const dossiers = CARTEIRA_SINTETICA.map((spec) => dossierFrom(spec));
    const changed = comparePolicies(
      dossiers,
      POLICY_2026_07_A,
      MAIS_SEVERA,
    ).filter((entry) => entry.categoryChanged);

    expect(changed.length).toBeGreaterThan(0);
    for (const entry of changed) {
      expect(entry.left.category).not.toBe(entry.right.category);
    }
  });

  it("leaves insufficient coverage insufficient under any thresholds", () => {
    const dossier = dossierFrom(CARTEIRA_SINTETICA[6]);

    for (const entry of comparePolicies([dossier], POLICY_2026_07_A, MAIS_SEVERA)) {
      expect(entry.left.category).toBe("DADOS_INSUFICIENTES");
      expect(entry.right.category).toBe("DADOS_INSUFICIENTES");
      expect(entry.categoryChanged).toBe(false);
    }
  });
});
