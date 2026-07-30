# ADR 014 — Dados Abertos e Lista PGFN são universos separados

## Contexto

Dados Abertos PGFN incluem créditos ativos em todas as situações; a Lista de
Devedores contém somente situação irregular. Ausência na Lista não significa
ausência de dívida e um arquivo incompleto pode omitir sistemas ou Estados.

## Decisão

Existem duas fontes distintas, sem fusão de campos ou sobrescrita:

* `PGFN_DADOS_ABERTOS`: worker trimestral processa Dívida Ativa Geral (SIDA),
  Dívida Previdenciária (Sistema Dívida) e FGTS, em todas as partes de UF quando
  a carteira não tiver UF. O manifesto lista referência, sistema, UF, arquivo,
  checksum e resultado de cada parte.
* `PGFN_LISTA_DEVEDORES_MANUAL`: XLSX/CSV exportado manualmente por operador.
  O parser captura preâmbulo, filtros e procedência por bloco; bloco sem
  procedência é marcado ou recusado. Ele vale somente para o recorte declarado e
  jamais sobrescreve observação de Dados Abertos.

Ambas usam o módulo único de resolução de identidade: máscara de CPF gera
candidatos e nome os ranqueia. Para Dados Abertos, parte não processada é
`NAO_CONSULTADO`, erro de parte é `ERRO_NA_FONTE`, e só uma cobertura completa
dos recortes aplicáveis permite `NAO_ENCONTRADO`.

O sinal de primeira classe `pgfn_regularidade_indiciada_por_delta` só é elegível
quando há vínculo confirmado nos Dados Abertos e `NAO_ENCONTRADO` confirmado na
Lista manual de escopo integral, sem filtros restritivos e para a mesma consulta
de CPF. Ele tem peso declarativo próprio e positivo, distinto de qualquer outro
sinal, e recomenda tom colaborativo e preservação/renegociação de acordo, nunca
escalada agressiva. Fora dessas pré-condições, o delta não é calculado.

`coletado_em` é a data de referência da publicação; a data do job fica no
manifesto. A confiança sofre decaimento por idade de base configurável e
versionado, pois uma publicação trimestral pode estar defasada.

## Alternativas descartadas

* **Fusão de Dados Abertos e Lista em um campo de dívida:** apaga a semântica de
  regularidade e transforma ausência em conclusão inválida.
* **Processar uma única origem/SUF:** subestima dívida em silêncio.
* **Usar matcher exclusivo no ETL:** duplica regra de identidade e fragiliza os
  invariantes.

## Consequências

O motor tem fixture que prova o delta positivo e fixtures que provam que cobertura
parcial ou Lista filtrada não geram o sinal. Valores continuam em campos distintos
e monetários, sem fallback entre total e dívida selecionada.

