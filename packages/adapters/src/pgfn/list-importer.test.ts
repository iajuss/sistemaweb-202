import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { importPgfnList } from "./list-importer.js";

const workbook = (): Uint8Array =>
  readFileSync(
    new URL("../../../../fixtures/pgfn/lista-manual.xlsx", import.meta.url),
  );

describe("importPgfnList", () => {
  it("reads the workbook Excel actually wrote", () => {
    const imported = importPgfnList(workbook());

    expect(imported.blocks.length).toBeGreaterThan(0);
    expect(imported.blocks[0].rows.length).toBe(91);
  });

  it("captures the filter preamble as provenance", () => {
    const imported = importPgfnList(workbook());

    expect(imported.blocks[0].provenance).toEqual({
      title: "Lista de Devedores - PGFN",
      filters: [
        // The source writes a non-breaking space before the figure. Provenance
        // is evidence, so it is kept exactly as published rather than tidied.
        "Faixa de Valor Máximo (R$): R$ 150.000,00",
        "Nome: Jose Santos",
        "Natureza da dívida: Multa Eleitoral",
      ],
      searchedAt: "Data da pesquisa: 27/07/2026 14:53",
    });
  });

  it("marks the scope as filtered, so absence cannot be read as no debt", () => {
    const imported = importPgfnList(workbook());

    expect(imported.blocks[0].queryScope).toMatchObject({ complete: false });
  });

  it("marks a block that arrives without provenance instead of merging it", () => {
    const imported = importPgfnList(workbook());
    const orphan = imported.blocks.at(-1);

    // The real export concatenates distinct queries with no header of their
    // own. Absorbing those rows into the previous block would attribute them
    // to filters that never produced them.
    expect(imported.blocks).toHaveLength(2);
    expect(orphan).toMatchObject({
      provenance: null,
      status: "SEM_PROCEDENCIA",
      rows: expect.any(Array),
    });
    expect(orphan?.rows).toHaveLength(2);
  });

  it("never lets a block inherit the provenance of the block above it", () => {
    const imported = importPgfnList(workbook());
    const [first, orphan] = imported.blocks;

    // The separator threshold is a guess made on a single sample (F-4), so the
    // failure mode is what has to be safe. Splitting in the wrong place can
    // cost a block its provenance; it must never hand a block someone else's
    // filters, because that is a false claim about which query produced these
    // rows rather than a missing one.
    const rendered = JSON.stringify(orphan, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );

    expect(first.provenance).not.toBeNull();
    expect(orphan.provenance).toBeNull();
    expect(orphan.status).toBe("SEM_PROCEDENCIA");
    expect(rendered).not.toContain("Multa Eleitoral");
    expect(rendered).not.toContain("Data da pesquisa");
  });

  it("keeps the two published amounts as two fields", () => {
    const imported = importPgfnList(workbook());
    const row = imported.blocks[0].rows[0];

    // Valor Total and Valor da Divida Selecionada diverge in 31 of the 91
    // records of the real sample. A fallback from one to the other is
    // forbidden, so neither is ever derived from the other.
    expect(row.totalAmount.cents).toBe(2916388644n);
    expect(row.selectedAmount.cents).toBe(2858856n);
    expect(row.totalAmount.cents).not.toBe(row.selectedAmount.cents);
  });

  it("keeps the published text of an amount it had to round", () => {
    const imported = importPgfnList(workbook());
    const row = imported.blocks[0].rows[0];

    expect(row.totalAmount).toMatchObject({
      raw: "29163886,440000001",
      roundedFromExcessPrecision: true,
    });
  });

  it("reads the published mask without widening it", () => {
    const imported = importPgfnList(workbook());

    expect(imported.blocks[0].rows[0].maskedCpf).toBe("***.982.247-**");
  });

  it("keeps two different people who share one mask as two rows", () => {
    const imported = importPgfnList(workbook());
    const shared = imported.blocks[0].rows.filter(
      (row) => row.maskedCpf === "***.982.247-**",
    );

    // Compatibility is not identity. Collapsing these would invent a person.
    expect(new Set(shared.map((row) => row.name)).size).toBeGreaterThan(1);
  });

  it("skips blank rows without ending the block", () => {
    const imported = importPgfnList(workbook());

    // Blank rows sit at 17, 67, 70 and 75 inside the first block. A blank line
    // is a formatting artefact, not a new query.
    expect(imported.blocks[0].rows).toHaveLength(91);
  });

  it("never carries a source of truth other than the file it read", () => {
    const imported = importPgfnList(workbook());

    expect(imported.source).toBe("PGFN_LISTA_DEVEDORES_MANUAL");
  });
});
