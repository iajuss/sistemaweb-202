import type { IdentityResolution } from "./identity/resolver.js";
import type {
  FieldValue,
  LinkMode,
  PlannedField,
  PlannedSource,
  RawObservation,
  SourceName,
  SourcePlan,
} from "./observation.js";
import type { SourceStatus } from "./source-status.js";

/**
 * Dossier — the second of the three layers of ADR 004. A composition of
 * observations at one instant, with the identity resolution that tied them to
 * a debtor.
 *
 * Two properties carry the weight here.
 *
 * **Composition starts from the plan, never from what was found.** A source or
 * slice that was declared and produced nothing is `NAO_CONSULTADO`. The only
 * thing that may say `NAO_ENCONTRADO` is a slice that was actually read and
 * came back empty. Deriving the field list from the observations would silently
 * turn a worker that never ran into a debtor with a clean record.
 *
 * **Only `CONFIRMADO` is a fact.** `PROVAVEL`, `POSSIVEL` and `AMBIGUO` cross
 * composition and reach the classifier, but they cross as evidence:
 * `vinculoConfirmado` is derived from the resolution *status*, never from a
 * caller-supplied `isFact`, and `factValue` refuses to hand back anything the
 * link did not confirm.
 */

export const DOSSIER_SCHEMA_VERSION = "2.0.0";

export type LinkStatus =
  | IdentityResolution["status"]
  | "NAO_APLICAVEL"
  | "NAO_RESOLVIDO"
  /** Only a snapshot upcast from schema v1, which never recorded the link. */
  | "DESCONHECIDO";

export interface DossierFieldEnvelope {
  readonly campo: string;
  readonly fonte: SourceName;
  readonly slices: readonly string[];
  readonly parametrosConsulta: Readonly<Record<string, unknown>>;
  readonly status: SourceStatus;
  readonly valor: FieldValue | null;
  /** Null only where nothing was collected, which means `NAO_CONSULTADO`. */
  readonly coletadoEm: string | null;
  readonly dataReferencia: string | null;
  readonly vinculoStatus: LinkStatus;
  readonly vinculoConfirmado: boolean;
  readonly confiancaVinculo: number;
  readonly evidenciaVinculo: readonly string[];
}

export interface SliceCoverage {
  readonly sliceId: string;
  readonly status: SourceStatus;
}

export interface SourceCoverage {
  readonly source: SourceName;
  readonly status: SourceStatus;
  /** Every declared slice was read: only then may absence mean absence. */
  readonly conclusiva: boolean;
  readonly obrigatoria: boolean;
  readonly slices: readonly SliceCoverage[];
}

export interface DossierCoverage {
  /** A category, not a number. Nothing downstream converts it into a score. */
  readonly veredito: "SUFICIENTE" | "DADOS_INSUFICIENTES";
  readonly slicesEsperadas: number;
  readonly slicesConclusivas: number;
  /** Reported for the explanation; never what decides the verdict. */
  readonly proporcao: number;
  readonly fontesObrigatoriasInconclusivas: readonly SourceName[];
  readonly fontes: readonly SourceCoverage[];
}

export interface DossierSnapshot {
  readonly dossierId: string;
  readonly tenantId: string;
  readonly debtorId: string;
  readonly schemaVersion: string;
  readonly planVersion: string;
  /** Null only when no field was tied to the debtor by the resolver. */
  readonly resolverVersion: string | null;
  /** The dossier's own date is composition; collection lives per field. */
  readonly composedAt: string;
  readonly supersedes: string | null;
  readonly cobertura: DossierCoverage;
  readonly campos: Readonly<Record<string, DossierFieldEnvelope>>;
}

export interface ComposeDossierInput {
  readonly dossierId: string;
  readonly tenantId: string;
  readonly debtorId: string;
  readonly composedAt: string;
  readonly plan: SourcePlan;
  readonly observations: readonly RawObservation[];
  readonly resolutions: Readonly<Partial<Record<SourceName, IdentityResolution>>>;
  readonly supersedes?: string | null;
}

const CONCLUSIVE_STATUSES: readonly SourceStatus[] = [
  "ENCONTRADO",
  "NAO_ENCONTRADO",
];

export function isConclusive(status: SourceStatus): boolean {
  return CONCLUSIVE_STATUSES.includes(status);
}

/**
 * A record that was read stays found whatever the rest of the coverage did; a
 * part that broke is a source error even though its slice is nominally
 * covered; an unread slice is unread. None of them ever becomes "no debt".
 */
