import type { PublishedRecord } from "./identity/resolver.js";
import type { SourceStatus } from "./source-status.js";

/**
 * Observation — the first of the three layers ADR 004 keeps apart. A raw fact
 * from one source, with the parameters that produced it, immutable and
 * reusable. It carries **no link confidence**: whether a published record is
 * this debtor is the resolver's answer, and that answer has to stay
 * re-executable against the untouched fact (ADR 017).
 */

export const SOURCE_NAMES = [
  "CARTEIRA_CLIENTE",
  "PGFN_DADOS_ABERTOS",
  "PGFN_LISTA_DEVEDORES_MANUAL",
] as const;

export type SourceName = (typeof SOURCE_NAMES)[number];

/**
 * Dados Abertos is published in three systems, and a query that read one has
 * not looked for the other two (ADR 014). The list lives here rather than in
 * the adapter because the composition plan is what declares which slices were
 * expected, and the adapter re-exports it so the two can never drift.
 */
export const PGFN_OPEN_DATA_SYSTEMS = [
  "SIDA",
  "PREVIDENCIARIO",
  "FGTS",
] as const;

export type PgfnOpenDataSystem = (typeof PGFN_OPEN_DATA_SYSTEMS)[number];

export function pgfnOpenDataSliceId(
  system: PgfnOpenDataSystem,
  uf: string,
): string {
  return `${system}|${uf}`;
}

export const CARTEIRA_SLICE_ID = "CARTEIRA";
export const PGFN_LISTA_SLICE_ID = "LISTA_MANUAL";

/** Money never leaves integer cents, so the union carries `bigint`, not `number`. */
export type FieldValue =
  | { readonly tipo: "MONETARIO_CENTAVOS"; readonly centavos: bigint }
  | { readonly tipo: "TEXTO"; readonly texto: string }
  | { readonly tipo: "BOOLEANO"; readonly booleano: boolean }
  | { readonly tipo: "DATA_HORA"; readonly dataHora: string }
  | { readonly tipo: "LISTA_TEXTO"; readonly lista: readonly string[] };

export type FieldKind = FieldValue["tipo"];

/**
 * How several records of the same source collapse into a single field. There
 * is deliberately no "pick one": a debtor with four inscriptions has four
 * situations, and choosing one of them would be a claim the source never made.
 */
export type FieldAggregation = "SOMA" | "UNIAO" | "EXISTE";

/**
 * How a record is tied to the debtor. `DECLARADO_PELO_CLIENTE` is the wallet:
 * ADR 018 fixes `confianca_vinculo` at 1.0 with evidence
 * `fornecido_pelo_cliente`, which states that the field came from the imported
 * record — not that the datum is independently true.
 */
export type LinkMode = "RESOLUCAO_DE_IDENTIDADE" | "DECLARADO_PELO_CLIENTE";

export interface PlannedField {
  readonly key: string;
  readonly tipo: FieldKind;
  readonly agregacao: FieldAggregation;
}

export interface PlannedSource {
  readonly source: SourceName;
  /** Declared up front. Composition iterates this, never the observations. */
  readonly expectedSlices: readonly string[];
  readonly fields: readonly PlannedField[];
  /** A required source that did not conclude makes the dossier insufficient. */
  readonly obrigatoria: boolean;
  readonly vinculo: LinkMode;
}

export interface SourcePlan {
  readonly planVersion: string;
  readonly sources: readonly PlannedSource[];
}

export const SOURCE_PLAN_VERSION = "2026-07-A";

/** One published identity, before anyone claims to know who it is. */
export type PublishedSubject = PublishedRecord;

export interface ObservationRecord {
  /** Points at a `PublishedSubject`; the resolver decides if it is the debtor. */
  readonly subjectId: string;
  readonly values: Readonly<Record<string, FieldValue>>;
}

export interface RawObservation {
  readonly id: string;
  readonly tenantId: string;
  readonly debtorId: string;
  readonly source: SourceName;
  readonly sliceId: string;
  readonly status: SourceStatus;
  /** When this fact was collected. The dossier's own date is composition. */
  readonly collectedAt: string;
  /** Publication reference, where the source has one. */
  readonly referenceDate: string | null;
  /** Without these, "not found under a filter" reads as "no debt". */
  readonly queryParams: Readonly<Record<string, unknown>>;
  readonly subjects: readonly PublishedSubject[];
  readonly records: readonly ObservationRecord[];
}

const WALLET_SOURCE: PlannedSource = {
  source: "CARTEIRA_CLIENTE",
  expectedSlices: [CARTEIRA_SLICE_ID],
  obrigatoria: true,
  vinculo: "DECLARADO_PELO_CLIENTE",
  fields: [
    {
      key: "carteira_valor_em_aberto",
      tipo: "MONETARIO_CENTAVOS",
      agregacao: "SOMA",
    },
    { key: "carteira_titulos", tipo: "LISTA_TEXTO", agregacao: "UNIAO" },
  ],
};

const PGFN_LISTA_SOURCE: PlannedSource = {
  source: "PGFN_LISTA_DEVEDORES_MANUAL",
  expectedSlices: [PGFN_LISTA_SLICE_ID],
  // Optional by design: the list is a manual upload under filters chosen by an
  // operator (ADR 015). Its absence is normal and must not sink the dossier.
  obrigatoria: false,
  vinculo: "RESOLUCAO_DE_IDENTIDADE",
  fields: [
    { key: "pgfn_lista_presente", tipo: "BOOLEANO", agregacao: "EXISTE" },
    {
      key: "pgfn_lista_valor_total",
      tipo: "MONETARIO_CENTAVOS",
      agregacao: "SOMA",
    },
    // Kept apart from the total on purpose: the two diverge in a third of the
    // real sample and a silent fallback between them is forbidden.
    {
      key: "pgfn_lista_valor_selecionado",
      tipo: "MONETARIO_CENTAVOS",
      agregacao: "SOMA",
    },
  ],
};

export function sourcePlanForUfs(ufs: readonly string[]): SourcePlan {
  if (ufs.length === 0) {
    throw new Error("PLANO_SEM_UF");
  }

  const expectedSlices = ufs.flatMap((uf) =>
    PGFN_OPEN_DATA_SYSTEMS.map((system) => pgfnOpenDataSliceId(system, uf)),
  );

  return Object.freeze({
    planVersion: SOURCE_PLAN_VERSION,
    sources: Object.freeze([
      WALLET_SOURCE,
      Object.freeze({
        source: "PGFN_DADOS_ABERTOS",
        expectedSlices: Object.freeze(expectedSlices),
        obrigatoria: true,
        vinculo: "RESOLUCAO_DE_IDENTIDADE",
        fields: [
          {
            key: "pgfn_dados_abertos_presente",
            tipo: "BOOLEANO",
            agregacao: "EXISTE",
          },
          {
            key: "pgfn_dados_abertos_valor_consolidado",
            tipo: "MONETARIO_CENTAVOS",
            agregacao: "SOMA",
          },
          {
            key: "pgfn_dados_abertos_inscricoes",
            tipo: "LISTA_TEXTO",
            agregacao: "UNIAO",
          },
        ],
      } satisfies PlannedSource),
      PGFN_LISTA_SOURCE,
    ]),
  });
}
