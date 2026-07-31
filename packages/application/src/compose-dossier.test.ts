import { afterEach, describe, expect, it, vi } from "vitest";

import { DevInsecureIdentityProvider } from "../../adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../../adapters/src/keycloak.js";
import {
  factValue,
  sourcePlanForUfs,
  type DossierSnapshot,
  type RawObservation,
  type SourceName,
  type TenantContext,
  type WalletGrant,
} from "@panella/domain";

import {
  composeDossierForDebtor,
  type DebtorObservationReader,
  type DossierSnapshotStore,
  type WalletDebtorReader,
} from "./compose-dossier.js";
import type {
  AuthorizedOperation,
  OperationPrincipal,
  WalletAuthorizationRepository,
} from "./authorize-actor.js";

/**
 * The wallet debtor every case is about. Synthetic CPF, masks derived from it
 * by hand, so the expected resolution of each case is checkable without
 * running the matcher: positions 4-9 of 52998224725 are 982247.
 */
const DEBTOR = { debtorId: "debtor-a", name: "JOSE SILVA", cpf: "52998224725" };
const MASK = "***982247**";
const PLAN = sourcePlanForUfs(["SP"]);

class WalletFixture implements WalletAuthorizationRepository {
  public constructor(private readonly grants: readonly WalletGrant[]) {}

  public async findWallet(_context: TenantContext, walletId: string) {
    return walletId === "wallet-a"
      ? { id: "wallet-a", tenantId: "tenant-a" }
      : null;
  }

  public async findGrant(
    _context: TenantContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return this.grants.find((grant) => grant.walletId === walletId) ?? null;
  }

  public async containsCpf(): Promise<boolean> {
    return false;
  }

  public async containsDebtor(): Promise<boolean> {
    return true;
  }
}

function grantedWallet(
  actions: WalletGrant["actions"] = ["READ_DOSSIER"],
): WalletFixture {
  return new WalletFixture([
    { tenantId: "tenant-a", walletId: "wallet-a", actions },
  ]);
}

const identityRepository: IdentityActorRepository = {
  findByIdentity: async () => ({
    actorId: "agent-a",
    tenantId: "tenant-a",
    kind: "AGENT",
    roles: [],
  }),
};

async function readingAgent(): Promise<AuthenticatedIdentity> {
  vi.stubEnv("NODE_ENV", "development");
  const principal = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  }).authenticateMachineAgent({
    issuer: "https://identity.example/realms/acme",
    subject: "service-account-agent-a",
  });
  return mapVerifiedKeycloakActor(principal, identityRepository);
}

/** Counts calls, so "never read" and "never written" are assertable. */
class RecordingDebtors implements WalletDebtorReader {
  public calls = 0;

  public constructor(
    private readonly debtor: {
      readonly debtorId: string;
      readonly name: string;
      readonly cpf: string;
    } | null,
  ) {}

  public async findInWallet(
    _principal: OperationPrincipal,
    _operation: AuthorizedOperation,
    debtorId: string,
  ) {
    this.calls += 1;
    return this.debtor && this.debtor.debtorId === debtorId
      ? this.debtor
      : null;
  }
}

class RecordingObservations implements DebtorObservationReader {
  public calls = 0;

  public constructor(
    private readonly observations: readonly RawObservation[] = [],
  ) {}

  public async listForDebtor() {
    this.calls += 1;
    return this.observations;
  }
}

class RecordingSnapshots implements DossierSnapshotStore {
  public saved: DossierSnapshot[] = [];

  public async save(
    _principal: OperationPrincipal,
    _operation: AuthorizedOperation,
    snapshot: DossierSnapshot,
  ) {
    this.saved.push(snapshot);
  }
}

