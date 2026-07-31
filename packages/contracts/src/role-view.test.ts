import { describe, expect, it } from "vitest";

import {
  evaluatePolicy,
  POLICY_2026_07_A,
  type HumanRole,
} from "@panella/domain";

import { dossierFrom, type DossierSpec } from "../../../fixtures/policy/dossiers.js";
import { projectDossierForRole, type AuditTrailEntry } from "./role-view.js";

/**
 * Role-redacted views. This is an `AGENTS.md` invariant, not a preference:
 * `operador_cobranca` never sees a full CPF nor the full match evidence, and
 * the audit role reads the trail without operational access to the wallet.
 *
 * The tests below are written so that relaxing either rule fails one of them.
 */

/** The same debtor the policy fixtures resolve against. */
const DEVEDOR = { nome: "JOSE SILVA", cpf: "52998224725" } as const;
const CPF_PONTUADO = "529.982.247-25";
/** Positions 4-9, which exist in memory for the matcher and nowhere else. */
const FRAGMENTO_4_9 = "982247";

const CONFIRMADO: DossierSpec = {
  carteira: { cents: 2_917_588_644n, titulos: 3 },
  dadosAbertos: { status: "ENCONTRADO", link: "CONFIRMADO" },
  lista: { status: "ENCONTRADO", link: "PROVAVEL" },
};

const TRILHA: readonly AuditTrailEntry[] = [
  {
    ocorridoEm: "2026-07-31T17:40:28.660Z",
    atorId: "agent-demo",
    acao: "READ_DOSSIER",
    carteiraId: "carteira-demo",
    devedorId: "debtor-a",
    fontes: ["PGFN_DADOS_ABERTOS", "PGFN_LISTA_DEVEDORES_MANUAL"],
    resultado: "COBRANCA_PADRAO",
  },
];

function view(papel: HumanRole, spec: DossierSpec = CONFIRMADO) {
  const dossier = dossierFrom(spec);
  return projectDossierForRole({
    papel,
    dossier,
    classificacao: evaluatePolicy(dossier, POLICY_2026_07_A),
    devedor: DEVEDOR,
    trilha: TRILHA,
  });
}

function render(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === "bigint" ? entry.toString() : entry,
  );
}

const PAPEIS: readonly HumanRole[] = [
  "ADMIN_TENANT",
  "ANALISTA_DOSSIE",
  "OPERADOR_COBRANCA",
  "ENCARREGADO_LGPD",
];

describe("no role ever receives the document", () => {
  it.each(PAPEIS)("keeps the CPF out of the %s view entirely", (papel) => {
    const rendered = render(view(papel));

    expect(rendered).not.toContain(DEVEDOR.cpf);
    expect(rendered).not.toContain(CPF_PONTUADO);
    // The mask reveals 4-9 and the fragment is derived in memory for the
    // matcher. A screen is not the matcher.
    expect(rendered).not.toContain(FRAGMENTO_4_9);
  });

  it("refuses to render a view when a free-text field carries a document", () => {
    // The realistic leak: an operator types the CPF into the name column of
    // the spreadsheet. The projection cannot un-know it, so it fails closed.
    const dossier = dossierFrom(CONFIRMADO);

    expect(() =>
      projectDossierForRole({
        papel: "OPERADOR_COBRANCA",
        dossier,
        classificacao: evaluatePolicy(dossier, POLICY_2026_07_A),
        devedor: { nome: `JOSE SILVA ${CPF_PONTUADO}`, cpf: DEVEDOR.cpf },
      }),
    ).toThrow("DOCUMENTO_EM_VISAO_DE_PAPEL");
  });

  it("refuses the bare eleven-digit form just as it refuses the punctuated one", () => {
    const dossier = dossierFrom(CONFIRMADO);

    expect(() =>
      projectDossierForRole({
        papel: "ANALISTA_DOSSIE",
        dossier,
        classificacao: evaluatePolicy(dossier, POLICY_2026_07_A),
        devedor: { nome: `JOSE SILVA ${DEVEDOR.cpf}`, cpf: DEVEDOR.cpf },
      }),
    ).toThrow("DOCUMENTO_EM_VISAO_DE_PAPEL");
  });
});

