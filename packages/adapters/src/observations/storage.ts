import {
  SOURCE_NAMES,
  SOURCE_STATUSES,
  type FieldValue,
  type ObservationRecord,
  type PublishedSubject,
  type RawObservation,
  type SourceName,
  type SourceStatus,
} from "@panella/domain";

import type { StoredObservation } from "../repositories/prisma-wallet-repository.js";

/**
 * `RawObservation` in one direction, the row the database holds in the other.
 *
 * **Money never becomes a number.** JSON has a single numeric type and it is a
 * float, so cents that come back through `JSON.parse` as a number are cents
 * that can come back wrong — the source itself already publishes
 * `29163886.440000001`. Amounts travel as digit strings and return as `bigint`.
 *
 * A shape this file does not recognise fails loudly. Answering with an empty
 * field would hide a schema change behind a missing value, which is exactly the
 * failure `NAO_CONSULTADO` and `NAO_ENCONTRADO` exist to keep apart.
 */

const INVALID = "PAYLOAD_DE_OBSERVACAO_INVALIDO";

interface SerializedRecord {
  readonly subjectId: string;
  readonly values: Readonly<Record<string, unknown>>;
}

function serializeValue(value: FieldValue): Readonly<Record<string, unknown>> {
  switch (value.tipo) {
    case "MONETARIO_CENTAVOS":
      return { tipo: value.tipo, centavos: value.centavos.toString() };
    case "TEXTO":
      return { tipo: value.tipo, texto: value.texto };
    case "BOOLEANO":
      return { tipo: value.tipo, booleano: value.booleano };
    case "DATA_HORA":
      return { tipo: value.tipo, dataHora: value.dataHora };
    case "LISTA_TEXTO":
      return { tipo: value.tipo, lista: [...value.lista] };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseValue(raw: unknown): FieldValue {
  if (!isObject(raw)) {
    throw new Error(INVALID);
  }

  switch (raw.tipo) {
    case "MONETARIO_CENTAVOS": {
      if (typeof raw.centavos !== "string" || !/^-?\d+$/.test(raw.centavos)) {
        // A number here would already have passed through a float.
        throw new Error(INVALID);
      }
      return { tipo: "MONETARIO_CENTAVOS", centavos: BigInt(raw.centavos) };
    }
    case "TEXTO":
      if (typeof raw.texto !== "string") throw new Error(INVALID);
      return { tipo: "TEXTO", texto: raw.texto };
    case "BOOLEANO":
      if (typeof raw.booleano !== "boolean") throw new Error(INVALID);
      return { tipo: "BOOLEANO", booleano: raw.booleano };
    case "DATA_HORA":
      if (typeof raw.dataHora !== "string") throw new Error(INVALID);
      return { tipo: "DATA_HORA", dataHora: raw.dataHora };
    case "LISTA_TEXTO": {
      if (
        !Array.isArray(raw.lista) ||
        raw.lista.some((entry) => typeof entry !== "string")
      ) {
        throw new Error(INVALID);
      }
      return { tipo: "LISTA_TEXTO", lista: raw.lista as string[] };
    }
    default:
      throw new Error(INVALID);
  }
}

function parseSubjects(raw: unknown): readonly PublishedSubject[] {
  if (!Array.isArray(raw)) {
    throw new Error(INVALID);
  }
  return raw.map((entry) => {
    if (
      !isObject(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.maskedCpf !== "string" ||
      typeof entry.name !== "string"
    ) {
      throw new Error(INVALID);
    }
    return { id: entry.id, maskedCpf: entry.maskedCpf, name: entry.name };
  });
}

function parseRecords(raw: unknown): readonly ObservationRecord[] {
  if (!Array.isArray(raw)) {
    throw new Error(INVALID);
  }
  return raw.map((entry) => {
    if (!isObject(entry) || typeof entry.subjectId !== "string" || !isObject(entry.values)) {
      throw new Error(INVALID);
    }
    const values: Record<string, FieldValue> = {};
    for (const [key, value] of Object.entries(entry.values)) {
      values[key] = parseValue(value);
    }
    return { subjectId: entry.subjectId, values };
  });
}

export function toStoredObservation(
  observation: RawObservation,
): StoredObservation {
  const records: SerializedRecord[] = observation.records.map((record) => ({
    subjectId: record.subjectId,
    values: Object.fromEntries(
      Object.entries(record.values).map(([key, value]) => [
        key,
        serializeValue(value),
      ]),
    ),
  }));

  return {
    id: observation.id,
    tenantId: observation.tenantId,
    debtorId: observation.debtorId,
    source: observation.source,
    sliceId: observation.sliceId,
    status: observation.status,
    queryParams: observation.queryParams,
    payload: { subjects: [...observation.subjects], records },
    collectedAt: new Date(observation.collectedAt),
    referenceDate:
      observation.referenceDate === null
        ? null
        : new Date(observation.referenceDate),
  };
}

export function toRawObservation(stored: StoredObservation): RawObservation {
  if (!SOURCE_NAMES.includes(stored.source as SourceName)) {
    throw new Error(INVALID);
  }
  if (!SOURCE_STATUSES.includes(stored.status as SourceStatus)) {
    throw new Error(INVALID);
  }
  if (!stored.payload) {
    throw new Error(INVALID);
  }

  return Object.freeze({
    id: stored.id,
    tenantId: stored.tenantId,
    debtorId: stored.debtorId,
    source: stored.source as SourceName,
    sliceId: stored.sliceId,
    status: stored.status,
    collectedAt: stored.collectedAt.toISOString(),
    referenceDate: stored.referenceDate
      ? stored.referenceDate.toISOString()
      : null,
    queryParams: stored.queryParams,
    subjects: parseSubjects(stored.payload.subjects),
    records: parseRecords(stored.payload.records),
  });
}
