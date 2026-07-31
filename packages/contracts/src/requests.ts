import { z } from "zod";

/**
 * Request contracts for the agent-facing read API.
 *
 * Every schema is `.strict()`, and that is the mechanism rather than a style
 * choice: a lookup carrying `cpf` is rejected because the shape refuses
 * unknown keys, not because someone remembered to check for that particular
 * one. A query only ever runs over a title the client already imported, so
 * the external title id is the only handle the caller ever holds.
 */

export const LookupDossierRequestSchema = z
  .object({
    id_externo: z.string().min(1),
  })
  .strict();

export type LookupDossierRequest = z.infer<typeof LookupDossierRequestSchema>;

/**
 * The cursor is opaque by contract. Callers must not construct or parse one:
 * its contents are an implementation detail of the ordering, and a client that
 * builds its own would break the moment the tie-breaker changes.
 */
export const ListPrioritiesRequestSchema = z
  .object({
    cursor: z.string().min(1).nullable().default(null),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export type ListPrioritiesRequest = z.infer<typeof ListPrioritiesRequestSchema>;

/**
 * There is no schema here that accepts a CPF, in a body or anywhere else, and
 * that absence is deliberate. A CPF never travels in a URL, a query string or
 * a log line, and an open lookup by CPF does not exist in this product.
 */
export const FORBIDDEN_LOOKUP_KEYS = Object.freeze([
  "cpf",
  "cpf_hash",
  "documento",
]);
