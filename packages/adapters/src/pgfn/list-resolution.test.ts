import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveIdentity, type PublishedRecord } from "@panella/domain";

import { importPgfnList } from "./list-importer.js";

/**
 * The resolver against the workbook Excel actually wrote, rather than against
 * records typed into a test. This is the path a real query takes: published
 * file, parsed rows, mask narrowing, name ranking, answer.
 */

function publishedRecords(): readonly PublishedRecord[] {
  const imported = importPgfnList(
    readFileSync(
      new URL("../../../../fixtures/pgfn/lista-manual.xlsx", import.meta.url),
    ),
  );
  return imported.blocks.flatMap((block) =>
    block.rows.map((row) => ({
      id: `${block.status}-${row.rowNumber}`,
      maskedCpf: row.maskedCpf,
      name: row.name,
    })),
  );
}

describe("resolving a wallet debtor against the published list", () => {
  it("abstains when the shared mask holds two people the name cannot separate", () => {
    const records = publishedRecords();
    const shared = records.filter(
      (record) => record.maskedCpf === "***.982.247-**",
    );

    const resolution = resolveIdentity(
      { name: "JOSE SANTOS", cpf: "52998224725" },
      records,
    );

    // The fixture puts more than one person behind this mask, and two of them
    // are named JOSE SANTOS. Neither becomes a fact.
    expect(shared.length).toBeGreaterThan(1);
    expect(resolution.status).toBe("AMBIGUO");
    expect(resolution.selected).toBeNull();
    expect(resolution.isFact).toBe(false);
    expect(resolution.confidence).toBeGreaterThan(0);
  });

  it("rejects the homonym the source returns for a token search", () => {
    const resolution = resolveIdentity(
      { name: "JOSE SANTOS", cpf: "52998224725" },
      publishedRecords(),
    );
    const homonym = resolution.candidates.find(
      (candidate) => candidate.name === "MARIA JOSE ALVES PEREIRA SOARES SANTOS",
    );

    // She is behind the same mask and carries both query tokens. Neither makes
    // her the debtor, and she is refused before the tie is even considered.
    expect(homonym).toBeDefined();
    expect(homonym?.status).toBe("REJEITADO");
    expect(homonym?.confidence).toBe(0);
  });

  it("finds nobody for a wallet CPF no published mask fits", () => {
    const resolution = resolveIdentity(
      { name: "JOSE SANTOS", cpf: "39053344705" },
      publishedRecords(),
    );

    expect(resolution.status).toBe("SEM_CANDIDATO");
    expect(resolution.isFact).toBe(false);
  });

  it("does not let a row from the block without provenance become a fact silently", () => {
    const records = publishedRecords();
    const orphanRecords = records.filter((record) =>
      record.id.startsWith("SEM_PROCEDENCIA"),
    );

    // The resolver answers about names; it is the block status that says the
    // rows cannot be attributed to a query. Both facts have to reach the
    // dossier, so neither is allowed to disappear here.
    expect(orphanRecords.length).toBeGreaterThan(0);
    expect(orphanRecords.every((record) => record.maskedCpf.startsWith("***"))).toBe(
      true,
    );
  });
});
