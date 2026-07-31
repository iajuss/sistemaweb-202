import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parsePgfnOpenDataPart } from "./open-data.js";

function fixture(name: string): Uint8Array {
  return readFileSync(
    new URL(`../../../../fixtures/pgfn/open-data/${name}`, import.meta.url),
  );
}

describe("parsePgfnOpenDataPart", () => {
  it("reads a Latin-1 semicolon part and skips its blank lines", () => {
    const part = parsePgfnOpenDataPart(fixture("sida-sp-01.csv"));

    expect(part.rows).toHaveLength(3);
    expect(part.rows[0].name).toBe("JOSE DA SILVA");
  });

  it("keeps the published mask as published, never widened", () => {
    const part = parsePgfnOpenDataPart(fixture("sida-sp-01.csv"));

    expect(part.rows[0].maskedCpf).toBe("***.982.247-**");
  });

  it("keeps the consolidated amount in integer cents", () => {
    const part = parsePgfnOpenDataPart(fixture("sida-sp-01.csv"));

    // The real published file carries values like 29163886.44 that a float
    // renders as 29163886.440000001.
    expect(part.rows[0].consolidatedAmount.toCents()).toBe(2916388644n);
    expect(part.rows[2].consolidatedAmount.toCents()).toBe(832010n);
  });

  it("keeps the situation and its type as two separate fields", () => {
    const part = parsePgfnOpenDataPart(fixture("sida-sp-01.csv"));

    // Merging them loses the difference between an active debt and a suspended
    // one under an instalment plan, which is the whole point of the field.
    expect(part.rows[2]).toMatchObject({
      situationType: "Parcelamento",
      situation: "SUSPENSA",
    });
  });

  it("reads a part with a header and no records as zero rows, not as an error", () => {
    expect(parsePgfnOpenDataPart(fixture("fgts-sp-01.csv")).rows).toEqual([]);
  });

  it("refuses a part whose layout lost a required column", () => {
    expect(() =>
      parsePgfnOpenDataPart(
        new TextEncoder().encode("CPF_CNPJ;NOME_DEVEDOR\n***.982.247-**;X\n"),
      ),
    ).toThrow("LAYOUT_PGFN_INVALIDO");
  });

  it("quarantines a row whose amount is unreadable instead of dropping it", () => {
    const part = parsePgfnOpenDataPart(
      new TextEncoder().encode(
        [
          "CPF_CNPJ;TIPO_PESSOA;NOME_DEVEDOR;UF_UNIDADE_RESPONSAVEL;NUMERO_INSCRICAO;TIPO_SITUACAO_INSCRICAO;SITUACAO_INSCRICAO;DATA_INSCRICAO;VALOR_CONSOLIDADO",
          "***.982.247-**;FISICA;X;SP;1;Em cobrança;ATIVA;2024-01-01;n/d",
        ].join("\n"),
      ),
    );

    expect(part.rows).toHaveLength(0);
    expect(part.rejected).toEqual([{ rowNumber: 2, reason: "VALOR_INVALIDO" }]);
  });
});