function aggregateStatus(statuses: readonly SourceStatus[]): SourceStatus {
  if (statuses.includes("ENCONTRADO")) return "ENCONTRADO";
  if (statuses.includes("ERRO_NA_FONTE")) return "ERRO_NA_FONTE";
  if (statuses.includes("NAO_CONSULTADO")) return "NAO_CONSULTADO";
  return "NAO_ENCONTRADO";
}

function linkStatusFor(
  mode: LinkMode,
  resolution: IdentityResolution | undefined,
): LinkStatus {
  if (mode === "DECLARADO_PELO_CLIENTE") return "NAO_APLICAVEL";
  return resolution ? resolution.status : "NAO_RESOLVIDO";
}

function isConfirmedLink(status: LinkStatus): boolean {
  return status === "CONFIRMADO" || status === "NAO_APLICAVEL";
}

function copyValue(value: FieldValue): FieldValue {
  // Materialised into the snapshot, not referenced. Purging the observation
  // afterwards must leave the dossier exactly as it was composed.
  return value.tipo === "LISTA_TEXTO"
    ? Object.freeze({ tipo: value.tipo, lista: Object.freeze([...value.lista]) })
    : Object.freeze({ ...value });
}

function aggregateField(
  field: PlannedField,
  linked: readonly FieldValue[],
): FieldValue | null {
  if (linked.length === 0) {
    return null;
  }

  switch (field.agregacao) {
    case "SOMA": {
      let total = 0n;
      for (const value of linked) {
        if (value.tipo !== "MONETARIO_CENTAVOS") {
          throw new TypeError("CAMPO_MONETARIO_COM_TIPO_INVALIDO");
        }
        total += value.centavos;
      }
      return Object.freeze({
        tipo: "MONETARIO_CENTAVOS" as const,
        centavos: total,
      });
    }
    case "UNIAO": {
      const items = new Set<string>();
      for (const value of linked) {
        if (value.tipo !== "LISTA_TEXTO") {
          throw new TypeError("CAMPO_DE_LISTA_COM_TIPO_INVALIDO");
        }
        for (const item of value.lista) {
          items.add(item);
        }
      }
      return Object.freeze({
        tipo: "LISTA_TEXTO" as const,
        lista: Object.freeze([...items].sort()),
      });
    }
    case "EXISTE":
      throw new TypeError("CAMPO_EXISTE_NAO_AGREGA_VALORES");
  }
}

interface SourceComposition {
  readonly planned: PlannedSource;
  readonly slices: readonly SliceCoverage[];
  readonly status: SourceStatus;
  readonly conclusiva: boolean;
  readonly observations: readonly RawObservation[];
  readonly linkStatus: LinkStatus;
  readonly linkedRecords: readonly RawObservation["records"][number][];
}

function composeSource(
  planned: PlannedSource,
  bySlice: ReadonlyMap<string, RawObservation>,
  resolution: IdentityResolution | undefined,
): SourceComposition {
  const slices = planned.expectedSlices.map((sliceId) => ({
    sliceId,
    status: bySlice.get(sliceId)?.status ?? ("NAO_CONSULTADO" as SourceStatus),
  }));
  const observations = planned.expectedSlices
    .map((sliceId) => bySlice.get(sliceId))
    .filter((entry): entry is RawObservation => entry !== undefined);

  if (
    planned.vinculo === "RESOLUCAO_DE_IDENTIDADE" &&
    !resolution &&
    observations.some((entry) => entry.status === "ENCONTRADO")
  ) {
    // A source that answered but was never resolved has records nobody has
    // tied to this debtor. Composing them anyway is exactly the invented fact
    // the resolver exists to prevent.
    throw new Error("RESOLUCAO_DE_IDENTIDADE_AUSENTE");
  }

  const selectedSubjectId =
    planned.vinculo === "DECLARADO_PELO_CLIENTE"
      ? null
      : (resolution?.selected?.id ?? null);

  const linkedRecords = observations.flatMap((entry) =>
    entry.records.filter(
      (record) =>
        planned.vinculo === "DECLARADO_PELO_CLIENTE" ||
        record.subjectId === selectedSubjectId,
    ),
  );

  return {
    planned,
    slices,
    status: aggregateStatus(slices.map((slice) => slice.status)),
    conclusiva: slices.every((slice) => isConclusive(slice.status)),
    observations,
    linkStatus: linkStatusFor(planned.vinculo, resolution),
    linkedRecords,
  };
}

function existsValue(source: SourceComposition): FieldValue | null {
  if (source.linkedRecords.length > 0) {
    return Object.freeze({ tipo: "BOOLEANO" as const, booleano: true });
  }
  // "Nobody by this name" is only sayable once every declared slice was read
  // and the resolver did not abstain. Anything else is silence, not a negative.
  if (source.conclusiva && source.linkStatus !== "AMBIGUO") {
    return Object.freeze({ tipo: "BOOLEANO" as const, booleano: false });
  }
  return null;
}

