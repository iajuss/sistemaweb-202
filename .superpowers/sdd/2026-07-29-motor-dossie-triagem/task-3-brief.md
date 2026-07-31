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

