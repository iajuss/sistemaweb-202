import {
  formatBrlFromCents,
  formatIsoDate,
  type RoleDossierView,
} from "@panella/contracts";
import type {
  PriorityEntry,
  WalletImportPreview,
  WalletImportReport,
} from "@panella/application";

/**
 * The three pages, server-rendered as strings. No framework, no client bundle
 * and no new dependency: the same handlers the API uses produce the data, and
 * this file only decides how it reads.
 *
 * **White label is total.** Product name, mark and colours come from the
 * tenant's configuration; there is no default for any of them, because a
 * default would be the developer's branding wearing a placeholder's clothes.
 * No mark, meta tag, footer or favicon here names whoever built this.
 *
 * **Everything interpolated is escaped.** A debtor name arrives from a
 * spreadsheet a client uploaded, which is untrusted input by any definition.
 */

export interface TenantTheme {
  readonly nomeDoProduto: string;
  readonly corPrimaria: string;
  readonly corSecundaria: string;
  readonly marca: string;
}

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** Colours reach CSS, so they are constrained rather than merely escaped. */
function safeColour(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "#000000";
}

function layout(theme: TenantTheme, titulo: string, corpo: string): string {
  const primaria = safeColour(theme.corPrimaria);
  const secundaria = safeColour(theme.corSecundaria);
  // A plain disc in the tenant's own colour: a browser tab needs an icon, and
  // the only mark allowed here is the tenant's.
  const favicon = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='8' fill='%23${primaria.slice(1)}'/%3E%3C/svg%3E`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escape(titulo)} — ${escape(theme.nomeDoProduto)}</title>
<link rel="icon" href="${favicon}">
<style>
:root { --primaria: ${primaria}; --secundaria: ${secundaria}; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1b1b1b; background: var(--secundaria); }
header { background: var(--primaria); color: #fff; padding: 1rem 1.5rem; }
header p { margin: 0; }
header .marca { font-size: .8rem; opacity: .85; letter-spacing: .04em; text-transform: uppercase; }
header .produto { font-size: 1.25rem; font-weight: 600; }
main { max-width: 60rem; margin: 0 auto; padding: 1.5rem; }
h1 { font-size: 1.3rem; margin: 0 0 1rem; }
h2 { font-size: 1.05rem; margin: 1.75rem 0 .5rem; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { text-align: left; padding: .6rem .75rem; border-bottom: 1px solid #e3e6ea; vertical-align: top; }
th { background: #fff; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: #55606b; }
td.numero { text-align: right; font-variant-numeric: tabular-nums; }
a { color: var(--primaria); }
.cartao { background: #fff; border: 1px solid #e3e6ea; padding: 1rem 1.25rem; margin-bottom: 1rem; }
.rotulo { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #55606b; }
.retido { color: #7a5c00; background: #fff6d9; padding: 0 .3rem; }
.nao-aplicado { color: #6b7680; }
ul.evidencia { margin: .25rem 0 0; padding-left: 1.1rem; font-size: .9rem; }
.erro { color: #8a1c1c; background: #fdeaea; padding: .6rem .75rem; }
code { font: .9em ui-monospace, monospace; }
button { font: inherit; background: var(--primaria); color: #fff; border: 0; padding: .55rem 1rem; cursor: pointer; }
input[type=file] { font: inherit; }
footer { max-width: 60rem; margin: 0 auto; padding: 0 1.5rem 2rem; font-size: .8rem; color: #55606b; }
</style>
</head>
<body>
<header>
<p class="marca">${escape(theme.marca)}</p>
<p class="produto">${escape(theme.nomeDoProduto)}</p>
</header>
<main>
${corpo}
</main>
<footer>
<p>A pontuação ordena esforço de cobrança entre devedores. Ela não estima se
alguém vai pagar, e não deve ser apresentada nem usada como se estimasse.</p>
</footer>
</body>
</html>
`;
}

