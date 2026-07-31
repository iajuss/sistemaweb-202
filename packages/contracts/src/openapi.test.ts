import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi.js";

/**
 * The OpenAPI document is derived from the Zod schemas, never hand-authored in
 * parallel with the code. A contract written twice drifts, and the version an
 * agent reads would stop being the version the server enforces.
 */

const document = buildOpenApiDocument();

function operation(path: string, method: "get" | "post") {
  const item = document.paths[path];
  if (!item) {
    throw new Error(`ROTA_AUSENTE_NO_OPENAPI:${path}`);
  }
  const found = item[method];
  if (!found) {
    throw new Error(`METODO_AUSENTE_NO_OPENAPI:${method} ${path}`);
  }
  return found;
}

describe("the document describes the three operations", () => {
  it("documents lookup as a POST with a body", () => {
    const lookup = operation(
      "/api/v1/carteiras/{walletId}/dossies/lookup",
      "post",
    );

    expect(lookup.requestBody).toBeDefined();
    expect(Object.keys(document.paths)).toHaveLength(3);
  });

  it("documents priorities with cursor and limit as query parameters", () => {
    const priorities = operation(
      "/api/v1/carteiras/{walletId}/prioridades",
      "get",
    );
    const names = (priorities.parameters ?? []).map((entry) => entry.name);

    expect(names).toContain("cursor");
    expect(names).toContain("limit");
  });

  it("documents the prompt as markdown, not JSON", () => {
    const prompt = operation("/api/v1/dossies/{dossierId}/prompt", "get");

    expect(Object.keys(prompt.responses["200"].content ?? {})).toContain(
      "text/markdown",
    );
  });
});

describe("what the document may never say", () => {
  it("declares no CPF parameter anywhere", () => {
    const serialized = JSON.stringify(document).toLowerCase();

    // Not a style rule: a documented CPF parameter is a documented way to ask
    // the system about a person it was never given.
    expect(serialized).not.toContain("cpf");
    expect(serialized).not.toContain("documento");
  });

  it("puts no identifier of a person in any path", () => {
    for (const path of Object.keys(document.paths)) {
      expect(path).not.toContain("{cpf}");
      expect(path).not.toContain("{debtorId}");
    }
  });

  it("carries the lookup body schema derived from Zod, not written by hand", () => {
    const lookup = operation(
      "/api/v1/carteiras/{walletId}/dossies/lookup",
      "post",
    );
    const schema = lookup.requestBody?.content["application/json"]?.schema as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    };

    expect(Object.keys(schema.properties ?? {})).toEqual(["id_externo"]);
    // Strictness survives the projection: the published contract says as much
    // as the runtime validator does, so an extra key is refused on both sides.
    expect(schema.additionalProperties).toBe(false);
  });
});
