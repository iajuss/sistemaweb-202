# ADR 017 — Observações brutas, resolução reexecutável e workers particionados

## Contexto

Confiança de identidade pode melhorar sem que a fonte seja consultada de novo.
Workers também processam publicações únicas contra carteiras de diversos tenants,
o que cria risco especial de vazamento se houver observação global.

## Decisão

`SourceAdapter` produz fatos brutos e cobertura; observação persistida é
tenant-scoped e não contém confiança de vínculo. A resolução de identidade é
etapa própria, reexecutável, entre observação e composição de dossiê. O compositor
é dirigido por lista declarada de fontes/slices esperadas e produz estados
explícitos, nunca deduz ausência de fato por ausência de observação.

Workers usam ator de sistema e candidatos de carteiras ativas apenas em memória.
Após match, persistem observação separada por tenant; não existe cache ou tabela
global de observações. Import manual da Lista PGFN é rota de operador distinta de
worker. Quarentena participa do expurgo.

## Consequências

Testes precisam provar re-resolução sem reconsulta, cobertura incompleta como
`NAO_CONSULTADO` e isolamento total entre tenants na carga em lote.

