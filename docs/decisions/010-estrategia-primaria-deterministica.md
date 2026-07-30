# ADR 010 — Uma estratégia primária determinística por devedor

## Contexto

O agente consumidor precisa de uma instrução acionável. Estratégias concorrentes
sem prioridade transferem ao agente uma decisão que o motor deve explicar e
auditar.

## Decisão

Uma classificação suficiente produz exatamente uma `estrategia_primaria`
determinística, acompanhada de canal, tom, cadência e elegibilidade para
parcelamento. Sinais, cobertura e incertezas permanecem expostos e podem trazer
alternativas justificadas, mas nunca como recomendações empatadas. Quando a
cobertura for insuficiente, a categoria é `DADOS_INSUFICIENTES` e não haverá
estratégia afirmativa.

## Alternativas descartadas

* **Várias recomendações concorrentes:** cria ambiguidade e impede atribuir a
  decisão a uma regra concreta.
* **Ocultar alternativas e sinais:** reduz explicabilidade e revisão humana.

## Consequências

Regras declarativas devem resolver empates de forma estável, e o golden test da
representação para prompt terá uma única instrução principal por dossiê.

