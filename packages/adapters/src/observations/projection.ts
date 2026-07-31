import { createHash } from "node:crypto";

import {
  CARTEIRA_SLICE_ID,
  PGFN_LISTA_SLICE_ID,
  isMaskCompatibleWithCpf,
  pgfnOpenDataSliceId,
  type ObservationRecord,
  type PublishedSubject,
  type RawObservation,
  type SourceStatus,
} from "@panella/domain";

import type { PgfnCoverageManifest, PgfnSystem } from "../pgfn/manifest.js";
import { PGFN_REQUIRED_SYSTEMS } from "../pgfn/manifest.js";
import type { PgfnInscription } from "../pgfn/open-data-worker.js";
import type { PgfnListBlock } from "../pgfn/list-importer.js";

/**
 * The seam between a source adapter's own shape and the `RawObservation` the
 * dossier composes. It is a projection and not a decision: nothing here judges
 * whether a published record is this debtor — that is the resolver's answer,
 * taken later, against these untouched facts (ADR 017).
 *
 * **One observation per declared slice.** Coverage is decided slice by slice,
 * and that is what separates `NAO_CONSULTADO` from `NAO_ENCONTRADO`. Collapsing
 * the three PGFN systems into a single fact would make a system nobody read
 * indistinguishable from a system that answered nothing.
 */

/**
 * Deterministic, and derived from the collection rather than from a clock. The
 * same collection re-run lands on the same row instead of duplicating it, while
 * a genuinely new collection is a new immutable fact with its own id.
 */
