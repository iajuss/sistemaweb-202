# ADR 020 — Isolamento tenant por repositório e RLS

## Contexto

Um `tenant_id` tipado ou um filtro Prisma escrito em cada consulta não impõe
isolamento: uma chamada esquecida pode ler ou gravar outro tenant. A Task 3
introduz dados pessoais cifrados, portanto um vazamento é falha de segurança.

## Decisão

Toda leitura e escrita de dados tenant-scoped passa por repositório que exige
uma `VerifiedPrincipal` runtime e uma capability opaca de carteira + ação;
`TenantContext` é detalhe interno e nunca porta pública. A capability de
`RUN_SOURCE` é exclusiva de ingestão SYSTEM e `READ_DOSSIER` não pode gravar.
O cliente Prisma cru fica privado ao módulo de repositórios; uma regra
arquitetural/lint proíbe seu import fora dessa camada. O ator de sistema também
fornece tenant e carteira explícitos, sem bypass global.

`Observation` é um fato imutável de fonte pública pertencente a **tenant +
devedor**. Ela não tem `walletId`, nem herda uma carteira da ingestão: o mesmo
fato pode ser reutilizado por qualquer carteira do mesmo tenant que contenha o
devedor. A leitura de observação cruza a carteira da capability com os títulos
do devedor antes de devolver o registro. Se o devedor não estiver na carteira
solicitada, retorna ausência sem expor o fato.

Em PostgreSQL de produção, toda tabela tenant-scoped usa `FORCE ROW LEVEL
SECURITY` e policy baseada em `current_setting('app.tenant_id', true)`. O
wrapper transacional do repositório executa `SET LOCAL app.tenant_id` antes de
qualquer query; `SET LOCAL` termina com a transação, evitando vazamento em pool.
RLS é segunda barreira, não substituto da autorização do domínio. Migrações usam
credencial separada; a aplicação não recebe `BYPASSRLS`.

CPF usa AEAD (AES-GCM no adapter KMS) com associated data canônico formado por
`tenant_id` e `debtor_id`; ciphertext movido entre registros ou tenants falha a
decifra. O índice usa HMAC com segredo no cofre, separado da chave de cifra; uma
rotação da chave HMAC exige reindexação de todos os índices ativos. A destruição
da chave individual retorna `ELIMINADO_A_PEDIDO_DO_TITULAR` ao leitor, mantendo
somente o esqueleto de auditoria.

## Alternativas descartadas

- **Filtro `tenant_id` em cada query:** fácil de esquecer e impossível de provar
  por inspeção local.
- **RLS sem repositório:** protege o banco, mas não valida autorização de
  carteira nem impede contexto ausente antes do acesso.
- **Gravar `walletId` em `Observation`:** transforma uma topologia de
  autorização mutável em propriedade do fato, bloqueia o reuso entre carteiras
  e pode manter um vínculo de acesso que já deixou de existir.
- **Repositório sem RLS:** reduz superfície, mas uma regressão ou consulta
  administrativa futura ainda pode vazar dados.

## Consequências

Pooling exige sempre transação curta com `SET LOCAL`; consultas fora do wrapper
são defeito. Testes precisam registrar RED da leitura A→B antes da guarda e
provar que remoção dela falha. AES-GCM, HMAC e seus segredos são portas
separadas, com fixtures somente sintéticas.
