import { describe, expect, it } from "vitest";

import { DossierSchema, assertSchemaCompatibility } from "./dossier-schema.js";

describe("dossier schema compatibility", () => {
  it("rejects a breaking fixture unless schema_version major changes", () => {
    const published = DossierSchema.parse({
      schema_version: "1.0.0",
      dossier_id: "dossier-1",
      composed_at: "2026-07-29T00:00:00.000Z",
      fields: {},
    });

    expect(() => assertSchemaCompatibility(published, {
      schema_version: "1.1.0",
      dossier_id: "dossier-1",
      composed_at: "2026-07-29T00:00:00.000Z",
    })).toThrow("BREAKING_SCHEMA_CHANGE_REQUIRES_MAJOR_VERSION");

    expect(() => assertSchemaCompatibility(published, {
      schema_version: "2.0.0",
      dossier_id: "dossier-1",
      composed_at: "2026-07-29T00:00:00.000Z",
    })).not.toThrow();
  });
});
