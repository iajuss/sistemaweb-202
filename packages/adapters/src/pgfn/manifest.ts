import type { SourceStatus } from "@panella/domain";

/**
 * Dados Abertos is published in three systems. A query that read one of them
 * has not looked for the other two, and ADR 014 is explicit that only complete
 * coverage of the applicable slices may answer `NAO_ENCONTRADO`.
 */
export const PGFN_REQUIRED_SYSTEMS = [
  "SIDA",
  "PREVIDENCIARIO",
  "FGTS",
] as const;

export type PgfnSystem = (typeof PGFN_REQUIRED_SYSTEMS)[number];

export interface PgfnPartResult {
  readonly system: PgfnSystem;
  readonly uf: string;
  readonly file: string;
  /** Provenance: which bytes produced this, so a rerun is comparable. */
  readonly checksum: string;
  readonly outcome: "PROCESSADA" | "ERRO";
  readonly error?: string;
}

export interface PgfnMissingPart {
  readonly system: PgfnSystem;
  readonly uf: string;
}

export interface PgfnCoverageManifest {
  /** Publication reference, which is also the field's `coletado_em`. */
  readonly referenceDate: string;
  readonly requiredUfs: readonly string[];
  readonly parts: readonly PgfnPartResult[];
  readonly missingParts: readonly PgfnMissingPart[];
  /** The status to report when no record matched. Never `ENCONTRADO`. */
  readonly coverageStatus: Extract<
    SourceStatus,
    "NAO_ENCONTRADO" | "NAO_CONSULTADO" | "ERRO_NA_FONTE"
  >;
}

export interface PgfnManifestInput {
  readonly referenceDate: string;
  readonly requiredUfs: readonly string[];
  readonly parts: readonly PgfnPartResult[];
}

export function buildPgfnManifest(
  input: PgfnManifestInput,
): PgfnCoverageManifest {
  const processed = new Set(
    input.parts
      .filter((entry) => entry.outcome === "PROCESSADA")
      .map((entry) => `${entry.system}|${entry.uf}`),
  );

  const missingParts: PgfnMissingPart[] = [];
  for (const uf of input.requiredUfs) {
    for (const system of PGFN_REQUIRED_SYSTEMS) {
      if (!processed.has(`${system}|${uf}`)) {
        missingParts.push({ system, uf });
      }
    }
  }

  const failed = input.parts.some((entry) => entry.outcome === "ERRO");
  // Order matters: a part that broke is a source error even though the slice
  // is nominally covered, and an unread slice is unread, not empty. Neither
  // ever becomes "this person has no debt".
  const coverageStatus = failed
    ? "ERRO_NA_FONTE"
    : missingParts.length > 0
      ? "NAO_CONSULTADO"
      : "NAO_ENCONTRADO";

  return {
    referenceDate: input.referenceDate,
    requiredUfs: [...input.requiredUfs],
    parts: [...input.parts],
    missingParts,
    coverageStatus,
  };
}

/**
 * A record that was actually read is a fact, and incomplete coverage cannot
 * unfind it. Absence, on the other hand, is only as strong as the coverage.
 */
export function pgfnObservationStatus(
  manifest: PgfnCoverageManifest,
  matchCount: number,
): SourceStatus {
  return matchCount > 0 ? "ENCONTRADO" : manifest.coverageStatus;
}
