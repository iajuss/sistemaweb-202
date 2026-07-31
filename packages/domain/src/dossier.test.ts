import { describe, expect, it } from "vitest";

import {
  absenceEstablished,
  assertDossierFactDiscipline,
  composeDossier,
  factValue,
  recordSupersession,
  supersededBy,
  type ComposeDossierInput,
  type DossierFieldEnvelope,
  type DossierSnapshot,
} from "./dossier.js";
import { resolveIdentity, type IdentityResolution } from "./identity/resolver.js";
import {
  sourcePlanForUfs,
  type RawObservation,
  type SourceName,
} from "./observation.js";

/**
 * The wallet debtor every case below is about. The CPF is synthetic and the
 * published masks are derived from it by hand, so the expected resolution of
 * each case can be checked without running the matcher.
 */
const DEBTOR = { name: "JOSE SILVA", cpf: "52998224725" } as const;
const MASK = "***982247**";
const OTHER_MASK = "***111222**";

const PLAN = sourcePlanForUfs(["SP"]);

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
    queryParams: {},
    subjects: [],
    records: [],
    ...overrides,
  };
}

function pgfnFound(
  sliceId: string,
  cents: bigint,
  inscription: string,
  subjectName = "JOSE SILVA",
  maskedCpf = MASK,
): RawObservation {
  return observation({
    source: "PGFN_DADOS_ABERTOS",
    sliceId,
    status: "ENCONTRADO",
    subjects: [{ id: "subject-1", maskedCpf, name: subjectName }],
    records: [
      {
        subjectId: "subject-1",
        values: {
          pgfn_dados_abertos_valor_consolidado: {
            tipo: "MONETARIO_CENTAVOS",
            centavos: cents,
          },
          pgfn_dados_abertos_inscricoes: {
            tipo: "LISTA_TEXTO",
            lista: [inscription],
          },
        },
      },
    ],
  });
}

function walletObservation(cents: bigint): RawObservation {
  return observation({
    source: "CARTEIRA_CLIENTE",
    sliceId: "CARTEIRA",
    status: "ENCONTRADO",
    collectedAt: "2026-07-25T00:00:00.000Z",
    referenceDate: null,
    subjects: [{ id: "debtor-a", maskedCpf: MASK, name: DEBTOR.name }],
    records: [
      {
        subjectId: "debtor-a",
        values: {
          carteira_valor_em_aberto: {
            tipo: "MONETARIO_CENTAVOS",
            centavos: cents,
          },
          carteira_titulos: { tipo: "LISTA_TEXTO", lista: ["TIT-1"] },
        },
      },
    ],
  });
}

function resolutionFor(records: readonly { id: string; maskedCpf: string; name: string }[]) {
  return resolveIdentity(DEBTOR, records);
}

