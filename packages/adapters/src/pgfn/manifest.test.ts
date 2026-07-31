import { describe, expect, it } from "vitest";

import {
  PGFN_REQUIRED_SYSTEMS,
  buildPgfnManifest,
  pgfnObservationStatus,
  type PgfnPartResult,
} from "./manifest.js";

function part(overrides: Partial<PgfnPartResult> = {}): PgfnPartResult {
  return {
    system: "SIDA",
    uf: "SP",
    file: "sida-sp-01.csv",
    checksum: "a".repeat(64),
    outcome: "PROCESSADA",
    ...overrides,
  };
}

function allSystems(uf: string): PgfnPartResult[] {
  return PGFN_REQUIRED_SYSTEMS.map((system) => part({ system, uf }));
}

const REFERENCE = "2026-06-30";

describe("buildPgfnManifest", () => {
  it("requires SIDA, Previdenciaria and FGTS before a full no-result", () => {
    const manifest = buildPgfnManifest({
      referenceDate: REFERENCE,
      requiredUfs: ["SP"],
      parts: [part({ system: "SIDA" })],
    });

    // Two of three systems were never read. Saying "no debt" here would turn
    // an unread file into a clean record.
    expect(manifest.coverageStatus).toBe("NAO_CONSULTADO");
    expect(manifest.missingParts).toEqual([
      { system: "PREVIDENCIARIO", uf: "SP" },
      { system: "FGTS", uf: "SP" },
    ]);
  });

  it("allows NAO_ENCONTRADO only once every required part was processed", () => {
    const manifest = buildPgfnManifest({
      referenceDate: REFERENCE,
      requiredUfs: ["SP"],
      parts: allSystems("SP"),
    });

    expect(manifest.coverageStatus).toBe("NAO_ENCONTRADO");
    expect(manifest.missingParts).toEqual([]);
  });

  it("requires every UF when the wallet does not narrow one", () => {
    const manifest = buildPgfnManifest({
      referenceDate: REFERENCE,
      requiredUfs: ["SP", "RJ"],
      parts: allSystems("SP"),
    });

    expect(manifest.coverageStatus).toBe("NAO_CONSULTADO");
    expect(manifest.missingParts).toHaveLength(3);
  });

  it("reports a failed part as a source error, never as an absence", () => {
    const manifest = buildPgfnManifest({
      referenceDate: REFERENCE,
      requiredUfs: ["SP"],
      parts: [
        ...allSystems("SP").slice(1),
        part({ system: "SIDA", outcome: "ERRO", error: "HTTP_504" }),
      ],
    });

    // Every part is present; one of them failed. A source that broke is not a
    // debtor without debt.
    expect(manifest.coverageStatus).toBe("ERRO_NA_FONTE");
  });

  it("keeps reference date, file and checksum for every part", () => {
    const manifest = buildPgfnManifest({
      referenceDate: REFERENCE,
      requiredUfs: ["SP"],
      parts: allSystems("SP"),
    });

    expect(manifest.referenceDate).toBe(REFERENCE);
    expect(manifest.parts).toHaveLength(3);
    expect(manifest.parts[0]).toMatchObject({
      file: "sida-sp-01.csv",
      checksum: "a".repeat(64),
    });
  });
});

describe("pgfnObservationStatus", () => {
  it("is ENCONTRADO when a record matched, whatever the rest of the coverage did", () => {
    const manifest = buildPgfnManifest({
      referenceDate: REFERENCE,
      requiredUfs: ["SP"],
      parts: [part({ system: "SIDA" })],
    });

    // A record that was read is a fact. Incomplete coverage cannot unfind it.
    expect(pgfnObservationStatus(manifest, 1)).toBe("ENCONTRADO");
  });

  it("falls back to the coverage status when nothing matched", () => {
    const partial = buildPgfnManifest({
      referenceDate: REFERENCE,
      requiredUfs: ["SP"],
      parts: [part({ system: "SIDA" })],
    });
    const complete = buildPgfnManifest({
      referenceDate: REFERENCE,
      requiredUfs: ["SP"],
      parts: allSystems("SP"),
    });

    expect(pgfnObservationStatus(partial, 0)).toBe("NAO_CONSULTADO");
    expect(pgfnObservationStatus(complete, 0)).toBe("NAO_ENCONTRADO");
  });

  it("never collapses the four states into found or not found", () => {
    const statuses = new Set(
      [
        [["SIDA"], 0],
        [PGFN_REQUIRED_SYSTEMS, 0],
        [PGFN_REQUIRED_SYSTEMS, 1],
      ].map(([systems, matches]) =>
        pgfnObservationStatus(
          buildPgfnManifest({
            referenceDate: REFERENCE,
            requiredUfs: ["SP"],
            parts: (systems as PgfnPartResult["system"][]).map((system) =>
              part({ system }),
            ),
          }),
          matches as number,
        ),
      ),
    );

    expect(statuses).toEqual(
      new Set(["NAO_CONSULTADO", "NAO_ENCONTRADO", "ENCONTRADO"]),
    );
  });
});
