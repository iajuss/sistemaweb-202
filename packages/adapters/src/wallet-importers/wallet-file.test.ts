import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseWalletFile } from "./wallet-file.js";

/**
 * An operator uploading a wallet does not declare a format, and the browser's
 * `content-type` is whatever the workstation's registry says — on Windows an
 * XLSX has been announced as `application/octet-stream` for a decade. The bytes
 * are the only honest declaration, so they are what decides.
 */

function fixture(name: string): Uint8Array {
  return readFileSync(new URL(`../../../../fixtures/${name}`, import.meta.url));
}

describe("choosing a parser from the bytes", () => {
  it("reads a workbook by its zip signature", () => {
    const parsed = parseWalletFile(fixture("wallet/titles.xlsx"));

    expect(parsed.format).toBe("XLSX");
    expect(parsed.rows.length).toBeGreaterThan(0);
  });

  it("reads a semicolon CP1252 export as CSV", () => {
    const parsed = parseWalletFile(
      fixture("wallet/valid-cp1252-semicolon.csv"),
    );

    expect(parsed.format).toBe("CSV");
    expect(parsed.encoding).toBe("CP1252");
    expect(parsed.delimiter).toBe(";");
  });

  it("reads a comma UTF-8 export with a BOM as CSV", () => {
    const parsed = parseWalletFile(fixture("wallet/invalid-cpf.csv"));

    expect(parsed.format).toBe("CSV");
    expect(parsed.encoding).toBe("UTF-8-BOM");
    expect(parsed.delimiter).toBe(",");
  });

  it("refuses a file with no rows at all instead of importing nothing", () => {
    expect(() => parseWalletFile(new Uint8Array())).toThrow("ARQUIVO_VAZIO");
  });
});
