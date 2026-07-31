# Task 1 report — Workspace, infraestrutura local e documentação de fontes

## Status

Completed and committed on `codex/dossie-triagem`.

Commit: `d744a677b05913c5e83bf5a57bbff4a214d7f433` (`chore: bootstrap modular workspace`)

## Files changed

- Root workspace and tooling: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`.
- Local infrastructure: `docker-compose.yml` (PostgreSQL, Keycloak, web and worker).
- Workspace packages: `apps/web/package.json`, `apps/worker/package.json`, and `package.json` files for domain, contracts, application and adapters.
- Domain smoke test: `packages/domain/src/smoke.test.ts`.
- Documentation and automation: `README.md`, `docs/fontes.md`, `.github/workflows/ci.yml`.
- Ignore policy: `.gitignore` now excludes environment files, generated artifacts, raw downloads and `lista-devedores-pgfn-*.xlsx`.

## TDD record

1. Added `packages/domain/src/smoke.test.ts` before workspace setup.
2. Ran `pnpm --filter @panella/domain test` before package creation. It reported `No projects found`, demonstrating that the selected package/test runner was not configured.
3. Added the minimum workspace configuration and test runner dependencies.
4. Ran the focused domain test after setup: 1 test passed.

## Verification commands and output

| Command | Result |
|---|---|
| `pnpm --filter @panella/domain test && pnpm lint && pnpm typecheck` | Passed: domain smoke test `1 passed`; ESLint completed with zero warnings; strict TypeScript completed with exit 0. |
| `pnpm generate:contracts && pnpm test && pnpm lint && pnpm typecheck` | Passed: contract bootstrap command completed; all six workspace package test commands completed; domain had `1 passed`; lint and strict typecheck completed with exit 0. |
| `git diff --check` | Passed with no whitespace errors. |
| `rg` check of `docs/fontes.md` | Found exactly one row for each required source: CENPROT, PGFN Dados Abertos, Lista PGFN, QSA/RFB, Portal da Transparência (CEIS/CEAF), DataJud, Serasa, Boa Vista and Quod. |

## Concerns

- Docker is not installed in this execution environment, so `docker compose config` and service startup were not executed. The Compose file is present and documents all four required services.
- `pnpm install` initially reported the sandbox policy blocking `esbuild` postinstall. The workspace explicitly permits the required local `esbuild` build through `allowBuilds`, after which installation and Vitest checks succeeded.
- Web and worker package commands intentionally keep bootstrap placeholder processes alive until their Task 12 entrypoints are implemented; they are not delivery surfaces yet.

## Fix round 1/5 — Compose dependency installation race

### Root cause

`web` and `worker` both ran `pnpm install --frozen-lockfile` while bind-mounting
the same `/workspace`, allowing concurrent mutation of root `node_modules`.

### Change

- Added a one-shot `workspace-dependencies` Compose service that is the sole
  service to run `pnpm install --frozen-lockfile`.
- Added a shared named `workspace-node-modules` volume so dependencies are not
  written into the bind-mounted workspace.
- Made both `web` and `worker` depend on successful completion of the init
  service before starting; neither application command now invokes `pnpm install`.

### Test and configuration evidence

| Command | Result |
|---|---|
| Pre-fix PowerShell Compose dependency-install gate | Failed as expected: `installs=2 initService=False`. |
| Post-fix PowerShell Compose dependency-install gate | Passed: `one init install; web and worker await its success.` It asserts exactly one install, the init service, no install in web/worker, and `service_completed_successfully` dependencies. |
| `pnpm test && pnpm lint && pnpm typecheck` | Passed: all workspace test scripts completed; domain smoke test `1 passed`; lint and strict typecheck exited 0. |
| `git diff --check` | Passed with no whitespace errors. |

### Commit

`c4361789022dff7807e8c26485087702f2df42a2` (`fix: serialize compose dependency installation`)
