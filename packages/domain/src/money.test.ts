import { describe, expect, it } from "vitest";

import {
  Money,
  normalizeSpreadsheetMoney,
  parseSerializedCents,
} from "./money.js";

describe("Money", () => {
  it("does not expose a constructible runtime value", () => {
    expect(() =>
      Reflect.construct(Money as unknown as new () => unknown, []),
    ).toThrow(TypeError);
  });

  it("does not expose the implementation constructor through a trusted value", () => {
    const trusted = Money.fromCents(123n);
    const recoveredConstructor = Reflect.get(
      Object.getPrototypeOf(trusted),
      "constructor",
    );

    expect(() =>
      Reflect.construct(
        recoveredConstructor as new (cents: bigint) => unknown,
        [123n],
      ),
    ).toThrow(TypeError);
  });

  it("accepts only factory-created values at the trusted-value boundary", () => {
    const trusted = Money.fromCents(123n);

    expect(() => Money.assert(trusted)).not.toThrow();
    expect(() => Money.assert({ toCents: () => 123n })).toThrow(TypeError);
  });

  it("rejects an object created from the implementation prototype", () => {
    const trusted = Money.fromCents(123n);
    const prototypeForgery = Object.create(Object.getPrototypeOf(trusted));

    expect(() => Money.assert(prototypeForgery)).toThrow(TypeError);
  });

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

  it("stays strict where the ambiguity is real, and only there", () => {
    // The constructor cannot tell whether "1234.5" means reais or cents, so it
    // refuses. The spreadsheet normalizer reads a column documented in reais,
    // where "1234,5" is unambiguously R$ 1.234,50 — the strictness belongs to
    // this layer, and enforcing it one layer earlier quarantined real money.
    expect(() => Money.fromDecimalString("1234.5")).toThrow(TypeError);
    expect(Money.fromDecimalString(normalizeSpreadsheetMoney("1234,5")).toCents())
      .toBe(123450n);
  });

  it("keeps serialized cents and canonical decimals disjoint", () => {
    // Accepting the same digits in both APIs can silently make a call site wrong by 100×.
    expect(parseSerializedCents("123456").toCents()).toBe(123456n);
    expect(() => Money.fromDecimalString("123456")).toThrow(TypeError);
    expect(Money.fromDecimalString("1234.56").toCents()).toBe(123456n);
    expect(() => parseSerializedCents("1234.56")).toThrow();
  });
});
