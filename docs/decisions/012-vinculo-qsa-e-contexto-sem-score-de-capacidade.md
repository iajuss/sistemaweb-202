# ADR 012 — Vínculo QSA é evidência de identidade e contexto, não score financeiro

## Contexto

Ser sócio ou administrador de empresa não demonstra renda, liquidez, capacidade
de pagamento, patrimônio ou um canal de contato alternativo da pessoa. Usar esse
vínculo como proxy financeiro seria uma inferência injustificada.

## Decisão

O vínculo QSA tem duas finalidades explícitas: compor a evidência de resolução de
identidade pela regra nomeada `coocorrencia_qsa` e oferecer contexto corporativo
verificado a quem tenha permissão de dossiê completo. No motor de classificação,
o sinal `vinculo_societario_qsa_contextual` tem peso `0` e contribuição `0`: não
altera propensão, prioridade, parcelamento, canal ou tom. Ele não infere renda ou
capacidade e não revela contato empresarial.

## Alternativas descartadas

* **Usar QSA como sinal de capacidade de pagamento ou renda PJ:** o dado não
  demonstra nenhuma dessas condições.
* **Derivar canal alternativo de vínculo societário:** o vínculo não prova que um
  contato empresarial é canal autorizado para cobrança pessoal.
* **Coletar sem finalidade declarada:** viola minimização.

## Consequências

O dossiê para agente explicita que o contexto QSA não é fator financeiro. Qualquer
uso futuro como sinal de classificação requer nova finalidade, evidência e ADR.

