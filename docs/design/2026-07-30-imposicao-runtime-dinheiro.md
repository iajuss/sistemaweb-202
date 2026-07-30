# Design — imposição runtime de dinheiro

## Objetivo

Impedir `number` em todas as fronteiras monetárias e eliminar ambiguidade entre
centavos serializados e decimais em unidade monetária.

## Fluxo

`HTTP/DB/arquivo` → schema ou normalizador de borda → forma canônica string →
fábrica `Money` → valor opaco. Nenhum consumidor constrói `Money` por objeto.

Centavos serializados usam `^-?\d+$`; decimal canônico usa
`^-?\d+\.\d{2}$`. O normalizador de planilha converte somente formatos de
arquivo explicitamente aceitos para o segundo formato. Ele não chama
`Number`, não aceita notação exponencial e não altera a gramática do domínio.

## Critérios de aceite

- `fromCents` rejeita `number`, string, `null` e float em runtime.
- `fromDecimalString` aceita apenas string decimal canônica com duas casas e
  rejeita `number`, centavos serializados, espaço, separador de milhar e
  notação exponencial.
- O parser Zod de centavos rejeita `number`, `null`, float e decimal com ponto,
  e converte a string válida para `Money`.
- `"123456"` é aceito apenas como centavos e `"1234.56"` apenas como decimal;
  o teste explica o risco de 100×.
- O lint rejeita `number` e `z.number()` em módulos monetários.
- O template de brief exige critérios de aceite explícitos para invariantes
  aplicáveis do `AGENTS.md`.
- Se surgir quinto defeito distinto da Task 2, a execução para e é escalada.
