import { mapWalletColumns, type WalletColumnKey } from "./columns.js";
import type { ParsedWalletFile, ParsedWalletRow } from "./parsed-file.js";

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

type ColumnKey = WalletColumnKey;

export type CsvEncoding = "UTF-8" | "UTF-8-BOM" | "CP1252";
export type CsvDelimiter = ";" | ",";

interface DecodedFile {
  readonly encoding: CsvEncoding;
  readonly text: string;
}

/**
 * The client exports whatever its ERP produces. A BOM is the only self-declaring
 * case; otherwise a strict UTF-8 decode is the test — CP1252 accented bytes are
 * not valid UTF-8 sequences, so a failure to decode is the answer, not a guess.
 */
function decode(bytes: Uint8Array): DecodedFile {
  const hasBom =
    bytes.length >= 3 &&
    UTF8_BOM.every((byte, position) => bytes[position] === byte);
  if (hasBom) {
    return {
      encoding: "UTF-8-BOM",
      text: new TextDecoder("utf-8").decode(bytes.subarray(3)),
    };
  }

  try {
    return {
      encoding: "UTF-8",
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return {
      encoding: "CP1252",
      text: new TextDecoder("windows-1252").decode(bytes),
    };
  }
}

/**
 * Counted on the header line only. Counting the whole file would let a decimal
 * comma outvote the real delimiter on a semicolon file.
 */
function detectDelimiter(headerLine: string): CsvDelimiter {
  const semicolons = headerLine.split(";").length;
  const commas = headerLine.split(",").length;
  return semicolons > commas ? ";" : ",";
}

function splitLine(line: string, delimiter: CsvDelimiter): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let position = 0; position < line.length; position += 1) {
    const character = line[position];
    if (quoted) {
      if (character !== '"') {
        field += character;
      } else if (line[position + 1] === '"') {
        field += '"';
        position += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

export function parseWalletCsv(bytes: Uint8Array): ParsedWalletFile {
  const { encoding, text } = decode(bytes);
  // `\r\n` and `\n` both appear in client exports; a lone `\r` does not.
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  if (headerIndex < 0) {
    throw new Error("ARQUIVO_VAZIO");
  }

  const delimiter = detectDelimiter(lines[headerIndex]);
  const columns = mapWalletColumns(splitLine(lines[headerIndex], delimiter));
  const rows: ParsedWalletRow[] = [];

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      continue;
    }

    const fields = splitLine(line, delimiter);
    const at = (key: ColumnKey): string => fields[columns[key]] ?? "";
    rows.push({
      // Physical, 1-based: the operator opens the file and looks at this line.
      rowNumber: index + 1,
      values: {
        externalId: at("externalId"),
        name: at("name"),
        cpf: at("cpf"),
        amount: at("amount"),
        dueDate: at("dueDate"),
      },
    });
  }

  return { format: "CSV", encoding, delimiter, rows };
}
