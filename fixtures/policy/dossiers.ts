// Relative, not `@panella/domain`: this directory is outside every workspace
// package, so the alias does not resolve here.
import {
  composeDossier,
  resolveIdentity,
  sourcePlanForUfs,
  type DossierSnapshot,
  type IdentityResolution,
  type RawObservation,
  type SourceName,
  type SourceStatus,
} from "../../packages/domain/src/index.js";

/**
 * Dossiers for the policy tests, built through the real `composeDossier`
 * rather than hand-written objects. A fixture that skips composition can claim
 * a field combination composition would never produce — an `AMBIGUO` link
 * sitting next to an attributed value, say — and the policy would then be
 * tested against a dossier that cannot exist.
 */

const DEBTOR = { name: "JOSE SILVA", cpf: "52998224725" } as const;
const MASK = "***982247**";
const OTHER_MASK = "***111222**";

export const POLICY_PLAN = sourcePlanForUfs(["SP"]);

/**
 * Link strengths, each produced by feeding the real resolver a published name
 * chosen so the hand-calculated score lands in the intended band:
 *
 * - `CONFIRMADO`: identical name, 1.0.
 * - `PROVAVEL`: "JOSE ALVES SILVA" — all tokens present 0.25, first 0.25,
 *   last 0.20, order 0.05, completeness 0.25 × 2/3 = 0.1667. Total 0.9167,
 *   above 0.75 and below 0.95.
 * - `AMBIGUO`: two records sharing the mask and the name, so the margin
 *   cannot separate them.
 * - `REJEITADO`: a record sharing the mask whose name the resolver refuses —
 *   completeness 2/6 fails the gate. This is the state the real demo produces:
 *   the source returned rows and none of them is this person.
 * - `SEM_CANDIDATO`: the mask fits another CPF.
 */
export type LinkStrength =
  | "CONFIRMADO"
  | "PROVAVEL"
  | "AMBIGUO"
  | "REJEITADO"
  | "SEM_CANDIDATO";

const PUBLISHED_BY_STRENGTH: Record<
  LinkStrength,
  readonly { id: string; maskedCpf: string; name: string }[]
