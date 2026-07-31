# ADR 023 — Precisão excedente: carteira quarentena, fonte publicada arredonda com rastro

**Data:** 2026-07-31
**Status:** aceito

## Contexto

Medição sobre o arquivo real da Lista de Devedores PGFN (91 registros, 2026-07-27,
conferido localmente, não versionado):

| Coluna | 2 casas | Excesso não-zero | Sem vírgula |
|---|---|---|---|
| `Valor Total` | 72 | 17 | 2 |
| `Valor da Dívida Selecionada` | 71 | 19 | 1 |

Máximo observado: **14 casas decimais**. E `Valor Total` diverge de `Valor da
Dívida Selecionada` em **31 dos 91** registros, confirmando o que o `AGENTS.md`
já registrava.

Ou seja: cerca de 19% das linhas da fonte real trazem ruído de serialização
IEEE-754, do tipo `29163886,440000001`. A regra estrita de quarentena — correta
para a carteira — descartaria em silêncio um quinto da fonte.

Os dois casos parecem o mesmo problema e não são:

- **Carteira do cliente**: o valor é a afirmação do cliente sobre a própria
  dívida. Casa decimal não-zero além dos centavos é erro de dado, e vale nomear.
- **Valor publicado pela PGFN**: o excesso é ruído de ponto flutuante na
  publicação, não um centésimo de centavo que alguém deva. Quarentenar é
  descartar dívida real.

## Decisão

Duas funções, duas regras, nenhuma se disfarçando da outra.

`normalizeSpreadsheetMoney` (carteira) aceita **zero, uma ou duas casas** —
`1234` é R$ 1.234,00 e `1,2` é R$ 1,20, que é como um ERP escreve uma coluna
documentada em reais. Casas além das duas passam **somente quando zeros**:
`1.234,5600` é exatamente `1.234,56`, e export de ERP formata quatro casas por
hábito. Precisão não-zero levanta `SPREADSHEET_MONEY_PRECISION_EXCEEDS_CENTS` e
a linha vai para quarentena com relatório.

A exigência de duas casas pertence a `Money.fromDecimalString`, e só lá: no
construtor a ambiguidade entre centavos e reais é real, e `"1234.5"` continua
recusado. Ela estava sendo imposta uma camada cedo demais, no normalizador de
borda, onde a coluna já é documentada em reais e ambiguidade não existe — o
efeito era quarentenar dinheiro perfeitamente legível. Um teste amarra as duas
camadas para que a assimetria não seja "corrigida" por engano.

`normalizeSourceMoney` (fonte publicada) devolve
`{ cents, raw, roundedFromExcessPrecision }`:

- arredonda para centavos por **meio-para-cima sobre a terceira casa**,
  inteiramente em aritmética de `BigInt` sobre a string — nenhum valor
  monetário passa por `Number` em momento algum;
- preserva a string publicada em `raw`, que vai junto na observação;
- marca `roundedFromExcessPrecision`, de modo que a derivação é declarada e não
  presumida.

Nada é perdido: a observação carrega exatamente o que foi publicado, e o campo
em centavos é explicitamente derivado.

`Valor Total` e `Valor da Dívida Selecionada` continuam dois campos distintos,
sem fallback de um para o outro em hipótese alguma (ADR 014 e `AGENTS.md`).

## Alternativas descartadas

- **Quarentenar também na fonte:** descarta 19% da dívida real observada.
- **Truncar em silêncio:** muda dinheiro sem dizer, que é exatamente o que os
  invariantes existem para impedir.
- **Guardar o valor como float:** proibido, e é a origem do problema.
- **Uma função só, com flag:** o chamador erraria a flag um dia, e o erro seria
  silencioso nos dois sentidos.

## Consequências

- O importador da Lista lê o arquivo real inteiro sem descartar linha por
  formatação.
- Toda observação de valor publicado carrega o texto original, então a
  conferência à mão continua possível depois do fato.
- `roundedFromExcessPrecision` é sinal de qualidade de fonte, disponível para a
  política de triagem se um dia importar.