const CONFIRMED = resolutionFor([
  { id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" },
]);

function compose(
  overrides: Partial<ComposeDossierInput> = {},
): DossierSnapshot {
  return composeDossier({
    dossierId: "dossier-1",
    tenantId: "tenant-a",
    debtorId: "debtor-a",
    composedAt: "2026-07-31T12:00:00.000Z",
    plan: PLAN,
    observations: [],
    resolutions: {},
    ...overrides,
  });
}

describe("dossier composition starts from the plan", () => {
  it("reports every declared field even when nothing was observed", () => {
    const snapshot = compose();
    const declared = PLAN.sources.flatMap((source) =>
      source.fields.map((field) => field.key),
    );

    expect(Object.keys(snapshot.campos).sort()).toEqual([...declared].sort());
  });

  it("calls an unobserved slice NAO_CONSULTADO, never NAO_ENCONTRADO", () => {
    const statuses = Object.values(compose().campos).map(
      (envelope) => envelope.status,
    );

    expect(new Set(statuses)).toEqual(new Set(["NAO_CONSULTADO"]));
  });

  it("keeps a partially covered source out of NAO_ENCONTRADO", () => {
    const snapshot = compose({
      observations: [
        observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|SP" }),
        observation({
          source: "PGFN_DADOS_ABERTOS",
          sliceId: "PREVIDENCIARIO|SP",
        }),
      ],
    });

    expect(snapshot.campos.pgfn_dados_abertos_presente.status).toBe(
      "NAO_CONSULTADO",
    );
  });

  it("answers NAO_ENCONTRADO only when every declared slice was read", () => {
    const snapshot = compose({
      observations: [
        observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|SP" }),
        observation({
          source: "PGFN_DADOS_ABERTOS",
          sliceId: "PREVIDENCIARIO|SP",
        }),
        observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
      ],
      resolutions: { PGFN_DADOS_ABERTOS: resolutionFor([]) },
    });

    expect(snapshot.campos.pgfn_dados_abertos_presente.status).toBe(
      "NAO_ENCONTRADO",
    );
    expect(snapshot.campos.pgfn_dados_abertos_presente.valor).toEqual({
      tipo: "BOOLEANO",
      booleano: false,
    });
  });

  it("refuses an observation for a slice the plan never declared", () => {
    expect(() =>
      compose({
        observations: [
          observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|RJ" }),
        ],
      }),
    ).toThrow("OBSERVACAO_FORA_DO_PLANO");
  });

  it("refuses an observation belonging to another tenant", () => {
    expect(() =>
      compose({
        observations: [
          observation({
            source: "PGFN_DADOS_ABERTOS",
            sliceId: "SIDA|SP",
            tenantId: "tenant-b",
          }),
        ],
      }),
    ).toThrow("OBSERVACAO_DE_OUTRO_TENANT");
  });

  it("refuses an observation about another debtor", () => {
    expect(() =>
      compose({
        observations: [
          observation({
            source: "PGFN_DADOS_ABERTOS",
            sliceId: "SIDA|SP",
            debtorId: "debtor-b",
          }),
        ],
      }),
    ).toThrow("OBSERVACAO_DE_OUTRO_TITULAR");
  });

  it("refuses two observations for the same slice", () => {
    expect(() =>
      compose({
        observations: [
          observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|SP" }),
          observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|SP" }),
        ],
      }),
    ).toThrow("OBSERVACAO_DUPLICADA_PARA_SLICE");
  });

  it("refuses a record carrying a field the plan never declared", () => {
    const smuggled = pgfnFound("SIDA|SP", 1000n, "INS-1");
    expect(() =>
      compose({
        observations: [
          {
            ...smuggled,
            records: [
              {
                subjectId: "subject-1",
                values: {
                  ...smuggled.records[0].values,
                  score_secreto: { tipo: "TEXTO", texto: "A" },
                },
              },
            ],
          },
        ],
        resolutions: { PGFN_DADOS_ABERTOS: CONFIRMED },
      }),
    ).toThrow("CAMPO_NAO_DECLARADO_NO_PLANO");
  });

  it("refuses to compose a source that answered without an identity resolution", () => {
    expect(() =>
      compose({ observations: [pgfnFound("SIDA|SP", 1000n, "INS-1")] }),
    ).toThrow("RESOLUCAO_DE_IDENTIDADE_AUSENTE");
  });
});

describe("only CONFIRMADO is a fact", () => {
  it("marks a confirmed link as fact and sums its records", () => {
    const snapshot = compose({
      observations: [
        pgfnFound("SIDA|SP", 1000n, "INS-1"),
        pgfnFound("PREVIDENCIARIO|SP", 2500n, "INS-2"),
        observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
      ],
      resolutions: { PGFN_DADOS_ABERTOS: CONFIRMED },
    });

    const envelope = snapshot.campos.pgfn_dados_abertos_valor_consolidado;
    expect(envelope.vinculoStatus).toBe("CONFIRMADO");
    expect(envelope.vinculoConfirmado).toBe(true);
    expect(envelope.valor).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 3500n,
    });
    expect(factValue(envelope)).toEqual(envelope.valor);
  });

  it("carries a PROVAVEL link through without making it a fact", () => {
    // "JOSE DA SILVA SANTOS" against wallet "JOSE SILVA": four published
    // tokens, two matched, completude 0.5 fails the gate outright, so the
    // resolution used here is built to land on PROVAVEL by hand instead.
    const provavel: IdentityResolution = {
      ...CONFIRMED,
      status: "PROVAVEL",
      confidence: 0.8,
      isFact: false,
    };

    const snapshot = compose({
      observations: [pgfnFound("SIDA|SP", 1000n, "INS-1")],
      resolutions: { PGFN_DADOS_ABERTOS: provavel },
    });

    const envelope = snapshot.campos.pgfn_dados_abertos_valor_consolidado;
    expect(envelope.valor).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 1000n,
    });
    expect(envelope.vinculoStatus).toBe("PROVAVEL");
    expect(envelope.vinculoConfirmado).toBe(false);
    expect(factValue(envelope)).toBeNull();
  });

  it("ignores a forged isFact on a link that is not CONFIRMADO", () => {
    const forged: IdentityResolution = {
      ...CONFIRMED,
      status: "PROVAVEL",
      isFact: true,
    };

    const snapshot = compose({
      observations: [pgfnFound("SIDA|SP", 1000n, "INS-1")],
      resolutions: { PGFN_DADOS_ABERTOS: forged },
    });

    expect(
      snapshot.campos.pgfn_dados_abertos_valor_consolidado.vinculoConfirmado,
    ).toBe(false);
  });

  it("attributes nothing when the resolver abstained", () => {
    const ambiguous = resolutionFor([
      { id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" },
      { id: "subject-2", maskedCpf: MASK, name: "JOSE SILVA" },
    ]);
    expect(ambiguous.status).toBe("AMBIGUO");

    const snapshot = compose({
      observations: [pgfnFound("SIDA|SP", 1000n, "INS-1")],
      resolutions: { PGFN_DADOS_ABERTOS: ambiguous },
    });

    const envelope = snapshot.campos.pgfn_dados_abertos_valor_consolidado;
    // The source answered — that stays true. Who it answered about is what the
    // resolver refused to say, so the value is absent, not zero and not false.
    expect(envelope.status).toBe("ENCONTRADO");
    expect(envelope.valor).toBeNull();
    expect(envelope.vinculoStatus).toBe("AMBIGUO");
    expect(envelope.vinculoConfirmado).toBe(false);
    expect(snapshot.campos.pgfn_dados_abertos_presente.valor).toBeNull();
  });

  it("never reports zero for a debtor with no attributed record", () => {
    const snapshot = compose({
      observations: [
        observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|SP" }),
        observation({
          source: "PGFN_DADOS_ABERTOS",
          sliceId: "PREVIDENCIARIO|SP",
        }),
        observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
      ],
      resolutions: { PGFN_DADOS_ABERTOS: resolutionFor([]) },
    });

    expect(snapshot.campos.pgfn_dados_abertos_valor_consolidado.valor).toBeNull();
  });

  it("rejects a snapshot claiming a fact under an unconfirmed link", () => {
    const snapshot = compose({
      observations: [pgfnFound("SIDA|SP", 1000n, "INS-1")],
      resolutions: { PGFN_DADOS_ABERTOS: CONFIRMED },
    });

    const loosened = {
      ...snapshot,
      campos: {
        ...snapshot.campos,
        pgfn_dados_abertos_valor_consolidado: {
          ...snapshot.campos.pgfn_dados_abertos_valor_consolidado,
          vinculoStatus: "PROVAVEL" as const,
        },
      },
    };

    expect(() => assertDossierFactDiscipline(loosened)).toThrow(
      "VINCULO_NAO_CONFIRMADO_MARCADO_COMO_FATO",
    );
  });

  it("treats a wallet field as declared by the client, not resolved", () => {
    const snapshot = compose({
      observations: [walletObservation(50_000n)],
    });

    const envelope = snapshot.campos.carteira_valor_em_aberto;
    expect(envelope.vinculoStatus).toBe("NAO_APLICAVEL");
    expect(envelope.vinculoConfirmado).toBe(true);
    expect(envelope.confiancaVinculo).toBe(1);
    expect(envelope.evidenciaVinculo).toEqual(["fornecido_pelo_cliente"]);
  });
});

