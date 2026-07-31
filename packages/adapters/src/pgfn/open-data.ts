import { Money, normalizeSpreadsheetMoney } from "@panella/domain";

/**
 * One published Dados Abertos part. The column names follow the published
 * layout and are **not** contract-verified — see `docs/fontes.md`. A layout
 * that lost a column fails loudly rather than producing empty fields, because
 * a silently empty debt field reads as "no debt".
 */

const REQUIRED_COLUMNS = {
  maskedCpf: "cpf_cnpj",
  personType: "tipo_pessoa",
  name: "nome_devedor",
  uf: "uf_unidade_responsavel",
  inscriptionNumber: "numero_inscricao",
  situationType: "tipo_situacao_inscricao",
  situation: "situacao_inscricao",
  inscribedAt: "data_inscricao",
  consolidatedAmount: "valor_consolidado",
} as const;

type ColumnKey = keyof typeof REQUIRED_COLUMNS;

export interface PgfnOpenDataRow {
  readonly rowNumber: number;
  /** As published: positions 4-9 only. Never widened, never completed. */
  readonly maskedCpf: string;
  readonly personType: string;
  readonly name: string;
  readonly uf: string;
  readonly inscriptionNumber: string;
  /** Kept apart from `situation`: "Parcelamento" and "SUSPENSA" say different things. */
  readonly situationType: string;
  readonly situation: string;
  readonly inscribedAt: string;
  readonly consolidatedAmount: Money;
}

export interface PgfnRejectedRow {
  readonly rowNumber: number;
  readonly reason: "VALOR_INVALIDO";
}

export interface PgfnOpenDataPart {
  readonly rows: readonly PgfnOpenDataRow[];
  readonly rejected: readonly PgfnRejectedRow[];
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function foldHeader(raw: string): string {
  return raw
    .trim()
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function mapColumns(headerFields: readonly string[]): Record<ColumnKey, number> {
  const folded = headerFields.map(foldHeader);
  const positions = {} as Record<ColumnKey, number>;

  for (const [key, header] of Object.entries(REQUIRED_COLUMNS) as [
    ColumnKey,
    string,
  ][]) {
    const position = folded.indexOf(header);
    if (position < 0) {
      throw new Error("LAYOUT_PGFN_INVALIDO");
    }
    positions[key] = position;
  }

  return positions;
}

export function parsePgfnOpenDataPart(bytes: Uint8Array): PgfnOpenDataPart {
  const lines = decode(bytes).split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  if (headerIndex < 0) {
    throw new Error("ARQUIVO_VAZIO");
  }

  const columns = mapColumns(lines[headerIndex].split(";"));
  const rows: PgfnOpenDataRow[] = [];
  const rejected: PgfnRejectedRow[] = [];

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    // Published parts carry blank lines between blocks.
    if (line.trim() === "") {
      continue;
    }

    const fields = line.split(";");
    const at = (key: ColumnKey): string => (fields[columns[key]] ?? "").trim();
    const rowNumber = index + 1;

    let consolidatedAmount: Money;
    try {
      consolidatedAmount = Money.fromDecimalString(
        normalizeSpreadsheetMoney(at("consolidatedAmount")),
      );
    } catch {
      // Named and counted, never dropped: a row that vanished silently is a
      // debt that stopped existing.
      rejected.push({ rowNumber, reason: "VALOR_INVALIDO" });
      continue;
    }

    rows.push({
      rowNumber,
      maskedCpf: at("maskedCpf"),
      personType: at("personType"),
      name: at("name"),
      uf: at("uf"),
      inscriptionNumber: at("inscriptionNumber"),
      situationType: at("situationType"),
      situation: at("situation"),
      inscribedAt: at("inscribedAt"),
      consolidatedAmount,
    });
  }

  return { rows, rejected };
}
