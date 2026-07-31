import { normalizeSourceMoney, type SourceMoney } from "@panella/domain";

import {
  readWorkbookGrid,
  type SheetRow,
} from "../wallet-importers/xlsx.js";

/**
 * The manually exported PGFN Lista de Devedores — ADR 014 and ADR 015. It is
 * never scraped: an operator runs the query and uploads what came back.
 *
 * The shape below was read off a real export. It carries a filter preamble, a
 * header several rows down, blank rows in the middle, rows Excel omits from
 * the XML entirely, and sometimes a second query concatenated underneath with
 * no preamble of its own.
 */

const HEADER_COLUMNS = {
  maskedCpf: "cpf/cnpj",
  name: "nome",
  tradeName: "nome fantasia",
  totalAmount: "valor total",
  selectedAmount: "valor da divida selecionada",
} as const;

type ColumnKey = keyof typeof HEADER_COLUMNS;

/**
 * How many empty rows in a row mark a new query rather than formatting.
 *
 * **Heuristic, not verified.** The real export sampled here has single empty
 * rows inside its data — rows 17, 67, 70, 75 are blank and row 60 is dropped
 * from the XML entirely — so one empty row is certainly formatting. No real
 * export containing a concatenated second query was available, so where the
 * true boundary lies is unknown. The consequence of guessing wrong is bounded
 * on purpose: a block that follows a separator without its own preamble is
 * marked `SEM_PROCEDENCIA` rather than merged, so rows are never silently
 * attributed to filters that did not produce them.
 */
const BLOCK_SEPARATOR_BLANK_ROWS = 2;

export interface PgfnListProvenance {
  readonly title: string;
  /** The filters that produced these rows. Without them the block is a claim. */
  readonly filters: readonly string[];
  readonly searchedAt: string | null;
}

export interface PgfnListRow {
  readonly rowNumber: number;
  readonly maskedCpf: string;
  readonly name: string;
  readonly tradeName: string;
  /** Kept apart from `selectedAmount`: they diverge in a third of the sample. */
  readonly totalAmount: SourceMoney;
  readonly selectedAmount: SourceMoney;
}

/**
 * Whether this block covers the whole universe of debts, derived from the
 * preamble the export carried and never assumed.
 *
 * A filter that selects **who** was searched leaves the debt universe whole:
 * the answer is complete for that subject, which is the only completeness the
 * regularity delta needs. Anything else — a debt nature, a value ceiling, a
 * label this code has never seen — is a cut, and under a cut "not found" is
 * not "no debt". Unknown labels narrow, so an export shape nobody has sampled
 * yet fails closed rather than silently authorising an inference.
 */
export interface PgfnListQueryScope {
  readonly complete: boolean;
  readonly reason: "INTEGRAL" | "FILTRADO" | "SEM_PROCEDENCIA";
  /** Filters that cut the universe. Non-empty means `complete` is false. */
  readonly narrowingFilters: readonly string[];
  /** Filters naming who was searched. Empty means the query named nobody. */
  readonly subjectFilters: readonly string[];
}

export interface PgfnListBlock {
  readonly provenance: PgfnListProvenance | null;
  readonly status: "COM_PROCEDENCIA" | "SEM_PROCEDENCIA";
  readonly queryScope: PgfnListQueryScope;
  readonly rows: readonly PgfnListRow[];
  readonly rejected: readonly {
    readonly rowNumber: number;
    readonly reason: "VALOR_INVALIDO";
  }[];
}

export interface PgfnListImport {
  readonly source: "PGFN_LISTA_DEVEDORES_MANUAL";
  readonly blocks: readonly PgfnListBlock[];
}

