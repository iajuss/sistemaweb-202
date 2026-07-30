# ADR 002 — CPF é cifrado em repouso; hash não substitui dado operacional

## Contexto

O hash do CPF é adequado para índice e deduplicação, mas não permite reverter o
valor. A PGFN publica CPF mascarado e a cada coleta o sistema precisa verificar
as posições 4–9 do CPF da carteira contra a máscara. Portanto, reter somente o
hash inviabilizaria refresh e resolução de identidade.

## Decisão

O CPF completo é armazenado cifrado em repouso, com chave gerenciada, e só é
descriptografado no limite operacional do adapter/matcher autorizado. Um hash
com segredo (HMAC) é usado para índice e agregação, nunca como substituto para
o valor operacional. O fragmento das posições 4–9 é derivado somente em memória,
a partir do CPF decifrado durante o matching; ele nunca é persistido, indexado ou
exposto como identificador público.

CPF em claro não pode aparecer em URL, logs, telemetria, mensagens de erro,
auditoria legível ou respostas da API. A auditoria usa identificador interno do
devedor e hash truncado não reversível quando necessário. A definição da chave,
rotação, retenção e controle de acesso será fechada antes do deploy, pois
depende do ambiente do cliente.

## Alternativas descartadas

* **Reter apenas hash/token:** não permite comparação posterior com a máscara
  PGFN nem chamadas que exijam o CPF autorizado da carteira.
* **Reter CPF em texto claro:** amplia indevidamente a superfície de exposição.
* **Tentar inferir o CPF a partir da máscara pública:** é tecnicamente ambíguo e
  juridicamente incompatível com o escopo restrito à carteira.

## Consequências

O modelo exigirá uma fronteira de criptografia testável e privilégios mínimos.
Backups, fixtures e relatórios não receberão CPF em claro. Fixtures reproduzirão
somente padrões sintéticos de máscara e homonímia.
