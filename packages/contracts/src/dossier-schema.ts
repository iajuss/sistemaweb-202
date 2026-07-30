import { SerializedCentsSchema, SourceStatusSchema } from "@panella/domain";
import { z } from "zod";

const SemanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/, "SEMVER_REQUIRED");

export const SourceProvenanceSchema = z.object({
  fonte: z.string().min(1),
  parametros_consulta: z.record(z.string(), z.unknown()),
}).strict();

const FieldEnvelopeBaseSchema = z.object({
  status: SourceStatusSchema,
  fonte: SourceProvenanceSchema,
  coletado_em: z.iso.datetime(),
  data_referencia: z.iso.datetime().nullable(),
  confianca_vinculo: z.number().min(0).max(1),
  evidencia_vinculo: z.array(z.string()),
});

export const MonetaryFieldEnvelopeSchema = FieldEnvelopeBaseSchema.extend({
  tipo_valor: z.literal("MONETARIO_CENTAVOS"),
  valor: SerializedCentsSchema,
}).strict();

export const TextFieldEnvelopeSchema = FieldEnvelopeBaseSchema.extend({
  tipo_valor: z.literal("TEXTO"),
  valor: z.string(),
}).strict();

export const BooleanFieldEnvelopeSchema = FieldEnvelopeBaseSchema.extend({
  tipo_valor: z.literal("BOOLEANO"),
  valor: z.boolean(),
}).strict();

export const DateTimeFieldEnvelopeSchema = FieldEnvelopeBaseSchema.extend({
  tipo_valor: z.literal("DATA_HORA"),
  valor: z.iso.datetime(),
}).strict();

export const TextListFieldEnvelopeSchema = FieldEnvelopeBaseSchema.extend({
  tipo_valor: z.literal("LISTA_TEXTO"),
  valor: z.array(z.string()),
}).strict();

export const EmptyFieldEnvelopeSchema = FieldEnvelopeBaseSchema.extend({
  tipo_valor: z.literal("SEM_VALOR"),
  valor: z.null(),
}).strict();

export const FieldEnvelopeSchema = z.discriminatedUnion("tipo_valor", [
  MonetaryFieldEnvelopeSchema,
  TextFieldEnvelopeSchema,
  BooleanFieldEnvelopeSchema,
  DateTimeFieldEnvelopeSchema,
  TextListFieldEnvelopeSchema,
  EmptyFieldEnvelopeSchema,
]);

export const DossierSchema = z.object({
  schema_version: SemanticVersionSchema,
  dossier_id: z.string().min(1),
  composed_at: z.iso.datetime(),
  fields: z.record(z.string(), FieldEnvelopeSchema),
}).strict();

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
  if (!result.success) {
    throw new TypeError("BREAKING_SCHEMA_CHANGE_REQUIRES_MAJOR_VERSION");
  }

  if (majorVersion(result.data.schema_version) !== majorVersion(published.schema_version)) {
    return;
  }
}
