import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  evaluatePolicy,
  POLICY_2026_07_A,
  sourcePlanForUfs,
  type DossierSnapshot,
  type RawObservation,
  type SourcePlan,
  type TenantContext,
  type WalletGrant,
} from "@panella/domain";
import {
  authorizeOperation,
  commitWalletImport,
  composeDossierForDebtor,
  type AuthorizedOperation,
  type OperationPrincipal,
  type PriorityEntry,
  type WalletAuthorizationRepository,
  type WalletFileParser,
} from "@panella/application";

import { DevInsecureIdentityProvider } from "../../../../packages/adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../../../../packages/adapters/src/keycloak.js";
import { createInMemoryCpfCrypto } from "../../../../packages/adapters/src/kms.js";
import { createPrismaWalletStore } from "../../../../packages/adapters/src/repositories/prisma-wallet-repository.js";
import { parseWalletXlsx } from "../../../../packages/adapters/src/wallet-importers/xlsx.js";
import { ingestPgfnOpenData } from "../../../../packages/adapters/src/pgfn/open-data-worker.js";
import { importPgfnList } from "../../../../packages/adapters/src/pgfn/list-importer.js";
import {
  projectPgfnListObservation,
  projectPgfnOpenDataObservations,
  projectWalletObservation,
} from "../../../../packages/adapters/src/observations/projection.js";
import {
  toRawObservation,
  toStoredObservation,
} from "../../../../packages/adapters/src/observations/storage.js";

/**
 * The demo, end to end, from an empty database: import the wallet workbook,
 * run both PGFN universes off the committed fixtures, persist the observations,
 * compose a dossier per debtor and classify it.
 *
 * **Nothing here is a second implementation of a business rule.** Every step
 * calls the same service the HTTP surface calls; what this file adds is the
 * wiring an operator would otherwise do by hand.
 *
 * Two limits it inherits and does not hide:
 *
 * - **One process.** The AEAD key vault is in memory (pendency F-5), so the
 *   process that encrypted a CPF is the only one that can read it back. Seeding
 *   and serving therefore share a process until the ADR 006 KMS vault exists.
 * - **Authorization is a fixture.** There is no login: `VerifiedPrincipal`
 *   issuance fails closed outside development (ADR 021, pendency P-1), and the
 *   wallet grant below stands in for the directory that will replace it.
 */

const workspaceRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

export const DEMO = Object.freeze({
  tenantId: "tenant-demo",
  walletId: "carteira-demo",
  actorId: "agent-demo",
  /** White label: the product's name, colours and mark belong to the tenant. */
  theme: {
    nome_do_produto: "Triagem de Cobrança",
    cor_primaria: "#1F4E79",
    cor_secundaria: "#F2F5F8",
    marca: "Cliente Demonstração",
  },
  /** The wallet is in São Paulo, so the plan declares the three SP slices. */
  ufs: ["SP"] as const,
  referenceDate: "2026-06-30T00:00:00.000Z",
  listCollectedAt: "2026-07-27T00:00:00.000Z",
});

const ACTIONS: WalletGrant["actions"] = [
  "IMPORT_WALLET",
  "READ_ACTIONABLE",
  "READ_AUDIT",
  "READ_DOSSIER",
];

/**
 * Stands in for the directory. Every dependency that decides who the caller is
 * stays wired at construction and is never chosen by a request — that property
 * is what keeps the HTTP layer from being a bypass (defect I-3).
 */
class DemoWalletAuthorization implements WalletAuthorizationRepository {
  public async findWallet(_context: TenantContext, walletId: string) {
    return walletId === DEMO.walletId
      ? { id: DEMO.walletId, tenantId: DEMO.tenantId }
      : null;
  }

  public async findGrant(
    _context: TenantContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return walletId === DEMO.walletId
      ? {
          tenantId: DEMO.tenantId,
          walletId: DEMO.walletId,
          actions: [...ACTIONS],
        }
      : null;
  }

  public async containsCpf(): Promise<boolean> {
    return false;
  }

  public async containsDebtor(): Promise<boolean> {
    return true;
  }
}

const identityRepository: IdentityActorRepository = {
  findByIdentity: async () => ({
    actorId: DEMO.actorId,
    tenantId: DEMO.tenantId,
    kind: "AGENT",
    roles: [],
  }),
};

export async function demoAgent(): Promise<AuthenticatedIdentity> {
  return mapVerifiedKeycloakActor(
    new DevInsecureIdentityProvider({
      allowInsecureDevelopmentIdentity: true,
    }).authenticateMachineAgent({
      issuer: "https://identity.example/realms/demo",
      subject: "service-account-agent-demo",
    }),
    identityRepository,
  );
}

