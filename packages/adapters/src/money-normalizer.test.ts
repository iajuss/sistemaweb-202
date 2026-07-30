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
});
