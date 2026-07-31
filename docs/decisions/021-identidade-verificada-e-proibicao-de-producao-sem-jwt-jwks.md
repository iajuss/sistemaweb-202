# ADR 021 — Identidade só entra por principal verificada; produção espera JWT/JWKS

## Contexto

O sistema precisa distinguir uma identidade apresentada em requisição de uma
identidade cujo credential foi efetivamente verificado. Perfil de ator, tenant,
papéis e grants não podem ser dados escolhidos pela requisição. A integração de
verificação de JWT contra JWKS do Keycloak, incluindo issuer, audience,
expiração e rotação de chaves, ainda não tem contrato aprovado nem implementação
verificada neste repositório.

## Decisão

O middleware de identidade emite `VerifiedPrincipal` opaca, com estado privado,
apenas a partir de entrada já validada. A resolução de `provider + subject` para
ator, tenant, tipo e papéis é feita em repositório tenant-local; a origem da
emissão é auditável e restrita a `HUMAN_KEYCLOAK`,
`AGENT_MACHINE_CREDENTIAL` ou `SYSTEM_WORKER`.

O único provedor temporário é `DevInsecureIdentityProvider`, permitido somente
com `NODE_ENV=development` e opt-in explícito. Não existe provedor que aceite
token em produção. Portanto, **deploy de produção está proibido** até que a
verificação JWT/JWKS de Keycloak seja implementada e validada com contrato de
issuer, audience, expiração, rotação e falhas fail-closed.

Task 3 pode encerrar sua correção de fronteira com esta pendência documentada,
mas não autoriza tráfego de produção autenticado.

## Consequências

Adaptadores aceitam somente principal verificada, nunca claims/perfis crus. A
autorização emite capability opaca após carteira + ação e repositórios exigem a
principal e essa capability. Para observações, a carteira autoriza a exposição
pelo vínculo atual entre carteira e devedor; não é atributo persistido do fato e
`Observation.walletId` é proibido. A futura implementação JWT/JWKS deve
substituir o provedor de desenvolvimento, não flexibilizar essa fronteira.
