import { describe, expect, it } from "vitest";

import { SOURCE_STATUSES, SourceStatusSchema } from "./source-status.js";

describe("SourceStatus", () => {
  it("does not collapse source states", () => {
    expect(new Set(SOURCE_STATUSES)).toEqual(new Set([
      "ENCONTRADO",
      "NAO_ENCONTRADO",
      "NAO_CONSULTADO",
      "ERRO_NA_FONTE",
    ]));
  });

  it("rejects values outside the four distinct states", () => {
    expect(SourceStatusSchema.safeParse("DESCONHECIDO").success).toBe(false);
  });
});