describe("operador_cobranca", () => {
  it("receives no match evidence, only how many rules matched", () => {
    const operador = view("OPERADOR_COBRANCA");
    const campo = operador.campos.find(
      (entry) => entry.campo === "pgfn_dados_abertos_valor_consolidado",
    );

    expect(campo?.evidenciaDetalhada).toBe(false);
    expect(campo?.evidenciaVinculo).toEqual([]);
    // The count is not the evidence: it says the match was examined without
    // saying what about this person matched what public record.
    expect(campo?.regrasCorrespondentes).toBeGreaterThan(0);
  });

  it("still sees the wallet it has to work, and the named signals", () => {
    const operador = view("OPERADOR_COBRANCA");

    expect(operador.campos.length).toBeGreaterThan(0);
    expect(operador.devedor?.nome).toBe(DEVEDOR.nome);
    expect(operador.classificacao?.sinais.map((sinal) => sinal.nome)).toContain(
      "divida_ativa_confirmada",
    );
    expect(operador.classificacao?.explicacao).toContain("Categoria");
  });

  it("does not receive the audit trail", () => {
    expect(view("OPERADOR_COBRANCA").trilha).toEqual([]);
  });
});

describe("analista_dossie", () => {
  it("receives the match evidence in full, because reviewing it is the job", () => {
    const analista = view("ANALISTA_DOSSIE");
    const campo = analista.campos.find(
      (entry) => entry.campo === "pgfn_dados_abertos_valor_consolidado",
    );

    expect(campo?.evidenciaDetalhada).toBe(true);
    expect(campo?.evidenciaVinculo).toContain("todos_os_tokens_presentes");
  });
});

describe("encarregado_lgpd", () => {
  it("reads the trail", () => {
    const auditoria = view("ENCARREGADO_LGPD");

    expect(auditoria.trilha).toHaveLength(1);
    expect(auditoria.trilha[0]).toMatchObject({
      atorId: "agent-demo",
      acao: "READ_DOSSIER",
      carteiraId: "carteira-demo",
    });
    expect(auditoria.trilha[0].ocorridoEm).toBe("31/07/2026 17:40 UTC");
  });

  it("has no operational access to the wallet", () => {
    const auditoria = view("ENCARREGADO_LGPD");

    // Reading the trail is not reading the debt. The decision skeleton stays —
    // date, rules version, sources and signals — because that is what the
    // right of review is about (docs/lgpd.md).
    expect(auditoria.campos).toEqual([]);
    expect(auditoria.devedor).toBeNull();
    expect(auditoria.classificacao?.categoria).toBe("COBRANCA_PADRAO");
  });
});

describe("admin_tenant", () => {
  it("administers grants and reads neither the wallet nor the trail", () => {
    const admin = view("ADMIN_TENANT");

    expect(admin.campos).toEqual([]);
    expect(admin.trilha).toEqual([]);
    expect(admin.devedor).toBeNull();
  });
});

describe("uncertainty and money cross into every view unchanged", () => {
  it("withholds a value whose link is not confirmed, for every role", () => {
    for (const papel of ["ANALISTA_DOSSIE", "OPERADOR_COBRANCA"] as const) {
      const campo = view(papel).campos.find(
        (entry) => entry.campo === "pgfn_lista_valor_total",
      );

      expect(campo?.vinculoConfirmado).toBe(false);
      expect(campo?.valorRetido).toBe(true);
      expect(campo?.valor).toBe("(valor retido: vínculo não confirmado)");
    }
  });

  it("renders money the way a Brazilian reads it", () => {
    const campo = view("OPERADOR_COBRANCA").campos.find(
      (entry) => entry.campo === "carteira_valor_em_aberto",
    );

    expect(campo?.valor).toBe("R$ 29.175.886,44");
  });

  it("renders collection dates the way a Brazilian reads them", () => {
    const campo = view("OPERADOR_COBRANCA").campos.find(
      (entry) => entry.campo === "carteira_valor_em_aberto",
    );

    expect(campo?.coletadoEm).toBe("25/07/2026");
  });
});
