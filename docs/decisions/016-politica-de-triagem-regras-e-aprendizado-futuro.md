# ADR 016 — Política de triagem por regras, auditável e reexecutável

## Contexto

Não existem desfechos observados rotulados para treinar ou calibrar um modelo
preditivo. O produto precisa alocar esforço de cobrança sem fingir probabilidade
de pagamento ou precisão estatística inexistente.

## Decisão

A v1 é uma **política de triagem baseada em regras**, declarativa, versionada e
conferida manualmente. O contrato usa `categoria_politica`, sinais nomeados e
`prioridade_operacional` ordinal para ordenar a carteira; não terá campo com nome
ou semântica de probabilidade, como `propensao_pagar`.

A política adota assimetria conservadora: na incerteza recomenda abordagem mais
leve. Cobrança intensiva requer identidade `CONFIRMED`, cobertura suficiente e
evidência forte prevista explicitamente pela regra. Categorias e ordenação são
derivadas do mesmo conjunto de sinais, mas a ordenação permite corte por
capacidade de equipe sem transformar prioridade em probabilidade.

Cada classificação imutável guarda versão de política, categoria, ordem e sinais
que contribuíram. Desfecho de cobrança é uma observação append-only separada,
vinculada à classificação: contato feito, resposta, pagamento, parcelamento ou
silêncio. Uma nova versão pode ser executada sobre dossiês antigos e comparada à
classificação anterior sem a alterar.

Validação sem rótulo é obrigatória: casos-limite calculados à mão antes da
implementação; análise de sensibilidade de cada peso em ±20%, que não pode trocar
categoria sem justificativa; e inspeção de distribuição sobre carteira sintética
de teste. Histórico pequeno fornecido pelo cliente pode validar direção da
ordenação, mas nunca treinar ou ajustar pesos.

## Alternativas descartadas

* **Chamar regras de modelo de propensão:** comunica uma capacidade preditiva não
  demonstrada.
* **Categoria sem ordenação:** não resolve alocação de equipe finita.
* **Atualizar classificação com desfecho no lugar:** destrói reexecução e
  comparabilidade de política.
* **Ajustar pesos a amostra pequena:** sobreajusta e produz falsa precisão.

## Consequências

Configuração de política terá versão e testes de estabilidade. O schema e a
OpenAPI gerados do código precisam descrever a limitação; comparação entre versões
será recurso de domínio e não nova consulta de fonte.

