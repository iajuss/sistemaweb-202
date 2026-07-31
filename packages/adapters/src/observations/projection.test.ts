import { describe, expect, it } from "vitest";

import { pgfnOpenDataSliceId, type RawObservation } from "@panella/domain";

import { buildPgfnManifest } from "../pgfn/manifest.js";
import type { PgfnInscription } from "../pgfn/open-data-worker.js";
import type { PgfnListBlock } from "../pgfn/list-importer.js";

import {
  projectPgfnListObservation,
  projectPgfnOpenDataObservations,
  projectWalletObservation,
} from "./projection.js";

/**
 * The seam between what a source adapter produces and what the dossier
 * composes. It had no code: the adapters emit their own shapes, the domain
 * consumes `RawObservation`, and every test so far built the latter by hand.
 *
 * The rule that carries the weight here is **one observation per declared
 * slice**. Coverage is decided slice by slice — that is what separates
 * `NAO_CONSULTADO` from `NAO_ENCONTRADO` — so a projection that collapsed the
 * three PGFN systems into one fact would make an unread system indistinguishable
 * from a system that answered nothing.
 */

const TENANT = "tenant-demo";
const DEBTOR = "debtor-1";
const CPF = "52998224725"; // positions 4-9 are 982247
const REFERENCE = "2026-06-30T00:00:00.000Z";

function inscription(
  overrides: Partial<PgfnInscription> & {
    readonly system: PgfnInscription["system"];
  },
): PgfnInscription {
  return {
    uf: "SP",
    maskedCpf: "***.982.247-**",
    name: "JOSE DA SILVA",
    inscriptionNumber: "12.345.678-9",
    situationType: "Em cobranca",
    situation: "ATIVA",
    inscribedAt: "2023-04-12",
    consolidatedAmountCents: 100n,
    ...overrides,
  };
}

function manifestWith(
  parts: readonly {
    readonly system: "SIDA" | "PREVIDENCIARIO" | "FGTS";
    readonly outcome: "PROCESSADA" | "ERRO";
  }[],
) {
  return buildPgfnManifest({
    referenceDate: REFERENCE,
    requiredUfs: ["SP"],
    parts: parts.map((part) => ({
      system: part.system,
      uf: "SP",
      file: `${part.system}.csv`,
      checksum: "abc",
      outcome: part.outcome,
      ...(part.outcome === "ERRO" ? { error: "DOWNLOAD_FALHOU" } : {}),
    })),
  });
}

const ALL_PROCESSED = manifestWith([
  { system: "SIDA", outcome: "PROCESSADA" },
  { system: "PREVIDENCIARIO", outcome: "PROCESSADA" },
  { system: "FGTS", outcome: "PROCESSADA" },
]);

function openData(
  inscriptions: readonly PgfnInscription[],
  manifest = ALL_PROCESSED,
): readonly RawObservation[] {
  return projectPgfnOpenDataObservations({
    tenantId: TENANT,
    debtorId: DEBTOR,
    requiredUfs: ["SP"],
    manifest,
    inscriptions,
  });
}

function bySlice(
  observations: readonly RawObservation[],
  sliceId: string,
): RawObservation {
  const found = observations.find(
    (observation) => observation.sliceId === sliceId,
  );
  if (!found) {
    throw new Error(`slice ausente: ${sliceId}`);
  }
  return found;
}

describe("projecting the wallet into an observation", () => {
  const titles = [
    { externalId: "TIT-001", amountCents: 123_456n },
    { externalId: "TIT-002", amountCents: 8_990n },
  ];

  function walletObservation(): RawObservation {
    return projectWalletObservation({
      tenantId: TENANT,
      debtorId: DEBTOR,
      collectedAt: "2026-07-31T12:00:00.000Z",
      titles,
    });
  }

  it("sums the open amount in integer cents and never in a number", () => {
    const values = walletObservation().records[0].values;

    // 123456 + 8990, calculated by hand before the projection existed.
    expect(values.carteira_valor_em_aberto).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 132_446n,
    });
  });

  it("lists the external title ids, which is what the operator recognises", () => {
    expect(walletObservation().records[0].values.carteira_titulos).toEqual({
      tipo: "LISTA_TEXTO",
      lista: ["TIT-001", "TIT-002"],
    });
  });

  it("is a tenant and debtor fact that carries no wallet anywhere", () => {
    // AGENTS.md: an observation belongs to tenant + debtor and never has a
    // `walletId`. The wallet authorises the read through its current link with
    // the debtor; nothing about it is written into the fact.
    expect(JSON.stringify(walletObservation(), (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    )).not.toContain("wallet");
  });

  it("is ENCONTRADO on the wallet slice, which the client declared", () => {
    const observation = walletObservation();
    expect(observation.source).toBe("CARTEIRA_CLIENTE");
    expect(observation.sliceId).toBe("CARTEIRA");
    expect(observation.status).toBe("ENCONTRADO");
  });

  it("derives the same id for the same collection and a new one for a new collection", () => {
    const first = walletObservation();
    const again = walletObservation();
    const later = projectWalletObservation({
      tenantId: TENANT,
      debtorId: DEBTOR,
      collectedAt: "2026-08-01T12:00:00.000Z",
      titles,
    });

    // Re-running the same collection must land on the same row rather than
    // duplicating it; a genuinely new collection is a new immutable fact.
    expect(again.id).toBe(first.id);
    expect(later.id).not.toBe(first.id);
  });
});

