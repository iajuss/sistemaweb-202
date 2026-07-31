# Design — imposição runtime de dinheiro

## Objetivo

Impedir `number` em todas as fronteiras monetárias e eliminar ambiguidade entre
centavos serializados e decimais em unidade monetária.

## Fluxo

`HTTP/DB/arquivo` → schema ou normalizador de borda → forma canônica string →
objeto-fábrica congelado `Money` → valor opaco criado por uma implementação
privada do módulo. O export runtime não é classe nem construtor; nenhum
consumidor constrói `Money` por objeto.

A fábrica expõe `fromCents`, `fromDecimalString` e `assert`. A assertiva usa a
marca ECMAScript privada da implementação, portanto forma e protótipo não
convertem um objeto estrutural em valor confiável.

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
- O export runtime `Money` não é construtível, e sua assertiva aceita somente
  valores criados pelas fábricas.
- Uma instância confiável não expõe o construtor privado da implementação por
  seu protótipo.
- Objeto com a mesma forma e objeto criado do protótipo da implementação são
  rejeitados pela assertiva.
- O lint rejeita `number` e `z.number()` em módulos monetários.
- O template de brief exige critérios de aceite explícitos para invariantes
  aplicáveis do `AGENTS.md`.
- Se surgir quinto defeito distinto da Task 2, a execução para e é escalada.
