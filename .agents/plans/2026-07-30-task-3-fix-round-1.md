# Task 3 Fix Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authenticated identity, wallet authorization, transaction tenant scope, erasure state, and audit persistence mechanically unavoidable.

**Architecture:** The Keycloak adapter will accept only a verified principal and resolve tenant-local authorization data from a repository. Application operations will issue opaque authorization tickets consumed by repositories. Domain context preserves the originally authenticated actor. A new migration adds explicit debtor-erasure audit state, while crypto distinguishes tombstoned erasure from invalid key references.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL RLS, Vitest, Docker Compose.

## Global Constraints

- No raw CPF in logs, URLs, errors, or test fixtures.
- Public source inputs cannot choose tenant, actor roles, or wallet grants.
- `SET LOCAL app.tenant_id` must precede every transaction query.
- Every change begins with a focused failing test.
- `VerifiedPrincipal` is a non-exported concrete class with ECMAScript `#` state; only its type is public and all guards check the class identity/state.
- Only middleware owns the private principal factory. Public human, machine-agent and system-worker emission paths carry an auditable origin and adapters provide validated inputs only.
- `DevInsecureIdentityProvider` is allowed only with `NODE_ENV=development` and an explicit opt-in flag; no production token-accepting provider exists.
- Tenant-scoped repositories require a verified principal plus an operation capability, not `tenantId` or a structural actor/context; authorization covers wallet and action, with explicit SYSTEM ingestion capability.
- A new migration, never an edit of the applied migration, persists debtor erasure tombstone and audit skeleton.
- ADR 021 and AGENTS.md must state JWT/JWKS remains open and production is prohibited until it is verified; Task 3 closure is explicitly permitted with that security pending.

### Task 1: Opaque verified principal and fail-closed development provider

**Files:** middleware principal module, `packages/domain/src/actor.ts`, `packages/domain/src/index.ts`, `packages/adapters/src/keycloak.ts`, principal/provider tests, `eslint.config.mjs`.

- [ ] Add failing runtime and compile-time tests proving a structural principal, caller-controlled profile/grants, non-dev mode, and an absent opt-in flag cannot issue a principal.
- [ ] Run the adapter test and observe the expected failure.
- [ ] Resolve tenant/roles/grants from verified issuer/subject; emit distinct HUMAN_KEYCLOAK, AGENT_MACHINE_CREDENTIAL, and SYSTEM_WORKER origins through middleware-only issuance.
- [ ] Run the adapter and domain tests.

### Task 2: Mandatory operation authorization, immutable context, and transaction order

**Files:** `packages/domain/src/authorization.ts`, `packages/domain/src/actor.ts`, `packages/application/src/authorize-actor.ts`, repository files and focused tests.

- [ ] Add failing runtime and compile-time tests for direct observation access without a capability, raw tenant/principal inputs, actor mutation after context creation, and tenant setup ordering.
- [ ] Run focused tests and observe failures.
- [ ] Issue immutable wallet/action capabilities (including explicit SYSTEM ingestion), require them at repository access, preserve the verified principal in context, and set tenant scope before role checks.
- [ ] Run focused tests.

### Task 3: Explicit erasure state and persistence

**Files:** `packages/adapters/src/kms.ts`, `packages/adapters/src/kms.test.ts`, `prisma/schema.prisma`, new Prisma migration, persistence tests.

- [ ] Add failing tests for an unknown/corrupt key reference and persistent erasure audit fields.
- [ ] Run focused tests and observe failures.
- [ ] Implement tombstone-aware crypto reads and a new debtor erasure/audit schema migration.
- [ ] Run focused tests.

### Task 4: ADR, runtime verification and handoff (do not begin Task 4 of the product plan)

**Files:** task report and progress ledger only (not staged).

- [ ] Run Docker Compose and stop immediately if a service fails.
- [ ] Re-run PostgreSQL/RLS integration and `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- [ ] Add ADR 021; update AGENTS.md, report and progress with RED/GREEN evidence, real RLS validation, AWS KMS NEEDS_CONTEXT, and the still-open JWT/JWKS production prohibition.
- [ ] Commit only product code, tests, configuration, migration, and applicable documentation.
