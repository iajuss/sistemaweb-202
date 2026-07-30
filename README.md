# Dossiê de triagem

Monorepo do motor de dossiê para triagem de cobrança. A aplicação trabalha
somente com títulos de carteiras autorizadas, consulta fontes públicas aprovadas
e produz uma política explicável de abordagem; não é um score de crédito.

## Pré-requisitos

- Node.js 22 ou superior
- pnpm 11
- Docker Compose para os serviços locais

## Comandos

```sh
pnpm install
pnpm test
pnpm lint
pnpm typecheck
pnpm generate:contracts
pnpm dev
pnpm worker
docker compose up
```

`pnpm dev` e `pnpm worker` mantêm os pontos de entrada de desenvolvimento
disponíveis enquanto as superfícies de entrega são implementadas nas próximas
fatias. O Compose inicia PostgreSQL, Keycloak, web e worker; valores locais de
administração são exclusivamente para desenvolvimento e não devem ser usados em
produção.

Nenhum teste acessa rede ou usa dados reais de devedores. Arquivos brutos de
fontes e a Lista PGFN ficam fora do repositório.