function observation(
  overrides: Partial<RawObservation> & {
    readonly source: SourceName;
    readonly sliceId: string;
  },
): RawObservation {
  return {
    id: `${overrides.source}-${overrides.sliceId}`,
    tenantId: "tenant-a",
    debtorId: "debtor-a",
    status: "NAO_ENCONTRADO",
    collectedAt: "2026-07-20T00:00:00.000Z",
    referenceDate: "2026-06-30T00:00:00.000Z",
    queryParams: { uf: "SP" },
    subjects: [],
    records: [],
    ...overrides,
  };
}

function pgfnFound(
  sliceId: string,
  cents: bigint,
  subjects: readonly { id: string; maskedCpf: string; name: string }[],
  attributedTo = subjects[0]?.id,
): RawObservation {
  return observation({
    source: "PGFN_DADOS_ABERTOS",
    sliceId,
    status: "ENCONTRADO",
    subjects,
    records: subjects.map((subject) => ({
      subjectId: subject.id,
      values: {
        pgfn_dados_abertos_valor_consolidado: {
          tipo: "MONETARIO_CENTAVOS" as const,
          centavos: subject.id === attributedTo ? cents : 1n,
        },
        pgfn_dados_abertos_inscricoes: {
          tipo: "LISTA_TEXTO" as const,
          lista: [`INS-${subject.id}`],
        },
      },
    })),
  });
}

interface Harness {
  readonly debtors: RecordingDebtors;
  readonly observations: RecordingObservations;
  readonly snapshots: RecordingSnapshots;
}

function harness(observations: readonly RawObservation[] = []): Harness {
  return {
    debtors: new RecordingDebtors(DEBTOR),
    observations: new RecordingObservations(observations),
    snapshots: new RecordingSnapshots(),
  };
}

/** The wallet holds no such debtor: every read below it must stay untouched. */
function harnessWithoutDebtor(): Harness {
  return {
    debtors: new RecordingDebtors(null),
    observations: new RecordingObservations(),
    snapshots: new RecordingSnapshots(),
  };
}

