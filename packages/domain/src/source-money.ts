/**
 * Money as a public source published it — see ADR 023.
 *
 * The wallet normalizer is strict on purpose: a client asserting a tenth of a
 * cent has a data error worth naming. A published value is a different animal.
 * Measured on the real PGFN list, 17 of 91 `Valor Total` cells arrive as float
 * serialization noise (`29163886,440000001`, up to fourteen decimal places).
 * That is not a debt of a fraction of a cent; refusing those rows would drop a
 * fifth of the observed debt on the floor.
 *
 * So the excess is rounded away — half up on the third decimal, in `BigInt`
 * arithmetic over the digits, never through `Number` — while the published
 * text is kept verbatim and the rounding is declared rather than assumed.
 */

export interface SourceMoney {
  readonly cents: bigint;
  /** Exactly as published, so a manual check stays possible after the fact. */
  readonly raw: string;
  readonly roundedFromExcessPrecision: boolean;
}

const PUBLISHED_MONEY_PATTERN =
  /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/;

export function normalizeSourceMoney(raw: string): SourceMoney {
  if (typeof raw !== "string") {
    throw new TypeError("SOURCE_MONEY_MUST_BE_A_STRING");
  }

  const parts = PUBLISHED_MONEY_PATTERN.exec(raw.trim());
  if (parts === null) {
    throw new TypeError("SOURCE_MONEY_FORMAT_INVALID");
  }

  const [, sign, whole, fraction = ""] = parts;
  // Pad so the first three positions always exist: two for the cents and one
  // to decide the rounding.
  const padded = `${fraction}000`;
  const centsFraction = BigInt(padded.slice(0, 2));
  const roundingDigit = BigInt(padded.slice(2, 3));
  const excess = fraction.slice(2);

  const magnitude =
    BigInt(whole.replaceAll(".", "")) * 100n +
    centsFraction +
    (roundingDigit >= 5n ? 1n : 0n);

  return {
    cents: sign === "-" ? -magnitude : magnitude,
    raw,
    // Padding zeros are exact. Only a digit that actually moved the value
    // counts as rounding.
    roundedFromExcessPrecision: /[1-9]/.test(excess),
  };
}
