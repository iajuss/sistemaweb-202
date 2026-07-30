import { describe, expect, it } from "vitest";

import { Money } from "./money.js";

describe("Money", () => {
  it("keeps 29163886.440000001 out of monetary arithmetic", () => {
    expect(Money.fromDecimalString("29163886.440000001").toCents()).toBe(2916388644n);
  });

  it("rejects number inputs so monetary values cannot use floating point", () => {
    expect(() => Money.fromDecimalString(29163886.44 as never)).toThrow(TypeError);
  });
});
