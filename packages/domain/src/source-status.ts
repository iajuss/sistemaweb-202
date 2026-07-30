import { z } from "zod";

export const SOURCE_STATUSES = [
  "ENCONTRADO",
  "NAO_ENCONTRADO",
  "NAO_CONSULTADO",
  "ERRO_NA_FONTE",
] as const;

export const SourceStatusSchema = z.enum(SOURCE_STATUSES);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