function earliest(values: readonly string[]): string | null {
  // The stalest input decides: a field is only as fresh as the slice that
  // lagged. ISO-8601 UTC sorts lexicographically, so no date parsing is needed.
  return values.length === 0 ? null : [...values].sort()[0];
}

function assertDeclaredFields(
  planned: PlannedSource,
  observations: readonly RawObservation[],
): void {
  const declared = new Set(
    planned.fields
      .filter((field) => field.agregacao !== "EXISTE")
      .map((field) => field.key),
  );
  for (const observation of observations) {
    for (const record of observation.records) {
      for (const key of Object.keys(record.values)) {
        if (!declared.has(key)) {
          throw new Error("CAMPO_NAO_DECLARADO_NO_PLANO");
        }
      }
    }
  }
}

function indexObservations(
  input: ComposeDossierInput,
): ReadonlyMap<SourceName, Map<string, RawObservation>> {
  const declared = new Map(
    input.plan.sources.map((source) => [
      source.source,
      new Set(source.expectedSlices),
    ]),
  );
  const index = new Map<SourceName, Map<string, RawObservation>>();

  for (const observation of input.observations) {
    if (observation.tenantId !== input.tenantId) {
      throw new Error("OBSERVACAO_DE_OUTRO_TENANT");
    }
    if (observation.debtorId !== input.debtorId) {
      throw new Error("OBSERVACAO_DE_OUTRO_TITULAR");
    }
    if (!declared.get(observation.source)?.has(observation.sliceId)) {
      throw new Error("OBSERVACAO_FORA_DO_PLANO");
    }

    const bySlice = index.get(observation.source) ?? new Map();
    if (bySlice.has(observation.sliceId)) {
      throw new Error("OBSERVACAO_DUPLICADA_PARA_SLICE");
    }
    bySlice.set(observation.sliceId, observation);
    index.set(observation.source, bySlice);
  }

  return index;
}

function resolverVersionOf(
  resolutions: ComposeDossierInput["resolutions"],
): string | null {
  const versions = new Set(
    Object.values(resolutions)
      .filter((resolution): resolution is IdentityResolution => Boolean(resolution))
      .map((resolution) => resolution.policyVersion),
  );
  if (versions.size > 1) {
    // A snapshot with two matchers behind it cannot say which one to blame
    // when a correction is requested, and supersession needs exactly that.
    throw new Error("VERSOES_DE_RESOLVER_DIVERGENTES");
  }
  return versions.size === 0 ? null : [...versions][0];
}

function evidenceFor(
  mode: LinkMode,
  resolution: IdentityResolution | undefined,
): readonly string[] {
  if (mode === "DECLARADO_PELO_CLIENTE") {
    // ADR 018: the wallet link is declared, not verified. Confidence 1.0 says
    // the field came from the imported record, not that the datum is true.
    return Object.freeze(["fornecido_pelo_cliente"]);
  }
  if (!resolution) {
    return Object.freeze([]);
  }
  return Object.freeze(
    resolution.rules.filter((rule) => rule.matched).map((rule) => rule.rule),
  );
}