async function compose(
  parts: Harness,
  overrides: {
    readonly actions?: WalletGrant["actions"];
    readonly walletId?: string;
  } = {},
): Promise<DossierSnapshot> {
  return composeDossierForDebtor({
    identity: await readingAgent(),
    walletId: overrides.walletId ?? "wallet-a",
    debtorId: DEBTOR.debtorId,
    plan: PLAN,
    authorization: grantedWallet(overrides.actions),
    debtors: parts.debtors,
    observations: parts.observations,
    snapshots: parts.snapshots,
    now: () => new Date("2026-07-31T12:00:00.000Z"),
    newDossierId: () => "dossier-1",
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("authorization precedes every read", () => {
  it("refuses an actor without READ_DOSSIER and reads nothing", async () => {
    const parts = harness();

    await expect(
      compose(parts, { actions: ["READ_ACTIONABLE"] }),
    ).rejects.toThrow("DOSSIE_NAO_AUTORIZADO");

    // Not just "returns nothing": the ports were never touched, so a refusal
    // cannot leak a debtor's existence through timing or through the store.
    expect(parts.debtors.calls).toBe(0);
    expect(parts.observations.calls).toBe(0);
    expect(parts.snapshots.saved).toEqual([]);
  });

  it("refuses a wallet that does not exist for this tenant", async () => {
    const parts = harness();

    await expect(compose(parts, { walletId: "wallet-b" })).rejects.toThrow(
      "DOSSIE_NAO_AUTORIZADO",
    );
    expect(parts.observations.calls).toBe(0);
  });

  it("refuses a debtor the wallet does not contain", async () => {
    // AGENTS.md: a query only ever runs over a CPF present in an imported
    // wallet. Holding a capability for the wallet is not holding it for
    // everyone in the tenant.
    const parts = harnessWithoutDebtor();

    await expect(compose(parts)).rejects.toThrow("DEVEDOR_FORA_DA_CARTEIRA");
    expect(parts.observations.calls).toBe(0);
    expect(parts.snapshots.saved).toEqual([]);
  });

  it("never names the CPF in the refusal it throws", async () => {
    const parts = harnessWithoutDebtor();

    await expect(compose(parts)).rejects.toSatisfy(
      (error: Error) => !error.message.includes(DEBTOR.cpf),
    );
  });
});

describe("composition starts from the plan", () => {
  it("calls a source nobody consulted NAO_CONSULTADO", async () => {
    const parts = harness();
    const snapshot = await compose(parts);

    expect(snapshot.campos.pgfn_dados_abertos_presente.status).toBe(
      "NAO_CONSULTADO",
    );
    expect(snapshot.campos.pgfn_lista_presente.status).toBe("NAO_CONSULTADO");
    expect(snapshot.cobertura.veredito).toBe("DADOS_INSUFICIENTES");
  });

  it("ignores an observation for a slice outside this dossier's plan", async () => {
    // The debtor accumulates observations across plans: an RJ slice read last
    // month is a legitimate stored fact. This dossier declared SP, so RJ is
    // not part of it — and must not blow it up either. The domain still
    // refuses an out-of-plan observation; the point is that it never sees one.
    const parts = harness([
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|RJ" }),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|SP" }),
    ]);

    const snapshot = await compose(parts);

    expect(
      snapshot.cobertura.fontes
        .find((fonte) => fonte.source === "PGFN_DADOS_ABERTOS")
        ?.slices.map((slice) => slice.sliceId),
    ).toEqual(["SIDA|SP", "PREVIDENCIARIO|SP", "FGTS|SP"]);
    expect(snapshot.campos.pgfn_dados_abertos_presente.status).toBe(
      "NAO_CONSULTADO",
    );
  });

  it("refuses an observation the reader returned for another debtor", async () => {
    // The reader is a port; a leaky implementation is exactly what this
    // catches, and it must fail loudly rather than compose someone else in.
    const parts = harness([
      observation({
        source: "PGFN_DADOS_ABERTOS",
        sliceId: "SIDA|SP",
        debtorId: "debtor-b",
      }),
    ]);

    await expect(compose(parts)).rejects.toThrow("OBSERVACAO_DE_OUTRO_TITULAR");
    expect(parts.snapshots.saved).toEqual([]);
  });
});

describe("identity resolution runs per source", () => {
  it("attributes only the record the resolver confirmed", async () => {
    const parts = harness([
      pgfnFound("SIDA|SP", 250_000n, [
        { id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" },
      ]),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "PREVIDENCIARIO|SP" }),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
    ]);

    const snapshot = await compose(parts);
    const campo = snapshot.campos.pgfn_dados_abertos_valor_consolidado;

    expect(campo.vinculoStatus).toBe("CONFIRMADO");
    expect(campo.vinculoConfirmado).toBe(true);
    expect(factValue(campo)).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 250_000n,
    });
  });

  it("carries an ambiguous resolution through without making it a fact", async () => {
    // Two people genuinely share the 4-9 fragment and the name. The mask
    // cannot discriminate and neither can the name, so the answer is refusal.
    const parts = harness([
      pgfnFound("SIDA|SP", 250_000n, [
        { id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" },
        { id: "subject-2", maskedCpf: MASK, name: "JOSE SILVA" },
      ]),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "PREVIDENCIARIO|SP" }),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
    ]);

    const snapshot = await compose(parts);
    const campo = snapshot.campos.pgfn_dados_abertos_valor_consolidado;

    expect(campo.vinculoStatus).toBe("AMBIGUO");
    expect(campo.vinculoConfirmado).toBe(false);
    expect(factValue(campo)).toBeNull();
    // Nor may it become a negative: "nobody" is as much a claim as "someone".
    expect(snapshot.campos.pgfn_dados_abertos_presente.valor).toBeNull();
  });

  it("does not turn one person appearing in two slices into an ambiguity", async () => {
    // The same published person shows up in SIDA and in FGTS. Two slices, one
    // subject: resolving them as two candidates would manufacture a tie
    // between someone and themselves and refuse a match that is not in doubt.
    const subject = { id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" };
    const parts = harness([
      pgfnFound("SIDA|SP", 250_000n, [subject]),
      pgfnFound("FGTS|SP", 90_000n, [subject]),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "PREVIDENCIARIO|SP" }),
    ]);

    const snapshot = await compose(parts);
    const campo = snapshot.campos.pgfn_dados_abertos_valor_consolidado;

    expect(campo.vinculoStatus).toBe("CONFIRMADO");
    expect(factValue(campo)).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 340_000n,
    });
  });

  it("does not attribute a record whose mask fits another CPF", async () => {
    const parts = harness([
      pgfnFound("SIDA|SP", 250_000n, [
        { id: "subject-9", maskedCpf: "***111222**", name: "JOSE SILVA" },
      ]),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "PREVIDENCIARIO|SP" }),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
    ]);

    const snapshot = await compose(parts);

    expect(
      snapshot.campos.pgfn_dados_abertos_valor_consolidado.vinculoStatus,
    ).toBe("SEM_CANDIDATO");
    expect(
      snapshot.campos.pgfn_dados_abertos_valor_consolidado.valor,
    ).toBeNull();
  });

  it("resolves each source separately, from its own subjects", async () => {
    const parts = harness([
      pgfnFound("SIDA|SP", 250_000n, [
        { id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" },
      ]),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "PREVIDENCIARIO|SP" }),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
      observation({
        source: "PGFN_LISTA_DEVEDORES_MANUAL",
        sliceId: "LISTA_MANUAL",
        status: "ENCONTRADO",
        subjects: [
          { id: "lista-1", maskedCpf: MASK, name: "JOSE SILVA SANTOS SOUZA" },
        ],
        records: [
          {
            subjectId: "lista-1",
            values: {
              pgfn_lista_valor_total: {
                tipo: "MONETARIO_CENTAVOS",
                centavos: 999n,
              },
            },
          },
        ],
      }),
    ]);

    const snapshot = await compose(parts);

    // Dados Abertos confirmed; the list holds a longer name that the
    // completeness gate refuses. One source's answer never colours the other.
    expect(
      snapshot.campos.pgfn_dados_abertos_valor_consolidado.vinculoStatus,
    ).toBe("CONFIRMADO");
    expect(snapshot.campos.pgfn_lista_valor_total.vinculoStatus).toBe(
      "REJEITADO",
    );
    expect(snapshot.campos.pgfn_lista_valor_total.valor).toBeNull();
  });
});

