# ADR 019 — Invariantes monetários impostos em runtime

## Contexto

Os reparos iniciais da Task 2 encontraram quatro variações da mesma falha:
um invariante era expresso por tipo, schema ou prosa, mas não era imposto em
toda fronteira runtime. Isso permitia que `number` atravessasse um construtor
ou que um payload estruturalmente inválido parecesse compatível.

JSON não representa `bigint`. Portanto, dinheiro serializado precisa cruzar
fronteiras como string, mas a mesma string não pode significar ora centavos,
ora unidades decimais.

## Decisão

`Money` é um tipo nominal/opaco cuja classe de implementação fica privada no
módulo e carrega uma marca ECMAScript `#brand`. O valor runtime público
`Money` é um objeto-fábrica congelado, não uma classe nem um construtor. Só
`Money.fromCents(bigint)` e `Money.fromDecimalString(string)` criam a instância;
`Money.assert(unknown)` aceita como confiável apenas valor que carregue a marca
privada. O protótipo não expõe o construtor da implementação. Objeto com a mesma
forma e objeto criado a partir do protótipo são rejeitados.

`fromCents` aceita somente `bigint`; `fromDecimalString` aceita somente decimal
canônico `^-?\d+\.\d{2}$`. Nenhuma função aceita objeto estrutural com aparência
de dinheiro.

`SerializedCentsSchema` é o schema Zod único de centavos transportados:
`^-?\d+$`, sem `number`. A fronteira que precisa do valor de domínio usa seu
parser derivado para validar a string e converter para `bigint` antes de chamar
o objeto-fábrica. Contratos JSON usam a mesma gramática, sem duplicá-la. Leituras
de persistência e entradas HTTP/CSV/XLSX devem passar por essa fronteira.

Arquivos de carteira não relaxam o domínio: o normalizador de borda aceita as
formas declaradas da planilha, produz decimal canônico com duas casas e só então
chama `fromDecimalString`. O normalizador não recebe nem devolve `number`.

Uma regra de lint proíbe `number` e `z.number()` nos módulos monetários; testes
paramétricos verificam entradas inválidas. As gramáticas são propositalmente
disjuntas: `"123456"` é centavos serializados, mas não decimal; `"1234.56"` é
decimal, mas não centavos.

## Consequências

Chamadores futuros não podem escolher uma representação monetária implícita.
Cada brief de tarefa deve transformar invariantes do `AGENTS.md` aplicáveis em
critérios de aceite explícitos e testáveis. Um novo defeito distinto nesta
fatia é bloqueador de escopo e exige decisão humana antes de nova correção.
