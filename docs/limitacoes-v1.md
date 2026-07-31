# O que a v1 não faz

Lista de pendências conhecidas e assumidas, fechada em 2026-07-31 ao encerrar a
fatia 3. Cada item traz **o que é**, **por que não é alcançável hoje** e **o que
dispara a necessidade de fechar**.

Nenhum item desta lista é exercitável sem superfície HTTP. Não existe rota,
handler nem entrypoint que aceite entrada externa: `packages/adapters` exporta
apenas `identity-middleware` e `keycloak`, e o módulo de repositórios não está
no mapa de `exports` do pacote. A superfície chega na Task 11, e é ela o gatilho
comum da maior parte da lista.

## Bloqueio de produção

| # | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|
| P-1 | Verificação de token JWT/JWKS ausente: assinatura, issuer, audience e expiração não são validadas (ADR 021). | Não há aceitação de token porque não há rota que receba um. A emissão de principal fora de `NODE_ENV=development` falha fechada em toda chamada. | **Qualquer deploy.** A proibição de produção do ADR 021 continua valendo e é a única pendência que bloqueia entrega real. |

## Autorização

| # | Severidade | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|---|
| I-2 | Important | Ator `HUMAN` é autorizado só por papel: `authorization.ts:60-66` ignora `walletId` e `authorize-actor.ts:197-199` retorna antes de consultar a concessão, então um `ANALISTA_DOSSIE` alcança toda carteira do tenant. Isolamento entre tenants permanece íntegro. | Nenhum ator humano é construído fora de teste — não há login. | Primeira rota autenticada por humano, ou seja, Task 11 e Task 12. |
| I-3 | Important | `mapVerifiedKeycloakActor` e `authorizeOperation` recebem o repositório de identidade como parâmetro do chamador, então `tenantId` e `roles` vêm do objeto passado. | O único chamador é o próprio teste; não há caminho em que a entrada da requisição escolha o repositório. | Task 11, quando um handler passar a montar esses argumentos a partir de dados de requisição. |
| I-5 | Important | Chave única de `ActorIdentity` é `(tenantId, provider, subject)` mas a resolução carrega só `{provider, subject}`, e a RLS forçada da tabela chaveia num tenant ainda desconhecido no momento da consulta — nenhuma implementação Prisma pode funcionar como está. | Não existe implementação de `IdentityActorRepository` contra o banco; todo teste usa fixture em memória. | Primeira resolução de identidade contra PostgreSQL. Decisão já tomada: unicidade global de `(provider, subject)`, `ActorIdentity` como tabela de bootstrap fora da RLS, com a limitação consciente de que uma identidade pertence a exatamente um tenant. Some quando P-1 fechar e o tenant vier de claim verificada. |

## Imposição de invariante

| # | Severidade | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|---|
| I-4 | Important | Seis guardas de runtime não têm teste que falhe quando removidas, contra o ADR 019: `AUTHORIZED_OPERATION_REQUIRED`, `OPERATION_PRINCIPAL_MISMATCH`, `OPERATION_CONTEXT_IDENTITY_MISMATCH`, `SYSTEM_INGESTION_CAPABILITY_REQUIRED`, `AUTHORIZED_WALLET_CONTEXT_REQUIRED`, `INVALID_TENANT_CONTEXT`. O pós-filtro `containsDebtor` em `authorize-actor.ts:308-314` também não tem cobertura. | As guardas existem e funcionam; o que falta é a prova de que continuam existindo. Risco é de regressão futura, não de furo atual. | Qualquer refatoração dessas guardas, e a revisão final antes da entrega. |
| M-1 | Menor | Regra ESLint em `eslint.config.mjs:25` proíbe importar `issueAuthenticatedActor` de `@panella/domain` — símbolo que não existe em lugar nenhum do repositório. Regra que nunca dispara produz confiança falsa. | Não protege nada, então não há o que furar. | Junto de M-3, que lhe daria um alvo real. |
| M-2 | Menor | `web` e `worker` não definem `NODE_ENV` no `docker-compose.yml`, e o `DevInsecureIdentityProvider` decide falhar fechado com base nessa variável. A garantia depende de valor indefinido. | `undefined !== "development"`, então o comportamento atual é o seguro: nenhum principal é emitido. O defeito é depender de acidente em vez de declaração. | Primeiro serviço que precise realmente subir com identidade de desenvolvimento. |
| M-3 | Menor | `createTenantContext` é exportado no barrel do domínio, contra o ADR 020 (`TenantContext` é detalhe interno e nunca porta pública). Consumidor legítimo único é `authorize-actor.ts`. | O contexto ainda não atravessa nenhuma porta pública, porque não há portas públicas. | Task 11. Fecha junto com M-1, movendo o símbolo para subpath restrito e apontando a regra morta para ele. |
| M-4 | Menor | `TransactionalTenantScopedRepository` tem construtor público sem autoridade. | Construir um sobre banco próprio não concede nada: toda leitura e escrita exige `VerifiedPrincipal` e `AuthorizedOperation`, os internos são campos `#` privados e o leitor recusa registro com `debtorId`. | Se a classe passar a guardar estado que valha por si.  |
| M-5 | Menor | Ciclo de dependência entre `packages/application` e `packages/adapters`. | Compila e roda; incomoda extração futura, não corretude. | Extração de qualquer um dos dois pacotes. |

