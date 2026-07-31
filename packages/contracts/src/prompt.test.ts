import { describe, expect, it } from "vitest";

import { evaluatePolicy, POLICY_2026_07_A } from "@panella/domain";

import { dossierFrom } from "../../../fixtures/policy/dossiers.js";
import { renderPrompt, PROMPT_VERSION } from "./prompt.js";

/**
 * The consumer is an AI agent, not a human reading a screen, and the prompt is
 * the surface it reads. Two properties matter more than prettiness: the same
 * snapshot must render identically forever, and every uncertainty in the
 * dossier must survive into the text. A prompt that quietly presents a
 * probable match as a fact re-introduces, in prose, the thing the whole
 * pipeline refuses to do in data.
 */

const CONFIRMADO = {
  carteira: { cents: 8_000_000n, titulos: 3 },
  dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
  lista: { status: "ENCONTRADO", link: "CONFIRMADO" },
} as const;

function render(spec: Parameters<typeof dossierFrom>[0]) {
  const dossier = dossierFrom(spec);
  return renderPrompt(dossier, evaluatePolicy(dossier, POLICY_2026_07_A));
}

describe("determinism", () => {
  it("renders the same text for the same snapshot", () => {
    expect(render(CONFIRMADO)).toBe(render(CONFIRMADO));
  });

  it("matches the golden rendering", async () => {
    await expect(render(CONFIRMADO)).toMatchFileSnapshot(
      "../../../fixtures/prompt/golden-confirmado.md",
    );
  });

  it("matches the golden rendering of an insufficient dossier", async () => {
    await expect(
      render({
        carteira: { cents: 8_000_000n, titulos: 3 },
        dadosAbertos: { status: "ERRO_NA_FONTE" },
        lista: { status: "NAO_ENCONTRADO" },
      }),
    ).toMatchFileSnapshot("../../../fixtures/prompt/golden-insuficiente.md");
  });

  it("declares its own version, so a change of wording is visible", () => {
    expect(render(CONFIRMADO)).toContain(PROMPT_VERSION);
  });
});

describe("uncertainty survives into the text", () => {
  it("never presents an ambiguous link as a fact", () => {
    const text = render({
      ...CONFIRMADO,
      dadosAbertos: { status: "ENCONTRADO", link: "AMBIGUO" },
    });

    expect(text).toContain("AMBIGUO");
    expect(text).toContain("não confirmado");
  });

  it("never presents a probable link as a fact", () => {
    const text = render({
      ...CONFIRMADO,
      dadosAbertos: { status: "ENCONTRADO", link: "PROVAVEL" },
    });

    expect(text).toContain("PROVAVEL");
    expect(text).toContain("não confirmado");
  });

  it("distinguishes a source that failed from one that found nothing", () => {
    const erro = render({
      carteira: { cents: 1_000_000n, titulos: 1 },
      dadosAbertos: { status: "ERRO_NA_FONTE" },
      lista: { status: "NAO_ENCONTRADO" },
    });
    const vazio = render({
      carteira: { cents: 1_000_000n, titulos: 1 },
      dadosAbertos: { status: "NAO_ENCONTRADO" },
      lista: { status: "NAO_ENCONTRADO" },
    });

    expect(erro).toContain("ERRO_NA_FONTE");
    expect(vazio).toContain("NAO_ENCONTRADO");
    expect(erro).not.toBe(vazio);
  });

  it("names a source nobody consulted as unconsulted", () => {
    const text = render({ carteira: { cents: 1_000_000n, titulos: 1 } });

    expect(text).toContain("NAO_CONSULTADO");
    expect(text).toContain("DADOS_INSUFICIENTES");
  });

  it("says outright that insufficient coverage is not a low score", () => {
    const text = render({
      carteira: { cents: 8_000_000n, titulos: 3 },
      dadosAbertos: { status: "ERRO_NA_FONTE" },
      lista: { status: "NAO_ENCONTRADO" },
    });

    expect(text).toContain("não é indício");
  });
});

describe("what may never reach the prompt", () => {
  it("carries no CPF, masked or whole", () => {
    const text = render(CONFIRMADO);

    expect(text).not.toContain("52998224725");
    expect(text).not.toContain("982247");
    expect(text).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  it("does not call the score a probability of payment", () => {
    const text = render(CONFIRMADO).toLowerCase();

    // ADR 016: no field with the name or the semantics of a probability.
    expect(text).not.toContain("propensao");
    expect(text).not.toContain("propensão");
    expect(text).not.toContain("probabilidade de pagamento");
    expect(text).not.toContain("chance de pagar");
  });

  it("states that the score orders effort rather than predicting payment", () => {
    expect(render(CONFIRMADO)).toContain("ordena esforço");
  });
});

describe("what the agent needs to act", () => {
  it("carries the strategy, the category and the explanation", () => {
    const text = render(CONFIRMADO);

    expect(text).toContain("COBRANCA_INTENSIVA");
    expect(text).toContain("CONTATO_DIRETO_PRIORITARIO");
    expect(text).toContain("divida_ativa_confirmada");
  });

  it("carries the composition date and the collection date apart", () => {
    const text = render(CONFIRMADO);

    // The dossier's date is composition; each field carries its own.
    expect(text).toContain("2026-07-31T12:00:00.000Z");
    expect(text).toContain("2026-07-20T00:00:00.000Z");
  });

  it("carries the policy and resolver versions behind the answer", () => {
    const text = render(CONFIRMADO);

    expect(text).toContain("2026-07-A");
  });
});
