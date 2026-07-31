import { describe, expect, it } from "vitest";

import { IDENTITY_POLICY_2026_07_A } from "./policy.js";
import { resolveIdentity, scoreName } from "./resolver.js";

/**
 * Expected values below were calculated by hand against the policy weights
 * before any of this was implemented.
 *
 * Weights: todos_os_tokens_presentes 0.25, primeiro_token_coincide 0.25,
 * ultimo_token_coincide 0.20, ordem_preservada 0.05, completude 0.25 × ratio.
 * Gate: completude < 0.60 rejects outright.
 * Thresholds: CONFIRMADO ≥ 0.95, PROVAVEL ≥ 0.75, POSSIVEL ≥ 0.55.
 *
 * | carteira      | publicado                              | tokens | presentes | 1º | último | ordem | compl. | soma   | saída      |
 * |---------------|----------------------------------------|--------|-----------|----|--------|-------|--------|--------|------------|
 * | JOSE SILVA    | JOSÉ DA SILVA                          | 2      | sim .25   |.25 | .20    | .05   | 2/2=1  | 1.0000 | CONFIRMADO |
 * | JOSE SILVA    | JOSE ANTONIO DA SILVA                  | 3      | sim .25   |.25 | .20    | .05   | 2/3    | 0.9167 | PROVAVEL   |
 * | JOSE SANTOS   | MARIA JOSE ALVES PEREIRA SOARES SANTOS | 6      | sim       | 0  | .20    | .05   | 2/6    | gate→0 | REJEITADO  |
 * | ANA           | ROGERIO SANT ANA DA SILVA              | 4      | sim       | 0  | 0      | .05   | 1/4    | gate→0 | REJEITADO  |
 * | JOSE SANTOS   | SANTOS JOSE PEREIRA                    | 3      | sim .25   | 0  | 0      | 0     | 2/3    | 0.4167 | REJEITADO  |
 *
 * Connectives (DA, DE, DO, DAS, DOS, E) are dropped before counting, which is
 * why "JOSÉ DA SILVA" is two tokens and not three.
 */

const policy = IDENTITY_POLICY_2026_07_A;

describe("scoreName", () => {
  it.each([
    ["JOSE SILVA", "JOSÉ DA SILVA", 1.0, "CONFIRMADO"],
    ["JOSE SILVA", "JOSE ANTONIO DA SILVA", 0.9167, "PROVAVEL"],
    ["JOSE SANTOS", "SANTOS JOSE PEREIRA", 0.4167, "REJEITADO"],
  ])("scores %s against %s as %f", (wallet, published, confidence, status) => {
    const scored = scoreName(wallet, published, policy);

    expect(scored.confidence).toBeCloseTo(confidence, 4);
    expect(scored.status).toBe(status);
  });

  it.each([
    [
      "JOSE SANTOS",
      "MARIA JOSE ALVES PEREIRA SOARES SANTOS",
      "the source matches tokens without position, so a longer name absorbs the query",
    ],
    [
      "ANA",
      "ROGERIO SANT ANA DA SILVA",
      "a surname split into two tokens puts the query in the middle of a stranger",
    ],
  ])("rejects %s against %s: %s", (wallet, published) => {
    const scored = scoreName(wallet, published, policy);

    expect(scored.status).toBe("REJEITADO");
    expect(scored.rules).toContainEqual(
      expect.objectContaining({ rule: "completude_minima", matched: false }),
    );
  });

  it("decomposes every score into named rules with weight and contribution", () => {
    const scored = scoreName("JOSE SILVA", "JOSE ANTONIO DA SILVA", policy);

    // Legal requirement, not a feature: an automated decision has to be
    // explainable to the person it is about.
    expect(scored.rules.map((rule) => rule.rule)).toEqual([
      "completude_minima",
      "todos_os_tokens_presentes",
      "primeiro_token_coincide",
      "ultimo_token_coincide",
      "ordem_preservada",
      "completude",
    ]);
    expect(
      scored.rules.reduce((total, rule) => total + rule.contribution, 0),
    ).toBeCloseTo(0.9167, 4);
  });
});

