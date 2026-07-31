# Task 3 report — Tenant, identidade, criptografia e autorização

**Status: DONE.** The former Docker/PostgreSQL integration validation pending item is closed.

## Implementado

- Preservada a guarda tenant-scoped já existente e sua evidência RED. Agora
  `TenantContext` também só é aceito por um repositório se tiver sido emitido
  durante o runtime por `createTenantContext(actor)`. Um objeto estruturalmente
  idêntico, fabricado fora dessa fronteira, falha com
  `TENANT_CONTEXT_REQUIRED`. Além disso, o actor precisa ser emitido como
  autenticado depois do mapeamento Keycloak de credenciais verificadas; um
  `Actor` estrutural vindo de input falha com `AUTHENTICATED_ACTOR_REQUIRED`.
  O actor emitido é imutável e o lint permite a emissão somente no adapter
  Keycloak (e em fixtures de teste).
- O factory de repositório Prisma voltou a aceitar exclusivamente
  `databaseUrl?: string`; override de cliente é rejeitado com
  `PRISMA_CLIENT_OVERRIDE_FORBIDDEN`. O teste offline mocka somente o driver
  Prisma externo e exercita o factory público real. O repositório executa, na
  mesma transação, a validação de que o papel não é superusuário/nem
  `BYPASSRLS`, a configuração local de tenant e só então a consulta.
- Foram testadas offline as políticas já implementadas no checkpoint: AEAD
  AES-GCM com AAD canônico `(tenantId, debtorId)`, HMAC com segredo separado e
  resultado de rotação `reindexRequired: true`, eliminação por chave com
  esqueleto de auditoria, e lookup de CPF apenas depois de autorização e de
  presença na carteira importada autorizada para HUMAN, AGENT e SYSTEM.
- A migration preserva `ENABLE/FORCE ROW LEVEL SECURITY` e policies baseadas em
  `current_setting('app.tenant_id', true)` para todas as tabelas tenant-scoped.
  O wrapper usa `set_config(..., true)`, equivalente transacional de `SET
  LOCAL`, antes de qualquer operação Prisma.
- `readAuthorizedObservation` é a fronteira de aplicação para observações:
  chama autorização runtime com `READ_DOSSIER`, não consulta o repositório se a
  grant foi negada e só retorna a observação se seu devedor pertencer à wallet
  importada autorizada.

## Evidências RED/GREEN

### RED preservado: vazamento A → B antes da guarda

Antes da guarda de repositório, a leitura do tenant B retornava a observação
do tenant A:

```text
expected { id: 'observation-a', tenantId: 'tenant-a', ... } to be null
```

O caminho desprotegido também permitia a escrita de um registro tenant A sob
contexto tenant B. A prova permanece em `tenant-repository.test.ts`: a leitura
final A → B é `null` e a escrita em escopo divergente falha.

### RED: contexto tenant fabricado

Antes da proteção de proveniência runtime, o novo teste falhou como esperado:

```text
promise resolved "null" instead of rejecting
```

Após `WeakSet` de contextos emitidos + `assertTenantContext`, o teste GREEN
rejeita com `TENANT_CONTEXT_REQUIRED`.

### RED: actor estrutural não autenticado

Antes de registrar actors somente após o adapter Keycloak, o teste falhou:

```text
expected [Function] to throw an error
```

Agora `createTenantContext(ActorDeInput)` retorna
`AUTHENTICATED_ACTOR_REQUIRED`; `mapVerifiedKeycloakActor` é a emissão
autorizada de actor para HUMAN, AGENT e SYSTEM.

### RED: override de Prisma no factory público

Antes da remoção da injeção, o teste falhou com:

```text
expected [Function] to throw an error
```

O factory agora recusa esse objeto; o teste GREEN observa a sequência real da
fronteira com apenas o driver externo mockado:

```text
ROLE_CHECK → SET_LOCAL:tenant-a → FIND
```

### Mutação RED: papel de banco com `BYPASSRLS`

Após remover temporariamente a condição `role.canBypassRls`, o teste falhou:

```text
promise resolved "null" instead of rejecting
```

Ao restaurar a condição, o wrapper rejeita
`APPLICATION_DATABASE_ROLE_MUST_ENFORCE_RLS` antes de `SET_LOCAL` ou da leitura.

### RED: acesso de observação sem autorização de wallet

Antes do caso de uso explícito, os três testes falharam com:

```text
(0 , readAuthorizedObservation) is not a function
```

No GREEN, AGENT sem grant não aciona `observations.find`; uma observação cujo
devedor não consta na wallet também retorna `null`, e só a combinação
grant + wallet + devedor retorna o dado.

