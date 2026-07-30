import { describe, expect, it } from "vitest";

import { Money, parseSerializedCents } from "./money.js";

describe("Money", () => {
  it.each([
    123,
    "123",
    null,
    123.45,
  ])("rejects non-bigint cents input %#", (raw) => {
    expect(() => Money.fromCents(raw as unknown as bigint)).toThrow(TypeError);
  });

  it.each([
    1234.56,
    null,
    "123456",
    " 1234.56",
    "1e3",
    "1234.5",
  ])("rejects non-canonical decimal input %#", (raw) => {
    expect(() => Money.fromDecimalString(raw as unknown as string)).toThrow(TypeError);
  });

  it("accepts only canonical two-place decimal strings", () => {
    expect(Money.fromDecimalString("1234.56").toCents()).toBe(123456n);
    expect(Money.fromDecimalString("-1234.56").toCents()).toBe(-123456n);
  });

  it.each([
    123456,
    null,
    1234.56,
    "1234.56",
  ])("rejects non-serialized-cent values in the parser %#", (raw) => {
    expect(() => parseSerializedCents(raw)).toThrow();
  });

  it("keeps serialized cents and canonical decimals disjoint", () => {
    // Accepting the same digits in both APIs can silently make a call site wrong by 100×.
    expect(parseSerializedCents("123456").toCents()).toBe(123456n);
    expect(() => Money.fromDecimalString("123456")).toThrow(TypeError);
    expect(Money.fromDecimalString("1234.56").toCents()).toBe(123456n);
    expect(() => parseSerializedCents("1234.56")).toThrow();
  });
});