function observationId(
  source: string,
  sliceId: string,
  debtorId: string,
  collectedAt: string,
): string {
  return createHash("sha256")
    .update(`${source}|${sliceId}|${debtorId}|${collectedAt}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * One published person, one id, whatever slice published them. The resolver
 * dedupes candidates by this id: two ids for one person would manufacture a tie
 * between somebody and themselves and refuse a match that is not in doubt.
 */
function subjectId(maskedCpf: string, name: string): string {
  return `subject-${createHash("sha256")
    .update(`${maskedCpf}|${name}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export interface WalletTitleFact {
  readonly externalId: string;
  readonly amountCents: bigint;
}

export interface WalletObservationInput {
  readonly tenantId: string;
  readonly debtorId: string;
  /** When the wallet was imported. The dossier's own date is composition. */
  readonly collectedAt: string;
  readonly titles: readonly WalletTitleFact[];
}

/**
 * The wallet as a source. There is deliberately no `walletId` parameter and no
 * wallet anywhere in the output: an observation belongs to tenant + debtor, and
 * the wallet authorises the read through its current link with the debtor
 * (ADR 020). Writing it into the fact would make the fact wallet-shaped.
 */
export function projectWalletObservation(
  input: WalletObservationInput,
): RawObservation {
  const total = input.titles.reduce(
    (sum, title) => sum + title.amountCents,
    0n,
  );

  const record: ObservationRecord = {
    // The wallet link is declared, not resolved, so composition takes every
    // record of this source regardless of subject.
    subjectId: "declarado-pelo-cliente",
    values: {
      carteira_valor_em_aberto: {
        tipo: "MONETARIO_CENTAVOS",
        centavos: total,
      },
      carteira_titulos: {
        tipo: "LISTA_TEXTO",
        lista: input.titles.map((title) => title.externalId),
      },
    },
  };

  return Object.freeze({
    id: observationId(
      "CARTEIRA_CLIENTE",
      CARTEIRA_SLICE_ID,
      input.debtorId,
      input.collectedAt,
    ),
    tenantId: input.tenantId,
    debtorId: input.debtorId,
    source: "CARTEIRA_CLIENTE",
    sliceId: CARTEIRA_SLICE_ID,
    status: "ENCONTRADO",
    collectedAt: input.collectedAt,
    referenceDate: null,
    queryParams: { origem: "IMPORTACAO_DA_CARTEIRA" },
    subjects: [],
    records: [record],
  });
}

export interface PgfnOpenDataProjectionInput {
  readonly tenantId: string;
  readonly debtorId: string;
  readonly requiredUfs: readonly string[];
  readonly manifest: PgfnCoverageManifest;
  /** Already gated by mask against this debtor by the ingestion worker. */
  readonly inscriptions: readonly PgfnInscription[];
}

function sliceStatus(
  manifest: PgfnCoverageManifest,
  system: PgfnSystem,
  uf: string,
  found: number,
): SourceStatus {
  const part = manifest.parts.find(
    (entry) => entry.system === system && entry.uf === uf,
  );
  if (!part) {
    // Nobody read it. Unread is not empty, and it is never "no debt".
    return "NAO_CONSULTADO";
  }
  if (part.outcome === "ERRO") {
    // A part that broke is a source error even though the slice is nominally
    // covered. An API failure does not turn anyone into a bad payer.
    return "ERRO_NA_FONTE";
  }
  return found > 0 ? "ENCONTRADO" : "NAO_ENCONTRADO";
}

function recordsForSlice(
  inscriptions: readonly PgfnInscription[],
): {
  readonly subjects: readonly PublishedSubject[];
  readonly records: readonly ObservationRecord[];
} {
  const subjects = new Map<string, PublishedSubject>();
  const totals = new Map<string, bigint>();
  const numbers = new Map<string, string[]>();

  for (const entry of inscriptions) {
    const id = subjectId(entry.maskedCpf, entry.name);
    subjects.set(id, { id, maskedCpf: entry.maskedCpf, name: entry.name });
    totals.set(id, (totals.get(id) ?? 0n) + entry.consolidatedAmountCents);
    numbers.set(id, [...(numbers.get(id) ?? []), entry.inscriptionNumber]);
  }

  return {
    subjects: [...subjects.values()],
    records: [...subjects.keys()].map((id) => ({
      subjectId: id,
      values: {
        pgfn_dados_abertos_valor_consolidado: {
          tipo: "MONETARIO_CENTAVOS" as const,
          centavos: totals.get(id) ?? 0n,
        },
        pgfn_dados_abertos_inscricoes: {
          tipo: "LISTA_TEXTO" as const,
          lista: numbers.get(id) ?? [],
        },
      },
    })),
  };
}

export function projectPgfnOpenDataObservations(
  input: PgfnOpenDataProjectionInput,
): readonly RawObservation[] {
  const observations: RawObservation[] = [];

  // Iterates the declared plan, never the inscriptions that happened to arrive.
  for (const uf of input.requiredUfs) {
    for (const system of PGFN_REQUIRED_SYSTEMS) {
      const forSlice = input.inscriptions.filter(
        (entry) => entry.system === system && entry.uf === uf,
      );
      const { subjects, records } = recordsForSlice(forSlice);
      const status = sliceStatus(input.manifest, system, uf, forSlice.length);
      const sliceId = pgfnOpenDataSliceId(system, uf);

      observations.push(
        Object.freeze({
          id: observationId(
            "PGFN_DADOS_ABERTOS",
            sliceId,
            input.debtorId,
            input.manifest.referenceDate,
          ),
          tenantId: input.tenantId,
          debtorId: input.debtorId,
          source: "PGFN_DADOS_ABERTOS",
          sliceId,
          status,
          collectedAt: input.manifest.referenceDate,
          referenceDate: input.manifest.referenceDate,
          // Without the parameters, "not found under a filter" reads as "no
          // debt". They travel with the fact, not beside it.
          queryParams: {
            uf,
            sistema: system,
            referencia: input.manifest.referenceDate,
            escopoCompleto: input.manifest.missingParts.length === 0,
          },
          subjects: status === "ENCONTRADO" ? subjects : [],
          records: status === "ENCONTRADO" ? records : [],
        }),
      );
    }
  }

  return Object.freeze(observations);
}

export interface PgfnListProjectionInput {
  readonly tenantId: string;
  readonly debtorId: string;
  /** In memory for the mask comparison only; never written to the fact. */
  readonly cpf: string;
  readonly collectedAt: string;
  readonly blocks: readonly PgfnListBlock[];
}

export function projectPgfnListObservation(
  input: PgfnListProjectionInput,
): RawObservation {
  const subjects: PublishedSubject[] = [];
  const records: ObservationRecord[] = [];
  const filters: string[] = [];
  let scopeComplete = false;

  for (const block of input.blocks) {
    // A block whose filters nobody can name describes a query nobody can
    // reproduce. Counting its rows would turn a gap into a claim (ADR 015).
    if (block.status !== "COM_PROCEDENCIA" || !block.provenance) {
      continue;
    }

    filters.push(...block.provenance.filters);
    // Never assumed: a block is only integral when it says so. One filtered
    // block is enough to make the whole reading a slice of the universe.
    scopeComplete = scopeComplete || block.queryScope.complete;

    for (const row of block.rows) {
      // The only gate on persistence. A row that fits nobody in the wallet
      // belongs to a non-client and never leaves this loop.
      if (!isMaskCompatibleWithCpf(row.maskedCpf, input.cpf)) {
        continue;
      }

      const id = subjectId(row.maskedCpf, row.name);
      subjects.push({ id, maskedCpf: row.maskedCpf, name: row.name });
      records.push({
        subjectId: id,
        values: {
          // Two fields, never one. `Valor Total` and `Valor da Dívida
          // Selecionada` diverge in a third of the real sample, and a silent
          // fallback between them is forbidden.
          pgfn_lista_valor_total: {
            tipo: "MONETARIO_CENTAVOS",
            centavos: row.totalAmount.cents,
          },
          pgfn_lista_valor_selecionado: {
            tipo: "MONETARIO_CENTAVOS",
            centavos: row.selectedAmount.cents,
          },
        },
      });
    }
  }

  return Object.freeze({
    id: observationId(
      "PGFN_LISTA_DEVEDORES_MANUAL",
      PGFN_LISTA_SLICE_ID,
      input.debtorId,
      input.collectedAt,
    ),
    tenantId: input.tenantId,
    debtorId: input.debtorId,
    source: "PGFN_LISTA_DEVEDORES_MANUAL",
    sliceId: PGFN_LISTA_SLICE_ID,
    status: subjects.length > 0 ? "ENCONTRADO" : "NAO_ENCONTRADO",
    collectedAt: input.collectedAt,
    referenceDate: input.collectedAt,
    queryParams: { filtros: filters, escopoCompleto: scopeComplete },
    subjects,
    records,
  });
}