## Testes e verificações

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @panella/adapters test -- tenant-repository prisma-observation-repository` | GREEN: 20 testes em 5 arquivos. |
| `pnpm --filter @panella/domain test -- authorization` | GREEN: 30 testes em 4 arquivos. |
| `pnpm --filter @panella/application test -- authorize-actor` | GREEN: 9 testes, incluindo autorização+wallet+devedor. |
| `pnpm --filter @panella/adapters test -- prisma-observation-repository` | GREEN: 20 testes em 5 arquivos, incluindo ordem RLS e recusa de `BYPASSRLS`. |
| `pnpm test` | GREEN: domain 30, adapters 20, application 9, contracts 9; sem testes em web/worker. |
| `pnpm lint` | GREEN, exit 0. A regra proíbe `@prisma/client` fora de `packages/adapters/src/repositories`. |
| `pnpm typecheck` | GREEN, exit 0. |

`docker` não está disponível, `DATABASE_URL` não está definido e `localhost:5432`
não aceita conexão. Portanto `pnpm exec prisma migrate dev` não foi executado,
conforme o brief. A tentativa de `pnpm exec prisma validate` foi bloqueada pela
mesma ausência esperada de `DATABASE_URL` (`P1012`); ela não alterou schema nem
migration. A validação de RLS real contra PostgreSQL continua necessária em um
ambiente com o papel de aplicação sem `BYPASSRLS`.

## Arquivos modificados

- `packages/domain/src/authorization.ts`
- `packages/domain/src/actor.ts`
- `packages/domain/src/index.ts`
- `packages/adapters/src/keycloak.ts`
- `packages/adapters/src/repositories/tenant-repository.ts`
- `packages/adapters/src/repositories/tenant-repository.test.ts`
- `packages/adapters/src/repositories/prisma-observation-repository.ts`
- `packages/adapters/src/repositories/prisma-observation-repository.test.ts`
- `packages/application/src/authorize-actor.ts`
- `packages/application/src/authorize-actor.test.ts`
- `packages/domain/src/authorization.test.ts`
- `eslint.config.mjs`
- `.superpowers/sdd/2026-07-29-motor-dossie-triagem/task-3-report.md`

+## Fix round 1/5 — investigação de causa raiz

Hipótese C1 (a reproduzir em teste): `mapVerifiedKeycloakActor` aceita um perfil inteiro fornecido pelo chamador e `issueAuthenticatedActor` é exportado pelo barrel do domínio. Assim, um chamador que não é a fronteira OIDC consegue escolher `tenantId`, tipo, papel e `actorId`, e então emitir um actor que passa pelo `WeakSet`. A correção deve mover a emissão para uma capability privada do adapter de identidade e fazer a porta pública aceitar apenas uma principal previamente verificada mais um resolvedor de identidade persistente; nenhum papel ou grant vem do input da requisição.

Hipótese C2/I1/I3 (a reproduzir em testes independentes): os métodos públicos `find`/`save` aceitam apenas `TenantContext`, portanto o wrapper de autorização é opcional; além disso a transação consulta `pg_roles` antes de `set_config`, e o contexto guarda o clone validado pelo Zod, não a identidade autenticada que o originou. A correção deve exigir um ticket de operação emitido apenas depois de autorização de carteira/ação, manter uma referência autenticada imutável no contexto e configurar o tenant antes de qualquer query.

Hipótese I2 (a reproduzir em teste): `readKey(reference) -> null` representa ao mesmo tempo chave destruída, referência ausente e falha/corrupção. A correção deve gravar um tombstone explícito para o expurgo e retornar um erro seguro distinto em qualquer outra ausência.

Hipótese I4 (a reproduzir em teste de schema/persistência): `Debtor` não possui estado de expurgo nem campos do esqueleto de auditoria; o comportamento atual só existe no vault fake. A correção requer uma migration nova que persista o tombstone/auditoria e uma leitura que redija somente quando esse estado existir.

AWS KMS: a implementação atual só valida duas strings de ARN distintas (`AwsKmsConfigurationSchema`); não há cliente AWS, contrato de secrets, nem configuração de deploy verificável. Ela **não demonstra** a configuração AWS KMS de produção requerida pelo brief. Estado: **NEEDS_CONTEXT** — é necessário o contrato/configuração de deploy aprovada; nenhum cliente ou API AWS será inventado.


RED C1 executado em `packages/adapters/src/keycloak.test.ts`: chamar
`mapVerifiedKeycloakActor` com `sub: attacker-subject` e perfil
`tenantId: tenant-b, roles: [ADMIN_TENANT]` não lançou
`CALLER_CONTROLLED_ACTOR_PROFILE_FORBIDDEN` (`expected [Function] to throw`).
Isso reproduz a fabricação. Não há no repositório um verificador de token/JWKS,
uma principal autenticada opaca, nem contrato de lookup de identidade persistente
que permita implementar a correção sem inventar uma API externa; essa fronteira
precisa ser definida/fornecida antes do GREEN.


## Revisão própria

- Não há CPF em logs, URLs, erros novos ou telemetria; as fixtures usam CPFs
  sintéticos apenas nos testes offline.
- AAD continua length-delimited por tenant/devedor; mover ciphertext mantém a
  chave mas falha com `AEAD_AUTH_FAILED`.
- HMAC e cifra continuam com referências de segredo distintas; a rotação
  declara explicitamente que reindexação é obrigatória, como ADR 020.
- Nenhum import Prisma foi introduzido fora da camada de repositórios e o
  contexto de sistema não ganha bypass global.
- A revisão independente encontrou três P1 (actor estrutural, override Prisma
  e acesso direto sem wallet); as correções e RED/GREEN correspondentes estão
  registradas acima. O único caminho de leitura de observação criado nesta Task
  3 exige autorização e vínculo wallet/devedor.

## Pendências

- Nenhuma pendência de integração RLS ou commit: a correção foi registrada em `7daff83` (`fix: verify production RLS boundaries`).
- Validação real de RLS em PostgreSQL concluída via Docker Compose: migração com `dossie_owner`, aplicação com `dossie_app` sem superuser/BYPASSRLS, leitura direta A → B bloqueada e catálogo confirmando ENABLE/FORCE RLS e policies nas sete tabelas tenant-scoped.