describe("coverage is a verdict, not a score", () => {
  function fullyCovered(
    pgfnStatus: RawObservation["status"] = "NAO_ENCONTRADO",
  ): ComposeDossierInput["observations"] {
    return [
      walletObservation(50_000n),
      observation({
        source: "PGFN_DADOS_ABERTOS",
        sliceId: "SIDA|SP",
        status: pgfnStatus,
      }),
      observation({
        source: "PGFN_DADOS_ABERTOS",
        sliceId: "PREVIDENCIARIO|SP",
        status: pgfnStatus,
      }),
      observation({
        source: "PGFN_DADOS_ABERTOS",
        sliceId: "FGTS|SP",
        status: pgfnStatus,
      }),
    ];
  }

  it("is sufficient when every required source concluded", () => {
    const snapshot = compose({
      observations: fullyCovered(),
      resolutions: { PGFN_DADOS_ABERTOS: resolutionFor([]) },
    });

    expect(snapshot.cobertura.veredito).toBe("SUFICIENTE");
  });

  it("returns DADOS_INSUFICIENTES rather than a lower number", () => {
    const snapshot = compose({
      observations: fullyCovered("ERRO_NA_FONTE"),
      resolutions: { PGFN_DADOS_ABERTOS: resolutionFor([]) },
    });

    expect(snapshot.cobertura.veredito).toBe("DADOS_INSUFICIENTES");
    // The proportion is reported for the explanation; it is never what decides.
    expect(snapshot.cobertura.proporcao).toBe(0.2);
    expect(snapshot.cobertura.fontesObrigatoriasInconclusivas).toEqual([
      "PGFN_DADOS_ABERTOS",
    ]);
  });

  it("stays insufficient even when most slices concluded", () => {
    const snapshot = compose({
      observations: [
        walletObservation(50_000n),
        observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "SIDA|SP" }),
        observation({
          source: "PGFN_DADOS_ABERTOS",
          sliceId: "PREVIDENCIARIO|SP",
        }),
      ],
    });

    expect(snapshot.cobertura.proporcao).toBeGreaterThanOrEqual(0.6);
    expect(snapshot.cobertura.veredito).toBe("DADOS_INSUFICIENTES");
  });

  it("returns DADOS_INSUFICIENTES when every source errored", () => {
    const snapshot = compose({
      observations: [
        observation({
          source: "CARTEIRA_CLIENTE",
          sliceId: "CARTEIRA",
          status: "ERRO_NA_FONTE",
        }),
        observation({
          source: "PGFN_DADOS_ABERTOS",
          sliceId: "SIDA|SP",
          status: "ERRO_NA_FONTE",
        }),
        observation({
          source: "PGFN_LISTA_DEVEDORES_MANUAL",
          sliceId: "LISTA_MANUAL",
          status: "ERRO_NA_FONTE",
        }),
      ],
    });

    expect(snapshot.cobertura.veredito).toBe("DADOS_INSUFICIENTES");
  });

  it("does not let an optional source decide the verdict", () => {
    const snapshot = compose({
      observations: fullyCovered(),
      resolutions: { PGFN_DADOS_ABERTOS: resolutionFor([]) },
    });

    const manual = snapshot.cobertura.fontes.find(
      (source) => source.source === "PGFN_LISTA_DEVEDORES_MANUAL",
    );
    expect(manual?.obrigatoria).toBe(false);
    expect(manual?.status).toBe("NAO_CONSULTADO");
    expect(snapshot.cobertura.veredito).toBe("SUFICIENTE");
  });
});

