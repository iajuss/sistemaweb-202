# Motor de dossiê e política de triagem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma aplicação white label, agent-first e multi-tenant que importa carteiras, compõe dossiês de fontes públicas e aplica uma política de triagem explicável.

**Architecture:** Monólito modular TypeScript em workspace: Next.js oferece UI/API; `packages/domain` não importa framework; workers executam ingestões e expurgo em containers separados. PostgreSQL armazena dados tenant-scoped; Keycloak autentica humanos e agentes, e KMS/Secrets Manager mantém chaves individuais de devedores.

**Tech Stack:** Node.js 22, pnpm workspace, TypeScript strict, Next.js, PostgreSQL, Prisma, Zod, Vitest, Docker Compose, Keycloak, AWS ECS/Fargate/RDS/KMS/Secrets Manager.

## Global Constraints

- Dinheiro é `Decimal` ou centavos inteiros; `number`/float é proibido para valores monetários.
- CPF completo é cifrado; HMAC serve a índice; o fragmento 4–9 só existe em memória durante matching.
- Nunca consultar CPF fora de carteira autorizada, colocar CPF em URL/log/telemetria, persistir dados de não-clientes ou usar base vazada.
- `ENCONTRADO`, `NAO_ENCONTRADO`, `NAO_CONSULTADO` e `ERRO_NA_FONTE` são estados distintos; cobertura insuficiente retorna `DADOS_INSUFICIENTES`.
- Observação é fato bruto tenant-scoped; resolução de identidade é reexecutável; dossiê e classificação são snapshots imutáveis.
- V1 é política de triagem por regras, não modelo preditivo; não expor campos de probabilidade.
- Zod é a única fonte de verdade para validação, tipos, JSON Schema e OpenAPI.
- Nenhum teste toca rede ou usa a planilha real PGFN; fixtures são sintéticas.
- Toda alteração arquitetural durante execução exige ADR e atualização concisa de `AGENTS.md`.

---

## Reordenação para caminho vertical fino (2026-07-31)

Decisão do usuário por prazo: entrega no domingo, com as fatias 1–3 fechadas e
nenhuma das quatro funcionalidades do enunciado funcionando. O objetivo passa a
ser **atravessar o sistema de ponta a ponta com as quatro funcionalidades
estreitas**, não completar duas delas em profundidade.

**Ordem de execução:** 4 → 8 → 5 → 6 → **6.5** → 7 → 11 → 9 → 10 → 12.

| Ordem | Task | Entrega estreita |
|---|---|---|
| 1 | 4 | Importação de carteira (CSV/XLSX, quarentena) |
| 2 | 8 | PGFN Dados Abertos — uma fonte só, funcionando |
| 3 | 5 | Resolução de identidade |
| 4 | 6 | Observações, cobertura e dossiê |
| 5 | **6.5** | **Persistência de carteira e observações em PostgreSQL** |
| 6 | 7 | Política de triagem e desfechos |
| 7 | 11 | API agent-first, contratos e endpoint de prompt |

**Escopo reduzido do que sobra:**

- **Task 9** vira documentação. QSA/RFB e Portal da Transparência ficam como
  fontes **mapeadas e não integradas** em `docs/fontes.md`, com adapter stub. O
  enunciado autoriza isso explicitamente.
- **Task 10** fica na política já desenhada em ADR 009, com job de expurgo
  parcial.
- **Task 12** vira UI mínima: uma tela de prioridades da carteira e uma de
  dossiê. Sem tela de revisões.

**Entregáveis baratos que o enunciado pede, tratados como obrigatórios:**
`docs/fontes.md` completo, `docs/lgpd.md` com base legal por fonte, `README.md`
com setup reproduzível em um comando, e o conjunto pequeno de casos de teste
conferíveis à mão.

**Modo de execução a partir da Task 4: inline.** Sem subagente, sem revisor
separado, sem re-revisão. O ciclo de três agentes valeu na fatia de segurança e
não se paga para importar CSV. TDD com RED observado e verificação antes de
declarar pronto continuam valendo integralmente. Parar e perguntar só se algo
exigir afrouxar invariante do `AGENTS.md`.

**Pendências documentadas, não implementadas:** ver `docs/limitacoes-v1.md` e o
ledger. Nenhuma delas é exercitável sem superfície HTTP, que só chega na Task 11.

---

## File map

