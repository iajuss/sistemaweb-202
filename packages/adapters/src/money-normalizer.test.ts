import { describe, expect, it } from "vitest";

import { normalizeSpreadsheetMoney } from "./money-normalizer.js";

describe("normalizeSpreadsheetMoney", () => {
  it.each([
    1234,
    null,
    1234.56,
  ])("rejects non-string spreadsheet money input %#", (raw) => {
    expect(() => normalizeSpreadsheetMoney(raw as unknown as string)).toThrow(TypeError);
  });

  it.each([
    ["1.234,56", "1234.56"],
    ["1234,56", "1234.56"],
    ["1234", "1234.00"],
  ])("normalizes spreadsheet value %s without floating-point conversion", (raw, expected) => {
    expect(normalizeSpreadsheetMoney(raw)).toBe(expected);
  });

  it.each([
    ["1.234,5600", "1234.56"],
    ["1234,560000", "1234.56"],
    ["0,0000", "0.00"],
  ])("accepts padding zeros beyond the cents in %s", (raw, expected) => {
    // ERP exports routinely format four decimal places. 1234,5600 is exactly
    // 1234,56, and refusing the whole wallet over cell formatting would be a
    // bad surprise on the first real file.
    expect(normalizeSpreadsheetMoney(raw)).toBe(expected);
  });

  it.each([
    ["29.163.886,440000001", "the real PGFN float artefact"],
    ["1234,561", "a tenth of a cent"],
    ["1234,5601", "non-zero precision hiding behind padding"],
  ])("refuses %s (%s) rather than truncating money", (raw) => {
    // Dropping a non-zero digit changes the amount. Naming the row and
    // quarantining it is the only honest answer.
    expect(() => normalizeSpreadsheetMoney(raw)).toThrow(TypeError);
  });
});