describe("the snapshot embeds what it says", () => {
  it("keeps its values after the observation it came from is emptied", () => {
    const source = pgfnFound("SIDA|SP", 1000n, "INS-1");
    const observations: RawObservation[] = [source];
    const snapshot = compose({
      observations,
      resolutions: { PGFN_DADOS_ABERTOS: CONFIRMED },
    });

    // Purge, as the retention job will do it: the observation disappears and
    // the values inside it are scribbled over. The snapshot embedded copies at
    // composition, so none of this can reach it.
    const smuggled = source.records[0].values
      .pgfn_dados_abertos_inscricoes as unknown as { lista: string[] };
    smuggled.lista.push("INS-FORJADA");
    (source as { records: unknown }).records = [];
    observations.length = 0;

    expect(snapshot.campos.pgfn_dados_abertos_valor_consolidado.valor).toEqual({
      tipo: "MONETARIO_CENTAVOS",
      centavos: 1000n,
    });
    expect(snapshot.campos.pgfn_dados_abertos_inscricoes.valor).toEqual({
      tipo: "LISTA_TEXTO",
      lista: ["INS-1"],
    });
  });

  it("cannot be edited in place", () => {
    const snapshot = compose();
    expect(() => {
      (snapshot as { composedAt: string }).composedAt = "2000-01-01T00:00:00.000Z";
    }).toThrow(TypeError);
    expect(() => {
      (snapshot.campos as Record<string, unknown>).novo = {};
    }).toThrow(TypeError);
  });

  it("dates the dossier at composition and each field at collection", () => {
    const snapshot = compose({
      observations: [walletObservation(50_000n)],
    });

    expect(snapshot.composedAt).toBe("2026-07-31T12:00:00.000Z");
    expect(snapshot.campos.carteira_valor_em_aberto.coletadoEm).toBe(
      "2026-07-25T00:00:00.000Z",
    );
    expect(snapshot.campos.pgfn_dados_abertos_presente.coletadoEm).toBeNull();
  });

  it("dates a multi-slice field at its stalest input", () => {
    const snapshot = compose({
      observations: [
        {
          ...pgfnFound("SIDA|SP", 1000n, "INS-1"),
          collectedAt: "2026-07-10T00:00:00.000Z",
        },
        {
          ...pgfnFound("PREVIDENCIARIO|SP", 500n, "INS-2"),
          collectedAt: "2026-07-20T00:00:00.000Z",
        },
      ],
      resolutions: { PGFN_DADOS_ABERTOS: CONFIRMED },
    });

    expect(
      snapshot.campos.pgfn_dados_abertos_valor_consolidado.coletadoEm,
    ).toBe("2026-07-10T00:00:00.000Z");
  });

  it("leaves coletado_em null only where nothing was collected", () => {
    const snapshot = compose({
      observations: [walletObservation(50_000n)],
    });

    for (const envelope of Object.values(snapshot.campos)) {
      if (envelope.coletadoEm === null) {
        expect(envelope.status).toBe("NAO_CONSULTADO");
      }
    }
  });
});