| Caminho | Responsabilidade |
|---|---|
| `apps/web` | UI white label, rotas HTTP e leitura/escrita via serviços de aplicação. |
| `apps/worker` | Entrypoints de worker para PGFN, QSA, CEIS/CEAF e expurgo. |
| `packages/domain/src` | Tipos puros, regras de identidade, dossiê, política, autorização e retenção. |
| `packages/contracts/src` | Schemas Zod, geração JSON Schema/OpenAPI e renderização de prompt. |
| `packages/application/src` | Casos de uso, portas e orquestração transacional. |
| `packages/adapters/src` | Parsers, SourceAdapters, Prisma repositories, KMS, Keycloak e arquivos. |
| `prisma/schema.prisma` | Persistência tenant-scoped, relações imutáveis e índices. |
| `fixtures/` | Dados sintéticos de importação, PGFN, QSA e Portal. |
| `docs/fontes.md` | Matriz de fontes, contratos, limites, custo e veredito. |
| `docs/lgpd.md` | Finalidades, premissas, retenção, expurgo e bases documentais. |

## Interfaces de referência

```ts
export type SourceStatus =
  | "ENCONTRADO"
  | "NAO_ENCONTRADO"
  | "NAO_CONSULTADO"
  | "ERRO_NA_FONTE";

export interface SourceAdapter<Input, RawRecord> {
  readonly source: string;
  collect(input: Input, context: SourceContext): Promise<CollectionResult<RawRecord>>;
}

export interface FieldEnvelope<T> {
  value: T | null;
  status: SourceStatus;
  source: SourceProvenance;
  collectedAt: string;
  linkConfidence: number;
  linkEvidence: readonly string[];
}

export interface Actor {
  kind: "HUMAN" | "AGENT" | "SYSTEM";
  provider: string;
  subject: string;
  tenantId?: string;
}
```

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

### Task 2: Primitivos de domínio, dinheiro e contrato versionado

**Files:**
- Create: `packages/domain/src/money.ts`, `packages/domain/src/source-status.ts`, `packages/domain/src/actor.ts`, `packages/domain/src/index.ts`
- Create: `packages/contracts/src/dossier-schema.ts`, `packages/contracts/src/classification-schema.ts`, `packages/contracts/src/generate.ts`
- Create: `packages/contracts/generated/openapi.json`, `packages/contracts/generated/dossier.schema.json`
- Test: `packages/domain/src/money.test.ts`, `packages/domain/src/source-status.test.ts`, `packages/contracts/src/schema-compatibility.test.ts`

**Interfaces:** Produces `Money`, `SourceStatus`, `Actor`, `FieldEnvelopeSchema`, `DossierSchema`, `ClassificationSchema` and `generateContracts()`.

- [ ] **Step 1: Write failing invariant tests**

```ts
it("keeps 29163886.440000001 out of monetary arithmetic", () => {
  expect(Money.fromDecimalString("29163886.440000001").toCents()).toBe(2916388644n);
});

it("does not collapse source states", () => {
  expect(new Set(SOURCE_STATUSES)).toEqual(new Set([
    "ENCONTRADO", "NAO_ENCONTRADO", "NAO_CONSULTADO", "ERRO_NA_FONTE",
  ]));
});
```

- [ ] **Step 2: Run the tests and contract generator before implementation**

Run: `pnpm --filter @panella/domain test -- money source-status && pnpm --filter @panella/contracts test -- schema-compatibility`

Expected: failures because primitives and generated contracts do not exist.

- [ ] **Step 3: Implement primitives and Zod-first contracts**

Implement `Money` with bigint cents and explicit decimal parser. Define all four source states as a Zod enum. Build field envelopes with status, provenance, reference date, confidence and evidence. Generate JSON Schema and OpenAPI only from exported Zod schemas. Add compatibility test that rejects a breaking fixture unless `schema_version` major changes.

- [ ] **Step 4: Verify generation and tests**

Run: `pnpm generate:contracts && pnpm test && pnpm lint && pnpm typecheck`

