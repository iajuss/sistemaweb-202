# ADR 009 — Retenção por tenant, crypto-shredding e auditoria pseudonimizada

## Contexto

O sistema armazena carteira, observações públicas, dossiês, classificações e
auditoria. Snapshots são imutáveis, mas essa propriedade não justifica retenção
indefinida nem impede eliminação de dados pessoais.

## Decisão

Retenção é uma política declarativa, versionada e configurável por tenant e
classe de dado. O núcleo recebe essa política como dependência; nenhum prazo fica
espalhado em constantes de regra ou schema. Um job agendado executa expurgo e é
testado tanto para remover a carga pessoal vencida quanto para preservar o
esqueleto de auditoria pseudonimizado.

O expurgo de dossiê/classificação remove a carga pessoal e mantém somente
decisão, data, versão de regras, fontes e sinais pseudonimizados. Crypto-shredding
por titular é o mecanismo para inutilizar cargas de snapshots sem alterar a
estrutura imutável. Métricas só podem permanecer sem prazo quando agregadas e
anonimizadas de forma irreversível e verificável.

## Alternativas descartadas

* **Prazos codificados em regras de negócio:** exige alteração de código/schema
  para adequação normativa ou contratual.
* **`DELETE` cego de snapshots:** elimina evidência mínima para auditoria e
  revisão.
* **Imutabilidade sem expurgo:** conflita com minimização e direitos do titular.

## Consequências

Cada política terá versão, vigência e escopo de tenant auditáveis. A definição
dos prazos abaixo é premissa técnica pendente de validação jurídica; mudanças
futuras alteram configuração e testes, não a estrutura dos dados.

