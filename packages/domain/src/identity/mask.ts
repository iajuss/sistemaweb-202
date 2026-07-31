/**
 * The PGFN publishes a CPF with only positions 4 to 9 revealed. Going from
 * that mask to a person is impossible — 10^5 CPFs share any fragment — and
 * `AGENTS.md` forbids attempting it. So this module only ever answers a
 * yes/no question about a CPF the caller already holds from an authorized
 * wallet. There is deliberately no function here that takes a mask alone.
 */

const REVEALED_START = 3;
const REVEALED_END = 9;
const REVEALED_LENGTH = REVEALED_END - REVEALED_START;

export interface CpfMask {
  /** Positions 4 to 9. Derived in memory for a comparison; never persisted. */
  readonly fragment: string;
}

const MASK_PATTERN = /^\*{3}\.?(\d{3})\.?(\d{3})-?\*{2}$/;

export function parseCpfMask(raw: string): CpfMask | null {
  const parts = MASK_PATTERN.exec(raw.trim());
  return parts === null ? null : { fragment: `${parts[1]}${parts[2]}` };
}

/**
 * Compatibility, not identity. A matching fragment narrows the candidate set;
 * the name ranking is what decides, and a low-confidence result never travels
 * as a fact.
 */
export function isMaskCompatibleWithCpf(raw: string, cpf: string): boolean {
  const mask = parseCpfMask(raw);
  if (mask === null) {
    return false;
  }

  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) {
    return false;
  }

  const fragment = digits.slice(REVEALED_START, REVEALED_END);
  return fragment.length === REVEALED_LENGTH && fragment === mask.fragment;
}
