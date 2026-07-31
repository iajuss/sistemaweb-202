import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ingestPgfnOpenData, type PgfnPartInput } from "./open-data-worker.js";

function bytes(name: string): Uint8Array {
  return readFileSync(
    new URL(`../../../../fixtures/pgfn/open-data/${name}`, import.meta.url),
  );
}

// The wallet holds one person. 529.982.247-25 publishes as ***.982.247-**.
const wallet = [
  { debtorId: "debtor-a", cpf: "52998224725", name: "JOSE DA SILVA" },
];

const allParts: PgfnPartInput[] = [
  { system: "SIDA", uf: "SP", file: "sida-sp-01.csv", bytes: bytes("sida-sp-01.csv") },
  {
    system: "PREVIDENCIARIO",
    uf: "SP",
    file: "previdenciario-sp-01.csv",
    bytes: bytes("previdenciario-sp-01.csv"),
  },
  { system: "FGTS", uf: "SP", file: "fgts-sp-01.csv", bytes: bytes("fgts-sp-01.csv") },
];

function run(parts: PgfnPartInput[] = allParts, candidates = wallet) {
  return ingestPgfnOpenData({
    tenantId: "tenant-a",
    referenceDate: "2026-06-30",
    requiredUfs: ["SP"],
    parts,
    candidates,
  });
}

describe("ingestPgfnOpenData", () => {
  it("keeps only records whose mask fits a CPF in the wallet", () => {
    const result = run();
    const payload = JSON.stringify(result.observations, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );

    // ***.111.222-** belongs to nobody in this wallet. A non-client's record
    // is not persisted, not indexed and not carried in the observation.
    expect(payload).not.toContain("111.222");
    expect(payload).not.toContain("98.765.432-1");
  });

  it("collects a mask-compatible record even when the name diverges", () => {
    const result = run();
    const inscriptions = result.observations[0].payload.inscriptions;

    // MARIA JOSE ALVES PEREIRA SOARES SANTOS shares the mask with the client's
    // CPF, so she is a candidate, not a stranger. The observation is the raw
    // fact; deciding whether she is the debtor belongs to identity resolution,
    // and that decision has to stay re-executable.
    expect(inscriptions.map((entry) => entry.name)).toEqual([
      "JOSE DA SILVA",
      "MARIA JOSE ALVES PEREIRA SOARES SANTOS",
      "JOSE DA SILVA",
    ]);
  });

  it("does not decide identity, so it records no confidence", () => {
    const result = run();

    expect(result.observations[0]).not.toHaveProperty("linkConfidence");
    expect(result.observations[0].payload.inscriptions[0]).not.toHaveProperty(
      "linkConfidence",
    );
  });

  it("reports ENCONTRADO with the published reference as the collection date", () => {
    const result = run();

    expect(result.observations[0]).toMatchObject({
      tenantId: "tenant-a",
      debtorId: "debtor-a",
      source: "PGFN_DADOS_ABERTOS",
      status: "ENCONTRADO",
      collectedAt: "2026-06-30",
    });
  });

  it("keeps the query scope beside the result", () => {
    const result = run();

    // "Not found under this filter" is not "no debt". The scope travels with
    // the observation so the difference survives.
    expect(result.observations[0].queryParams).toMatchObject({
      referenceDate: "2026-06-30",
      requiredUfs: ["SP"],
      systems: ["SIDA", "PREVIDENCIARIO", "FGTS"],
      coverageComplete: true,
    });
  });

  it("answers NAO_ENCONTRADO only when every required part was processed", () => {
    const result = run(allParts, [
      { debtorId: "debtor-b", cpf: "12345678909", name: "OUTRA PESSOA" },
    ]);

    expect(result.observations[0].status).toBe("NAO_ENCONTRADO");
  });

  it("answers NAO_CONSULTADO when a required system was never read", () => {
    const result = run(allParts.slice(0, 1), [
      { debtorId: "debtor-b", cpf: "12345678909", name: "OUTRA PESSOA" },
    ]);

    expect(result.observations[0].status).toBe("NAO_CONSULTADO");
    expect(result.manifest.missingParts).toHaveLength(2);
  });

  it("turns a failed part into ERRO_NA_FONTE, never into an absence", () => {
    const result = run(
      [
        ...allParts.slice(1),
        { system: "SIDA", uf: "SP", file: "sida-sp-01.csv", error: "HTTP_504" },
      ],
      [{ debtorId: "debtor-b", cpf: "12345678909", name: "OUTRA PESSOA" }],
    );

    expect(result.observations[0].status).toBe("ERRO_NA_FONTE");
  });

  it("keeps a found record found even though another part failed", () => {
    const result = run([
      ...allParts.slice(0, 1),
      { system: "FGTS", uf: "SP", file: "fgts-sp-01.csv", error: "HTTP_504" },
    ]);

    expect(result.observations[0].status).toBe("ENCONTRADO");
  });

  it("carries the consolidated amount as integer cents", () => {
    const result = run();

    expect(
      result.observations[0].payload.inscriptions[0].consolidatedAmountCents,
    ).toBe(2916388644n);
  });

  it("records file and checksum for every part it processed", () => {
    const result = run();

    expect(result.manifest.parts).toHaveLength(3);
    expect(result.manifest.parts[0].checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never carries a full CPF out of the matcher", () => {
    const rendered = JSON.stringify(run(), (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );

    expect(rendered).not.toContain("52998224725");
    expect(rendered).not.toContain("529.982.247-25");
  });
});
