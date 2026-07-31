import { randomUUID } from "node:crypto";

import {
  composeDossier,
  resolveIdentity,
  type DossierSnapshot,
  type IdentityResolution,
  type PublishedSubject,
  type RawObservation,
  type SourceName,
  type SourcePlan,
} from "@panella/domain";

import {
  authorizeOperation,
  type AuthenticatedOperationIdentity,
  type AuthorizedOperation,
  type OperationPrincipal,
  type WalletAuthorizationRepository,
} from "./authorize-actor.js";

/**
 * Composing a dossier is the moment the three layers of ADR 004 meet: raw
 * observations, an identity resolution, and one snapshot at one instant.
 *
 * The order of the steps is the security property. Authorization comes before
 * any read, the wallet link comes before any observation, and the resolver runs
 * per source over that source's own published subjects. Nothing here decides
 * what a match means — that stays in the domain, where `vinculoConfirmado` is
 * derived and cannot be handed in.
 */

/**
 * The debtor as the wallet holds them. The CPF arrives decrypted because the
 * matcher needs it in memory; it is passed to the resolver and to nothing else,
 * and never reaches a log, an error message or the snapshot.
 */
export interface WalletDebtorRecord {
  readonly debtorId: string;
  readonly name: string;
  readonly cpf: string;
}

/**
 * Wallet-scoped on purpose. The observation is a tenant + debtor fact with no
 * `walletId` (ADR 020); what the wallet authorizes is the *current link* with
 * the debtor, and this port is where that link is checked. A debtor absent from
 * the wallet has no answer, not an empty one.
 */
export interface WalletDebtorReader {
  findInWallet(
    principal: OperationPrincipal,
    operation: AuthorizedOperation,
    debtorId: string,
  ): Promise<WalletDebtorRecord | null>;
}

export interface DebtorObservationReader {
  listForDebtor(
    principal: OperationPrincipal,
    operation: AuthorizedOperation,
    debtorId: string,
  ): Promise<readonly RawObservation[]>;
}

export interface DossierSnapshotStore {
  save(
    principal: OperationPrincipal,
    operation: AuthorizedOperation,
    snapshot: DossierSnapshot,
  ): Promise<void>;
}

export interface ComposeDossierForDebtorInput {
  readonly identity: AuthenticatedOperationIdentity;
  readonly walletId: string;
  readonly debtorId: string;
  /** Declared up front. What was expected, not what happened to be found. */
  readonly plan: SourcePlan;
  readonly authorization: WalletAuthorizationRepository;
  readonly debtors: WalletDebtorReader;
  readonly observations: DebtorObservationReader;
  readonly snapshots: DossierSnapshotStore;
  /** Set when this dossier corrects an earlier one (ADR 018). */
  readonly supersedes?: string | null;
  readonly now?: () => Date;
  readonly newDossierId?: () => string;
}

function subjectsOf(
  observations: readonly RawObservation[],
): readonly PublishedSubject[] {
  // One published person may appear in several slices. Resolving them as
  // separate candidates would invent an ambiguity the source never had.
  const byId = new Map<string, PublishedSubject>();
  for (const observation of observations) {
    for (const subject of observation.subjects) {
      byId.set(subject.id, subject);
    }
  }
  return [...byId.values()];
}

export async function composeDossierForDebtor(
  input: ComposeDossierForDebtorInput,
): Promise<DossierSnapshot> {
  const operation = await authorizeOperation(
    input.identity,
    input.walletId,
    "READ_DOSSIER",
    input.authorization,
  );
  if (!operation) {
    throw new Error("DOSSIE_NAO_AUTORIZADO");
  }

  const { principal, context } = operation;
  const debtor = await input.debtors.findInWallet(
    principal,
    operation,
    input.debtorId,
  );
  if (!debtor) {
    // Named without the CPF and without the debtor id: a refusal must not turn
    // into an oracle for who exists in which wallet.
    throw new Error("DEVEDOR_FORA_DA_CARTEIRA");
  }

  const stored = await input.observations.listForDebtor(
    principal,
    operation,
    input.debtorId,
  );

  // A debtor accumulates observations across plans — an RJ slice read for an
  // earlier dossier is a legitimate stored fact. This dossier is the plan it
  // declared, so anything outside it is not part of this composition and is
  // not an error either. The domain still refuses an out-of-plan observation;
  // the point of filtering here is that it never receives one.
  const observations = stored.filter((observation) =>
    input.plan.sources.some(
      (planned) =>
        planned.source === observation.source &&
        planned.expectedSlices.includes(observation.sliceId),
    ),
  );

  const resolutions: Partial<Record<SourceName, IdentityResolution>> = {};
  for (const planned of input.plan.sources) {
    if (planned.vinculo !== "RESOLUCAO_DE_IDENTIDADE") {
      continue;
    }

    const forSource = observations.filter(
      (observation) => observation.source === planned.source,
    );
    if (forSource.length === 0) {
      // Nobody consulted this source. Running the resolver over an empty list
      // would stamp a resolver version onto a slice that was never read.
      continue;
    }

    resolutions[planned.source] = resolveIdentity(
      { name: debtor.name, cpf: debtor.cpf },
      subjectsOf(forSource),
    );
  }

  const snapshot = composeDossier({
    dossierId: (input.newDossierId ?? randomUUID)(),
    tenantId: context.tenantId,
    debtorId: input.debtorId,
    composedAt: (input.now ?? (() => new Date()))().toISOString(),
    plan: input.plan,
    observations,
    resolutions,
    supersedes: input.supersedes ?? null,
  });

  await input.snapshots.save(principal, operation, snapshot);
  return snapshot;
}
