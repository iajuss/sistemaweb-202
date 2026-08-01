import { describe, expect, it } from "vitest";

import { POLICY_2026_07_B } from "@panella/domain";

import { buildWalletQueue } from "./list-wallet-queue.js";
import type { OperationPrincipal, AuthorizedOperation } from "./authorize-actor.js";

/**
 * The queue is what someone opens first, so it has to say what the wallet
 * actually holds.
 *
 * The failure this exists to prevent: an operator imports a wallet, the system
 * accepts it, and the queue does not change — from which the only reasonable
 * conclusion is that the import failed. A screen that lies is worse than one
 * that complains.
 *
 * The rule that follows: **every debtor in the wallet gets a row.** A debtor
 * nobody has looked up yet is `DADOS_INSUFICIENTES` with no dossier, which is
 * not the same as a dossier that came back empty, and the two must not read
 * alike.
 */

// The queue never reaches storage itself; the ports are what it reads through,
// and the fixtures below stand in for them.
const principal = {} as OperationPrincipal;
const operation = {} as AuthorizedOperation;

function titles(rows: readonly { debtorId: string; externalId: string }[]) {
  return { listByWallet: async () => rows };
}

function classifications(
  rows: readonly {
    dossierId: string;
    debtorId: string;
    category: "COBRANCA_INTENSIVA" | "COBRANCA_PADRAO" | "MONITORAMENTO";
    operationalPriority: number;
    score: number;
    composedAt: string;
  }[],
) {
  return { listForWallet: async () => rows };
}

const SEM_DOSSIE = POLICY_2026_07_B.priorities.DADOS_INSUFICIENTES;

describe("the queue a wallet actually has", () => {
  it("gives one row to a debtor holding three titles", async () => {
    // Three instalments of one debt are three titles and one debtor. Counting
    // them as three would make the queue a list of debts, not of people to
    // pursue.
    const queue = await buildWalletQueue({
      principal,
      operation,
      titles: titles([
        { debtorId: "debtor-a", externalId: "TIT-003" },
        { debtorId: "debtor-a", externalId: "TIT-001" },
        { debtorId: "debtor-a", externalId: "TIT-002" },
      ]),
      classifications: classifications([]),
    });

    expect(queue).toHaveLength(1);
    // The lowest external id, so the row does not flap between reads.
    expect(queue[0].externalId).toBe("TIT-001");
  });

  it("carries the classification of a debtor whose dossier was composed", async () => {
    const queue = await buildWalletQueue({
      principal,
      operation,
      titles: titles([{ debtorId: "debtor-a", externalId: "TIT-001" }]),
      classifications: classifications([
        {
          dossierId: "dossie-1",
          debtorId: "debtor-a",
          category: "COBRANCA_PADRAO",
          operationalPriority: 1,
          score: 0.4,
          composedAt: "2026-08-01T10:00:00.000Z",
        },
      ]),
    });

    expect(queue[0]).toEqual({
      dossierId: "dossie-1",
      externalId: "TIT-001",
      category: "COBRANCA_PADRAO",
      operationalPriority: 1,
      score: 0.4,
    });
  });

  it("shows a freshly imported debtor as DADOS_INSUFICIENTES with no dossier", async () => {
    // Nobody consulted a source for this person. That is not a low score, and
    // it is not an empty dossier either — there is no dossier at all.
    const queue = await buildWalletQueue({
      principal,
      operation,
      titles: titles([{ debtorId: "debtor-novo", externalId: "NOVA-001" }]),
      classifications: classifications([]),
    });

    expect(queue[0]).toEqual({
      dossierId: null,
      externalId: "NOVA-001",
      category: "DADOS_INSUFICIENTES",
      operationalPriority: SEM_DOSSIE,
      score: 0,
    });
  });

  it("takes the operational priority from the policy, never from a constant", async () => {
    // If the policy's table moves, this row moves with it. A hard-coded 3 here
    // would be a second source of truth for the same decision.
    const queue = await buildWalletQueue({
      principal,
      operation,
      titles: titles([{ debtorId: "debtor-novo", externalId: "NOVA-001" }]),
      classifications: classifications([]),
      policy: {
        ...POLICY_2026_07_B,
        priorities: { ...POLICY_2026_07_B.priorities, DADOS_INSUFICIENTES: 9 },
      },
    });

    expect(queue[0].operationalPriority).toBe(9);
  });

  it("drops nobody when the wallet mixes looked-up and untouched debtors", async () => {
    const queue = await buildWalletQueue({
      principal,
      operation,
      titles: titles([
        { debtorId: "debtor-a", externalId: "TIT-001" },
        { debtorId: "debtor-novo", externalId: "NOVA-001" },
      ]),
      classifications: classifications([
        {
          dossierId: "dossie-1",
          debtorId: "debtor-a",
          category: "COBRANCA_PADRAO",
          operationalPriority: 1,
          score: 0.4,
          composedAt: "2026-08-01T10:00:00.000Z",
        },
      ]),
    });

    expect(queue).toHaveLength(2);
    expect(queue.map((entry) => entry.externalId).sort()).toEqual([
      "NOVA-001",
      "TIT-001",
    ]);
  });

  it("uses the most recent dossier when a debtor has several", async () => {
    // Every lookup composes a new snapshot; correction is by supersession and
    // never by editing. The queue shows the latest, not whichever came back
    // first from storage.
    const queue = await buildWalletQueue({
      principal,
      operation,
      titles: titles([{ debtorId: "debtor-a", externalId: "TIT-001" }]),
      classifications: classifications([
        {
          dossierId: "dossie-antigo",
          debtorId: "debtor-a",
          category: "MONITORAMENTO",
          operationalPriority: 2,
          score: 0.1,
          composedAt: "2026-07-30T10:00:00.000Z",
        },
        {
          dossierId: "dossie-novo",
          debtorId: "debtor-a",
          category: "COBRANCA_INTENSIVA",
          operationalPriority: 0,
          score: 0.8,
          composedAt: "2026-08-01T10:00:00.000Z",
        },
      ]),
    });

    expect(queue[0].dossierId).toBe("dossie-novo");
    expect(queue[0].category).toBe("COBRANCA_INTENSIVA");
  });

  it("ignores a classification for a debtor the wallet no longer holds", async () => {
    // The wallet is what authorizes the row. A dossier left over from a debtor
    // who has left the wallet must not reappear on the screen.
    const queue = await buildWalletQueue({
      principal,
      operation,
      titles: titles([{ debtorId: "debtor-a", externalId: "TIT-001" }]),
      classifications: classifications([
        {
          dossierId: "dossie-orfao",
          debtorId: "debtor-que-saiu",
          category: "COBRANCA_INTENSIVA",
          operationalPriority: 0,
          score: 0.9,
          composedAt: "2026-08-01T10:00:00.000Z",
        },
      ]),
    });

    expect(queue).toHaveLength(1);
    expect(queue[0].externalId).toBe("TIT-001");
  });

  it("answers an empty queue for an empty wallet", async () => {
    const queue = await buildWalletQueue({
      principal,
      operation,
      titles: titles([]),
      classifications: classifications([]),
    });

    expect(queue).toEqual([]);
  });
});
