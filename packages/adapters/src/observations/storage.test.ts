import { describe, expect, it } from "vitest";

import type { RawObservation } from "@panella/domain";

import { toRawObservation, toStoredObservation } from "./storage.js";

/**
 * An observation only survives a restart if it can go to the database and come
 * back as the same fact. The rule that matters is **money never becomes a
 * number**: JSON has one numeric type and it is a float, so cents that go
 * through `JSON.parse` as a number are cents that can come back wrong. They
 * travel as digit strings and return as `bigint`.
 */

const RAW: RawObservation = Object.freeze({
  id: "obs-1",
  tenantId: "tenant-demo",
  debtorId: "debtor-1",
  source: "PGFN_DADOS_ABERTOS",
  sliceId: "SIDA|SP",
  status: "ENCONTRADO",
  collectedAt: "2026-06-30T00:00:00.000Z",
  referenceDate: "2026-06-30T00:00:00.000Z",
  queryParams: { uf: "SP", sistema: "SIDA" },
  subjects: [
    { id: "subject-1", maskedCpf: "***.982.247-**", name: "JOSE DA SILVA" },
  ],
  records: [
    {
      subjectId: "subject-1",
      values: {
        pgfn_dados_abertos_valor_consolidado: {
          tipo: "MONETARIO_CENTAVOS" as const,
          centavos: 2_916_388_644n,
        },
        pgfn_dados_abertos_inscricoes: {
          tipo: "LISTA_TEXTO" as const,
          lista: ["12.345.678-9"],
        },
      },
    },
  ],
});

describe("an observation round-tripping through storage", () => {
  it("comes back as the same fact", () => {
    expect(toRawObservation(toStoredObservation(RAW))).toEqual(RAW);
  });

  it("survives the JSON the database actually stores", () => {
    // Not the in-memory object: the value that goes through `JSON.parse` on
    // the way back is the one the guarantee has to hold for.
    const stored = toStoredObservation(RAW);
    const asDatabaseReturnsIt = {
      ...stored,
      queryParams: JSON.parse(JSON.stringify(stored.queryParams)) as Record<
        string,
        unknown
      >,
      payload: JSON.parse(JSON.stringify(stored.payload)) as Record<
        string,
        unknown
      >,
    };

    expect(toRawObservation(asDatabaseReturnsIt)).toEqual(RAW);
  });

  it("serialises cents as digits and never as a JSON number", () => {
    const payload = JSON.stringify(toStoredObservation(RAW).payload);

    expect(payload).toContain('"2916388644"');
    expect(payload).not.toContain(":2916388644");
  });

  it("refuses cents that arrive as a JSON number", () => {
    const stored = toStoredObservation(RAW);
    const asFloat = {
      ...stored,
      payload: {
        ...stored.payload,
        records: [
          {
            subjectId: "subject-1",
            values: {
              pgfn_dados_abertos_valor_consolidado: {
                tipo: "MONETARIO_CENTAVOS",
                centavos: 2_916_388_644,
              },
            },
          },
        ],
      },
    };

    // A row written by an older version, by hand, or by anything that did not
    // go through this file. `29163886.440000001` is what the real source
    // publishes: a number that reached JSON has already lost the argument.
    expect(() => toRawObservation(asFloat)).toThrow(
      "PAYLOAD_DE_OBSERVACAO_INVALIDO",
    );
  });

  it("refuses a stored value whose type it does not know", () => {
    const stored = toStoredObservation(RAW);
    const corrupted = {
      ...stored,
      payload: {
        ...stored.payload,
        records: [
          {
            subjectId: "subject-1",
            values: { qualquer: { tipo: "PONTO_FLUTUANTE", valor: 1.5 } },
          },
        ],
      },
    };

    // Loudly, not with an empty field: a shape nobody planned for is a schema
    // change, and answering with a hole would hide it behind a missing value.
    expect(() => toRawObservation(corrupted)).toThrow(
      "PAYLOAD_DE_OBSERVACAO_INVALIDO",
    );
  });

  it("keeps no wallet in what is written", () => {
    expect(JSON.stringify(toStoredObservation(RAW))).not.toContain("wallet");
  });

  it("keeps a slice that found nothing distinguishable from one nobody read", () => {
    const unread = toStoredObservation({
      ...RAW,
      status: "NAO_CONSULTADO",
      subjects: [],
      records: [],
    });
    const empty = toStoredObservation({
      ...RAW,
      status: "NAO_ENCONTRADO",
      subjects: [],
      records: [],
    });

    expect(toRawObservation(unread).status).toBe("NAO_CONSULTADO");
    expect(toRawObservation(empty).status).toBe("NAO_ENCONTRADO");
  });

  it("carries a null reference date through unchanged", () => {
    const wallet = { ...RAW, source: "CARTEIRA_CLIENTE" as const, referenceDate: null };

    expect(toRawObservation(toStoredObservation(wallet)).referenceDate).toBeNull();
  });
});
