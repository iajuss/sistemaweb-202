import {
  POLICY_2026_07_B,
  type PolicyCategory,
  type PolicyDefinition,
} from "@panella/domain";

import type {
  AuthorizedOperation,
  OperationPrincipal,
} from "./authorize-actor.js";
import type { PriorityEntry } from "./lookup-dossier.js";

/**
 * The wallet's queue, assembled from what the wallet actually holds.
 *
 * **Membership comes from the titles, not from the dossiers.** A queue built
 * out of composed dossiers can only show debtors somebody already looked up,
 * so a freshly imported wallet would leave the screen unchanged and the
 * operator would reasonably conclude the import failed. The wallet is the
 * authority on who is in it; a dossier is an answer about one of them.
 *
 * **A debtor with no dossier is not a debtor with a bad score.** They appear as
 * `DADOS_INSUFICIENTES` with `dossierId: null`, which is the same distinction
 * the engine draws internally between `NAO_CONSULTADO` and `NAO_ENCONTRADO`:
 * nobody asked, versus asked and found nothing. Collapsing the two would make
 * "not yet looked at" indistinguishable from "looked at and clean".
 *
 * Composing the missing dossiers here is not an option, and that is a
 * boundary rather than an omission: composition decrypts the CPF for the
 * matcher and requires `READ_DOSSIER`, while this queue is served to an
 * operator holding `READ_ACTIONABLE`. The screen must not be the place where
 * that stops being true.
 */

export interface WalletTitleRow {
  readonly debtorId: string;
  readonly externalId: string;
}

export interface WalletTitleLister {
  listByWallet(
    principal: OperationPrincipal,
    operation: AuthorizedOperation,
  ): Promise<readonly WalletTitleRow[]>;
}

/**
 * A classification already computed for a debtor of this wallet. Deliberately
 * flat: the queue needs the ordering key and the link target, never the fields
 * of the dossier, and an operator's screen has no business carrying them.
 */
export interface ClassifiedDebtor {
  readonly dossierId: string;
  readonly debtorId: string;
  readonly category: PolicyCategory;
  readonly operationalPriority: number;
  readonly score: number;
  readonly composedAt: string;
}

export interface WalletClassificationReader {
  listForWallet(
    principal: OperationPrincipal,
    operation: AuthorizedOperation,
  ): Promise<readonly ClassifiedDebtor[]>;
}

export interface BuildWalletQueueInput {
  readonly principal: OperationPrincipal;
  readonly operation: AuthorizedOperation;
  readonly titles: WalletTitleLister;
  readonly classifications: WalletClassificationReader;
  readonly policy?: PolicyDefinition;
}

/** The latest wins: correction is by supersession, never by editing (ADR 018). */
function latestByDebtor(
  classified: readonly ClassifiedDebtor[],
): ReadonlyMap<string, ClassifiedDebtor> {
  const latest = new Map<string, ClassifiedDebtor>();
  for (const entry of classified) {
    const current = latest.get(entry.debtorId);
    const newer =
      !current ||
      entry.composedAt > current.composedAt ||
      (entry.composedAt === current.composedAt &&
        entry.dossierId.localeCompare(current.dossierId) > 0);
    if (newer) {
      latest.set(entry.debtorId, entry);
    }
  }
  return latest;
}

/**
 * One title represents the debtor in the queue, and it is the lowest external
 * id rather than whichever the reader happened to return first. A row that
 * changed identity between two reads would break the keyset cursor, which now
 * pages on that id.
 */
function representativeTitles(
  rows: readonly WalletTitleRow[],
): ReadonlyMap<string, string> {
  const byDebtor = new Map<string, string>();
  for (const row of rows) {
    const current = byDebtor.get(row.debtorId);
    if (current === undefined || row.externalId.localeCompare(current) < 0) {
      byDebtor.set(row.debtorId, row.externalId);
    }
  }
  return byDebtor;
}

export async function buildWalletQueue(
  input: BuildWalletQueueInput,
): Promise<readonly PriorityEntry[]> {
  const policy = input.policy ?? POLICY_2026_07_B;
  const rows = await input.titles.listByWallet(input.principal, input.operation);
  const classified = latestByDebtor(
    await input.classifications.listForWallet(input.principal, input.operation),
  );

  const queue: PriorityEntry[] = [];
  for (const [debtorId, externalId] of representativeTitles(rows)) {
    const classification = classified.get(debtorId);
    queue.push(
      classification
        ? {
            dossierId: classification.dossierId,
            externalId,
            category: classification.category,
            operationalPriority: classification.operationalPriority,
            score: classification.score,
          }
        : {
            // Nobody has looked this debtor up. The priority comes from the
            // policy's own table, so it moves when the policy moves.
            dossierId: null,
            externalId,
            category: "DADOS_INSUFICIENTES",
            operationalPriority: policy.priorities.DADOS_INSUFICIENTES,
            score: 0,
          },
    );
  }
  return queue;
}
