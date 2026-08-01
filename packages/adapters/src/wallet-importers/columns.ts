import type { RawTitleRow } from "@panella/domain";

/**
 * What a wallet file must contain, declared once.
 *
 * It used to be declared twice — the CSV parser and the XLSX parser each held
 * their own copy — which meant the two could drift, and the screen could only
 * tell an operator the format by writing it out a third time. A format
 * described in three places is a format that will eventually be described
 * wrongly in one of them.
 */

export type WalletColumnKey = keyof RawTitleRow;

export interface WalletColumn {
  readonly key: WalletColumnKey;
  /** The header as the folded comparison sees it; see `foldHeader`. */
  readonly header: string;
  readonly required: boolean;
  /** Shown on the import screen and used to build the example file. */
  readonly exemplo: string;
}

/**
 * Every column is required today. There are no optional ones, and saying so is
 * the point: a future optional column — a contact channel, say — has to be
 * declared here before any parser or screen may mention it.
 */
export const WALLET_COLUMNS: readonly WalletColumn[] = Object.freeze([
  Object.freeze({
    key: "externalId" as const,
    header: "id_externo",
    required: true,
    exemplo: "TIT-001",
  }),
  Object.freeze({
    key: "name" as const,
    header: "nome",
    required: true,
    exemplo: "MARIA SOUZA",
  }),
  Object.freeze({
    key: "cpf" as const,
    header: "cpf",
    // Synthetic, and deliberately not one of the values the tests upload, so
    // that "this CPF is not on the page" stays a meaningful assertion.
    required: true,
    exemplo: "111.444.777-35",
  }),
  Object.freeze({
    key: "amount" as const,
    header: "valor",
    required: true,
    exemplo: "1.234,56",
  }),
  Object.freeze({
    key: "dueDate" as const,
    header: "vencimento",
    required: true,
    exemplo: "10/03/2026",
  }),
]);

/**
 * The example an operator downloads before their first attempt, built from the
 * declaration above so it cannot describe a format the parser does not accept.
 *
 * Four rows, chosen to show the behaviour rather than just the shape:
 *
 * - two titles of the **same** debtor, because a line is a debt and the debtor
 *   emerges from the aggregation — the commonest misreading of the format;
 * - both accepted date forms, Brazilian and ISO;
 * - one row with a check digit that does not close, so the quarantine is
 *   visible on the first try instead of being a paragraph nobody believes.
 *
 * Every CPF here is synthetic, and deliberately **outside** the set the demo
 * wallet seeds. Reusing one of those would make every row of the example
 * aggregate onto a debtor who already exists — three titles updated, no new
 * line in the queue — which is the opposite of what an operator trying the
 * file for the first time needs to see.
 */
const EXAMPLE_ROWS: readonly string[] = Object.freeze([
  "EXEMPLO-001;ANTONIA FERREIRA LOPES;371.829.456-73;1.234,56;10/03/2026",
  "EXEMPLO-002;ANTONIA FERREIRA LOPES;371.829.456-73;89,90;10/04/2026",
  "EXEMPLO-003;MARIA JOÃO CONCEIÇÃO;204.815.937-05;10.000,00;2026-05-01",
  "EXEMPLO-004;CARLOS PEREIRA;845.206.173-09;300,00;20/06/2026",
]);

export function exampleWalletCsv(): string {
  const header = WALLET_COLUMNS.map((column) => column.header).join(";");
  return [header, ...EXAMPLE_ROWS, ""].join("\r\n");
}

/**
 * The same header written by three ERPs differs in case, accent and padding and
 * still means the same column, so the name is compared in a folded form.
 */
export function foldHeader(raw: string): string {
  return raw
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const DECLARED_HEADERS: ReadonlySet<string> = new Set(
  WALLET_COLUMNS.map((column) => column.header),
);

export interface InvalidWalletHeaderError extends Error {
  readonly expected: readonly string[];
  readonly found: readonly string[];
  readonly missing: readonly string[];
}

export function isInvalidHeaderError(
  error: unknown,
): error is InvalidWalletHeaderError {
  return (
    error instanceof Error &&
    error.message === "CABECALHO_INVALIDO" &&
    Array.isArray((error as InvalidWalletHeaderError).missing)
  );
}

/**
 * A header cell is echoed back to the operator only if it looks like a column
 * name and nothing else. The commonest mistake is exporting without the header
 * row, which makes the first line of **data** the header — and repeating that
 * verbatim would print somebody's CPF and name onto the screen, and from there
 * into any log of it.
 *
 * **A single token, no spaces.** That rule is what separates `documento` from
 * `jose da silva`: a person's name is several words, a column name is one. It
 * costs the operator nothing — a header written `id externo` shows as
 * unrecognised, and the list of what was expected still says exactly which
 * column was missing. An unrecognisable cell is counted, never quoted.
 */
const COLUMN_NAME = /^[a-z][a-z0-9_]{0,29}$/;

function safeHeaderName(raw: string): string {
  const folded = foldHeader(raw);
  return COLUMN_NAME.test(folded) || DECLARED_HEADERS.has(folded)
    ? folded
    : "(coluna não reconhecida)";
}

function invalidHeader(
  found: readonly string[],
  missing: readonly string[],
): InvalidWalletHeaderError {
  return Object.assign(new Error("CABECALHO_INVALIDO"), {
    expected: WALLET_COLUMNS.map((column) => column.header),
    found,
    missing,
  });
}

/**
 * Maps each declared column to its position, or refuses naming what it looked
 * for and what it saw. The refusal is one error for the whole file — a file
 * without the columns is not a file with bad rows — while a row that fails on
 * its own contents is quarantined one line at a time.
 */
export function mapWalletColumns(
  headerCells: readonly string[],
): Record<WalletColumnKey, number> {
  const folded = headerCells.map(foldHeader);
  const positions = {} as Record<WalletColumnKey, number>;
  const missing: string[] = [];

  for (const column of WALLET_COLUMNS) {
    const position = folded.indexOf(column.header);
    if (position < 0) {
      if (column.required) {
        missing.push(column.header);
      }
      continue;
    }
    positions[column.key] = position;
  }

  if (missing.length > 0) {
    throw invalidHeader(headerCells.map(safeHeaderName), missing);
  }
  return positions;
}
