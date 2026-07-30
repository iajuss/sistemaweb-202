import { z } from "zod";

const ClassificationBaseSchema = z.object({
  schema_version: z.string().regex(/^\d+\.\d+\.\d+$/, "SEMVER_REQUIRED"),
  classification_id: z.string().min(1),
  dossier_id: z.string().min(1),
  policy_version: z.string().min(1),
  classified_at: z.iso.datetime(),
  operational_priority: z.number().int().nonnegative(),
  primary_strategy: z.string().min(1),
  confianca_global: z.number().min(0).max(1),
  signals: z.array(z.object({
    nome: z.string().min(1),
    peso: z.number(),
    fonte: z.string().min(1),
    aplicado: z.boolean(),
  }).strict()),
  explicacao: z.string().min(1),
}).strict();

export const ClassificationSchema = z.union([
  ClassificationBaseSchema.extend({
    category: z.string().min(1),
    cobertura: z.literal("SUFICIENTE"),
  }).strict(),
  ClassificationBaseSchema.extend({
    category: z.literal("DADOS_INSUFICIENTES"),
    cobertura: z.literal("INSUFICIENTE"),
  }).strict(),
]);

export type Classification = z.infer<typeof ClassificationSchema>;