export function renderPrioritiesPage(
  theme: TenantTheme,
  walletId: string,
  entries: readonly PriorityEntry[],
): string {
  const linhas = entries
    .map(
      (entry) => `<tr>
<td>${entry.operationalPriority}</td>
<td><a href="/carteiras/${encodeURIComponent(walletId)}/dossies/${encodeURIComponent(entry.dossierId)}">${escape(entry.externalId)}</a></td>
<td>${escape(entry.category)}</td>
<td class="numero">${escape(entry.score.toFixed(2).replace(".", ","))}</td>
</tr>`,
    )
    .join("\n");

  const vazio = `<p>Nenhum dossiê classificado nesta carteira.</p>`;
  const tabela = `<table>
<thead><tr><th>Prioridade</th><th>Título</th><th>Categoria</th><th>Pontuação</th></tr></thead>
<tbody>
${linhas}
</tbody>
</table>`;

  return layout(
    theme,
    "Prioridades",
    `<h1>Prioridades da carteira ${escape(walletId)}</h1>
<p><a href="/carteiras/${encodeURIComponent(walletId)}/importacoes">Importar carteira</a></p>
${entries.length === 0 ? vazio : tabela}`,
  );
}

/**
 * Why the reason codes are spelled out on the page: the operator who reads
 * this is the person who has to go and fix the spreadsheet. `CPF_INVALIDO` is
 * what the report and the audit record carry; the sentence next to it is what
 * makes the line actionable without a manual.
 */
const MOTIVOS: Readonly<Record<string, string>> = Object.freeze({
  ID_EXTERNO_AUSENTE: "a linha não traz identificador do título",
  ID_EXTERNO_DUPLICADO: "o mesmo identificador aparece em outra linha do arquivo",
  NOME_AUSENTE: "a linha não traz o nome do devedor",
  CPF_INVALIDO: "o dígito verificador do CPF não fecha",
  VALOR_INVALIDO: "o valor não é um número reconhecível",
  VENCIMENTO_INVALIDO: "o vencimento não é uma data no formato AAAA-MM-DD",
});

function importLayout(
  theme: TenantTheme,
  walletId: string,
  corpo: string,
): string {
  return layout(
    theme,
    "Importar carteira",
    `<p><a href="/carteiras/${encodeURIComponent(walletId)}/prioridades">← Prioridades da carteira</a></p>
<h1>Importar carteira ${escape(walletId)}</h1>
${corpo}`,
  );
}

export function renderImportFormPage(
  theme: TenantTheme,
  walletId: string,
  erro?: string,
): string {
  const aviso = erro
    ? `<p class="erro">O arquivo não foi lido: <strong>${escape(erro)}</strong>. Nada foi importado.</p>`
    : "";

  return importLayout(
    theme,
    walletId,
    `${aviso}
<form class="cartao" method="post" action="/carteiras/${encodeURIComponent(walletId)}/importacoes" enctype="multipart/form-data">
<p><span class="rotulo">Arquivo da carteira</span></p>
<p><input type="file" name="arquivo" accept=".csv,.xlsx" required></p>
<p><button type="submit">Conferir antes de importar</button></p>
</form>
<p>Uma linha do arquivo é <strong>um título</strong>, não um devedor: três
parcelas do mesmo devedor são três linhas, e o devedor emerge da agregação.
Colunas esperadas: <code>id_externo</code>, <code>nome</code>, <code>cpf</code>,
<code>valor</code> e <code>vencimento</code>. O arquivo pode ser CSV ou XLSX.</p>
<p>O próximo passo <strong>não grava nada</strong>: mostra o que seria aceito e
o que iria para quarentena, e só então pergunta se pode importar.</p>`,
  );
}

function acceptedTable(preview: WalletImportPreview): string {
  if (preview.accepted.length === 0) {
    return `<p>Nenhuma linha aceitável neste arquivo.</p>`;
  }

  const linhas = preview.accepted
    .map(
      (row) => `<tr>
<td class="numero">${row.rowNumber}</td>
<td>${escape(row.externalId)}</td>
<td>${escape(row.name)}</td>
<td class="numero">${escape(formatBrlFromCents(row.amount.toCents()))}</td>
<td>${escape(formatIsoDate(row.dueDate.toISOString()))}</td>
</tr>`,
    )
    .join("\n");

  return `<table>
<thead><tr><th>Linha</th><th>Título</th><th>Devedor</th><th>Valor</th><th>Vencimento</th></tr></thead>
<tbody>
${linhas}
</tbody>
</table>`;
}

