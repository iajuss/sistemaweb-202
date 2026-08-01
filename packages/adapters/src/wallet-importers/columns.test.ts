import { describe, expect, it } from "vitest";

import {
  exampleWalletCsv,
  WALLET_COLUMNS,
  foldHeader,
  mapWalletColumns,
  isInvalidHeaderError,
} from "./columns.js";
import { parseWalletCsv } from "./csv.js";

/**
 * One definition of what a wallet file must contain, because there were two —
 * the CSV parser and the XLSX parser each carried their own copy, so the two
 * could drift apart and the screen could only describe the format by repeating
 * it a third time by hand.
 */

function csvOf(headerLine: string, row: string): Uint8Array {
  return Buffer.from(`${headerLine}\n${row}\n`, "utf8");
}

describe("the columns a wallet file must have", () => {
  it("is what the CSV parser actually accepts", () => {
    // Built from the declaration, not typed out again: if the declaration and
    // the parser ever disagree, this fails instead of the operator finding out.
    const header = WALLET_COLUMNS.map((column) => column.header).join(";");
    const row = WALLET_COLUMNS.map((column) => column.exemplo).join(";");

    const parsed = parseWalletCsv(csvOf(header, row));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].values.externalId).toBe("TIT-001");
  });

  it("declares every column required, with none optional today", () => {
    // Stated rather than assumed: the screen tells the operator this, and a
    // future optional column has to come here first.
    expect(WALLET_COLUMNS.every((column) => column.required)).toBe(true);
    expect(WALLET_COLUMNS.map((column) => column.header)).toEqual([
      "id_externo",
      "nome",
      "cpf",
      "valor",
      "vencimento",
    ]);
  });

  it("matches a header however the ERP cased, accented or padded it", () => {
    expect(foldHeader("  ID_Externo ")).toBe("id_externo");
    expect(foldHeader("Vencimento")).toBe("vencimento");
    expect(foldHeader("VALOR")).toBe("valor");
  });
});

describe("when the header does not match", () => {
  it("names what was expected and what was missing", () => {
    let error: unknown;
    try {
      mapWalletColumns(["id_externo", "nome", "cpf", "valor"]);
    } catch (thrown) {
      error = thrown;
    }

    expect(isInvalidHeaderError(error)).toBe(true);
    if (!isInvalidHeaderError(error)) throw new Error("EXPECTED_HEADER_ERROR");
    expect(error.message).toBe("CABECALHO_INVALIDO");
    expect(error.missing).toEqual(["vencimento"]);
    expect(error.expected).toEqual([
      "id_externo",
      "nome",
      "cpf",
      "valor",
      "vencimento",
    ]);
    expect(error.found).toEqual(["id_externo", "nome", "cpf", "valor"]);
  });

  it("never repeats a CPF back, even when the file has no header at all", () => {
    // The commonest mistake is exporting without the header row, which makes
    // the first line of data the "header". Echoing it verbatim would print a
    // person's CPF into the screen, and from there into any log of it.
    let error: unknown;
    try {
      mapWalletColumns([
        "TIT-001",
        "JOSE DA SILVA",
        "529.982.247-25",
        "1.234,56",
        "2026-03-10",
      ]);
    } catch (thrown) {
      error = thrown;
    }

    if (!isInvalidHeaderError(error)) throw new Error("EXPECTED_HEADER_ERROR");
    // Compared case-insensitively: the cells are folded to lower case before
    // they are considered, so asserting only the upper-case form would pass
    // while the name went out in lower case.
    const shown = error.found.join(" ").toLowerCase();
    expect(shown).not.toContain("529982247");
    expect(shown).not.toContain("529.982.247-25");
    expect(shown).not.toContain("982247");
    expect(shown).not.toContain("jose");
    expect(shown).not.toContain("silva");
    expect(shown).not.toContain("tit-001");
    expect(error.found.length).toBe(5);
    expect(new Set(error.found)).toEqual(
      new Set(["(coluna não reconhecida)"]),
    );
  });

  it("keeps a column name it does recognise, so the operator can see the shape", () => {
    let error: unknown;
    try {
      mapWalletColumns(["id_externo", "nome", "documento", "valor", "data"]);
    } catch (thrown) {
      error = thrown;
    }

    if (!isInvalidHeaderError(error)) throw new Error("EXPECTED_HEADER_ERROR");
    expect(error.found).toContain("id_externo");
    expect(error.found).toContain("documento");
    expect(error.missing).toEqual(["cpf", "vencimento"]);
  });
});

describe("the example file an operator downloads first", () => {
  it("parses, and yields three accepted rows and one quarantined", async () => {
    // The file exists to be tried. If it stopped importing cleanly it would
    // teach the wrong lesson on the first attempt.
    const { previewWalletImport } = await import("@panella/application");
    const preview = previewWalletImport(
      Buffer.from(exampleWalletCsv(), "utf8"),
      { parse: (bytes) => parseWalletCsv(bytes) },
    );

    expect(preview.accepted).toHaveLength(3);
    expect(preview.quarantined).toEqual([
      { status: "QUARENTENA", rowNumber: 5, reason: "CPF_INVALIDO" },
    ]);
  });

  it("shows two titles of one debtor, so a line reads as a debt", async () => {
    const { previewWalletImport } = await import("@panella/application");
    const preview = previewWalletImport(
      Buffer.from(exampleWalletCsv(), "utf8"),
      { parse: (bytes) => parseWalletCsv(bytes) },
    );
    const cpfs = new Set(preview.accepted.map((row) => row.cpfDigits));

    expect(preview.accepted).toHaveLength(3);
    expect(cpfs.size).toBe(2);
  });

  it("exercises both accepted date forms", async () => {
    const { previewWalletImport } = await import("@panella/application");
    const preview = previewWalletImport(
      Buffer.from(exampleWalletCsv(), "utf8"),
      { parse: (bytes) => parseWalletCsv(bytes) },
    );

    expect(preview.accepted.map((row) => row.dueDate.toISOString().slice(0, 10)))
      .toEqual(["2026-03-10", "2026-04-10", "2026-05-01"]);
  });

  it("is the file committed under docs/, byte for byte", async () => {
    // Served by the screen from code and committed for the README to link.
    // Two copies is one too many unless something notices when they diverge.
    const { readFileSync } = await import("node:fs");
    const committed = readFileSync(
      new URL("../../../../docs/exemplo-carteira.csv", import.meta.url),
      "utf8",
    );

    expect(committed).toBe(exampleWalletCsv());
  });
});

describe("the example file against the demo wallet", () => {
  it("uses CPFs the demo does not already seed", () => {
    // If it reused one, every accepted row would aggregate onto a debtor who
    // already exists: three titles updated and no new line in the queue, which
    // teaches the opposite of what the file is for.
    const seededByTheDemo = ["529982247", "123111222", "111444777"];
    const csv = exampleWalletCsv();

    for (const base of seededByTheDemo) {
      expect(csv).not.toContain(base);
      expect(csv).not.toContain(
        `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}`,
      );
    }
  });
});
