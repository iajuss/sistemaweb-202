/**
 * Identity resolution weights and thresholds, declarative and versioned.
 *
 * Versioned because a resolution has to be re-executable: a dossier records the
 * version that produced it, and changing these numbers produces a new version
 * rather than silently reinterpreting past answers.
 */

export interface IdentityPolicy {
  readonly version: string;
  readonly weights: {
    readonly todos_os_tokens_presentes: number;
    readonly primeiro_token_coincide: number;
    readonly ultimo_token_coincide: number;
    readonly ordem_preservada: number;
    readonly completude: number;
  };
  /**
   * Below this ratio of wallet tokens to published tokens the record is
   * refused outright, whatever the rest scores. This is the gate for the trap
   * the real source demonstrates: it matches tokens with no notion of
   * position, so "Jose Santos" returns `MARIA JOSE ALVES PEREIRA SOARES
   * SANTOS`. A query absorbed into a much longer name is not that person.
   */
  readonly minimumCompleteness: number;
  readonly thresholds: {
    readonly confirmado: number;
    readonly provavel: number;
    readonly possivel: number;
  };
  /**
   * How close the runner-up may come before the answer is refusal. A margin
   * this thin is not a decision, and picking the better guess would invent a
   * fact about a person.
   */
  readonly ambiguityMargin: number;
}

export const IDENTITY_POLICY_2026_07_A: IdentityPolicy = Object.freeze({
  version: "2026-07-A",
  weights: Object.freeze({
    todos_os_tokens_presentes: 0.25,
    primeiro_token_coincide: 0.25,
    ultimo_token_coincide: 0.2,
    ordem_preservada: 0.05,
    completude: 0.25,
  }),
  minimumCompleteness: 0.6,
  thresholds: Object.freeze({
    confirmado: 0.95,
    provavel: 0.75,
    possivel: 0.55,
  }),
  ambiguityMargin: 0.05,
});