Expected: generated files exist, all tests pass and no monetary type accepts `number`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain packages/contracts
git commit -m "feat: add versioned domain contracts"
```

### Task 3: Tenant, identity, encryption and authorization boundaries

**Files:**
- Create: `prisma/schema.prisma`, `packages/domain/src/authorization.ts`, `packages/domain/src/identity.ts`
- Create: `packages/application/src/authorize-actor.ts`, `packages/adapters/src/kms.ts`, `packages/adapters/src/keycloak.ts`
- Test: `packages/domain/src/authorization.test.ts`, `packages/application/src/authorize-actor.test.ts`, `packages/adapters/src/kms.test.ts`

**Interfaces:** Consumes `Actor`; produces `TenantContext { tenantId: string; actor: Actor }`, `TenantScopedRepository<T>` whose every read/write receives `TenantContext`, `authorize(actor, walletId, action)`, `encryptCpf`, `decryptCpf`, `destroyDebtorKey`, `readDebtor` and `IdentityRef { provider, subject }`. `encryptCpf` and `decryptCpf` receive `{ tenantId, debtorId }` as AEAD associated-data inputs; `readDebtor` returns `{ readState: "ELIMINADO_A_PEDIDO_DO_TITULAR"; audit: AuditSkeleton }` after destroyed-key lookup.

**Acceptance criteria from AGENTS.md:**
- Every tenant-scoped read and write uses a repository that requires runtime `TenantContext`; raw Prisma is forbidden outside that layer by an architectural test or lint rule. PostgreSQL RLS is enabled in production with transaction-scoped `SET LOCAL app.tenant_id`, never an application bypass.
- The report must show RED output where an observation written for tenant A is readable by tenant B before the repository guard exists; the final test must fail if that guard is removed.
- CPF is encrypted with AEAD using `tenant_id` and `debtor_id` as associated data; moving ciphertext to another debtor or tenant must fail to decrypt.
- CPF lookup uses HMAC with a vault-held secret separate from the encryption key; no plain hash is allowed, and the ADR records that HMAC-key rotation requires reindexing.
- Destroyed debtor key reads as `ELIMINADO_A_PEDIDO_DO_TITULAR`, with audit skeleton available and no decrypt error or ciphertext exposed.
- Runtime authorization runs on every human, agent and system-worker access. Backend lookup accepts only a CPF already present in an authorized imported wallet, and a test fails if this check is removed.

- [ ] **Step 1: Write failing tenant and actor tests**

```ts
it("denies an agent a wallet grant from another tenant", () => {
  expect(authorize(agentA, walletB, "READ_DOSSIER")).toEqual({ allowed: false });
});

it("destroys only the selected debtor key", async () => {
  await destroyDebtorKey("debtor-a");
  await expect(readDebtor(recordA)).resolves.toMatchObject({
    readState: "ELIMINADO_A_PEDIDO_DO_TITULAR",
    audit: expect.any(Object),
  });
  await expect(decryptCpf(recordB)).resolves.toBe("valid");
});

it("cannot read a tenant A observation through tenant B context", async () => {
  await repositoryFor(tenantA).save(observationForTenantA);
  await expect(repositoryFor(tenantB).find(observationForTenantA.id)).resolves.toBeNull();
});

it("rejects ciphertext copied to another tenant or debtor", async () => {
  await expect(decryptCpf({ ...recordA, tenantId: tenantB.id })).rejects.toThrow("AEAD_AUTH_FAILED");
});
```

- [ ] **Step 2: Run them before persistence exists**

Run: `pnpm --filter @panella/domain test authorization && pnpm --filter @panella/adapters test kms`

Expected: failures because policy and key interfaces do not exist.

- [ ] **Step 3: Implement schema and ports**

Add tenant-scoped wallet, debtor, title, actor identity and agent-wallet-grant tables with production RLS policies. Expose only tenant-context repositories; use transaction-local tenant session state and prohibit raw Prisma outside repositories. Store AEAD CPF ciphertext, HMAC index and `key_reference`; HMAC and cipher use separate vault keys and no persisted mask fragment exists. Implement domain authorization independently of Keycloak for human, agent and system worker. Map Keycloak issuer/`sub` and service-account subject into `Actor`; add fake KMS for offline tests and AWS KMS configuration for production.

- [ ] **Step 4: Verify tenant isolation**

Run: `pnpm exec prisma migrate dev && pnpm test && pnpm typecheck`

Expected: RED evidence proves the original A-to-B leak before the guard; final tenant-crossing read is denied by repository and RLS integration coverage, copied ciphertext fails AEAD authentication, HMAC key material is separate, and destroyed key reads as `ELIMINADO_A_PEDIDO_DO_TITULAR` without exposing ciphertext.

- [ ] **Step 5: Commit**

```bash
git add prisma packages/domain packages/application packages/adapters
git commit -m "feat: add tenant identity and key boundaries"
```

### Task 4: Carteira, importação plugável e quarentena

**Files:**
- Create: `packages/domain/src/wallet.ts`, `packages/application/src/import-wallet.ts`, `packages/adapters/src/wallet-importers/csv.ts`, `packages/adapters/src/wallet-importers/xlsx.ts`
- Create: `fixtures/wallet/valid-cp1252-semicolon.csv`, `fixtures/wallet/invalid-cpf.csv`, `fixtures/wallet/titles.xlsx`
- Test: `packages/application/src/import-wallet.test.ts`, `packages/adapters/src/wallet-importers/csv.test.ts`, `packages/adapters/src/wallet-importers/xlsx.test.ts`

**Interfaces:** Produces `WalletImporter.preview(input)`, `WalletImporter.commit(preview, actor)`, `ImportReport` and `QuarantineRecord`.

- [ ] **Step 1: Write failing importer tests**

```ts
it("deduplicates by external title id, not CPF", async () => {
  const report = await importer.preview(twoTitlesSameCpf);
  expect(report.accepted).toHaveLength(2);
});

