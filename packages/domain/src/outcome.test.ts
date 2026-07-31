import { describe, expect, it } from "vitest";

import { recordOutcome, type CollectionOutcome } from "./outcome.js";

/**
 * A collection outcome is a separate append-only observation linked to the
 * classification, never an update of it (ADR 016). Writing the outcome back
 * into the classification would destroy the two things the policy is for:
 * re-executing an old dossier under a new version, and comparing the two.
 */

const BASE: CollectionOutcome = {
  outcomeId: "outcome-1",
  classificationId: "dossier-1|2026-07-A",
  tenantId: "tenant-a",
  tipo: "PAGAMENTO",
  actorId: "agent-a",
  recordedAt: "2026-08-01T10:00:00.000Z",
  observacao: null,
};

describe("recordOutcome", () => {
  it("appends without touching what was already recorded", () => {
    const first = recordOutcome([], BASE);
    const second = recordOutcome(first, {
      ...BASE,
      outcomeId: "outcome-2",
      tipo: "PARCELAMENTO",
      recordedAt: "2026-08-02T10:00:00.000Z",
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    // The first list is untouched: append returns a new one.
    expect(first[0]).toEqual(BASE);
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("keeps several outcomes for one classification", () => {
    // Contact made, then silence, then payment: a history, not a final state.
    const history = [
      { ...BASE, outcomeId: "o-1", tipo: "CONTATO_FEITO" as const },
      { ...BASE, outcomeId: "o-2", tipo: "SILENCIO" as const },
      { ...BASE, outcomeId: "o-3", tipo: "PAGAMENTO" as const },
    ].reduce(recordOutcome, [] as readonly CollectionOutcome[]);

    expect(history.map((entry) => entry.tipo)).toEqual([
      "CONTATO_FEITO",
      "SILENCIO",
      "PAGAMENTO",
    ]);
  });

  it("refuses a duplicate outcome id", () => {
    expect(() => recordOutcome(recordOutcome([], BASE), BASE)).toThrow(
      "DESFECHO_DUPLICADO",
    );
  });

  it("refuses an outcome for another tenant's classification", () => {
    expect(() =>
      recordOutcome(recordOutcome([], BASE), {
        ...BASE,
        outcomeId: "outcome-2",
        tenantId: "tenant-b",
      }),
    ).toThrow("DESFECHO_DE_OUTRO_TENANT");
  });

  it("refuses an outcome with no classification behind it", () => {
    expect(() =>
      recordOutcome([], { ...BASE, classificationId: "" }),
    ).toThrow("DESFECHO_SEM_CLASSIFICACAO");
  });

  it("freezes each entry so a stored outcome cannot be edited later", () => {
    const [entry] = recordOutcome([], BASE);

    expect(() => {
      (entry as { tipo: string }).tipo = "SILENCIO";
    }).toThrow(TypeError);
  });
});
