# Limites da política de triagem da v1

## O que a v1 faz

A v1 produz uma categoria de política, sinais explicáveis e uma prioridade
operacional ordinal para organizar esforço de cobrança. Ela recomenda canal, tom,
cadência e elegibilidade para parcelamento com incertezas e cobertura explícitas.

## O que a v1 não faz

* Não prevê probabilidade de pagamento, inadimplência, renda ou capacidade de
  pagamento.
* Não treina modelo estatístico ou de machine learning.
* Não transforma vínculo societário, ausência em fonte parcial, falha de fonte ou
  match de baixa confiança em fato de cobrança.
* Não consulta pessoas fora da carteira autorizada nem automatiza a Lista de
  Devedores PGFN.

O schema e a API usam `categoria_politica` e `prioridade_operacional`; são
proibidos nomes que sugiram probabilidade, como `propensao_pagar` ou
`probabilidade_pagamento`.

## O que seria necessário para evolução preditiva

Para considerar modelo preditivo no futuro, o cliente precisará de desfechos
observados suficientes, representativos e com qualidade auditável; validação
temporal independente; análise de vieses e impactos; base legal e governança
validadas; monitoramento de deriva; revisão humana; e aprovação de novo design,
ADR e política de retenção. Histórico pequeno serve somente para verificar se a
ordenação por regras está na direção esperada, nunca para treinar ou calibrar.