function fold(raw: string): string {
  return raw
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Filter labels that select the subject of the query. Allow-list on purpose:
 * a label absent from it narrows, so the sample of one real export this was
 * read off cannot be mistaken for knowledge of every export.
 */
const SUBJECT_FILTER_LABELS: readonly string[] = [
  "nome",
  "cpf",
  "cnpj",
  "cpf/cnpj",
];

function filterLabel(line: string): string {
  return fold(line.split(":")[0] ?? "");
}

export function derivePgfnListQueryScope(
  provenance: PgfnListProvenance | null,
): PgfnListQueryScope {
  if (!provenance) {
    // Filters nobody can name describe a query nobody can reproduce. That is
    // a gap, and a gap is never integrality.
    return Object.freeze({
      complete: false,
      reason: "SEM_PROCEDENCIA" as const,
      narrowingFilters: Object.freeze([]),
      subjectFilters: Object.freeze([]),
    });
  }

  const subjectFilters = provenance.filters.filter((line) =>
    SUBJECT_FILTER_LABELS.includes(filterLabel(line)),
  );
  const narrowingFilters = provenance.filters.filter(
    (line) => !SUBJECT_FILTER_LABELS.includes(filterLabel(line)),
  );

  return Object.freeze({
    complete: narrowingFilters.length === 0,
    reason:
      narrowingFilters.length === 0 ? ("INTEGRAL" as const) : ("FILTRADO" as const),
    narrowingFilters: Object.freeze(narrowingFilters),
    subjectFilters: Object.freeze(subjectFilters),
  });
}

function isHeaderRow(row: SheetRow): boolean {
  const folded = row.cells.map(fold);
  return (
    folded.includes(HEADER_COLUMNS.maskedCpf) &&
    folded.includes(HEADER_COLUMNS.name)
  );
}

function mapColumns(row: SheetRow): Record<ColumnKey, number> {
  const folded = row.cells.map(fold);
  const positions = {} as Record<ColumnKey, number>;
  for (const [key, header] of Object.entries(HEADER_COLUMNS) as [
    ColumnKey,
    string,
  ][]) {
    positions[key] = folded.indexOf(header);
  }
  return positions;
}

function isBlank(row: SheetRow): boolean {
  return row.cells.every((cell) => cell.trim() === "");
}

function readProvenance(rows: readonly SheetRow[]): PgfnListProvenance | null {
  const lines = rows
    .map((row) => row.cells.find((cell) => cell.trim() !== "")?.trim() ?? "")
    .filter((line) => line !== "");
  if (lines.length === 0) {
    return null;
  }

  const searchedAt =
    lines.find((line) => fold(line).startsWith("data da pesquisa")) ?? null;
  const filters = lines.filter(
    (line, index) =>
      index > 0 &&
      line !== searchedAt &&
      !fold(line).startsWith("filtros utilizados"),
  );

  return { title: lines[0], filters, searchedAt };
}

/**
 * A published row has two independent money columns and the fallback between
 * them is forbidden, so a row is only accepted when both parse. One unreadable
 * amount would otherwise tempt exactly the substitution ADR 014 rules out.
 */
function readRow(
  row: SheetRow,
  columns: Record<ColumnKey, number>,
): PgfnListRow | null {
  const at = (key: ColumnKey): string =>
    (columns[key] >= 0 ? (row.cells[columns[key]] ?? "") : "").trim();

  let totalAmount: SourceMoney;
  let selectedAmount: SourceMoney;
  try {
    totalAmount = normalizeSourceMoney(at("totalAmount"));
    selectedAmount = normalizeSourceMoney(at("selectedAmount"));
  } catch {
    return null;
  }

  return {
    rowNumber: row.rowNumber,
    maskedCpf: at("maskedCpf"),
    name: at("name"),
    tradeName: at("tradeName"),
    totalAmount,
    selectedAmount,
  };
}

interface BlockAccumulator {
  provenanceRows: SheetRow[];
  columns: Record<ColumnKey, number> | null;
  rows: PgfnListRow[];
  rejected: { rowNumber: number; reason: "VALOR_INVALIDO" }[];
}

function emptyBlock(): BlockAccumulator {
  return { provenanceRows: [], columns: null, rows: [], rejected: [] };
}

function sealBlock(
  accumulator: BlockAccumulator,
  blocks: PgfnListBlock[],
): void {
  if (accumulator.rows.length === 0 && accumulator.rejected.length === 0) {
    return;
  }

  const provenance = readProvenance(accumulator.provenanceRows);
  blocks.push({
    provenance,
    // A block with no preamble of its own cannot be attributed to the filters
    // above it: those filters did not produce these rows. Marked, not merged.
    status: provenance ? "COM_PROCEDENCIA" : "SEM_PROCEDENCIA",
    queryScope: derivePgfnListQueryScope(provenance),
    rows: accumulator.rows,
    rejected: accumulator.rejected,
  });
}

export function importPgfnList(bytes: Uint8Array): PgfnListImport {
  const grid = readWorkbookGrid(bytes);
  const blocks: PgfnListBlock[] = [];
  let accumulator = emptyBlock();
  let previousRowNumber: number | null = null;
  let blankRun = 0;

  for (const row of grid) {
    // Excel drops fully empty rows from the XML, so an absent row number and a
    // blank row are the same thing and both have to be counted.
    const absent =
      previousRowNumber === null ? 0 : row.rowNumber - previousRowNumber - 1;
    previousRowNumber = row.rowNumber;
    blankRun += absent;

    if (isHeaderRow(row)) {
      accumulator.columns = mapColumns(row);
      blankRun = 0;
      continue;
    }

    if (isBlank(row)) {
      blankRun += 1;
      continue;
    }

    const gap = blankRun >= BLOCK_SEPARATOR_BLANK_ROWS;
    blankRun = 0;

    if (gap && accumulator.rows.length > 0) {
      sealBlock(accumulator, blocks);
      // The header does not repeat in a concatenated query, so the layout
      // carries over while the provenance deliberately does not.
      const columns = accumulator.columns;
      accumulator = emptyBlock();
      accumulator.columns = columns;
    }

    if (accumulator.columns === null) {
      accumulator.provenanceRows.push(row);
      continue;
    }

    const parsed = readRow(row, accumulator.columns);
    if (parsed) {
      accumulator.rows.push(parsed);
    } else {
      accumulator.rejected.push({
        rowNumber: row.rowNumber,
        reason: "VALOR_INVALIDO",
      });
    }
  }

  sealBlock(accumulator, blocks);
  return { source: "PGFN_LISTA_DEVEDORES_MANUAL", blocks };
}