describe("projecting PGFN Dados Abertos, one observation per slice", () => {
  it("emits exactly the slices the plan declares for the queried UF", () => {
    expect(openData([]).map((observation) => observation.sliceId).sort()).toEqual(
      [
        pgfnOpenDataSliceId("FGTS", "SP"),
        pgfnOpenDataSliceId("PREVIDENCIARIO", "SP"),
        pgfnOpenDataSliceId("SIDA", "SP"),
      ].sort(),
    );
  });

  it("calls a slice that was read and matched nobody NAO_ENCONTRADO", () => {
    expect(
      bySlice(openData([]), pgfnOpenDataSliceId("FGTS", "SP")).status,
    ).toBe("NAO_ENCONTRADO");
  });

  it("calls an unread slice NAO_CONSULTADO, never NAO_ENCONTRADO", () => {
    const partial = openData(
      [],
      manifestWith([
        { system: "SIDA", outcome: "PROCESSADA" },
        { system: "PREVIDENCIARIO", outcome: "PROCESSADA" },
      ]),
    );

    expect(bySlice(partial, pgfnOpenDataSliceId("FGTS", "SP")).status).toBe(
      "NAO_CONSULTADO",
    );
    // And the slices that were read keep their own answer: one unread system
    // does not make the other two unknown.
    expect(bySlice(partial, pgfnOpenDataSliceId("SIDA", "SP")).status).toBe(
      "NAO_ENCONTRADO",
    );
  });

  it("calls a failed slice ERRO_NA_FONTE, and a failure is never a debt", () => {
    const failed = openData(
      [],
      manifestWith([
        { system: "SIDA", outcome: "ERRO" },
        { system: "PREVIDENCIARIO", outcome: "PROCESSADA" },
        { system: "FGTS", outcome: "PROCESSADA" },
      ]),
    );

    expect(bySlice(failed, pgfnOpenDataSliceId("SIDA", "SP")).status).toBe(
      "ERRO_NA_FONTE",
    );
  });

  it("puts each inscription on the slice that published it", () => {
    const observations = openData([
      inscription({ system: "SIDA" }),
      inscription({ system: "PREVIDENCIARIO", inscriptionNumber: "77.777.777-7" }),
    ]);

    expect(bySlice(observations, pgfnOpenDataSliceId("SIDA", "SP")).status).toBe(
      "ENCONTRADO",
    );
    expect(
      bySlice(observations, pgfnOpenDataSliceId("PREVIDENCIARIO", "SP")).status,
    ).toBe("ENCONTRADO");
    expect(bySlice(observations, pgfnOpenDataSliceId("FGTS", "SP")).status).toBe(
      "NAO_ENCONTRADO",
    );
  });

  it("gives one published person the same subject id in every slice", () => {
    const observations = openData([
      inscription({ system: "SIDA" }),
      inscription({ system: "PREVIDENCIARIO" }),
    ]);

    // The resolver dedupes candidates by subject id. Two ids for one person
    // would invent a tie between somebody and themselves.
    expect(bySlice(observations, pgfnOpenDataSliceId("SIDA", "SP")).subjects[0].id).toBe(
      bySlice(observations, pgfnOpenDataSliceId("PREVIDENCIARIO", "SP"))
        .subjects[0].id,
    );
  });

  it("keeps two people behind one mask as two subjects", () => {
    const observations = openData([
      inscription({ system: "SIDA" }),
      inscription({
        system: "SIDA",
        name: "MARIA JOSE ALVES PEREIRA SOARES SANTOS",
        inscriptionNumber: "55.555.555-5",
      }),
    ]);
    const slice = bySlice(observations, pgfnOpenDataSliceId("SIDA", "SP"));

    expect(slice.subjects).toHaveLength(2);
    expect(new Set(slice.subjects.map((subject) => subject.id)).size).toBe(2);
  });

  it("sums one subject's inscriptions and names them, in cents", () => {
    const slice = bySlice(
      openData([
        inscription({ system: "SIDA", consolidatedAmountCents: 2_916_388_644n }),
        inscription({
          system: "SIDA",
          consolidatedAmountCents: 150_000n,
          inscriptionNumber: "98.765.432-1",
        }),
      ]),
      pgfnOpenDataSliceId("SIDA", "SP"),
    );
    const record = slice.records[0];

    // 2916388644 + 150000, by hand.
    expect(record.values.pgfn_dados_abertos_valor_consolidado).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 2_916_538_644n,
    });
    expect(record.values.pgfn_dados_abertos_inscricoes).toEqual({
      tipo: "LISTA_TEXTO",
      lista: ["12.345.678-9", "98.765.432-1"],
    });
  });

  it("keeps the query scope, so absence under a filter cannot read as no debt", () => {
    const slice = bySlice(openData([]), pgfnOpenDataSliceId("SIDA", "SP"));

    expect(slice.queryParams).toMatchObject({
      uf: "SP",
      sistema: "SIDA",
      referencia: REFERENCE,
    });
    expect(slice.referenceDate).toBe(REFERENCE);
  });

  it("never writes a CPF, whole or masked, into the record values", () => {
    const slice = bySlice(
      openData([inscription({ system: "SIDA" })]),
      pgfnOpenDataSliceId("SIDA", "SP"),
    );

    expect(
      JSON.stringify(slice.records, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).not.toContain("982247");
  });
});

