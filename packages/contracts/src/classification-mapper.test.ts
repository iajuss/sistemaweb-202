import { describe, expect, it } from "vitest";

import {
  evaluatePolicy,
  POLICY_2026_07_A,
  type DossierSnapshot,
} from "@panella/domain";

import { dossierFrom } from "../../../fixtures/policy/dossiers.js";
import { ClassificationSchema } from "./classification-schema.js";
import { toClassificationContract } from "./classification-mapper.js";

/**
 * The output contract is the product. A classification the domain can produce
 * but the contract cannot express is a bug found at the last possible moment,
 * so the projection is tested here, at the boundary, rather than discovered
 * when an endpoint is written.
 */

const CLASSIFIED_AT = "2026-07-31T13:00:00.000Z";

function contractFor(dossier: DossierSnapshot) {
  return toClassificationContract(
    evaluatePolicy(dossier, POLICY_2026_07_A),
    CLASSIFIED_AT,
  );
}

describe("projecting a classification onto the published contract", () => {
  it("accepts an actionable classification", () => {
    const contract = contractFor(
      dossierFrom({
        carteira: { cents: 8_000_000n, titulos: 3 },
        dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
        lista: { status: "ENCONTRADO", link: "CONFIRMADO" },
      }),
    );

    expect(ClassificationSchema.safeParse(contract).success).toBe(true);
    expect(contract.category).toBe("COBRANCA_INTENSIVA");
    expect(contract.cobertura).toBe("SUFICIENTE");
  });

  it("accepts an insufficient-coverage classification", () => {
    const contract = contractFor(
      dossierFrom({
        carteira: { cents: 8_000_000n, titulos: 3 },
        dadosAbertos: { status: "ERRO_NA_FONTE" },
        lista: { status: "NAO_ENCONTRADO" },
      }),
    );

    // The contract's union only allows DADOS_INSUFICIENTES together with
    // INSUFICIENTE coverage, so this parse is the invariant, not a formality.
    expect(ClassificationSchema.safeParse(contract).success).toBe(true);
    expect(contract.category).toBe("DADOS_INSUFICIENTES");
    expect(contract.cobertura).toBe("INSUFICIENTE");
  });

  it("carries every named signal with its weight and source", () => {
    const contract = contractFor(
      dossierFrom({
        carteira: { cents: 8_000_000n, titulos: 3 },
        dadosAbertos: { status: "NAO_ENCONTRADO" },
        lista: { status: "NAO_ENCONTRADO" },
      }),
    );

    // The right of review over an automated decision is why this is required
    // rather than optional: a category with no decomposition is unreviewable.
    expect(contract.signals).toHaveLength(POLICY_2026_07_A.signals.length);
    for (const signal of contract.signals) {
      expect(signal.nome.length).toBeGreaterThan(0);
      expect(signal.fonte.length).toBeGreaterThan(0);
      expect(typeof signal.peso).toBe("number");
    }
    expect(contract.explicacao.length).toBeGreaterThan(0);
  });

  it("takes the timestamp from the caller, keeping evaluation pure", () => {
    const dossier = dossierFrom({
      carteira: { cents: 1_000_000n, titulos: 1 },
      dadosAbertos: { status: "NAO_ENCONTRADO" },
      lista: { status: "NAO_ENCONTRADO" },
    });

    expect(contractFor(dossier).classified_at).toBe(CLASSIFIED_AT);
    // Re-projecting the same classification twice is identical, because
    // nothing inside reads a clock.
    expect(contractFor(dossier)).toEqual(contractFor(dossier));
  });

  it("refuses a timestamp that is not ISO-8601", () => {
    const classification = evaluatePolicy(
      dossierFrom({
        carteira: { cents: 1_000_000n, titulos: 1 },
        dadosAbertos: { status: "NAO_ENCONTRADO" },
        lista: { status: "NAO_ENCONTRADO" },
      }),
      POLICY_2026_07_A,
    );

    expect(() =>
      toClassificationContract(classification, "31/07/2026"),
    ).toThrow("CLASSIFIED_AT_NAO_E_ISO_8601");
  });
});