/**
 * The quarantine table carries a line number and a reason, and nothing else.
 * It is written to be read by a person and exported by an operator, so a CPF —
 * whole or masked — must never reach it. The record it renders does not carry
 * one, which is the structural half of the same rule.
 */
function quarantineTable(preview: WalletImportPreview): string {
  if (preview.quarantined.length === 0) {
    return `<p>Nenhuma linha em quarentena.</p>`;
  }

  const linhas = preview.quarantined
    .map(
      (row) => `<tr>
<td class="numero">${row.rowNumber}</td>
<td><code>${escape(row.reason)}</code></td>
<td>${escape(MOTIVOS[row.reason] ?? "motivo não descrito")}</td>
</tr>`,
    )
    .join("\n");

  return `<table>
<thead><tr><th>Linha</th><th>Motivo</th><th>O que corrigir</th></tr></thead>
<tbody>
${linhas}
</tbody>
</table>`;
}

export function renderImportPreviewPage(
  theme: TenantTheme,
  walletId: string,
  filename: string,
  preview: WalletImportPreview,
  token: string,
): string {
  return importLayout(
    theme,
    walletId,
    `<div class="cartao">
<p><span class="rotulo">Arquivo</span> ${escape(filename)}</p>
<p><span class="rotulo">Linhas aceitas</span> ${preview.accepted.length}
&nbsp;·&nbsp; <span class="rotulo">Em quarentena</span> ${preview.quarantined.length}</p>
<p>Esta é uma conferência: <strong>nada foi gravado ainda</strong>.</p>
</div>
<h2>Serão importadas</h2>
${acceptedTable(preview)}
<h2>Quarentena</h2>
<p>Estas linhas não entram, e o resto do arquivo entra assim mesmo. Um arquivo
nunca é recusado inteiro por causa de uma linha, e nenhuma linha é descartada
em silêncio.</p>
${quarantineTable(preview)}
<form class="cartao" method="post" action="/carteiras/${encodeURIComponent(walletId)}/importacoes/confirmar">
<input type="hidden" name="preparo" value="${escape(token)}">
<p><button type="submit">Importar as ${preview.accepted.length} linhas aceitas</button></p>
</form>`,
  );
}

export function renderImportReportPage(
  theme: TenantTheme,
  walletId: string,
  report: WalletImportReport,
): string {
  return importLayout(
    theme,
    walletId,
    `<div class="cartao">
<p><span class="rotulo">Importação</span> <code>${escape(report.importId)}</code></p>
<p><span class="rotulo">Títulos criados</span> ${report.created}
&nbsp;·&nbsp; <span class="rotulo">Atualizados</span> ${report.updated}
&nbsp;·&nbsp; <span class="rotulo">Em quarentena</span> ${report.quarantined.length}</p>
<p>Reimportar o mesmo arquivo não duplica nada: o título é identificado pelo
<code>id_externo</code>, e a segunda passagem atualiza em vez de criar.</p>
</div>
<h2>Quarentena</h2>
${quarantineTable(report)}
<p><a href="/carteiras/${encodeURIComponent(walletId)}/prioridades">Ver as prioridades da carteira →</a></p>
<p>Os dossiês são compostos por consulta, não pela importação: a carteira
define quem pode ser consultado.</p>`,
  );
}

function renderField(campo: RoleDossierView["campos"][number]): string {
  const valor = campo.valorRetido
    ? `<span class="retido">${escape(campo.valor)}</span>`
    : escape(campo.valor);
  const evidencia = campo.evidenciaDetalhada
    ? `<ul class="evidencia">${campo.evidenciaVinculo
        .map((regra) => `<li>${escape(regra)}</li>`)
        .join("")}</ul>`
    : `<p class="evidencia">${campo.regrasCorrespondentes} regra(s) de correspondência.</p>`;

  return `<tr>
<td>${escape(campo.campo)}</td>
<td>${valor}</td>
<td>${escape(campo.status)}</td>
<td>${escape(campo.vinculoStatus)}${campo.vinculoConfirmado ? "" : ", não confirmado"}${evidencia}</td>
<td>${escape(campo.coletadoEm ?? "não coletado")}</td>
</tr>`;
}

