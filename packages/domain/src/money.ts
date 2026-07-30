import { z } from "zod";

const CANONICAL_DECIMAL_PATTERN = /^(-?)(\d+)\.(\d{2})$/;

export const SerializedCentsSchema = z
  .string()
  .regex(/^-?\d+$/, "CENTAVOS_SERIALIZADOS_COMO_STRING_REQUIRED");

export class Money {
  declare private readonly moneyBrand: "Money";

  private constructor(private readonly cents: bigint) {}

  static fromCents(cents: bigint): Money {
    if (typeof cents !== "bigint") {
      throw new TypeError("MONEY_CENTS_MUST_BE_A_BIGINT");
    }

    return new Money(cents);
  }

  static fromDecimalString(decimal: string): Money {
    if (typeof decimal !== "string") {
      throw new TypeError("MONEY_DECIMAL_MUST_BE_A_STRING");
    }

    const parts = CANONICAL_DECIMAL_PATTERN.exec(decimal);
    if (parts === null) {
      throw new TypeError("MONEY_DECIMAL_FORMAT_INVALID");
    }

    const [, sign, whole, fraction] = parts;
    const cents = BigInt(whole) * 100n + BigInt(fraction);
    return new Money(sign === "-" ? -cents : cents);
  }

  toCents(): bigint {
    return this.cents;
  }
}

export function parseSerializedCents(input: unknown): Money {
  const serializedCents = SerializedCentsSchema.parse(input);
  return Money.fromCents(BigInt(serializedCents));
}
