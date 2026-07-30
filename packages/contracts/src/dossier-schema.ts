import { SourceStatusSchema } from "@panella/domain";
import { z } from "zod";

const SemanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/, "SEMVER_REQUIRED");

export const SourceProvenanceSchema = z.object({
  fonte: z.string().min(1),
  parametros_consulta: z.record(z.string(), z.unknown()),
});

export const FieldEnvelopeSchema = z.object({
  valor: z.unknown().nullable(),
  status: SourceStatusSchema,
  fonte: SourceProvenanceSchema,
  coletado_em: z.iso.datetime(),
  data_referencia: z.iso.datetime().nullable(),
  confianca_vinculo: z.number().min(0).max(1),
  evidencia_vinculo: z.array(z.string()),
});

export const DossierSchema = z.object({
  schema_version: SemanticVersionSchema,
  dossier_id: z.string().min(1),
  composed_at: z.iso.datetime(),
  fields: z.record(z.string(), FieldEnvelopeSchema),
});

export type FieldEnvelope = z.infer<typeof FieldEnvelopeSchema>;
export type Dossier = z.infer<typeof DossierSchema>;

function majorVersion(version: string): string {
  return version.split(".", 1)[0] ?? "";
}

export function assertSchemaCompatibility(
  published: z.infer<typeof DossierSchema>,
  candidate: unknown,
): void {
  const result = DossierSchema.safeParse(candidate);
  if (result.success) {
    return;
  }

  const candidateVersion = z.object({ schema_version: SemanticVersionSchema }).safeParse(candidate);
  if (candidateVersion.success && majorVersion(candidateVersion.data.schema_version) !== majorVersion(published.schema_version)) {
    return;
  }

  throw new TypeError("BREAKING_SCHEMA_CHANGE_REQUIRES_MAJOR_VERSION");
}
