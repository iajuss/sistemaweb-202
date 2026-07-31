import type { RawTitleRow } from "@panella/domain";

/**
 * A parser's whole job: bytes to text cells plus the line the operator will
 * look at. Every judgement about what a cell means belongs to the domain.
 */
export interface ParsedWalletRow {
  readonly rowNumber: number;
  readonly values: RawTitleRow;
}

export interface ParsedWalletFile {
  readonly format: "CSV" | "XLSX";
  /** Recorded because "the accents came out wrong" is a support question. */
  readonly encoding: string;
  readonly delimiter: string | null;
  readonly rows: readonly ParsedWalletRow[];
}