export function composeDossier(input: ComposeDossierInput): DossierSnapshot {
  const index = indexObservations(input);
  const resolverVersion = resolverVersionOf(input.resolutions);

  const composed = input.plan.sources.map((planned) => {
    const bySlice = index.get(planned.source) ?? new Map<string, RawObservation>();
    const source = composeSource(
      planned,
      bySlice,
      input.resolutions[planned.source],
    );
    assertDeclaredFields(planned, source.observations);
    return source;
  });

  const campos: Record<string, DossierFieldEnvelope> = {};
  for (const source of composed) {
    const collected = source.observations.map((entry) => entry.collectedAt);
    const references = source.observations
      .map((entry) => entry.referenceDate)
      .filter((entry): entry is string => entry !== null);
    const parametrosConsulta = Object.freeze(
      Object.fromEntries(
        source.observations.map((entry) => [entry.sliceId, entry.queryParams]),
      ),
    );
    const confianca =
      source.planned.vinculo === "DECLARADO_PELO_CLIENTE"
        ? 1
        : (input.resolutions[source.planned.source]?.confidence ?? 0);
    const evidencia = evidenceFor(
      source.planned.vinculo,
      input.resolutions[source.planned.source],
    );

    for (const field of source.planned.fields) {
      const valor =
        field.agregacao === "EXISTE"
          ? existsValue(source)
          : aggregateField(
              field,
              source.linkedRecords
                .map((record) => record.values[field.key])
                .filter((value): value is FieldValue => value !== undefined),
            );

      campos[field.key] = Object.freeze({
        campo: field.key,
        fonte: source.planned.source,
        slices: Object.freeze([...source.planned.expectedSlices]),
        parametrosConsulta,
        status: source.status,
        valor: valor === null ? null : copyValue(valor),
        coletadoEm: earliest(collected),
        dataReferencia: earliest(references),
        vinculoStatus: source.linkStatus,
        vinculoConfirmado: isConfirmedLink(source.linkStatus),
        confiancaVinculo: confianca,
        evidenciaVinculo: evidencia,
      });
    }
  }

  const fontes = composed.map((source) =>
    Object.freeze({
      source: source.planned.source,
      status: source.status,
      conclusiva: source.conclusiva,
      obrigatoria: source.planned.obrigatoria,
      slices: Object.freeze(source.slices.map((slice) => Object.freeze(slice))),
    }),
  );

  const slicesEsperadas = fontes.reduce(
    (total, source) => total + source.slices.length,
    0,
  );
  const slicesConclusivas = fontes.reduce(
    (total, source) =>
      total + source.slices.filter((slice) => isConclusive(slice.status)).length,
    0,
  );
  const fontesObrigatoriasInconclusivas = fontes
    .filter((source) => source.obrigatoria && !source.conclusiva)
    .map((source) => source.source);

  const snapshot: DossierSnapshot = Object.freeze({
    dossierId: input.dossierId,
    tenantId: input.tenantId,
    debtorId: input.debtorId,
    schemaVersion: DOSSIER_SCHEMA_VERSION,
    planVersion: input.plan.planVersion,
    resolverVersion,
    composedAt: input.composedAt,
    supersedes: input.supersedes ?? null,
    cobertura: Object.freeze({
      // Insufficient coverage is a category, never a lower number. The
      // proportion below is published for the explanation and read by nothing.
      veredito:
        fontesObrigatoriasInconclusivas.length === 0
          ? ("SUFICIENTE" as const)
          : ("DADOS_INSUFICIENTES" as const),
      slicesEsperadas,
      slicesConclusivas,
      proporcao:
        slicesEsperadas === 0 ? 0 : slicesConclusivas / slicesEsperadas,
      fontesObrigatoriasInconclusivas: Object.freeze(
        fontesObrigatoriasInconclusivas,
      ),
      fontes: Object.freeze(fontes),
    }),
    campos: Object.freeze(campos),
  });

  return snapshot;
}

/**
 * The executable form of "a low-confidence match is never presented as a fact".
 *
 * Composition does **not** call it: `vinculoConfirmado` is derived from the
 * link status there, so composition cannot produce a violation, and a guard no
 * test can fail is a false guarantee (defect I-4). It belongs on the boundary
 * where a snapshot arrives from somewhere else — storage, an upcast from an
 * older schema, a request body — and the reader that runs it has the removal
 * test.
 */
export function assertDossierFactDiscipline(snapshot: {
  readonly campos: Readonly<Record<string, DossierFieldEnvelope>>;
}): void {
  for (const envelope of Object.values(snapshot.campos)) {
    if (envelope.vinculoConfirmado && !isConfirmedLink(envelope.vinculoStatus)) {
      throw new Error("VINCULO_NAO_CONFIRMADO_MARCADO_COMO_FATO");
    }
  }
}

/** The only way to read a value as the debtor's. Everything else is evidence. */
export function factValue(envelope: DossierFieldEnvelope): FieldValue | null {
  return envelope.vinculoConfirmado ? envelope.valor : null;
}

export interface DossierSupersession {
  readonly predecessorId: string;
  readonly successorId: string;
  readonly reason: string;
  readonly recordedAt: string;
}

/**
 * Correction is supersession, never an edit (ADR 018). The relation is
 * append-only and `superseded_by` is derived on read, so the superseded
 * snapshot keeps saying exactly what it said when it was composed.
 */
export function recordSupersession(
  links: readonly DossierSupersession[],
  link: DossierSupersession,
): readonly DossierSupersession[] {
  if (link.predecessorId === link.successorId) {
    throw new Error("SUPERSESSAO_CIRCULAR");
  }
  if (links.some((entry) => entry.predecessorId === link.predecessorId)) {
    throw new Error("DOSSIE_JA_SUPERSEDIDO");
  }
  if (links.some((entry) => entry.successorId === link.successorId)) {
    throw new Error("DOSSIE_JA_SUPERSEDE_OUTRO");
  }
  return Object.freeze([...links, Object.freeze(link)]);
}

export function supersededBy(
  dossierId: string,
  links: readonly DossierSupersession[],
): string | null {
  return (
    links.find((entry) => entry.predecessorId === dossierId)?.successorId ?? null
  );
}
