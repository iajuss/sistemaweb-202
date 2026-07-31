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

