import { describe, expect, it } from "vitest";

import { normalizeSourceMoney } from "./source-money.js";

describe("normalizeSourceMoney", () => {
  it("reads a plain published value without claiming it was rounded", () => {
    expect(normalizeSourceMoney("29.163.886,44")).toEqual({
      cents: 2916388644n,
      raw: "29.163.886,44",
      roundedFromExcessPrecision: false,
    });
  });

  it("recovers the cents from the float artefact the real source publishes", () => {
    // Measured on the real file: 17 of 91 rows in Valor Total look like this.
    // Quarantining them would drop a fifth of the observed debt.
    expect(normalizeSourceMoney("29.163.886,440000001")).toEqual({
      cents: 2916388644n,
      raw: "29.163.886,440000001",
      roundedFromExcessPrecision: true,
    });
  });

  it.each([
    ["1.234,565", 123457n],
    ["1.234,564", 123456n],
    ["1.234,5650000", 123457n],
    ["0,999999999999", 100n],
  ])("rounds %s half up on the third decimal", (raw, cents) => {
    expect(normalizeSourceMoney(raw).cents).toBe(cents);
  });

  it("handles the fourteen decimal places the real file reaches", () => {
    expect(normalizeSourceMoney("99.999,99999999999999").cents).toBe(10000000n);
  });

  it("treats padding zeros as exact, not as rounding", () => {
    expect(normalizeSourceMoney("1.234,5600")).toMatchObject({
      cents: 123456n,
      roundedFromExcessPrecision: false,
    });
  });

  it("reads a value published without a decimal separator", () => {
    // Two rows in the real file carry no comma at all.
    expect(normalizeSourceMoney("1500").cents).toBe(150000n);
  });

  it("keeps a negative published value negative", () => {
    expect(normalizeSourceMoney("-1.234,565").cents).toBe(-123457n);
  });

  it.each([
    [`1.234,56${String.fromCharCode(0xa0)}`, "a trailing non-breaking space"],
    [`${String.fromCharCode(0xa0)}1.234,56`, "a leading non-breaking space"],
    [`1.234,56${String.fromCharCode(0x202f)}`, "a narrow no-break space"],
  ])("reads %s padded by %s", (raw) => {
    // The real PGFN export writes its value filter as "R$<NBSP>150.000,00", so
    // these characters are demonstrably in this source's vocabulary. They pass
    // today because JavaScript `trim` removes every Zs code point, not only
    // U+0020 — this pins that, so replacing `trim` with a hand-rolled strip
    // later cannot quietly start rejecting amounts that survived publication.
    expect(normalizeSourceMoney(raw).cents).toBe(123456n);
  });

  it("refuses a value it cannot read rather than inventing zero", () => {
    // An unreadable amount is a source problem to be named, never a debt of
    // nothing.
    expect(() => normalizeSourceMoney("n/d")).toThrow(TypeError);
    expect(() => normalizeSourceMoney("")).toThrow(TypeError);
  });

  it("never converts money through a float", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync(new URL("./source-money.ts", import.meta.url), "utf8"),
    );

    // 0.1 + 0.2 is why this module exists. A single Number() would undo it,
    // and the artefact it parses is exactly what a float already did once.
    expect(source).not.toMatch(/\bNumber\s*\(/);
    expect(source).not.toMatch(/\bparseFloat\b/);
    expect(source).not.toMatch(/\bparseInt\b/);
  });
});
