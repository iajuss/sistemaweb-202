### Task 1: Workspace, infraestrutura local e documentação de fontes

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `docker-compose.yml`
- Create: `apps/web/package.json`, `apps/worker/package.json`, `packages/domain/package.json`, `packages/contracts/package.json`, `packages/application/package.json`, `packages/adapters/package.json`
- Create: `docs/fontes.md`, `README.md`, `.github/workflows/ci.yml`
- Test: `packages/domain/src/smoke.test.ts`

**Interfaces:** Produces workspace commands `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm generate:contracts`, `pnpm dev`, and `pnpm worker`.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from "vitest";

describe("domain package", () => {
  it("runs without a web framework", () => expect(true).toBe(true));
});
```

- [ ] **Step 2: Run it to verify the workspace is not yet configured**

Run: `pnpm --filter @panella/domain test`

Expected: command fails because the package and test runner do not exist.

- [ ] **Step 3: Create the workspace and Docker Compose services**

Create pnpm packages named `@panella/web`, `@panella/worker`, `@panella/domain`, `@panella/contracts`, `@panella/application` and `@panella/adapters`. Compose must start PostgreSQL, Keycloak, web and worker services; `.gitignore` must ignore `.env`, generated artifacts, raw source downloads and `lista-devedores-pgfn-*.xlsx`.

Write `docs/fontes.md` with one row each for CENPROT, PGFN Dados Abertos, Lista PGFN, QSA/RFB, Portal Transparência, DataJud, Serasa, Boa Vista and Quod. Mark only PGFN Dados Abertos, Lista PGFN manual, QSA/RFB and CEIS/CEAF as planned integration paths; state “não verificado” where a contract was not confirmed.

- [ ] **Step 4: Run local checks**

Run: `pnpm --filter @panella/domain test && pnpm lint && pnpm typecheck`

Expected: smoke test passes, lint and TypeScript strict mode pass.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json docker-compose.yml .gitignore README.md docs/fontes.md .github apps packages
git commit -m "chore: bootstrap modular workspace"
```