describe("projecting the manual PGFN list", () => {
  function block(
    overrides: Partial<PgfnListBlock> = {},
  ): PgfnListBlock {
    return {
      provenance: {
        title: "Consulta",
        filters: ["Nome: JOSE"],
        searchedAt: "2026-07-27",
      },
      status: "COM_PROCEDENCIA",
      queryScope: { complete: false },
      rows: [
        {
          rowNumber: 14,
          maskedCpf: "***.982.247-**",
          name: "JOSE DA SILVA",
          tradeName: "",
          totalAmount: {
            cents: 2_916_388_644n,
            publishedText: "29163886,440000001",
            roundedFromExcessPrecision: true,
          },
          selectedAmount: {
            cents: 150_000n,
            publishedText: "1500,00",
            roundedFromExcessPrecision: false,
          },
        },
      ],
      rejected: [],
      ...overrides,
    } as PgfnListBlock;
  }

  function listObservation(
    blocks: readonly PgfnListBlock[],
    cpf = CPF,
  ): RawObservation {
    return projectPgfnListObservation({
      tenantId: TENANT,
      debtorId: DEBTOR,
      cpf,
      collectedAt: "2026-07-27T00:00:00.000Z",
      blocks,
    });
  }

  it("keeps the two published amounts as two fields, with no fallback", () => {
    const values = listObservation([block()]).records[0].values;

    expect(values.pgfn_lista_valor_total).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 2_916_388_644n,
    });
    expect(values.pgfn_lista_valor_selecionado).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 150_000n,
    });
  });

  it("drops a row whose mask cannot be this debtor", () => {
    // The gate on persistence. A row that fits nobody in the wallet belongs to
    // a non-client and never leaves this function.
    const observation = listObservation([block()], "11144477735");

    expect(observation.subjects).toHaveLength(0);
    expect(observation.status).toBe("NAO_ENCONTRADO");
  });

  it("reports the scope the block declared rather than assuming it", () => {
    const filtered = listObservation([block()]);
    const complete = listObservation([
      // The importer pins `complete: false` today, so an integral export is
      // not yet representable in the type. Deriving it from the preamble is
      // the next slice; the projection already reads it rather than assuming.
      block({
        queryScope: { complete: true } as unknown as PgfnListBlock["queryScope"],
      }),
    ]);

    expect(filtered.queryParams.escopoCompleto).toBe(false);
    expect(complete.queryParams.escopoCompleto).toBe(true);
  });

  it("refuses to attribute rows from a block with no provenance", () => {
    // A block whose filters are unknown describes a query nobody can name.
    // Counting it would turn a gap into a claim.
    const observation = listObservation([
      block({ provenance: null, status: "SEM_PROCEDENCIA" }),
    ]);

    expect(observation.subjects).toHaveLength(0);
    expect(observation.status).toBe("NAO_ENCONTRADO");
  });
});
