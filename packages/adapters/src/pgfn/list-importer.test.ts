import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  derivePgfnListQueryScope,
  importPgfnList,
} from "./list-importer.js";

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

/**
 * Scope completeness is **derived from the captured preamble**, never assumed
 * in either direction. Pinning it to `false` made the regularity delta
 * permanently unreachable; pinning it to `true` would let "not found under a
 * filter" read as "no debt". The preamble is the evidence, so it decides.
 *
 * The rule is an allow-list and it fails closed: a filter that selects **who**
 * was searched leaves the debt universe whole, and everything else — a debt
 * nature, a value ceiling, a label nobody has seen before — cuts it.
 */
describe("derivePgfnListQueryScope", () => {
  const provenance = (filters: readonly string[]) => ({
    title: "Lista de Devedores - PGFN",
    filters: [...filters],
    searchedAt: "Data da pesquisa: 27/07/2026 14:53",
  });

  it("calls an export filtered only by subject complete for that subject", () => {
    const scope = derivePgfnListQueryScope(provenance(["Nome: Jose Santos"]));

    expect(scope).toMatchObject({
      complete: true,
      reason: "INTEGRAL",
      narrowingFilters: [],
      subjectFilters: ["Nome: Jose Santos"],
    });
  });

  it("calls an export with no filters at all complete", () => {
    expect(derivePgfnListQueryScope(provenance([]))).toMatchObject({
      complete: true,
      reason: "INTEGRAL",
    });
  });

  it.each([
    ["a debt nature", "Natureza da dívida: Multa Eleitoral"],
    ["a value ceiling", "Faixa de Valor Máximo (R$): R$ 150.000,00"],
    ["a value floor", "Faixa de Valor Mínimo (R$): R$ 1.000,00"],
  ])("calls an export filtered by %s incomplete", (_case, filter) => {
    const scope = derivePgfnListQueryScope(
      provenance(["Nome: Jose Santos", filter]),
    );

    expect(scope.complete).toBe(false);
    expect(scope.reason).toBe("FILTRADO");
    expect(scope.narrowingFilters).toEqual([filter]);
  });

  it("treats a filter label nobody has seen as narrowing", () => {
    // One real export is the whole sample. A label this code does not know is
    // a cut it cannot rule out, and the safe reading of an unknown cut is that
    // absence proves nothing.
    const scope = derivePgfnListQueryScope(
      provenance(["Situação da inscrição: Em cobrança"]),
    );

    expect(scope.complete).toBe(false);
    expect(scope.reason).toBe("FILTRADO");
  });

  it("refuses to call a block without provenance complete", () => {
    expect(derivePgfnListQueryScope(null)).toMatchObject({
      complete: false,
      reason: "SEM_PROCEDENCIA",
    });
  });

  it("derives the real export's scope from its own preamble", () => {
    const imported = importPgfnList(workbook());

    // The committed workbook carries a debt nature and a value ceiling, so the
    // answer is still `false` — reached by reading the preamble rather than by
    // a constant, which is the difference that makes the delta reachable.
    expect(imported.blocks[0].queryScope).toMatchObject({
      complete: false,
      reason: "FILTRADO",
      subjectFilters: ["Nome: Jose Santos"],
    });
    expect(imported.blocks[0].queryScope.narrowingFilters).toEqual([
      // The non-breaking space the source publishes, kept verbatim: provenance
      // is evidence and evidence is not tidied.
      "Faixa de Valor Máximo (R$): R$ 150.000,00",
      "Natureza da dívida: Multa Eleitoral",
    ]);
  });
});