describe("resolver version and supersession", () => {
  it("records the resolver version that produced the links", () => {
    const snapshot = compose({
      observations: [pgfnFound("SIDA|SP", 1000n, "INS-1")],
      resolutions: { PGFN_DADOS_ABERTOS: CONFIRMED },
    });

    expect(snapshot.resolverVersion).toBe(CONFIRMED.policyVersion);
  });

  it("refuses to compose links produced by two resolver versions", () => {
    expect(() =>
      compose({
        observations: [
          pgfnFound("SIDA|SP", 1000n, "INS-1"),
          observation({
            source: "PGFN_LISTA_DEVEDORES_MANUAL",
            sliceId: "LISTA_MANUAL",
            status: "ENCONTRADO",
            subjects: [{ id: "s", maskedCpf: MASK, name: "JOSE SILVA" }],
            records: [],
          }),
        ],
        resolutions: {
          PGFN_DADOS_ABERTOS: CONFIRMED,
          PGFN_LISTA_DEVEDORES_MANUAL: {
            ...CONFIRMED,
            policyVersion: "2026-99-Z",
          },
        },
      }),
    ).toThrow("VERSOES_DE_RESOLVER_DIVERGENTES");
  });

  it("leaves the resolver version null only when nothing was resolved", () => {
    const snapshot = compose({ observations: [walletObservation(1n)] });
    expect(snapshot.resolverVersion).toBeNull();
  });

  it("corrects by supersession and never by editing", () => {
    const original = compose({
      observations: [pgfnFound("SIDA|SP", 1000n, "INS-1")],
      resolutions: { PGFN_DADOS_ABERTOS: CONFIRMED },
    });
    const corrected = compose({
      dossierId: "dossier-2",
      composedAt: "2026-07-31T18:00:00.000Z",
      observations: [pgfnFound("SIDA|SP", 2000n, "INS-1")],
      resolutions: { PGFN_DADOS_ABERTOS: CONFIRMED },
      supersedes: original.dossierId,
    });

    const links = recordSupersession([], {
      predecessorId: original.dossierId,
      successorId: corrected.dossierId,
      reason: "IDENTIDADE_CORRIGIDA",
      recordedAt: "2026-07-31T18:00:00.000Z",
    });

    expect(corrected.supersedes).toBe("dossier-1");
    expect(supersededBy("dossier-1", links)).toBe("dossier-2");
    expect(supersededBy("dossier-2", links)).toBeNull();
    expect(
      original.campos.pgfn_dados_abertos_valor_consolidado.valor,
    ).toEqual({ tipo: "MONETARIO_CENTAVOS", centavos: 1000n });
  });

  it("refuses a second successor for the same dossier", () => {
    const links = recordSupersession([], {
      predecessorId: "dossier-1",
      successorId: "dossier-2",
      reason: "IDENTIDADE_CORRIGIDA",
      recordedAt: "2026-07-31T18:00:00.000Z",
    });

    expect(() =>
      recordSupersession(links, {
        predecessorId: "dossier-1",
        successorId: "dossier-3",
        reason: "OUTRA",
        recordedAt: "2026-07-31T19:00:00.000Z",
      }),
    ).toThrow("DOSSIE_JA_SUPERSEDIDO");
  });

  it("refuses a supersession that points at itself", () => {
    expect(() =>
      recordSupersession([], {
        predecessorId: "dossier-1",
        successorId: "dossier-1",
        reason: "OUTRA",
        recordedAt: "2026-07-31T19:00:00.000Z",
      }),
    ).toThrow("SUPERSESSAO_CIRCULAR");
  });
});

