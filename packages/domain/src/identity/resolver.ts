import { isMaskCompatibleWithCpf } from "./mask.js";
import { nameTokens } from "./normalize.js";
import { IDENTITY_POLICY_2026_07_A, type IdentityPolicy } from "./policy.js";

/**
 * Identity resolution: verification, never discovery.
 *
 * The wallet supplies a full CPF and a name. The mask narrows the published
 * records to candidates — it never identifies anyone, since 10^5 CPFs share a
 * fragment — and the name ranking decides among them. When it cannot decide,
 * the answer is refusal. Uncertainty travels all the way to the classifier;
 * only `CONFIRMADO` is ever a fact.
 */

export type NameMatchStatus =
  | "CONFIRMADO"
  | "PROVAVEL"
  | "POSSIVEL"
  | "REJEITADO";

export type IdentityStatus = NameMatchStatus | "AMBIGUO" | "SEM_CANDIDATO";

export interface RuleOutcome {
  readonly rule: string;
  readonly weight: number;
  readonly matched: boolean;
  readonly contribution: number;
}

export interface NameScore {
  readonly status: NameMatchStatus;
  readonly confidence: number;
  readonly rules: readonly RuleOutcome[];
}

export interface PublishedRecord {
  readonly id: string;
  readonly maskedCpf: string;
  readonly name: string;
}

export interface WalletDebtor {
  readonly name: string;
  readonly cpf: string;
}

export interface IdentityCandidate extends NameScore {
  readonly id: string;
  readonly name: string;
}

export interface IdentityResolution {
  readonly status: IdentityStatus;
  readonly confidence: number;
  /** Only a confirmed match is a fact. Everything else is evidence. */
  readonly isFact: boolean;
  readonly selected: IdentityCandidate | null;
  readonly candidates: readonly IdentityCandidate[];
  readonly rules: readonly RuleOutcome[];
  readonly policyVersion: string;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function orderPreserved(
  walletTokens: readonly string[],
  publishedTokens: readonly string[],
): boolean {
  let cursor = -1;
  for (const token of walletTokens) {
    const position = publishedTokens.indexOf(token, cursor + 1);
    if (position < 0) {
      return false;
    }
    cursor = position;
  }
  return true;
}

function statusFor(
  confidence: number,
  policy: IdentityPolicy,
): NameMatchStatus {
  if (confidence >= policy.thresholds.confirmado) return "CONFIRMADO";
  if (confidence >= policy.thresholds.provavel) return "PROVAVEL";
  if (confidence >= policy.thresholds.possivel) return "POSSIVEL";
  return "REJEITADO";
}

export function scoreName(
  walletName: string,
  publishedName: string,
  policy: IdentityPolicy = IDENTITY_POLICY_2026_07_A,
): NameScore {
  const walletTokens = nameTokens(walletName);
  const publishedTokens = nameTokens(publishedName);
  const { weights } = policy;

  const completeness =
    publishedTokens.length === 0
      ? 0
      : walletTokens.length / publishedTokens.length;
  const gatePassed = completeness >= policy.minimumCompleteness;

  const allPresent =
    walletTokens.length > 0 &&
    walletTokens.every((token) => publishedTokens.includes(token));
  const firstMatches =
    walletTokens.length > 0 && walletTokens[0] === publishedTokens[0];
  const lastMatches =
    walletTokens.length > 0 &&
    walletTokens[walletTokens.length - 1] ===
      publishedTokens[publishedTokens.length - 1];
  const ordered = allPresent && orderPreserved(walletTokens, publishedTokens);

  const scored: RuleOutcome[] = [
    // The gate is listed as a rule with zero weight so the explanation shows
    // why a record was refused, rather than only that it scored low.
    {
      rule: "completude_minima",
      weight: 0,
      matched: gatePassed,
      contribution: 0,
    },
    {
      rule: "todos_os_tokens_presentes",
      weight: weights.todos_os_tokens_presentes,
      matched: allPresent,
      contribution: allPresent ? weights.todos_os_tokens_presentes : 0,
    },
    {
      rule: "primeiro_token_coincide",
      weight: weights.primeiro_token_coincide,
      matched: firstMatches,
      contribution: firstMatches ? weights.primeiro_token_coincide : 0,
    },
    {
      rule: "ultimo_token_coincide",
      weight: weights.ultimo_token_coincide,
      matched: lastMatches,
      contribution: lastMatches ? weights.ultimo_token_coincide : 0,
    },
    {
      rule: "ordem_preservada",
      weight: weights.ordem_preservada,
      matched: ordered,
      contribution: ordered ? weights.ordem_preservada : 0,
    },
    {
      rule: "completude",
      weight: weights.completude,
      matched: completeness >= 1,
      contribution: round(weights.completude * Math.min(completeness, 1)),
    },
  ];

  const total = round(
    scored.reduce((rolling, rule) => rolling + rule.contribution, 0),
  );

  // The gate is absolute: a query absorbed into a much longer name is not that
  // person, however well the remaining rules happen to score. A refused record
  // reports zero confidence rather than its raw total — the homonym the real
  // source returns scores 0.58, and a consumer thresholding on confidence
  // would read that as a middling match instead of a refusal. The individual
  // contributions stay in `rules`, so the explanation still says what matched.
  return {
    status: gatePassed ? statusFor(total, policy) : "REJEITADO",
    confidence: gatePassed ? total : 0,
    rules: scored,
  };
}

export function resolveIdentity(
  debtor: WalletDebtor,
  records: readonly PublishedRecord[],
  policy: IdentityPolicy = IDENTITY_POLICY_2026_07_A,
): IdentityResolution {
  const candidates = records
    // The mask narrows; it never identifies. A record that fits no wallet CPF
    // belongs to someone who is not a client.
    .filter((record) => isMaskCompatibleWithCpf(record.maskedCpf, debtor.cpf))
    .map((record) => ({
      id: record.id,
      name: record.name,
      ...scoreName(debtor.name, record.name, policy),
    }))
    .sort((left, right) => right.confidence - left.confidence);

  const empty = {
    confidence: 0,
    isFact: false,
    selected: null,
    candidates,
    rules: [],
    policyVersion: policy.version,
  };

  if (candidates.length === 0) {
    return { status: "SEM_CANDIDATO", ...empty };
  }

  const viable = candidates.filter(
    (candidate) => candidate.status !== "REJEITADO",
  );
  if (viable.length === 0) {
    const best = candidates[0];
    return {
      status: "REJEITADO",
      confidence: best.confidence,
      isFact: false,
      selected: null,
      candidates,
      rules: best.rules,
      policyVersion: policy.version,
    };
  }

  const [best, runnerUp] = viable;
  if (runnerUp && best.confidence - runnerUp.confidence <= policy.ambiguityMargin) {
    // Refusal, not the better guess. The mask did not discriminate and the
    // name did not either; choosing between them would manufacture a fact
    // about a person, and a wrong one half the time.
    return {
      status: "AMBIGUO",
      confidence: best.confidence,
      isFact: false,
      selected: null,
      candidates,
      rules: best.rules,
      policyVersion: policy.version,
    };
  }

  return {
    status: best.status,
    confidence: best.confidence,
    isFact: best.status === "CONFIRMADO",
    selected: best,
    candidates,
    rules: best.rules,
    policyVersion: policy.version,
  };
}
