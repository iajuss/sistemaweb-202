import { describe, expect, it } from "vitest";

import { ClassificationSchema } from "./classification-schema.js";
import { DossierSchema, assertSchemaCompatibility } from "./dossier-schema.js";

const envelopeBase = {
  status: "ENCONTRADO",
  fonte: { fonte: "PGFN", parametros_consulta: {} },
  coletado_em: "2026-07-29T00:00:00.000Z",
  data_referencia: "2026-07-01T00:00:00.000Z",
  confianca_vinculo: 1,
  evidencia_vinculo: ["fixture_sintetica"],
} as const;

describe("dossier schema compatibility", () => {
  it.each([
    29163886,
    null,
    29163886.44,
    "29163886.44",
  ])("rejects non-serialized cents in monetary envelopes %#", (valor) => {
    expect(DossierSchema.safeParse({
      schema_version: "1.0.0",
      dossier_id: "dossier-money-invalid",
      composed_at: "2026-07-29T00:00:00.000Z",
      fields: {
        divida_total: { ...envelopeBase, tipo_valor: "MONETARIO_CENTAVOS", valor },
      },
    }).success).toBe(false);
  });

  it("accepts cents serialized with the contract grammar", () => {
    expect(DossierSchema.safeParse({
      schema_version: "1.0.0",
      dossier_id: "dossier-money",
      composed_at: "2026-07-29T00:00:00.000Z",
      fields: {
        divida_total: { ...envelopeBase, tipo_valor: "MONETARIO_CENTAVOS", valor: "2916388644" },
      },
    }).success).toBe(true);
  });

  it("keeps non-monetary field values explicitly typed", () => {
    expect(DossierSchema.safeParse({
      schema_version: "1.0.0",
      dossier_id: "dossier-text",
      composed_at: "2026-07-29T00:00:00.000Z",
      fields: {
        situacao: { ...envelopeBase, tipo_valor: "TEXTO", valor: "regular" },
      },
    }).success).toBe(true);
  });

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
      fields: {
        situacao: { ...envelopeBase, tipo_valor: "TEXTO", valor: "regular" },
      },
    })).not.toThrow();

    expect(() => assertSchemaCompatibility(published, {
      schema_version: "1.1.0",
      dossier_id: "dossier-1",
      composed_at: "2026-07-29T00:00:00.000Z",
    })).toThrow("BREAKING_SCHEMA_CHANGE_REQUIRES_MAJOR_VERSION");

    expect(() => assertSchemaCompatibility(published, {
      schema_version: "2.0.0",
      dossier_id: "dossier-1",
      composed_at: "2026-07-29T00:00:00.000Z",
    })).toThrow("BREAKING_SCHEMA_CHANGE_REQUIRES_MAJOR_VERSION");
  });

  it("requires coverage and global confidence for agent-facing classifications", () => {
    const classification = {
      schema_version: "1.0.0",
      classification_id: "classification-1",
      dossier_id: "dossier-1",
      policy_version: "2026-07-a",
      classified_at: "2026-07-29T00:00:00.000Z",
      category: "TRATAMENTO_LEVE",
      operational_priority: 3,
      primary_strategy: "CONTATO_INICIAL",
      signals: [],
      explicacao: "Cobertura e confiança permitem tratamento leve.",
      cobertura: "SUFICIENTE",
      confianca_global: 0.8,
    };

    expect(ClassificationSchema.safeParse(classification).success).toBe(true);
    const withoutRequiredFields: Partial<typeof classification> = { ...classification };
    delete withoutRequiredFields.cobertura;
    delete withoutRequiredFields.confianca_global;
    expect(ClassificationSchema.safeParse(withoutRequiredFields).success).toBe(false);
  });

  it("requires DADOS_INSUFICIENTES when coverage is insufficient", () => {
    const classification = {
      schema_version: "1.0.0",
      classification_id: "classification-insufficient-coverage",
      dossier_id: "dossier-1",
      policy_version: "2026-07-a",
      classified_at: "2026-07-29T00:00:00.000Z",
      category: "TRATAMENTO_LEVE",
      operational_priority: 3,
      primary_strategy: "CONTATO_INICIAL",
      cobertura: "INSUFICIENTE",
      confianca_global: 0.8,
      signals: [],
      explicacao: "A cobertura insuficiente deve impedir uma classificacao acionavel.",
    };

    expect(ClassificationSchema.safeParse(classification).success).toBe(false);
    expect(ClassificationSchema.safeParse({
      ...classification,
      category: "DADOS_INSUFICIENTES",
    }).success).toBe(true);
  });
});
