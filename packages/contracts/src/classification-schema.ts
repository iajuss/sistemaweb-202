import { z } from "zod";

export const ClassificationSchema = z.object({
  schema_version: z.string().regex(/^\d+\.\d+\.\d+$/, "SEMVER_REQUIRED"),
  classification_id: z.string().min(1),
  dossier_id: z.string().min(1),
  policy_version: z.string().min(1),
  classified_at: z.iso.datetime(),
  category: z.string().min(1),
  operational_priority: z.number().int().nonnegative(),
  primary_strategy: z.string().min(1),
  cobertura: z.enum(["SUFICIENTE", "INSUFICIENTE"]),
  confianca_global: z.number().min(0).max(1),
  signals: z.array(z.object({
    nome: z.string().min(1),
    peso: z.number(),
    fonte: z.string().min(1),
    aplicado: z.boolean(),
  }).strict()),
  explicacao: z.string().min(1),
}).strict();

export type Classification = z.infer<typeof ClassificationSchema>;
