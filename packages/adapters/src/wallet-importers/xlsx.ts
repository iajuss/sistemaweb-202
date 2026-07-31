import type { RawTitleRow } from "@panella/domain";

import type { ParsedWalletFile, ParsedWalletRow } from "./parsed-file.js";
import { readZipEntries } from "./zip.js";

const REQUIRED_COLUMNS = {
  externalId: "id_externo",
  name: "nome",
  cpf: "cpf",
  amount: "valor",
  dueDate: "vencimento",
} as const;

type ColumnKey = keyof typeof REQUIRED_COLUMNS;

/** Built-in number formats that mean "this number is a date". */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Day 1 is 1900-01-01, and the 1900 leap-year bug puts the epoch on the 30th. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MILLISECONDS_PER_DAY = 86_400_000;

function text(bytes: Uint8Array | undefined): string {
  return bytes ? new TextDecoder("utf-8").decode(bytes) : "";
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function innerTexts(fragment: string): string {
  // A shared string split across runs is one value; Excel splits it after
  // in-cell editing, and joining the runs is the only way back to the name.
  return [...fragment.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeEntities(match[1]))
    .join("");
}

function readSharedStrings(entries: ReadonlyMap<string, Uint8Array>): string[] {
  const xml = text(entries.get("xl/sharedStrings.xml"));
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    innerTexts(match[1]),
  );
}

/**
 * A date in a sheet is a plain number wearing a format, so the styles table is
 * the only place that says whether `46091` is money or a due date.
 */
function readDateStyles(entries: ReadonlyMap<string, Uint8Array>): Set<number> {
  const xml = text(entries.get("xl/styles.xml"));
  const dateFormatIds = new Set(BUILTIN_DATE_FORMATS);

  for (const match of xml.matchAll(
    /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g,
  )) {
    if (/[ymd]/i.test(match[2].replace(/\[[^\]]*\]/g, ""))) {
      dateFormatIds.add(Number(match[1]));
    }
  }

  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const dateStyles = new Set<number>();
  [...cellXfs.matchAll(/<xf[^>]*>/g)].forEach((match, index) => {
    const formatId = Number(/numFmtId="(\d+)"/.exec(match[0])?.[1] ?? "0");
    if (dateFormatIds.has(formatId)) {
      dateStyles.add(index);
    }
  });
  return dateStyles;
}

function resolveSheetPath(entries: ReadonlyMap<string, Uint8Array>): string {
  const workbook = text(entries.get("xl/workbook.xml"));
  const relationshipId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = text(entries.get("xl/_rels/workbook.xml.rels"));
  const pattern = new RegExp(
    `<Relationship[^>]*Id="${relationshipId}"[^>]*Target="([^"]+)"`,
  );
  const target = relationshipId ? pattern.exec(rels)?.[1] : undefined;
  const path = target
    ? `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}`
    : "xl/worksheets/sheet1.xml";

  if (!entries.has(path)) {
    throw new Error("XLSX_PLANILHA_NAO_ENCONTRADA");
  }
  return path;
}

function columnIndex(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference)?.[1] ?? "A";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function serialToIsoDay(serial: string): string {
  const days = Number.parseInt(serial.split(".")[0], 10);
  return new Date(EXCEL_EPOCH_UTC + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * A numeric cell holds the amount as decimal text in the XML. It is reshaped
 * textually into the same Brazilian form a CSV would carry, never parsed into a
 * float: the whole point of the monetary invariant is that no money value ever
 * passes through binary floating point.
 */
function numberToSpreadsheetMoney(raw: string): string {
  const [whole, fraction] = raw.split(".");
  if (fraction === undefined) {
    return whole;
  }
  return `${whole},${fraction.length === 1 ? `${fraction}0` : fraction}`;
}

function cellText(
  cell: string,
  sharedStrings: readonly string[],
  dateStyles: ReadonlySet<number>,
): string {
  const type = /\st="([^"]+)"/.exec(cell)?.[1] ?? "n";
  if (type === "inlineStr") {
    return innerTexts(/<is>([\s\S]*?)<\/is>/.exec(cell)?.[1] ?? "");
  }

  const value = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1];
  if (value === undefined) {
    return "";
  }
  if (type === "s") {
    return sharedStrings[Number(value)] ?? "";
  }
  if (type === "str") {
    return decodeEntities(value);
  }

  const style = Number(/\ss="(\d+)"/.exec(cell)?.[1] ?? "-1");
  return dateStyles.has(style)
    ? serialToIsoDay(value)
    : numberToSpreadsheetMoney(value);
}

function foldHeader(raw: string): string {
  return raw
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function mapColumns(headerCells: readonly string[]): Record<ColumnKey, number> {
  const folded = headerCells.map(foldHeader);
  const positions = {} as Record<ColumnKey, number>;

  for (const [key, header] of Object.entries(REQUIRED_COLUMNS) as [
    ColumnKey,
    string,
  ][]) {
    const position = folded.indexOf(header);
    if (position < 0) {
      throw new Error("CABECALHO_INVALIDO");
    }
    positions[key] = position;
  }

  return positions;
}

export interface SheetRow {
  readonly rowNumber: number;
  readonly cells: readonly string[];
}

function readSheetRows(
  xml: string,
  sharedStrings: readonly string[],
  dateStyles: ReadonlySet<number>,
): SheetRow[] {
  return [...xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].map(
    (rowMatch) => {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[2].matchAll(
        /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const reference = /r="([A-Z]+\d+)"/.exec(cellMatch[1])?.[1];
        const cell = `<c${cellMatch[1]}>${cellMatch[2] ?? ""}</c>`;
        // Sheets omit empty cells entirely, so position comes from the
        // reference and the gaps are filled rather than shifted over.
        const index = reference ? columnIndex(reference) : cells.length;
        while (cells.length < index) {
          cells.push("");
        }
        cells[index] = cellText(cell, sharedStrings, dateStyles);
      }
      return { rowNumber: Number(rowMatch[1]), cells };
    },
  );
}

/**
 * The workbook as a grid of text, with no assumption about what any row means.
 * The wallet import wants a header on the first non-empty row; the PGFN manual
 * list arrives with a filter preamble above its header. Both read the same
 * sheet, so the reading stops here and the interpreting happens above.
 */
export function readWorkbookGrid(bytes: Uint8Array): readonly SheetRow[] {
  const entries = readZipEntries(bytes);
  return readSheetRows(
    text(entries.get(resolveSheetPath(entries))),
    readSharedStrings(entries),
    readDateStyles(entries),
  );
}

export function parseWalletXlsx(bytes: Uint8Array): ParsedWalletFile {
  const sheetRows = readWorkbookGrid(bytes);

  const headerRow = sheetRows.find((row) =>
    row.cells.some((cell) => cell.trim() !== ""),
  );
  if (!headerRow) {
    throw new Error("ARQUIVO_VAZIO");
  }

  const columns = mapColumns(headerRow.cells);
  const rows: ParsedWalletRow[] = [];

  for (const row of sheetRows) {
    if (row.rowNumber <= headerRow.rowNumber) {
      continue;
    }
    if (row.cells.every((cell) => cell.trim() === "")) {
      continue;
    }

    const at = (key: ColumnKey): string => row.cells[columns[key]] ?? "";
    const values: RawTitleRow = {
      externalId: at("externalId"),
      name: at("name"),
      cpf: at("cpf"),
      amount: at("amount"),
      dueDate: at("dueDate"),
    };
    rows.push({ rowNumber: row.rowNumber, values });
  }

  return { format: "XLSX", encoding: "UTF-8", delimiter: null, rows };
}