it("quarantines an invalid CPF while importing valid rows", async () => {
  const report = await importer.commit(invalidCpfFixture, actor);
  expect(report.quarantined).toHaveLength(1);
  expect(report.accepted).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests before parsers exist**

Run: `pnpm --filter @panella/application test import-wallet`

Expected: failures because importer ports and parsers do not exist.

- [ ] **Step 3: Implement import pipeline**

Implement detection for UTF-8 BOM/CP1252, `;`/`,` and decimal comma; parse CSV and XLSX into title rows. Validate CPF digits, cents, `id_externo`, due date, client history and channels. Preview is non-mutating; commit writes titles idempotently by `id_externo`, encrypted debtor CPF, import audit and per-row quarantine. Hash file bytes without logging contents.

- [ ] **Step 4: Verify import behavior**

Run: `pnpm test -- import-wallet csv xlsx && pnpm lint && pnpm typecheck`

Expected: fixtures import offline; repeated commit is idempotent; no test output includes raw CPF.

- [ ] **Step 5: Commit**

```bash
git add prisma packages/domain packages/application packages/adapters fixtures/wallet
git commit -m "feat: import wallet titles with quarantine"
```

### Task 5: Resolução de identidade compartilhada

**Files:**
- Create: `packages/domain/src/identity/normalize.ts`, `packages/domain/src/identity/mask.ts`, `packages/domain/src/identity/resolver.ts`
- Create: `fixtures/identity/cases.ts`
- Test: `packages/domain/src/identity/resolver.test.ts`

**Interfaces:** Produces `resolveIdentity(candidate, observation): IdentityResolution` with `CONFIRMED`, `PROBABLE`, `POSSIBLE` and `REJECTED`.

- [ ] **Step 1: Write the required failing cases**

```ts
it.each([
  ["MARIA JOSE ALVES PEREIRA SOARES SANTOS", "JOSE SANTOS", "REJECTED"],
  ["ROGERIO SANT ANA DA SILVA", "ANA", "REJECTED"],
  ["JOSÉ DA SILVA", "JOSE SILVA", "CONFIRMED"],
])("resolves %s as %s", (found, requested, expected) => {
  expect(resolveIdentity(requested, record(found)).status).toBe(expected);
});
```

- [ ] **Step 2: Run resolver tests before implementation**

Run: `pnpm --filter @panella/domain test resolver`

Expected: failures because resolver and named rules do not exist.

- [ ] **Step 3: Implement named, weighted rules**

Normalize accents/case/tokens, evaluate mask compatibility in memory, token position, order, completeness and string distance. Return every matched rule and weight. Keep thresholds in a versioned configuration object. The resolver must not import adapters or database code.

- [ ] **Step 4: Verify confidence propagation inputs**

Run: `pnpm --filter @panella/domain test resolver && pnpm typecheck`

Expected: compatible mask plus divergent name is not confirmed; low-confidence result carries evidence rather than a fact claim.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/identity fixtures/identity
git commit -m "feat: add explainable identity resolution"
```

### Task 6: Observações, cobertura, dossiês e supersessão

**Files:**
- Create: `packages/domain/src/observation.ts`, `packages/domain/src/dossier.ts`, `packages/application/src/compose-dossier.ts`
- Create: `packages/adapters/src/prisma-observation-repository.ts`
- Test: `packages/domain/src/dossier.test.ts`, `packages/application/src/compose-dossier.test.ts`

**Interfaces:** Produces `SourcePlan`, `composeDossier(plan, observations, resolverVersion)`, `DossierSupersession` and read state `ELIMINADO_A_PEDIDO_DO_TITULAR`.

- [ ] **Step 1: Write failing coverage and immutability tests**

```ts
it("marks an unprocessed PGFN slice as NAO_CONSULTADO", () => {
  expect(composeDossier(planWithMissingSlice, []).fields.pgfn.status).toBe("NAO_CONSULTADO");
});

it("keeps embedded dossie fields after its observation is purged", () => {
  const snapshot = composeDossier(plan, [observation]);
  purgeObservation(observation.id);
  expect(readDossier(snapshot.id).fields.pgfn.value).toEqual(snapshot.fields.pgfn.value);
});
```

- [ ] **Step 2: Run tests before composition exists**

Run: `pnpm --filter @panella/application test compose-dossier`

Expected: failures because source planning, composition and snapshot storage do not exist.

- [ ] **Step 3: Implement observation and snapshot rules**

Persist raw tenant-scoped observations with provenance and coverage, without link confidence. Compose from a declarative source/slice plan, call the resolver, materialize field envelopes into snapshot JSON and store `resolver_version`. Write append-only supersession relation and derive `superseded_by` on reads. Map destroyed key to `ELIMINADO_A_PEDIDO_DO_TITULAR` while returning audit skeleton only.

- [ ] **Step 4: Verify re-resolution boundary**

Run: `pnpm test -- dossier compose-dossier && pnpm typecheck`

Expected: observations can be re-resolved before purge; no snapshot changes after purge; missing coverage never becomes `NAO_ENCONTRADO`.

- [ ] **Step 5: Commit**

```bash
git add prisma packages/domain packages/application packages/adapters
git commit -m "feat: compose immutable dossiers from observations"
```

### Task 6.5: Persistência de carteira e observações em PostgreSQL

Criada em 2026-07-31, por decisão explícita do usuário, para tirar a
persistência da condição de pendência sem posição. A Task 4 entregou os títulos
atrás das portas `WalletImportStore` com implementação **em memória**; a Task 8
entregou observações PGFN como valores em memória. Deixar isso para a Task 11 —
a última da fila — é o modo conhecido de uma pendência nunca chegar. Dossiê e
classificação precisam nascer sobre persistência real, com os repositórios
Prisma que a fatia 3 construiu.

**Posição:** imediatamente após a Task 6, antes da Task 7.

**Files:**
- Create: `packages/adapters/src/repositories/prisma-wallet-repository.ts`
- Modify: `packages/adapters/src/repositories/prisma-observation-repository.ts`
- Modify: `prisma/schema.prisma` (nome do devedor no título, auditoria de importação)
- Test: `packages/adapters/src/repositories/prisma-wallet-repository.test.ts`

**Interfaces:** implementa `WalletImportStore` sobre Prisma, com a mesma
autoridade das classes existentes: emissão por fábrica, campos `#`, protótipo
congelado, `VerifiedPrincipal` mais `AuthorizedOperation` em toda chamada.

**Critérios de aceitação:**

- As mesmas suítes de `import-wallet` passam contra PostgreSQL, não só contra a
  implementação em memória. Idempotência por `id_externo` sob índice único real
  `(tenantId, walletId, externalId)`, não apenas por chave de `Map`.
- Escrita e leitura entram no teste de isolamento tenant A → B já existente, com
  RLS ativa; a nova classe entra na lista `describe.each` dos invariantes
  arquiteturais de `tenant-repository.test.ts`.
- CPF cifrado em repouso, índice HMAC no banco, e nenhuma consulta com CPF em
  claro em parâmetro, log ou mensagem de erro.
- Observação PGFN persistida como fato tenant + devedor, sem `walletId`
  (ADR 020), reutilizável entre carteiras que contenham o mesmo devedor.
- Auditoria de importação em tabela append-only.
- Migração aplicada por `prisma migrate deploy` no Compose, com `migrate diff
  --exit-code` vazio ao final.

**Steps:** RED de idempotência contra o índice único real antes da migração;
migração e repositório; execução da suíte com Compose de pé; commit.

### Task 7: Política de triagem, ordenação e desfechos

**Files:**
- Create: `packages/domain/src/policy/types.ts`, `packages/domain/src/policy/policy-2026-07-a.ts`, `packages/domain/src/policy/evaluate.ts`, `packages/domain/src/outcome.ts`
- Create: `fixtures/policy/dossiers.ts`
- Test: `packages/domain/src/policy/evaluate.test.ts`, `packages/domain/src/policy/sensitivity.test.ts`, `packages/domain/src/policy/distribution.test.ts`

**Interfaces:** Produces `evaluatePolicy(dossier, policy): PolicyClassification`, `comparePolicies(dossierIds, left, right)` and `recordOutcome(classificationId, outcome, actor)`.

- [ ] **Step 1: Write failing manual-policy tests**

```ts
it("returns DADOS_INSUFICIENTES when three source results are errors", () => {
  expect(evaluatePolicy(threeErrors, policy).category).toBe("DADOS_INSUFICIENTES");
});

it("does not use a low-confidence record as a negative fact", () => {
  expect(evaluatePolicy(lowConfidenceNegative, policy).signals).not.toContainEqual(
    expect.objectContaining({ applied: true, sourceField: "protestos" }),
  );
});
```

- [ ] **Step 2: Run policy tests before evaluator exists**

Run: `pnpm --filter @panella/domain test evaluate sensitivity distribution`

Expected: failures because policy types and evaluator do not exist.

- [ ] **Step 3: Implement declarative policy**

Define named signals, source fields, independent weights, eligibility gates and deterministic tie-breaker. Add `pgfn_regularidade_indiciada_por_delta` as a positive, separately weighted signal only when ADR 014 preconditions hold; add QSA contextual signal with weight and contribution zero. Apply conservative escalation gate requiring `CONFIRMED` identity and sufficient coverage. Return one strategy, ordinal priority, coverage, global confidence and readable explanation.

- [ ] **Step 4: Verify non-predictive validation**

Run: `pnpm test -- evaluate sensitivity distribution && pnpm lint`

Expected: each ±20% weight perturbation preserves configured boundary fixtures; synthetic portfolio distribution has more than one non-insufficient category; manually calculated fixtures match exact contributions.

- [ ] **Step 5: Commit**

```bash
git add packages/domain fixtures/policy
git commit -m "feat: add explainable triage policy"
```

### Task 8: PGFN Dados Abertos e Lista manual

**Files:**
- Create: `packages/adapters/src/pgfn/open-data-worker.ts`, `packages/adapters/src/pgfn/list-importer.ts`, `packages/adapters/src/pgfn/manifest.ts`
- Create: `fixtures/pgfn/open-data/`, `fixtures/pgfn/lista-manual.xlsx`
- Test: `packages/adapters/src/pgfn/open-data-worker.test.ts`, `packages/adapters/src/pgfn/list-importer.test.ts`

**Interfaces:** Produces `ingestPgfnOpenData(run)`, `importPgfnList(file, actor)`, `PgfnCoverageManifest` and `PGFN_DADOS_ABERTOS`/`PGFN_LISTA_DEVEDORES_MANUAL` observations.

- [ ] **Step 1: Write failing source-separation tests**

```ts
it("requires SIDA, Previdenciaria and FGTS before a full no-result", () => {
  expect(manifestWithOnlySida.coverageStatus).toBe("NAO_CONSULTADO");
});

it("keeps a filtered manual list as a separate scoped observation", () => {
  expect(importedList.source).toBe("PGFN_LISTA_DEVEDORES_MANUAL");
  expect(importedList.queryScope).toMatchObject({ complete: false });
});
```

- [ ] **Step 2: Run the tests before adapters exist**

Run: `pnpm --filter @panella/adapters test pgfn`

Expected: failures because PGFN parsers and manifests do not exist.

- [ ] **Step 3: Implement the two PGFN paths**

Implement quarterly worker handling all required SIDA, Previdenciária and FGTS files and all UFs when wallet lacks UF. Stream only tenant candidates into shared identity resolution and persist reference date, part checksum and coverage. Implement manual XLSX/CSV parser with preamble, blank rows, block detection, provenance status, decimal money, semantically distinct total/selected debt values and no scraping code.

- [ ] **Step 4: Verify PGFN invariants**

Run: `pnpm test -- pgfn resolver evaluate`

Expected: partial coverage is `NAO_CONSULTADO`; orphan block is marked/rejected; filtered List absence cannot create the regularity delta; full-scope delta can.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters fixtures/pgfn docs/fontes.md docs/lgpd.md
git commit -m "feat: add PGFN batch and manual sources"
```

### Task 9: QSA/RFB worker e Portal da Transparência adapter

**Files:**
- Create: `packages/adapters/src/qsa/worker.ts`, `packages/adapters/src/qsa/layout.ts`, `packages/adapters/src/portal/adapter.ts`
- Create: `fixtures/qsa/socios-part-01.zip`, `fixtures/portal/ceis-found.json`, `fixtures/portal/ceaf-error.json`
- Test: `packages/adapters/src/qsa/worker.test.ts`, `packages/adapters/src/portal/adapter.test.ts`

**Interfaces:** Produces `runQsaMonthlyJob`, `parseSociosPart`, `PortalTransparencyAdapter.collect` and source manifests with latency/failure metadata.

- [ ] **Step 1: Write failing source safety tests**

```ts
it("rejects a compatible QSA mask with divergent name", async () => {
  expect((await runQsaMonthlyJob(fixture)).matched).toHaveLength(0);
});

it("does not persist a QSA row for a non-client", async () => {
  await runQsaMonthlyJob(fixture);
  expect(await repository.findByRawName("NON CLIENT")).toEqual([]);
});
```

- [ ] **Step 2: Run tests before workers exist**

Run: `pnpm --filter @panella/adapters test qsa portal`

Expected: failures because QSA streaming and Portal adapter do not exist.

- [ ] **Step 3: Implement workers and adapter**

Stream `Socios*.zip` only, validate positional semicolon/Latin-1 layout and fail on column-count change. Keep non-client rows only in process memory, derive mask in memory, call shared resolver, persist tenant observations and manifest, then delete raw artifacts. Implement CEIS/CEAF through `SourceAdapter` with timeout, retry, rate limit, TTL, secret-only configuration and fixture mode; classify missing credential as configuration/source state, not negative data.

- [ ] **Step 4: Verify offline operation**

Run: `pnpm test -- qsa portal`

Expected: no network is contacted; QSA manifest retains reference date/checksum; Portal errors remain `ERRO_NA_FONTE`.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters fixtures/qsa fixtures/portal docs/fontes.md
git commit -m "feat: add QSA and transparency adapters"
```

### Task 10: Retenção, expurgo e revisão interna

**Files:**
- Create: `packages/domain/src/retention.ts`, `packages/application/src/purge-expired.ts`, `packages/application/src/review-request.ts`
- Create: `apps/worker/src/purge.ts`
- Test: `packages/application/src/purge-expired.test.ts`, `packages/application/src/review-request.test.ts`

**Interfaces:** Produces `purgeExpired(policy, now)`, `PurgeExecution`, `createReviewRequest(actor, input)` and `ReadState`.

- [ ] **Step 1: Write failing retention and review tests**

```ts
it("redacts expired dossier payload but preserves its audit skeleton", async () => {
  const result = await purgeExpired(policy, now);
  expect(result.readState).toBe("ELIMINADO_A_PEDIDO_DO_TITULAR");
  expect(result.audit.policyVersion).toBeDefined();
});

it("rejects a review request from a public actor", () => {
  expect(() => createReviewRequest(publicActor, input)).toThrow("INTERNAL_ACTOR_REQUIRED");
});
```

- [ ] **Step 2: Run tests before implementation**

Run: `pnpm --filter @panella/application test purge-expired review-request`

Expected: failures because retention execution and review gate do not exist.

- [ ] **Step 3: Implement policy-driven lifecycle**

Implement tenant/versioned retention policy, observation purge, snapshot redaction, debtor-key destruction and append-only `PurgeExecution`. Implement internal operator/encarregado review request flow, analysis/result fields and superseding dossier/classification link. Do not expose a public CPF review route.

- [ ] **Step 4: Verify retention invariants**

Run: `pnpm test -- purge-expired review-request compose-dossier`

Expected: expired observation cannot alter embedded snapshot; purge preserves audit skeleton; only authorized internal actors create review requests.

- [ ] **Step 5: Commit**

```bash
git add prisma packages/domain packages/application apps/worker docs/lgpd.md
git commit -m "feat: add retention purge and review workflow"
```

### Task 11: Agent API, prompt, pagination and OpenAPI

**Files:**
- Create: `packages/contracts/src/prompt.ts`, `packages/application/src/lookup-dossier.ts`, `packages/application/src/list-priorities.ts`
- Create: `apps/web/src/app/api/v1/carteiras/[walletId]/dossies/lookup/route.ts`, `apps/web/src/app/api/v1/carteiras/[walletId]/prioridades/route.ts`, `apps/web/src/app/api/v1/dossies/[dossierId]/prompt/route.ts`
- Test: `packages/contracts/src/prompt.test.ts`, `packages/application/src/lookup-dossier.test.ts`, `apps/web/src/app/api/v1/api-contract.test.ts`

**Interfaces:** Produces lookup by body `id_externo`, cursor-paginated priorities, dossiê read, prompt projection and generated OpenAPI operations.

- [ ] **Step 1: Write failing contract and golden tests**

```ts
it("renders the same prompt for the same snapshot and prompt version", () => {
  expect(renderPrompt(snapshot, "1.0.0")).toMatchFileSnapshot("fixtures/prompt/golden.md");
});

it("does not accept CPF as a lookup parameter", async () => {
  await expect(api.lookup({ cpf: "123" })).rejects.toThrow("ID_EXTERNO_REQUIRED");
});
```

- [ ] **Step 2: Run tests before routes exist**

Run: `pnpm --filter @panella/contracts test prompt && pnpm --filter @panella/web test api-contract`

Expected: failures because handlers and prompt renderer do not exist.

- [ ] **Step 3: Implement agent-first read APIs**

Authorize actor in application services, look up `id_externo` only inside authorized wallet, paginate priorities with opaque cursor, and return redacted views by role. Render deterministic Markdown/text with `prompt_version`, coverage, uncertainty, signals and primary strategy. Generate OpenAPI and JSON Schema from Zod; never hand-author duplicate operation schemas.

- [ ] **Step 4: Verify contracts**

Run: `pnpm generate:contracts && pnpm test -- prompt lookup-dossier api-contract && pnpm typecheck`

Expected: golden prompt is stable; OpenAPI documents lookup body and cursor; no route accepts CPF in URL/query.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/contracts packages/application fixtures/prompt
git commit -m "feat: expose agent-first dossier API"
```

### Task 12: UI white label, outcomes, jobs and final verification

**Files:**
- Create: `apps/web/src/app/(app)/prioridades/page.tsx`, `apps/web/src/app/(app)/dossies/[dossierId]/page.tsx`, `apps/web/src/app/(app)/revisoes/page.tsx`
- Create: `apps/web/src/lib/theme.ts`, `apps/worker/src/index.ts`, `scripts/verify-no-pii.mjs`
- Modify: `README.md`, `docs/fontes.md`, `docs/lgpd.md`, `AGENTS.md`
- Test: `apps/web/src/app/ui-access.test.tsx`, `apps/worker/src/index.test.ts`, `scripts/verify-no-pii.test.mjs`

**Interfaces:** Produces role-filtered human views, worker commands and reproducible local runbook.

- [ ] **Step 1: Write failing UI and worker tests**

```ts
it("hides CPF and source evidence from operador_cobranca", async () => {
  render(<DossierPage actor={operator} dossier={fixture} />);
  expect(screen.queryByText("CPF")).not.toBeInTheDocument();
});

it("runs purge as a worker command, not a web request", async () => {
  await expect(runWorker("purge")).resolves.toMatchObject({ actor: { kind: "SYSTEM" } });
});
```

- [ ] **Step 2: Run tests before UI and worker entrypoint exist**

Run: `pnpm --filter @panella/web test ui-access && pnpm --filter @panella/worker test`

Expected: failures because pages, theme and worker command dispatcher do not exist.

- [ ] **Step 3: Implement final delivery surfaces**

Implement tenant-configured product name, colors, logo, favicon and metadata without developer branding. Show prioritized queue, role-filtered dossier, review queue and outcome entry. Implement worker dispatcher for PGFN, QSA, Portal refresh and purge, all with system actor audit. Add README commands for install, local start, migrations, contract generation, tests, lint and typecheck.

- [ ] **Step 4: Execute release verification**

Run: `pnpm generate:contracts && pnpm test && pnpm lint && pnpm typecheck && pnpm build && node scripts/verify-no-pii.mjs`

Expected: all tests offline pass; generated contracts are current; build succeeds; scanner finds no CPF fixture leak or developer branding.

- [ ] **Step 5: Commit**

```bash
git add apps packages scripts prisma fixtures docs README.md AGENTS.md
git commit -m "feat: deliver white-label triage application"
```

## Plan self-review

| Requirement group | Tasks |
|---|---|
| Workspace, docs, reproducibility and no real data | 1, 12 |
| Money, source states, Zod/OpenAPI/schema compatibility | 2, 11 |
| Tenant, actor, Keycloak boundary and key isolation | 3, 11, 12 |
| Wallet, idempotency, parsing, quarantine and audit | 4, 10 |
| Identity resolution and low-confidence safeguards | 5, 6, 8, 9 |
| Observation/dossiê/classification layers and supersession | 6, 7, 10 |
| Three source integrations and source semantics | 8, 9 |
| Retention, review, crypto-shredding and audit | 3, 6, 10 |
| Policy, ranking, sensitivity, distribution and outcomes | 7 |
| Agent API, prompt contract, pagination and UI roles | 11, 12 |

The plan contains no implementation placeholders: every source path, interface,
test command and acceptance check is specified. Types defined in the interface
section are introduced before their consumers.
