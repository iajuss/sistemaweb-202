import { z } from "zod";

const CANONICAL_DECIMAL_PATTERN = /^(-?)(\d+)\.(\d{2})$/;

export const SerializedCentsSchema = z
  .string()
  .regex(/^-?\d+$/, "CENTAVOS_SERIALIZADOS_COMO_STRING_REQUIRED");

class MoneyValue {
  readonly #brand = true;
  readonly #cents: bigint;

  private constructor(cents: bigint) {
    this.#cents = cents;
  }

  static fromCents(cents: bigint): MoneyValue {
    if (typeof cents !== "bigint") {
      throw new TypeError("MONEY_CENTS_MUST_BE_A_BIGINT");
    }

    return new MoneyValue(cents);
  }

  static fromDecimalString(decimal: string): MoneyValue {
    if (typeof decimal !== "string") {
      throw new TypeError("MONEY_DECIMAL_MUST_BE_A_STRING");
    }

    const parts = CANONICAL_DECIMAL_PATTERN.exec(decimal);
    if (parts === null) {
      throw new TypeError("MONEY_DECIMAL_FORMAT_INVALID");
    }

    const [, sign, whole, fraction] = parts;
    const cents = BigInt(whole) * 100n + BigInt(fraction);
    return new MoneyValue(sign === "-" ? -cents : cents);
  }

  static assert(value: unknown): asserts value is MoneyValue {
    if (
      typeof value !== "object"
      || value === null
      || !(#brand in value)
    ) {
      throw new TypeError("MONEY_VALUE_MUST_BE_FACTORY_CREATED");
    }
  }

  toCents(): bigint {
    return this.#cents;
  }
}

Object.defineProperty(MoneyValue.prototype, "constructor", {
  configurable: false,
  enumerable: false,
  value: undefined,
  writable: false,
});

export type Money = MoneyValue;

interface MoneyFactory {
  readonly fromCents: (cents: bigint) => Money;
  readonly fromDecimalString: (decimal: string) => Money;
  readonly assert: (value: unknown) => asserts value is Money;
}

export const Money: Readonly<MoneyFactory> = Object.freeze({
  fromCents: (cents: bigint) => MoneyValue.fromCents(cents),
  fromDecimalString: (decimal: string) => MoneyValue.fromDecimalString(decimal),
  assert: (value: unknown) => MoneyValue.assert(value),
});

export function parseSerializedCents(input: unknown): Money {
  const serializedCents = SerializedCentsSchema.parse(input);
  return Money.fromCents(BigInt(serializedCents));
}

const SPREADSHEET_MONEY_PATTERN = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?$/;

/**
 * Brazilian spreadsheet money (`1.234,56`) to the canonical decimal string
 * `Money.fromDecimalString` accepts. Lives in the domain because rejecting a
 * malformed amount is an invariant, not a parsing convenience; the adapters
 * re-export it so both the wallet import and the PGFN sheets share one rule.
 */
export function normalizeSpreadsheetMoney(raw: string): string {
  if (typeof raw !== "string") {
    throw new TypeError("SPREADSHEET_MONEY_MUST_BE_A_STRING");
  }

  const parts = SPREADSHEET_MONEY_PATTERN.exec(raw);
  if (parts === null) {
    throw new TypeError("SPREADSHEET_MONEY_FORMAT_INVALID");
  }

  const [, sign, whole, fraction = "00"] = parts;
  return `${sign}${whole.replaceAll(".", "")}.${fraction}`;
}