export function renderDossierPage(
  theme: TenantTheme,
  walletId: string,
  view: RoleDossierView,
): string {
  const classificacao = view.classificacao;
  const sinais = classificacao
    ? classificacao.sinais
        .map(
          (sinal) => `<tr class="${sinal.aplicado ? "" : "nao-aplicado"}">
<td>${escape(sinal.nome)}</td>
<td class="numero">${escape(sinal.peso.toFixed(2).replace(".", ","))}</td>
<td>${escape(sinal.fonte)}</td>
<td>${sinal.aplicado ? "aplicado" : "não aplicado"}</td>
</tr>`,
        )
        .join("\n")
    : "";

  const blocoClassificacao = classificacao
    ? `<h2>Classificação</h2>
<div class="cartao">
<p><span class="rotulo">Categoria</span><br><strong>${escape(classificacao.categoria)}</strong></p>
<p><span class="rotulo">Estratégia primária</span><br>${escape(classificacao.estrategia)}</p>
<p><span class="rotulo">Pontuação</span> ${escape(classificacao.pontuacao.toFixed(2).replace(".", ","))}
&nbsp;·&nbsp; <span class="rotulo">Cobertura</span> ${escape(classificacao.cobertura)}
&nbsp;·&nbsp; <span class="rotulo">Política</span> ${escape(classificacao.versaoDaPolitica)}</p>
</div>
<h2>Sinais</h2>
<table>
<thead><tr><th>Sinal</th><th>Peso</th><th>Fonte</th><th>Situação</th></tr></thead>
<tbody>
${sinais}
</tbody>
</table>
<h2>Explicação</h2>
<div class="cartao"><p>${escape(classificacao.explicacao)}</p></div>`
    : "";

  const campos =
    view.campos.length === 0
      ? `<p>Este papel não tem acesso operacional aos campos da carteira.</p>`
      : `<table>
<thead><tr><th>Campo</th><th>Valor</th><th>Fonte</th><th>Vínculo</th><th>Coletado em</th></tr></thead>
<tbody>
${view.campos.map(renderField).join("\n")}
</tbody>
</table>`;

  const trilha =
    view.trilha.length === 0
      ? ""
      : `<h2>Trilha de auditoria</h2>
<table>
<thead><tr><th>Quando</th><th>Ator</th><th>Ação</th><th>Carteira</th><th>Resultado</th></tr></thead>
<tbody>
${view.trilha
  .map(
    (entrada) => `<tr>
<td>${escape(entrada.ocorridoEm)}</td>
<td>${escape(entrada.atorId)}</td>
<td>${escape(entrada.acao)}</td>
<td>${escape(entrada.carteiraId)}</td>
<td>${escape(entrada.resultado)}</td>
</tr>`,
  )
  .join("\n")}
</tbody>
</table>`;

  return layout(
    theme,
    "Dossiê",
    `<p><a href="/carteiras/${encodeURIComponent(walletId)}/prioridades">← Prioridades da carteira</a></p>
<h1>Dossiê ${escape(view.dossierId)}</h1>
<div class="cartao">
<p><span class="rotulo">Devedor</span><br>${escape(view.devedor?.nome ?? "não exibido para este papel")}</p>
<p><span class="rotulo">Composto em</span> ${escape(view.compostoEm)}
&nbsp;·&nbsp; <span class="rotulo">Cobertura</span> ${escape(view.cobertura.veredito)}
(${view.cobertura.slicesConclusivas} de ${view.cobertura.slicesEsperadas} slices conclusivas)
&nbsp;·&nbsp; <span class="rotulo">Papel</span> ${escape(view.papel)}</p>
<p>A data acima é a da composição. Cada campo declara separadamente quando foi
coletado.</p>
</div>
${blocoClassificacao}
<h2>Campos</h2>
${campos}
<p>Campo com vínculo não confirmado tem o valor retido de propósito: alguém
publicou aquele dado, mas ninguém estabeleceu que é desta pessoa.</p>
${trilha}`,
  );
}

/** Money formatting reaches the page only through the presentation edge. */
export { formatBrlFromCents };
