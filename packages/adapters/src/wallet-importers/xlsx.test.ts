import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseWalletXlsx } from "./xlsx.js";

const workbook = (): Uint8Array =>
  readFileSync(
    new URL("../../../../fixtures/wallet/titles.xlsx", import.meta.url),
  );

describe("parseWalletXlsx", () => {
  it("resolves the sheet through the workbook rels, not a fixed path", () => {
    // The fixture's sheet is `worksheets/carteira.xml` behind `rId7`, so a
    // reader that guesses `sheet1.xml` finds nothing.
    const parsed = parseWalletXlsx(workbook());

    expect(parsed.format).toBe("XLSX");
    expect(parsed.rows).toHaveLength(3);
  });

  it("joins a shared string split across runs", () => {
    const parsed = parseWalletXlsx(workbook());

    expect(parsed.rows[0].values.name).toBe("JOÃO BATISTA MOREIRA");
  });

  it("reads an inline string and decodes its entities", () => {
    const parsed = parseWalletXlsx(workbook());

    expect(parsed.rows[2].values.name).toBe("PEDRO & FILHOS");
  });

  it("reads a formula result cell as its cached text", () => {
    const parsed = parseWalletXlsx(workbook());

    expect(parsed.rows[2].values.cpf).toBe("111.444.777-35");
  });

  it("converts a date serial to an ISO day for both built-in and custom formats", () => {
    const parsed = parseWalletXlsx(workbook());

    expect(parsed.rows[0].values.dueDate).toBe("2026-03-10");
    expect(parsed.rows[1].values.dueDate).toBe("2026-04-10");
    expect(parsed.rows[2].values.dueDate).toBe("2026-05-01");
  });

  it("carries a numeric amount as text, never through a float", () => {
    const parsed = parseWalletXlsx(workbook());

    // The cell holds `89.9`; two decimal places are restored textually so the
    // domain sees the same shape a CSV would give it.
    expect(parsed.rows.map((row) => row.values.amount)).toEqual([
      "1234,56",
      "89,90",
      "10000",
    ]);
  });

  it("numbers rows by the sheet row, so the report points at the right line", () => {
    const parsed = parseWalletXlsx(workbook());

    expect(parsed.rows.map((row) => row.rowNumber)).toEqual([2, 3, 4]);
  });

  it("refuses something that is not a workbook instead of reporting zero rows", () => {
    expect(() => parseWalletXlsx(new TextEncoder().encode("id_externo;nome"))).toThrow(
      "XLSX_INVALIDO",
    );
  });
});
