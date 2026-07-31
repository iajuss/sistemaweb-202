import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseWalletCsv } from "./csv.js";

function fixture(name: string): Uint8Array {
  return readFileSync(
    new URL(`../../../../fixtures/wallet/${name}`, import.meta.url),
  );
}

describe("parseWalletCsv", () => {
  it("reads a CP1252 file delimited by semicolons", () => {
    const parsed = parseWalletCsv(fixture("valid-cp1252-semicolon.csv"));

    expect(parsed.encoding).toBe("CP1252");
    expect(parsed.delimiter).toBe(";");
    // Latin-1 bytes decoded as UTF-8 would yield the replacement character.
    expect(parsed.rows[0].values.name).toBe("JOSÉ DA SILVA");
    expect(parsed.rows[2].values.name).toBe("MARIA JOÃO CONCEIÇÃO");
  });

  it("keeps the decimal comma for the domain to normalize", () => {
    const parsed = parseWalletCsv(fixture("valid-cp1252-semicolon.csv"));

    expect(parsed.rows[0].values.amount).toBe("1.234,56");
    expect(parsed.rows[2].values.amount).toBe("10.000,00");
  });

  it("skips blank lines while keeping the physical line number", () => {
    const parsed = parseWalletCsv(fixture("valid-cp1252-semicolon.csv"));

    // Line 3 is blank; the operator reading the report must find line 4.
    expect(parsed.rows.map((row) => row.rowNumber)).toEqual([2, 4, 5]);
  });

  it("strips the UTF-8 BOM instead of gluing it to the first header", () => {
    const parsed = parseWalletCsv(fixture("invalid-cpf.csv"));

    expect(parsed.encoding).toBe("UTF-8-BOM");
    expect(parsed.delimiter).toBe(",");
    expect(parsed.rows[0].values.externalId).toBe("TIT-010");
  });

  it("keeps a quoted delimiter inside the field", () => {
    const parsed = parseWalletCsv(fixture("invalid-cpf.csv"));

    expect(parsed.rows[0].values.name).toBe("SANTOS, ANA PAULA");
    expect(parsed.rows[0].values.amount).toBe("1.500,00");
  });

  it("chooses the delimiter from the header, not from decimal commas", () => {
    const parsed = parseWalletCsv(
      new TextEncoder().encode(
        "id_externo;nome;cpf;valor;vencimento\nT1;A;529.982.247-25;1.234,56;2026-01-01\n",
      ),
    );

    expect(parsed.delimiter).toBe(";");
    expect(parsed.rows[0].values.amount).toBe("1.234,56");
  });

  it("accepts headers regardless of case, accent and surrounding space", () => {
    const parsed = parseWalletCsv(
      new TextEncoder().encode(
        "ID_Externo; Nome ;CPF;Valor;Vencimento\nT1;A;529.982.247-25;10,00;2026-01-01\n",
      ),
    );

    expect(parsed.rows[0].values.externalId).toBe("T1");
  });

  it("refuses a file whose header lacks a required column", () => {
    expect(() =>
      parseWalletCsv(
        new TextEncoder().encode("id_externo;nome;cpf;valor\nT1;A;X;1\n"),
      ),
    ).toThrow("CABECALHO_INVALIDO");
  });

  it("refuses an empty file rather than reporting zero rows", () => {
    expect(() => parseWalletCsv(new Uint8Array())).toThrow("ARQUIVO_VAZIO");
  });
});
