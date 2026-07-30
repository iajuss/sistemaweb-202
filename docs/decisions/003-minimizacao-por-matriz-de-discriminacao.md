# ADR 003 — Schema de identidade é limitado à matriz de discriminação

## Contexto

Coletar campos pessoais que não ajudam a resolver identidade em nenhuma fonte
contraria minimização. Ao mesmo tempo, nome e CPF da carteira são indispensáveis
para comparar com registros públicos mascarados e homônimos.

## Decisão

O schema de importação separa campos de **âncora de identidade** dos campos de
**operação de cobrança**. A matriz abaixo define os primeiros. `✓` significa
capacidade confirmada; `~` significa que o contrato do adapter ainda deve ser
validado com documentação/fixture oficial e não poderá ser usado como fato no
score antes disso; `—` significa que não discrimina a pessoa naquela fonte.

| Campo | PGFN | Portal da Transparência (CEIS/CEAF) | QSA/RFB | Decisão |
|---|---:|---:|---:|---|
| CPF completo da carteira | comparação com máscara (✓) | filtro de consulta (✓) | gera candidatos por máscara de sócio, nunca join por igualdade (✓) | obrigatório, cifrado |
| Posições 4–9 do CPF | máscara retornada (✓) | — | máscara de sócio (✓) | derivado, uso interno do matcher |
| Nome | registro retornado (✓) | payload específico a validar (~) | nome do sócio no layout de dados abertos (✓) | obrigatório, normalizado apenas em memória |
| UF | — | — | endereço da empresa, não da pessoa (—) | fora do schema de identidade |
| Município | — | — | endereço da empresa, não da pessoa (—) | fora do schema de identidade |
| Data de nascimento | — | — | — | fora do schema |

Os dados opcionais fornecidos pelo cliente — histórico de pagamento, desfecho
de contato e canais disponíveis — ficam em um bloco operacional distinto: não
são usados para vincular um registro público à pessoa. Vencimento e valor
pertencem ao título; dias de atraso é derivado. A necessidade desses campos será
documentada por finalidade na matriz LGPD.

## Alternativas descartadas

* **Coletar UF, município e data de nascimento “por precaução”:** não há poder
  de discriminação nas três fontes escolhidas.
* **Usar metadados de empresa como endereço da pessoa:** produz falso vínculo.
* **Promover campo não verificado a sinal de score:** transforma incerteza de
  contrato em conclusão sobre o devedor.

## Consequências

O design e as migrations não incluirão UF, município ou nascimento para
identidade. PGFN e QSA/RFB usam o mesmo módulo de resolução de identidade; o
adapter do Portal terá teste de contrato/fixture antes que o nome retornado seja
consumido. Toda ampliação futura da matriz exige justificar finalidade, fonte e
discriminação em ADR e documentação LGPD.
