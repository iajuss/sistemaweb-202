# ADR 022 — Leitor XLSX próprio, sem dependência externa

**Data:** 2026-07-31
**Status:** aceito

## Contexto

A carteira do cliente chega em XLSX direto (invariante de `AGENTS.md`), então o
importador precisa ler a planilha sem passar por conversão manual para CSV.

As opções de mercado envelheceram mal para este caso:

- `xlsx` (SheetJS) saiu do registro público do npm; a versão que resta lá é
  antiga e carrega CVEs conhecidas.
- `exceljs` traz uma árvore de dependências transitivas grande para o que aqui
  é uma leitura de quatro colunas.
- O defeito E-1 de `docs/limitacoes-v1.md` já corrompeu `node_modules` no
  Windows duas vezes; toda instalação nova é risco de prazo real.

XLSX não é API de terceiro: é ZIP com XML, formato publicado e estável. Node 22
já traz `zlib.inflateRawSync`, que é a única primitiva que faltava.

## Decisão

Ler XLSX com código próprio em `packages/adapters/src/wallet-importers/xlsx.ts`,
sem dependência externa. O leitor cobre o que uma carteira exportada usa:

- diretório central do ZIP, com entradas `STORED` e `DEFLATE`;
- `sharedStrings.xml`, incluindo texto dividido em *runs*;
- células `inlineStr`, `str` (resultado de fórmula) e numéricas;
- datas em serial do Excel, resolvidas por `styles.xml` — formato embutido de
  data ou formato próprio contendo `y`/`m`/`d` — com a época 1899-12-30 e o bug
  bissexto de 1900;
- planilha alvo resolvida por `workbook.xml` e seus rels, não por caminho fixo.

Escrever é fora de escopo: o sistema lê carteira, não emite planilha.

## Consequências

- Zero dependência nova, zero exposição a supply chain, zero risco de E-1 nesta
  fatia.
- **Não verificado:** nenhum arquivo produzido pelo Excel foi lido em teste. A
  fixture é sintética e gerada por `scripts/make-wallet-fixtures.mjs`, que
  escreve ZIP com DEFLATE, `sharedStrings`, célula `inlineStr` e data em serial
  com estilo — as formas que o Excel emite —, mas isso é evidência de formato,
  não de campo. O primeiro arquivo real de cliente é o teste que falta.
- Formatos fora do recorte (planilha protegida, XLSB, XLS binário antigo)
  falham com erro nomeado, nunca com linha silenciosamente vazia.
- Se um arquivo real quebrar o leitor, a saída é adotar `exceljs`; a fronteira
  `WalletFileParser` existe justamente para tornar essa troca local.
