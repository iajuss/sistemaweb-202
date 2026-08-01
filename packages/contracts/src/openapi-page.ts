import type { OpenApiOperation } from "./openapi.js";

/**
 * The OpenAPI document, rendered as one self-contained HTML page.
 *
 * **Why this exists at all:** the contract is the product, and reading it
 * should not require cloning the repository, installing anything or starting a
 * server. This page can be published; the application deliberately cannot
 * (pendency P-1), and the page says so, so that nobody who finds it reads it as
 * the address of a running service.
 *
 * **Why it is written here and not by a viewer:** the usual answer is a script
 * tag pointing at a CDN. That would put a third party into the delivery of a
 * system that refuses third parties everywhere else, and it would break the
 * "no new dependency" rule by the back door. The page is plain HTML and inline
 * CSS, generated from the same document the runtime validates against.
 */

export interface RenderableOpenApiDocument {
  readonly openapi: string;
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Record<
    string,
    Partial<Record<"get" | "post", OpenApiOperation>>
  >;
  readonly components?: { readonly schemas: Record<string, unknown> };
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

function json(value: unknown): string {
  return escape(JSON.stringify(value, null, 2));
}

function renderOperation(
  path: string,
  method: string,
  operation: OpenApiOperation,
): string {
  const parameters = (operation.parameters ?? [])
    .map(
      (parameter) =>
        `<li><code>${escape(parameter.name)}</code> em ${escape(parameter.in)}${
          parameter.required ? " — obrigatório" : " — opcional"
        }</li>`,
    )
    .join("");

  const body = operation.requestBody
    ? Object.entries(operation.requestBody.content)
        .map(
          ([media, content]) =>
            `<h4>Corpo da requisição — <code>${escape(media)}</code></h4>
<pre>${json(content.schema)}</pre>`,
        )
        .join("")
    : "";

  const responses = Object.entries(operation.responses)
    .map(([status, response]) => {
      const media = Object.entries(response.content ?? {})
        .map(
          ([type, content]) =>
            `<p class="media"><code>${escape(type)}</code></p>
<pre>${json(content.schema)}</pre>`,
        )
        .join("");
      return `<div class="resposta">
<p><span class="status">${escape(status)}</span> ${escape(response.description)}</p>
${media}
</div>`;
    })
    .join("");

  return `<section class="operacao">
<h3><span class="metodo">${escape(method.toUpperCase())}</span> <code>${escape(path)}</code></h3>
<p>${escape(operation.summary)}</p>
${parameters === "" ? "" : `<h4>Parâmetros</h4><ul>${parameters}</ul>`}
${body}
<h4>Respostas</h4>
${responses}
</section>`;
}

export function renderOpenApiPage(
  document: RenderableOpenApiDocument,
): string {
  const operations = Object.entries(document.paths)
    .flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) =>
        renderOperation(path, method, operation as OpenApiOperation),
      ),
    )
    .join("\n");

  const schemas = Object.entries(document.components?.schemas ?? {})
    .map(
      ([name, schema]) => `<section class="operacao">
<h3 id="schema-${escape(name)}">${escape(name)}</h3>
<pre>${json(schema)}</pre>
</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(document.info.title)} — contrato ${escape(document.info.version)}</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: #1b1b1b; background: #f4f6f8; }
header { background: #1b2b3a; color: #fff; padding: 1.5rem; }
header h1 { margin: 0 0 .25rem; font-size: 1.4rem; }
header p { margin: 0; opacity: .85; font-size: .9rem; }
main { max-width: 56rem; margin: 0 auto; padding: 1.5rem; }
h2 { font-size: 1.1rem; margin: 2rem 0 .75rem; }
h3 { font-size: 1rem; margin: 0 0 .5rem; }
h4 { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: #55606b; margin: 1rem 0 .35rem; }
.operacao { background: #fff; border: 1px solid #dfe4e9; padding: 1rem 1.25rem; margin-bottom: 1rem; }
.metodo { background: #1b2b3a; color: #fff; padding: .1rem .45rem; font-size: .8rem; letter-spacing: .05em; }
.status { font-weight: 600; }
.resposta { border-top: 1px solid #eef1f4; padding-top: .5rem; }
.media { margin: .25rem 0; font-size: .85rem; color: #55606b; }
pre { background: #f7f9fa; border: 1px solid #e6eaee; padding: .75rem; overflow-x: auto; font: .82rem/1.45 ui-monospace, monospace; }
code { font: .9em ui-monospace, monospace; }
.aviso { background: #fff6d9; border: 1px solid #e8d9a0; padding: 1rem 1.25rem; }
footer { max-width: 56rem; margin: 0 auto; padding: 0 1.5rem 2rem; font-size: .85rem; color: #55606b; }
</style>
</head>
<body>
<header>
<h1>${escape(document.info.title)}</h1>
<p>OpenAPI ${escape(document.openapi)} · versão ${escape(document.info.version)}</p>
</header>
<main>
<div class="aviso">
<p><strong>Isto é documentação de contrato. A aplicação não está publicada, e
isso é decisão, não pendência de tempo.</strong></p>
<p>O sistema falha fechado sem verificação de JWT/JWKS (pendência <strong>P-1</strong>):
fora de <code>NODE_ENV=development</code> nenhuma principal verificada é emitida,
em nenhuma chamada. Publicar a aplicação exigiria desligar essa guarda num
sistema que decifra CPF. Um contrato estático não tem banco atrás e não decifra
nada — por isso ele pode ser publicado e a aplicação não.</p>
<p>Este arquivo é gerado a partir dos mesmos schemas Zod que o servidor valida
em runtime. Contrato escrito à mão em paralelo ao código é proibido neste
projeto: se o código muda o contrato, a diferença aparece aqui.</p>
</div>

<h2>Operações</h2>
${operations}

<h2>Schemas</h2>
${schemas}
</main>
<footer>
<p>Toda requisição exige o cabeçalho <code>Authorization</code> e responde
<code>cache-control: no-store</code>: o dossiê é dado pessoal de pessoa
identificada. Não existe consulta aberta por CPF — o único identificador que o
chamador segura é o <code>id_externo</code> do título, dentro de uma carteira
que ele já tem autorização para ler.</p>
<p>A pontuação ordena esforço de cobrança entre devedores. Ela não estima se
alguém vai pagar, e não deve ser apresentada nem usada como se estimasse.</p>
</footer>
</body>
</html>
`;
}