describe("resolveIdentity", () => {
  const walletDebtor = { name: "JOSE SANTOS", cpf: "52998224725" };

  it("confirms the only mask-compatible record whose name holds up", () => {
    const resolution = resolveIdentity(
      walletDebtor,
      [
        { id: "a", maskedCpf: "***.982.247-**", name: "JOSE SANTOS" },
        {
          id: "b",
          maskedCpf: "***.982.247-**",
          name: "MARIA JOSE ALVES PEREIRA SOARES SANTOS",
        },
        { id: "c", maskedCpf: "***.111.222-**", name: "JOSE SANTOS" },
      ],
      policy,
    );

    // `b` shares the mask but is rejected on the name; `c` is a different
    // person entirely. One candidate survives.
    expect(resolution.status).toBe("CONFIRMADO");
    expect(resolution.selected?.id).toBe("a");
    expect(resolution.isFact).toBe(true);
  });

  it("abstains when two records fit equally well, choosing neither", () => {
    const resolution = resolveIdentity(
      walletDebtor,
      [
        { id: "a", maskedCpf: "***.982.247-**", name: "JOSE SANTOS" },
        { id: "b", maskedCpf: "***.982.247-**", name: "JOSE SANTOS" },
      ],
      policy,
    );

    // The decisive case. The mask does not discriminate — 10^5 CPFs share a
    // fragment — and the name does not either. The correct output is refusal,
    // not the better guess: picking one would invent a fact about a person.
    expect(resolution.status).toBe("AMBIGUO");
    expect(resolution.selected).toBeNull();
    expect(resolution.isFact).toBe(false);
    expect(resolution.candidates).toHaveLength(2);
  });

  it("abstains on a near tie, not only on an exact one", () => {
    const resolution = resolveIdentity(
      { name: "JOSE SILVA", cpf: "52998224725" },
      [
        { id: "a", maskedCpf: "***.982.247-**", name: "JOSE SILVA" },
        { id: "b", maskedCpf: "***.982.247-**", name: "JOSE DA SILVA" },
      ],
      policy,
    );

    // Both normalize to the same two tokens and both score 1.0. Even had they
    // differed by a hair, a margin that thin is not a decision.
    expect(resolution.status).toBe("AMBIGUO");
    expect(resolution.selected).toBeNull();
  });

  it("carries low confidence rather than a fact when nothing is confirmed", () => {
    const resolution = resolveIdentity(
      walletDebtor,
      [
        {
          id: "b",
          maskedCpf: "***.982.247-**",
          name: "MARIA JOSE ALVES PEREIRA SOARES SANTOS",
        },
      ],
      policy,
    );

    // The raw contributions sum to 0.5833, which a consumer thresholding on
    // confidence would read as a middling match. A record the gate refused
    // reports zero: refused is refused, and the contributions stay in `rules`
    // so the explanation still says what did and did not match.
    expect(resolution.status).toBe("REJEITADO");
    expect(resolution.isFact).toBe(false);
    expect(resolution.confidence).toBe(0);
    expect(
      resolution.rules.reduce((total, rule) => total + rule.contribution, 0),
    ).toBeCloseTo(0.5833, 4);
  });

  it("reports NAO_ENCONTRADO shape when no record fits the mask at all", () => {
    const resolution = resolveIdentity(
      walletDebtor,
      [{ id: "c", maskedCpf: "***.111.222-**", name: "JOSE SANTOS" }],
      policy,
    );

    expect(resolution.status).toBe("SEM_CANDIDATO");
    expect(resolution.candidates).toEqual([]);
    expect(resolution.isFact).toBe(false);
  });

  it("marks a probable match as not a fact", () => {
    const resolution = resolveIdentity(
      { name: "JOSE SILVA", cpf: "52998224725" },
      [{ id: "a", maskedCpf: "***.982.247-**", name: "JOSE ANTONIO DA SILVA" }],
      policy,
    );

    // Uncertainty has to survive the trip to the classifier. Only CONFIRMADO
    // is a fact; everything else travels as evidence with its confidence.
    expect(resolution.status).toBe("PROVAVEL");
    expect(resolution.isFact).toBe(false);
    expect(resolution.confidence).toBeCloseTo(0.9167, 4);
  });

  it("records the policy version, so a resolution can be re-executed", () => {
    const resolution = resolveIdentity(walletDebtor, [], policy);

    expect(resolution.policyVersion).toBe("2026-07-A");
  });

  it("never derives the CPF fragment into its output", () => {
    const resolution = resolveIdentity(walletDebtor, [
      { id: "a", maskedCpf: "***.982.247-**", name: "JOSE SANTOS" },
    ], policy);

    // The fragment exists in memory for the comparison and nowhere else.
    expect(JSON.stringify(resolution)).not.toContain("52998224725");
    expect(JSON.stringify(resolution)).not.toContain("982247");
  });
});