function ownerSql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "-e",
      "PGPASSWORD=dossie_owner_local_only",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "dossie_owner",
      "-d",
      "dossie_triagem",
      "-tA",
      "-c",
      sql,
    ],
    { cwd: workspaceRoot, encoding: "utf8" },
  );
}

function fixture(path: string): Uint8Array {
  return readFileSync(resolve(workspaceRoot, "fixtures", path));
}

/**
 * Scoped to this demo's own tenant, never `TRUNCATE`. The same database holds
 * the integration suites' tenants, and a global wipe would make the two race.
 */
function resetDemoTenant(): void {
  ownerSql(
    `DELETE FROM "WalletImport" WHERE "tenantId" = '${DEMO.tenantId}';
     DELETE FROM "Observation" WHERE "tenantId" = '${DEMO.tenantId}';
     DELETE FROM "Title" WHERE "tenantId" = '${DEMO.tenantId}';
     DELETE FROM "Debtor" WHERE "tenantId" = '${DEMO.tenantId}';
     DELETE FROM "AgentWalletGrant" WHERE "tenantId" = '${DEMO.tenantId}';
     DELETE FROM "ActorIdentity" WHERE "tenantId" = '${DEMO.tenantId}';
     DELETE FROM "Wallet" WHERE "tenantId" = '${DEMO.tenantId}';
     DELETE FROM "Tenant" WHERE "id" = '${DEMO.tenantId}';
     INSERT INTO "Tenant" ("id", "theme")
       VALUES ('${DEMO.tenantId}', '${JSON.stringify(DEMO.theme)}'::jsonb);
     INSERT INTO "Wallet" ("id", "tenantId", "name", "importedAt")
       VALUES ('${DEMO.walletId}', '${DEMO.tenantId}', 'Carteira de demonstração', CURRENT_TIMESTAMP);`,
  );
}

export interface DemoDebtor {
  readonly debtorId: string;
  readonly name: string;
  readonly externalIds: readonly string[];
}

export interface DemoRuntime {
  readonly plan: SourcePlan;
  readonly authorization: WalletAuthorizationRepository;
  readonly store: ReturnType<typeof createPrismaWalletStore>;
  readonly snapshots: Map<string, DossierSnapshot>;
  readonly priorities: readonly PriorityEntry[];
  readonly debtors: readonly DemoDebtor[];
  readonly quarantined: number;
  disconnect(): Promise<void>;
}

