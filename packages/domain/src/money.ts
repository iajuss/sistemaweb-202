const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

export class Money {
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

    const parts = DECIMAL_PATTERN.exec(decimal);
    if (parts === null) {
      throw new TypeError("MONEY_DECIMAL_FORMAT_INVALID");
    }

    const [, sign, whole, fraction = ""] = parts;
    const cents = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
    return new Money(sign === "-" ? -cents : cents);
  }

  toCents(): bigint {
    return this.cents;
  }
}