describe("what the snapshot records about itself", () => {
  it("records the resolver version behind its links", async () => {
    const parts = harness([
      pgfnFound("SIDA|SP", 250_000n, [
        { id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" },
      ]),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "PREVIDENCIARIO|SP" }),
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
    ]);

    const snapshot = await compose(parts);

    expect(snapshot.resolverVersion).toBe("2026-07-A");
  });

  it("leaves the resolver version null when no source was consulted", async () => {
    const snapshot = await compose(harness());

    expect(snapshot.resolverVersion).toBeNull();
  });

  it("dates the dossier at composition, not at collection", async () => {
    const parts = harness([
      observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|SP" }),
    ]);

    const snapshot = await compose(parts);

    expect(snapshot.composedAt).toBe("2026-07-31T12:00:00.000Z");
    expect(snapshot.campos.pgfn_dados_abertos_presente.coletadoEm).toBe(
      "2026-07-20T00:00:00.000Z",
    );
  });

  it("saves exactly the snapshot it returns, and only once", async () => {
    const parts = harness();
    const snapshot = await compose(parts);

    expect(parts.snapshots.saved).toHaveLength(1);
    expect(parts.snapshots.saved[0]).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("carries the tenant of the verified principal, not of the request", async () => {
    const snapshot = await compose(harness());

    expect(snapshot.tenantId).toBe("tenant-a");
    expect(snapshot.debtorId).toBe("debtor-a");
    expect(snapshot.planVersion).toBe(PLAN.planVersion);
  });
});
