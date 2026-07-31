// Regenerates the synthetic PGFN Dados Abertos fixtures.
//
// Synthetic on purpose: the real published file contains real people and is
// gitignored, kept out of logs and never sent to a third party. These files
// preserve the *patterns* that matter — the 4-9 CPF mask, homonymy, a blank
// line in the middle of a part, and a Latin-1 encoding with decimal commas —
// without carrying anyone's data.
//
// Column names follow the published layout and are NOT contract-verified; see
// docs/fontes.md, where PGFN Dados Abertos is marked "não verificado".
//
// Run: node scripts/make-pgfn-fixtures.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(
  new URL("../fixtures/pgfn/open-data/", import.meta.url),
);
mkdirSync(outputDirectory, { recursive: true });

const HEADER = [
  "CPF_CNPJ",
  "TIPO_PESSOA",
  "NOME_DEVEDOR",
  "UF_UNIDADE_RESPONSAVEL",
  "NUMERO_INSCRICAO",
  "TIPO_SITUACAO_INSCRICAO",
  "SITUACAO_INSCRICAO",
  "DATA_INSCRICAO",
  "VALOR_CONSOLIDADO",
].join(";");

function row(fields) {
  return fields.join(";");
}

// The wallet CPF used across the fixtures is 529.982.247-25, whose published
// mask is ***.982.247-**. The homonym below shares the name but not the mask.
const parts = {
  "sida-sp-01.csv": [
    HEADER,
    row([
      "***.982.247-**",
      "FISICA",
      "JOSE DA SILVA",
      "SP",
      "12.345.678-9",
      "Em cobrança",
      "ATIVA",
      "2023-04-12",
      "29.163.886,44",
    ]),
    "",
    row([
      "***.111.222-**",
      "FISICA",
      "JOSE DA SILVA",
      "SP",
      "98.765.432-1",
      "Em cobrança",
      "ATIVA",
      "2024-01-09",
      "1.500,00",
    ]),
    row([
      "***.982.247-**",
      "FISICA",
      "MARIA JOSE ALVES PEREIRA SOARES SANTOS",
      "SP",
      "55.555.555-5",
      "Parcelamento",
      "SUSPENSA",
      "2022-11-30",
      "8.320,10",
    ]),
    "",
  ],
  "previdenciario-sp-01.csv": [
    HEADER,
    row([
      "***.982.247-**",
      "FISICA",
      "JOSE DA SILVA",
      "SP",
      "77.777.777-7",
      "Em cobrança",
      "ATIVA",
      "2021-08-15",
      "12.000,00",
    ]),
  ],
  "fgts-sp-01.csv": [HEADER],
};

for (const [name, lines] of Object.entries(parts)) {
  writeFileSync(
    `${outputDirectory}${name}`,
    Buffer.from(lines.join("\r\n"), "latin1"),
  );
}

console.log(`fixtures written to ${outputDirectory}`);
