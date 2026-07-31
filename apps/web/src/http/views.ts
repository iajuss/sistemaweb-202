import { formatBrlFromCents, type RoleDossierView } from "@panella/contracts";
import type { PriorityEntry } from "@panella/application";

/**
 * The two pages, server-rendered as strings. No framework, no client bundle
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
${entries.length === 0 ? vazio : tabela}`,
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