describe("published subjects", () => {
  it("does not attribute a record whose mask fits another CPF", () => {
    const resolution = resolutionFor([
      { id: "subject-1", maskedCpf: OTHER_MASK, name: "JOSE SILVA" },
    ]);
    expect(resolution.status).toBe("SEM_CANDIDATO");

    const snapshot = compose({
      observations: [
        pgfnFound("SIDA|SP", 1000n, "INS-1", "JOSE SILVA", OTHER_MASK),
        observation({
          source: "PGFN_DADOS_ABERTOS",
          sliceId: "PREVIDENCIARIO|SP",
        }),
        observation({ source: "PGFN_DADOS_ABERTOS", sliceId: "FGTS|SP" }),
      ],
      resolutions: { PGFN_DADOS_ABERTOS: resolution },
    });

    expect(snapshot.campos.pgfn_dados_abertos_valor_consolidado.valor).toBeNull();
    expect(snapshot.campos.pgfn_dados_abertos_presente.valor).toEqual({
      tipo: "BOOLEANO",
      booleano: false,
    });
  });
});

/**
 * `absenceEstablished` is a read-boundary function: it is handed envelopes
 * that composition produced *and* envelopes that arrived from storage or from
 * an older schema, which nothing vouched for. The cases below are hand-built
 * for that reason — composition cannot produce the forged combinations, and a
 * guard that only sees well-formed input is a guard no test can fail.
 */
describe("absenceEstablished", () => {
  const envelope = (
    overrides: Partial<DossierFieldEnvelope>,
  ): DossierFieldEnvelope => ({
    campo: "pgfn_lista_presente",
    fonte: "PGFN_LISTA_DEVEDORES_MANUAL",
    slices: ["LISTA_MANUAL"],
    parametrosConsulta: {},
    status: "ENCONTRADO",
    valor: { tipo: "BOOLEANO", booleano: false },
    coletadoEm: "2026-07-27T00:00:00.000Z",
    dataReferencia: null,
    vinculoStatus: "REJEITADO",
    vinculoConfirmado: false,
    confiancaVinculo: 0,
    evidenciaVinculo: [],
    ...overrides,
  });

  it("calls a refused link absence, even though the source answered ENCONTRADO", () => {
    // Rows came back and the resolver refused every one of them. The person is
    // not there; the source state alone would say the opposite.
    expect(absenceEstablished(envelope({}))).toBe(true);
  });

  it("calls an empty answer absence", () => {
    expect(
      absenceEstablished(
        envelope({ status: "NAO_ENCONTRADO", vinculoStatus: "NAO_RESOLVIDO" }),
      ),
    ).toBe(true);
  });

  it.each(["AMBIGUO", "PROVAVEL", "POSSIVEL", "DESCONHECIDO"] as const)(
    "refuses to read a %s link as absence even when the value says so",
    (vinculoStatus) => {
      // Composition never produces this pair; a stored or upcast snapshot can.
      // Doubt is silence, and silence is not absence.
      expect(absenceEstablished(envelope({ vinculoStatus }))).toBe(false);
    },
  );

  it("is not absence when the person is present", () => {
    expect(
      absenceEstablished(
        envelope({
          valor: { tipo: "BOOLEANO", booleano: true },
          vinculoStatus: "CONFIRMADO",
          vinculoConfirmado: true,
        }),
      ),
    ).toBe(false);
  });

  it("is not absence when nothing was concluded at all", () => {
    expect(
      absenceEstablished(
        envelope({
          status: "NAO_CONSULTADO",
          valor: null,
          vinculoStatus: "NAO_RESOLVIDO",
        }),
      ),
    ).toBe(false);
  });
});
