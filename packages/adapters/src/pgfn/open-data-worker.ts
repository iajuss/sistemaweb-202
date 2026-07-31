import { createHash } from "node:crypto";

import { isMaskCompatibleWithCpf, type SourceStatus } from "@panella/domain";

import {
  PGFN_REQUIRED_SYSTEMS,
  buildPgfnManifest,
  pgfnObservationStatus,
  type PgfnCoverageManifest,
  type PgfnPartResult,
  type PgfnSystem,
} from "./manifest.js";
import { parsePgfnOpenDataPart, type PgfnOpenDataRow } from "./open-data.js";

/**
 * A wallet debtor as the matcher sees it. The full CPF exists here only for
 * the duration of the run: it is compared against the published mask in memory
 * and never written to an observation, a manifest or a log.
 */
export interface PgfnWalletCandidate {
  readonly debtorId: string;
  readonly cpf: string;
  readonly name: string;
}

export interface PgfnPartInput {
  readonly system: PgfnSystem;
  readonly uf: string;
  readonly file: string;
  /** Absent when the part could not be fetched; `error` says why. */
  readonly bytes?: Uint8Array;
  readonly error?: string;
}

/** One published inscription, as published. No judgement about who it is. */
export interface PgfnInscription {
  readonly system: PgfnSystem;
  readonly uf: string;
  readonly maskedCpf: string;
  readonly name: string;
  readonly inscriptionNumber: string;
  readonly situationType: string;
  readonly situation: string;
  readonly inscribedAt: string;
  readonly consolidatedAmountCents: bigint;
}

export interface PgfnQueryScope {
  readonly referenceDate: string;
  readonly requiredUfs: readonly string[];
  readonly systems: readonly PgfnSystem[];
  readonly coverageComplete: boolean;
}

/**
 * A raw source fact, per ADR 017. It carries no link confidence: whether a
 * mask-compatible record is actually this debtor is the resolver's answer, and
 * that answer has to stay re-executable against the untouched fact.
 */
export interface PgfnOpenDataObservation {
  readonly tenantId: string;
  readonly debtorId: string;
  readonly source: "PGFN_DADOS_ABERTOS";
  readonly status: SourceStatus;
  /** The publication reference, not the day the job ran. */
  readonly collectedAt: string;
  readonly queryParams: PgfnQueryScope;
  readonly payload: { readonly inscriptions: readonly PgfnInscription[] };
}

export interface PgfnIngestionInput {
  readonly tenantId: string;
  readonly referenceDate: string;
  readonly requiredUfs: readonly string[];
  readonly parts: readonly PgfnPartInput[];
  readonly candidates: readonly PgfnWalletCandidate[];
}

export interface PgfnIngestionResult {
  readonly manifest: PgfnCoverageManifest;
  readonly observations: readonly PgfnOpenDataObservation[];
}

interface ProcessedPart {
  readonly result: PgfnPartResult;
  readonly rows: readonly PgfnOpenDataRow[];
}

function processPart(part: PgfnPartInput): ProcessedPart {
  if (!part.bytes) {
    return {
      result: {
        system: part.system,
        uf: part.uf,
        file: part.file,
        checksum: "",
        outcome: "ERRO",
        error: part.error ?? "PARTE_NAO_LIDA",
      },
      rows: [],
    };
  }

  const checksum = createHash("sha256").update(part.bytes).digest("hex");
  try {
    return {
      result: {
        system: part.system,
        uf: part.uf,
        file: part.file,
        checksum,
        outcome: "PROCESSADA",
      },
      rows: parsePgfnOpenDataPart(part.bytes).rows,
    };
  } catch (cause) {
    return {
      result: {
        system: part.system,
        uf: part.uf,
        file: part.file,
        checksum,
        outcome: "ERRO",
        error: cause instanceof Error ? cause.message : "ERRO_DESCONHECIDO",
      },
      rows: [],
    };
  }
}

export function ingestPgfnOpenData(
  input: PgfnIngestionInput,
): PgfnIngestionResult {
  const processed = input.parts.map(processPart);
  const manifest = buildPgfnManifest({
    referenceDate: input.referenceDate,
    requiredUfs: input.requiredUfs,
    parts: processed.map((part) => part.result),
  });

  const queryParams: PgfnQueryScope = {
    referenceDate: input.referenceDate,
    requiredUfs: [...input.requiredUfs],
    systems: [...PGFN_REQUIRED_SYSTEMS],
    coverageComplete: manifest.missingParts.length === 0,
  };

  const observations = input.candidates.map((candidate) => {
    const inscriptions: PgfnInscription[] = [];

    for (const part of processed) {
      for (const row of part.rows) {
        // The only gate on persistence. A row that fits nobody in the wallet
        // belongs to a non-client and never leaves this loop — not to a file,
        // not to an index, not to a log.
        if (!isMaskCompatibleWithCpf(row.maskedCpf, candidate.cpf)) {
          continue;
        }

        inscriptions.push({
          system: part.result.system,
          uf: part.result.uf,
          maskedCpf: row.maskedCpf,
          name: row.name,
          inscriptionNumber: row.inscriptionNumber,
          situationType: row.situationType,
          situation: row.situation,
          inscribedAt: row.inscribedAt,
          consolidatedAmountCents: row.consolidatedAmount.toCents(),
        });
      }
    }

    return {
      tenantId: input.tenantId,
      debtorId: candidate.debtorId,
      source: "PGFN_DADOS_ABERTOS",
      status: pgfnObservationStatus(manifest, inscriptions.length),
      collectedAt: input.referenceDate,
      queryParams,
      payload: { inscriptions },
    } satisfies PgfnOpenDataObservation;
  });

  return { manifest, observations };
}