## Fontes

| # | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|
| F-1 | QSA/RFB e Portal da Transparência ficam **mapeados e não integrados**, com adapter stub e documentação em `docs/fontes.md`. | Decisão de escopo por prazo; o enunciado autoriza fonte mapeada e não integrada. | Só se a política de triagem passar a depender de sinal dessas fontes. Hoje o sinal de QSA tem peso e contribuição zero por decisão do ADR 012. |
| F-3 | Layout de colunas dos Dados Abertos PGFN segue o publicado e **não é verificado por contrato**. | Não há amostra real de Dados Abertos; a Lista manual, essa sim, foi conferida contra arquivo real. | Primeira execução do worker contra arquivo publicado de verdade. Layout inesperado falha alto (`LAYOUT_PGFN_INVALIDO`), nunca devolve campo vazio. |
| F-4 | Detecção de bloco na Lista manual usa limiar de **duas linhas vazias**, heurística não verificada. | Nenhum export real com duas consultas concatenadas estava disponível; o arquivo real conferido tem uma consulta só. | Primeiro export real concatenado. Custo de errar é limitado por desenho: bloco sem preâmbulo é marcado `SEM_PROCEDENCIA`, nunca fundido. |
| F-2 | Lista PGFN manual não é raspada em nenhuma hipótese (ADR 015); a entrada é upload manual. | Decisão fechada em ADR, não pendência. | Nunca. Registrado aqui para não ser relido como lacuna. |
| F-5 | O cofre de chaves AEAD é `createInMemoryCpfCrypto`: o `Debtor` fica cifrado no banco, mas a chave morre com o processo, então um processo novo não decifra o CPF de uma importação anterior. | Não há integração com KMS; ADR 006 define AWS KMS/Secrets Manager para produção e nada disso sobe em Compose local. | Primeiro ambiente que precise ler um CPF importado por outro processo — na prática, o mesmo deploy que P-1 bloqueia. |

## Ambiente

| # | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|
| E-1 | O serviço `workspace-dependencies` do Compose faz bind-mount do repositório enquanto o volume nomeado cobre só o `node_modules` da raiz, então o container reescreve `packages/*/node_modules` no host Windows com reparse points que o Windows não resolve. **`pnpm migrate` depende desse serviço**, então rodar migração dispara o defeito. Reincidiu em 2026-07-31 e derrubou 17 arquivos de teste com `Cannot find package '@panella/domain'`. | Afeta só a máquina de desenvolvimento; não altera artefato entregue. | Já custou tempo três vezes. **Reparo confirmado:** apagar `packages/*/node_modules` no host, rodar `pnpm install --frozen-lockfile` e depois `pnpm exec prisma generate`. O install responde "Already up to date" — a mensagem é enganosa, o relink acontece mesmo assim, e `--force` não é necessário. Correção desenhada: volumes nomeados sobre cada caminho `node_modules` e `prisma generate` no entrypoint. |
| E-2 | Reinstalação limpa de `node_modules` apaga o Prisma Client gerado, e o `tsc` passa a reportar `implicitly has an 'any' type` em callbacks de `$transaction`. | Artefato de ambiente, não defeito de produto. | Nenhum. `pnpm exec prisma generate` restaura; registrado para a falha não ser lida como regressão. |
