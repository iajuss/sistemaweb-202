# ADR 018 — Snapshot explica sua resolução, revisão e eliminação

## Contexto

Snapshots precisam permanecer explicáveis após correção de identidade, pedido de
revisão ou eliminação de titular. Além disso, o prompt é contrato independente
para agentes e a API precisa permitir entrada por identificador externo seguro.

## Decisão

`DossierSnapshot` grava `resolver_version` e `supersedes`. `DossierSupersession`
é registro append-only de predecessor, sucessor e motivo; na leitura, o contrato
expõe `supersedes` e `superseded_by` como campos derivados dessa relação, sem
alterar o snapshot antigo. Pedido de revisão é entidade append-only que registra
ator, momento, classificação contestada, análise, resultado e, quando aplicável,
o novo dossiê/classificação supersedente.

`Debtor` referencia chave individual no cofre (`key_reference`), permitindo
crypto-shredding por titular. Cada job de expurgo gera `PurgeExecution` auditável
com política/versão, escopo, resultado e esqueleto preservado, sem carga pessoal.

O dossiê expõe `schema_version`; sua projeção textual expõe `prompt_version`
independente e tem golden test próprio. A classificação sempre inclui cobertura e
confiança global; `DADOS_INSUFICIENTES` é categoria normal de saída.

Para fonte `CARTEIRA_CLIENTE`, `confianca_vinculo` é `1.0` e a evidência é
`fornecido_pelo_cliente`: isso representa vínculo declarado entre campo e registro
importado, não veracidade independente do dado. Não há resolução de identidade
nesse caso.

Agente resolve o ponto de entrada via `POST /v1/carteiras/{id}/dossies/lookup`,
com `id_externo` no corpo; CPF não aparece em URL nem query string. A coleção de
prioridades é cursor-paginada.

Snapshot embute cópia materializada dos envelopes de campo, sinais e explicações
na composição; ele não depende de referência viva a observações. Expurgar uma
observação após 12 meses, portanto, não altera dossiê existente. A re-resolução
fica disponível somente durante a retenção da observação; depois disso, o
snapshot segue legível e explicável, mas não re-resolúvel com matcher novo.

`ReviewRequest` só é criado por operador ou encarregado autenticado, em rota
interna; não existe endpoint público por CPF. A identificação do titular antes do
registro é responsabilidade do controlador/cliente. Após crypto-shredding, o
leitor retorna `ELIMINADO_A_PEDIDO_DO_TITULAR`, nunca erro de decifração: carga
pessoal é inacessível e o esqueleto de auditoria permanece legível.

## Consequências

Schema Zod/OpenAPI devem conter esses campos, e testes cobrirão supersessão,
pedido de revisão, crypto-shredding, auditoria de expurgo, prompt versionado,
lookup por `id_externo`, paginação estável e invariância de snapshot após expurgo
de observação.