> = {
  CONFIRMADO: [{ id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" }],
  PROVAVEL: [{ id: "subject-1", maskedCpf: MASK, name: "JOSE ALVES SILVA" }],
  AMBIGUO: [
    { id: "subject-1", maskedCpf: MASK, name: "JOSE SILVA" },
    { id: "subject-2", maskedCpf: MASK, name: "JOSE SILVA" },
  ],
  REJEITADO: [
    // The documented trap, verbatim: the source matches tokens with no notion
    // of position, so a two-token query is absorbed into a six-token name.
    {
      id: "subject-7",
      maskedCpf: MASK,
      name: "MARIA JOSE ALVES PEREIRA SOARES SILVA",
    },
  ],
  SEM_CANDIDATO: [
    { id: "subject-9", maskedCpf: OTHER_MASK, name: "JOSE SILVA" },
  ],
};

function resolutionFor(strength: LinkStrength): IdentityResolution {
  return resolveIdentity(DEBTOR, PUBLISHED_BY_STRENGTH[strength]);
}

interface SourceSpec {
  readonly status: SourceStatus;
  readonly link?: LinkStrength;
  readonly cents?: bigint;
  /** Only a full-scope export may let absence mean absence (ADR 014). */
  readonly escopoCompleto?: boolean;
}

export interface DossierSpec {
  readonly dossierId?: string;
  readonly carteira?: { readonly cents: bigint; readonly titulos: number };
  readonly dadosAbertos?: SourceSpec;
  readonly lista?: SourceSpec;
}

const OPEN_DATA_SLICES = ["SIDA|SP", "PREVIDENCIARIO|SP", "FGTS|SP"] as const;

function base(
  source: SourceName,
  sliceId: string,
  status: SourceStatus,
  queryParams: Readonly<Record<string, unknown>> = {},
): RawObservation {
  return {
    id: `${source}-${sliceId}`,
    tenantId: "tenant-a",
    debtorId: "debtor-a",
    source,
    sliceId,
    status,
    collectedAt: "2026-07-20T00:00:00.000Z",
    referenceDate: "2026-06-30T00:00:00.000Z",
    queryParams,
    subjects: [],
    records: [],
  };
}

export function dossierFrom(spec: DossierSpec): DossierSnapshot {
  const observations: RawObservation[] = [];
  const resolutions: Partial<Record<SourceName, IdentityResolution>> = {};

  if (spec.carteira) {
    observations.push({
      ...base("CARTEIRA_CLIENTE", "CARTEIRA", "ENCONTRADO"),
      collectedAt: "2026-07-25T00:00:00.000Z",
      referenceDate: null,
      subjects: [{ id: "debtor-a", maskedCpf: MASK, name: DEBTOR.name }],
      records: [
        {
          subjectId: "debtor-a",
          values: {
            carteira_valor_em_aberto: {
              tipo: "MONETARIO_CENTAVOS",
              centavos: spec.carteira.cents,
            },
            carteira_titulos: {
              tipo: "LISTA_TEXTO",
              lista: Array.from(
                { length: spec.carteira.titulos },
                (_unused, index) => `TIT-${index + 1}`,
              ),
            },
          },
        },
      ],
    });
  }

  if (spec.dadosAbertos) {
    const { status, link, cents } = spec.dadosAbertos;
    const subjects =
      status === "ENCONTRADO" && link
        ? PUBLISHED_BY_STRENGTH[link].map((record) => ({ ...record }))
        : [];

    for (const sliceId of OPEN_DATA_SLICES) {
      const observation = base("PGFN_DADOS_ABERTOS", sliceId, status, {
        uf: "SP",
      });
      observations.push(
        sliceId === OPEN_DATA_SLICES[0] && subjects.length > 0
          ? {
              ...observation,
              subjects,
              records: subjects.map((subject) => ({
                subjectId: subject.id,
                values: {
                  pgfn_dados_abertos_valor_consolidado: {
                    tipo: "MONETARIO_CENTAVOS" as const,
                    centavos: cents ?? 100_000n,
                  },
                  pgfn_dados_abertos_inscricoes: {
                    tipo: "LISTA_TEXTO" as const,
                    lista: [`INS-${subject.id}`],
                  },
                },
              })),
            }
          : observation,
      );
    }

    if (link) {
      resolutions.PGFN_DADOS_ABERTOS = resolutionFor(link);
    }
  }

  if (spec.lista) {
    const { status, link, cents, escopoCompleto } = spec.lista;
    const subjects =
      status === "ENCONTRADO" && link
        ? PUBLISHED_BY_STRENGTH[link].map((record) => ({ ...record }))
        : [];

    observations.push({
      ...base("PGFN_LISTA_DEVEDORES_MANUAL", "LISTA_MANUAL", status, {
        // The same key the real projection writes. When the two drifted apart
        // the policy read a field production never produced, and the scope
        // gate was dead in a way no fixture could show.
        escopoCompleto: escopoCompleto === true,
      }),
      subjects,
      records: subjects.map((subject) => ({
        subjectId: subject.id,
        values: {
          pgfn_lista_valor_total: {
            tipo: "MONETARIO_CENTAVOS" as const,
            centavos: cents ?? 100_000n,
          },
          pgfn_lista_valor_selecionado: {
            tipo: "MONETARIO_CENTAVOS" as const,
            centavos: cents ?? 100_000n,
          },
        },
      })),
    });

    if (link) {
      resolutions.PGFN_LISTA_DEVEDORES_MANUAL = resolutionFor(link);
    }
  }

  return composeDossier({
    dossierId: spec.dossierId ?? "dossier-1",
    tenantId: "tenant-a",
    debtorId: "debtor-a",
    composedAt: "2026-07-31T12:00:00.000Z",
    plan: POLICY_PLAN,
    observations,
    resolutions,
  });
}

/** Every declared slice read, so absence is allowed to mean absence. */
export const COBERTURA_COMPLETA = {
  carteira: { cents: 1_000_000n, titulos: 1 },
  dadosAbertos: { status: "NAO_ENCONTRADO" as const },
  lista: { status: "NAO_ENCONTRADO" as const },
} satisfies DossierSpec;
