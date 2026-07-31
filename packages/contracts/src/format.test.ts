import { describe, expect, it } from "vitest";

import {
  formatBrlFromCents,
  formatIsoDate,
  formatIsoDateTime,
} from "./format.js";

/**
 * Formatting is the presentation edge and nothing else. Every expectation
 * below was written out by hand before the module existed, because the point
 * of the module is the exact shape of the string.
 */

describe("formatBrlFromCents", () => {
  it.each([
    [0n, "R$ 0,00"],
    [5n, "R$ 0,05"],
    [50n, "R$ 0,50"],
    [100n, "R$ 1,00"],
    [1_050n, "R$ 10,50"],
    [100_000n, "R$ 1.000,00"],
    [-12_345n, "-R$ 123,45"],
    [100_000_000_000n, "R$ 1.000.000.000,00"],
  ])("renders %s cents as %s", (centavos, expected) => {
    expect(formatBrlFromCents(centavos)).toBe(expected);
  });

  it("renders the amount the real PGFN export publishes", () => {
    // `29163886,440000001` rounded to cents by ADR 023, plus the wallet's own
    // titles: the figure the demo prints, and the one that was rendering as
    // `R$ 29175886.44` before this module existed.
    expect(formatBrlFromCents(2_917_588_644n)).toBe("R$ 29.175.886,44");
  });

  it("never converts money through a float", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync(new URL("./format.ts", import.meta.url), "utf8"),
    );

    // The whole reason money is carried in integer cents. One `Number()` on
    // the way to the screen undoes it silently, and the real source already
    // publishes `29163886,440000001`.
    expect(source).not.toMatch(/\bNumber\s*\(/);
    expect(source).not.toMatch(/\bparseFloat\b/);
    expect(source).not.toMatch(/\bparseInt\b/);
    expect(source).not.toMatch(/\bIntl\b/);
  });
});

describe("formatIsoDate", () => {
  it.each([
    ["2026-07-31T17:40:28.660Z", "31/07/2026"],
    ["2026-01-01T00:00:00.000Z", "01/01/2026"],
    ["2026-06-30T00:00:00.000Z", "30/06/2026"],
  ])("renders %s as %s", (iso, expected) => {
    expect(formatIsoDate(iso)).toBe(expected);
  });

  it("refuses a string that is not an ISO instant instead of guessing", () => {
    expect(() => formatIsoDate("31/07/2026")).toThrow("DATA_NAO_E_ISO_8601");
  });
});

describe("formatIsoDateTime", () => {
  it("declares UTC rather than silently shifting the clock", () => {
    // The stored instant is UTC. Rendering it as local time would need a tenant
    // timezone nobody has configured, and a wrong hour on an audit trail is
    // worse than an explicit one.
    expect(formatIsoDateTime("2026-07-31T17:40:28.660Z")).toBe(
      "31/07/2026 17:40 UTC",
    );
  });

  it("refuses a string that is not an ISO instant", () => {
    expect(() => formatIsoDateTime("ontem")).toThrow("DATA_NAO_E_ISO_8601");
  });
});