export async function seedDemo(): Promise<DemoRuntime> {
  const plan = sourcePlanForUfs([...DEMO.ufs]);
  const authorization = new DemoWalletAuthorization();
  const identity = await demoAgent();
  const store = createPrismaWalletStore(createInMemoryCpfCrypto());

  resetDemoTenant();

  const parser: WalletFileParser = { parse: (bytes) => parseWalletXlsx(bytes) };
  const report = await commitWalletImport({
    identity,
    walletId: DEMO.walletId,
    bytes: fixture("demo/carteira-demo.xlsx"),
    parser,
    authorization,
    store,
  });

  const ingestion = await authorizedOperation(identity, "IMPORT_WALLET");
  const reading = await authorizedOperation(identity, "READ_DOSSIER");
  const actionable = await authorizedOperation(identity, "READ_ACTIONABLE");

  const titles = await store.titles.listByWallet(
    actionable.principal,
    actionable,
  );

  // The wallet is the first source, and it is grouped by debtor because that
  // is the unit a dossier is about. A title is a debt; the person emerges from
  // the aggregation.
  const byDebtor = new Map<
    string,
    { name: string; titles: { externalId: string; amountCents: bigint }[] }
  >();
  for (const title of titles) {
    const entry = byDebtor.get(title.debtorId) ?? {
      name: title.name,
      titles: [],
    };
    entry.titles.push({
      externalId: title.externalId,
      amountCents: title.amountCents,
    });
    byDebtor.set(title.debtorId, entry);
  }

  const candidates: { debtorId: string; name: string; cpf: string }[] = [];
  for (const debtorId of byDebtor.keys()) {
    const debtor = await store.titles.findInWallet(
      reading.principal,
      reading,
      debtorId,
    );
    if (debtor) {
      candidates.push(debtor);
    }
  }

  // --- the sources ---------------------------------------------------------

  const openData = ingestPgfnOpenData({
    tenantId: DEMO.tenantId,
    referenceDate: DEMO.referenceDate,
    requiredUfs: [...DEMO.ufs],
    parts: [
      { system: "SIDA", uf: "SP", file: "sida-sp-01.csv", bytes: fixture("pgfn/open-data/sida-sp-01.csv") },
      {
        system: "PREVIDENCIARIO",
        uf: "SP",
        file: "previdenciario-sp-01.csv",
        bytes: fixture("pgfn/open-data/previdenciario-sp-01.csv"),
      },
      { system: "FGTS", uf: "SP", file: "fgts-sp-01.csv", bytes: fixture("pgfn/open-data/fgts-sp-01.csv") },
    ],
    candidates,
  });

  const list = importPgfnList(fixture("pgfn/lista-manual.xlsx"));

  const observations: RawObservation[] = [];
  for (const candidate of candidates) {
    const wallet = byDebtor.get(candidate.debtorId);
    observations.push(
      projectWalletObservation({
        tenantId: DEMO.tenantId,
        debtorId: candidate.debtorId,
        collectedAt: new Date().toISOString(),
        titles: wallet?.titles ?? [],
      }),
      ...projectPgfnOpenDataObservations({
        tenantId: DEMO.tenantId,
        debtorId: candidate.debtorId,
        requiredUfs: [...DEMO.ufs],
        manifest: openData.manifest,
        inscriptions:
          openData.observations.find(
            (entry) => entry.debtorId === candidate.debtorId,
          )?.payload.inscriptions ?? [],
      }),
      projectPgfnListObservation({
        tenantId: DEMO.tenantId,
        debtorId: candidate.debtorId,
        cpf: candidate.cpf,
        name: candidate.name,
        collectedAt: DEMO.listCollectedAt,
        blocks: list.blocks,
      }),
    );
  }

  for (const observation of observations) {
    await store.observations.save(
      ingestion.principal,
      ingestion,
      toStoredObservation(observation),
    );
  }

  // --- dossiers and classifications ---------------------------------------

  const snapshots = new Map<string, DossierSnapshot>();
  const priorities: PriorityEntry[] = [];
  const debtors: DemoDebtor[] = [];
  let sequence = 0;

  for (const candidate of candidates) {
    sequence += 1;
    const dossierId = `dossie-${sequence}`;
    const snapshot = await composeDossierForDebtor({
      identity,
      walletId: DEMO.walletId,
      debtorId: candidate.debtorId,
      plan,
      authorization,
      debtors: walletDebtorReader(store),
      observations: debtorObservationReader(store),
      snapshots: { save: async (_p, _o, value) => void snapshots.set(value.dossierId, value) },
      newDossierId: () => dossierId,
    });

    const classification = evaluatePolicy(snapshot, POLICY_2026_07_A);
    const wallet = byDebtor.get(candidate.debtorId);
    priorities.push({
      dossierId,
      externalId: wallet?.titles[0]?.externalId ?? "",
      category: classification.category,
      operationalPriority: classification.operational_priority,
      score: classification.score,
    });
    debtors.push({
      debtorId: candidate.debtorId,
      name: candidate.name,
      externalIds: (wallet?.titles ?? []).map((title) => title.externalId),
    });
  }

  return {
    plan,
    authorization,
    store,
    snapshots,
    priorities,
    debtors,
    quarantined: report.quarantined.length,
    disconnect: () => store.disconnect(),
  };
}

async function authorizedOperation(
  identity: AuthenticatedIdentity,
  action: WalletGrant["actions"][number],
): Promise<AuthorizedOperation> {
  const operation = await authorizeOperation(
    identity,
    DEMO.walletId,
    action,
    new DemoWalletAuthorization(),
  );
  if (!operation) {
    throw new Error("OPERACAO_NAO_AUTORIZADA");
  }
  return operation;
}

/** The database is the source; these only narrow it to the port's shape. */
export function walletDebtorReader(
  store: ReturnType<typeof createPrismaWalletStore>,
) {
  return {
    findInWallet: (
      principal: OperationPrincipal,
      operation: AuthorizedOperation,
      debtorId: string,
    ) => store.titles.findInWallet(principal, operation, debtorId),
  };
}

export function debtorObservationReader(
  store: ReturnType<typeof createPrismaWalletStore>,
) {
  return {
    listForDebtor: async (
      principal: OperationPrincipal,
      operation: AuthorizedOperation,
      debtorId: string,
    ): Promise<readonly RawObservation[]> =>
      (
        await store.observations.listForDebtor(principal, operation, debtorId)
      ).map(toRawObservation),
  };
}
