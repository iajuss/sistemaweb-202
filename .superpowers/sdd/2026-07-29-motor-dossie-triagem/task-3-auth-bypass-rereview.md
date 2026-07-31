# Task 3 — Scoped independent re-review of the authentication critical bypasses

**Date:** 2026-07-30
**Range reviewed:** `e77a5d3..a7a9d2d`
**Reviewer:** independent subagent (did not implement the code under review)
**Verdict: NOT CLOSED.** Three Critical findings (C-3 reclassified from the
reviewer's Important I-1 by user decision), all with executable PoCs, all
independently confirmed by direct source reading before being recorded here.

Slice 3 must not be closed on this evidence.

## Environment note discovered while running the suite

`docker compose up workspace-dependencies` bind-mounts the repository at
`.:/workspace` while the named volume `workspace-node-modules` covers only
`/workspace/node_modules` (the root). The per-package `packages/*/node_modules`
therefore live on the host filesystem and are rewritten by the Linux container
with reparse points Windows cannot resolve (`Get-Item` reports `Mode: d----l`
with empty `LinkType`/`Target`; Node fails with `ERR_MODULE_NOT_FOUND` for
`zod`). `pnpm install --frozen-lockfile` reports "Already up to date" because
the lockfile matches — it does not revalidate symlinks, so `--force` does not
repair it either.

Repair used: delete `packages/*/node_modules` and `apps/*/node_modules`, then
run `pnpm install --frozen-lockfile` on the host. This recurs on every host run
of the Compose dependency service and is worth a permanent fix.

## Bypass-by-bypass verdict

| # | Bypass | Verdict |
|---|---|---|
| 1 | C1 — caller-controlled actor profile | CLOSED |
| 2 | C2/I1/I3 — optional authz, transaction order, context identity | PARTIALLY CLOSED |
| 3 | Structural actor forgery | CLOSED |
| 4 | Prisma client override | PARTIALLY CLOSED — demonstrated bypass |
| 5 | Direct observation access without wallet authorization | CLOSED at boundary; debtor-in-wallet post-check untested |
| 6 | `DevInsecureIdentityProvider` fail-closed | STILL OPEN — demonstrated bypass |

Note: the error name `AUTHENTICATED_ACTOR_REQUIRED` recorded in
`task-3-report.md` does not exist in the tree. The real runtime guards are
`VERIFIED_PRINCIPAL_REQUIRED` (`identity-middleware.ts:102`),
`AUTHENTICATED_IDENTITY_REQUIRED` (`keycloak.ts:79,87`) and
`AUTHORIZED_OPERATION_REQUIRED` (`authorize-actor.ts:174`). The guard is real;
the report names it wrongly.

## Critical

### C-1 — production-reachable verified principal via the development provider

`packages/adapters/src/identity-middleware.ts:123-151`

The `NODE_ENV === "development"` + explicit opt-in check exists **only in the
constructor**. `authenticateHumanKeycloak`, `authenticateMachineAgent` and
`authenticateSystemWorker` are ordinary prototype methods that never read
`this`, consult no private state, and call the module-private
`issueVerifiedPrincipal` directly. The constructor is therefore optional.

PoC executed under `NODE_ENV=production`:

```text
A) constructor blocked -> DEV_INSECURE_IDENTITY_PROVIDER_FORBIDDEN
B) forged principal = {"issuer":"internal://attacker","subject":"attacker-subject","origin":"SYSTEM_WORKER"}
C) assertVerifiedPrincipal ACCEPTED the forged principal
D) assertAuthenticatedIdentity ACCEPTED
E) operation = {"walletId":"victim-wallet","action":"RUN_SOURCE","tenantId":"victim-tenant"}
E) assertAuthorizedOperation ACCEPTED -> full write capability on victim-tenant
```

```js
process.env.NODE_ENV = "production";
const principal = DevInsecureIdentityProvider.prototype
  .authenticateSystemWorker({ issuer: "internal://attacker", subject: "x" });
```

The principal is registered in the issuance `WeakSet`, so every downstream guard
accepts it. RLS gives no protection because the attacker chooses the tenant fed
to `set_config`. This is strictly weaker than the reflected-constructor attack
the team already defended against and tested.

Consequence for ADR 021: the production prohibition has **no code enforcement**.
This is distinct from — and not excused by — the accepted open JWT/JWKS item.

Suggested fix: grant per-call authority from the constructor (a `#authorized`
private field read by each `authenticate*` method, mirroring the
`principalIssuanceAuthority` pattern already used above), plus re-check
`process.env.NODE_ENV` inside each method. Add a test that calls the detached
prototype method under `NODE_ENV=production` and expects a throw.

### C-2 — exported repository class defeats `PRISMA_CLIENT_OVERRIDE_FORBIDDEN`

`packages/adapters/src/repositories/prisma-observation-repository.ts:165-170`

`PrismaObservationDatabase` is module-private, but
`PrismaAuthorizedObservationRepository` is exported with a public, unguarded
constructor accepting that database. `new PrismaAuthorizedObservationRepository(fake)`
skips the factory guard at line 198 entirely.

PoC result:

```text
calls: ['findAuthorized(victim-tenant,victim-wallet,observation-a) -- NO set_config, NO role check']
returned tenantId: OTHER-TENANT   (operation tenant was victim-tenant)
```

Per ADR 019, a TypeScript-private field is not runtime enforcement.

Suggested fix: stop exporting the class (export only
`createPrismaObservationRepository` and the bundle type), or apply the same
authority-token pattern in the constructor plus a `WeakSet` of factory-issued
repositories.

### C-3 — production observation read returns foreign-tenant records

*(Recorded by the reviewer as Important I-1. Reclassified to Critical by user
decision on 2026-07-30; see the severity note below. The identifier I-1 is kept
as an alias so earlier references remain traceable.)*

`packages/adapters/src/repositories/prisma-observation-repository.ts:186`

`PrismaAuthorizedObservationRepository.find` returns
`this.database.findAuthorized(...)` verbatim, bypassing the
`record?.tenantId === context.tenantId` comparison that
`TransactionalTenantScopedRepository.find` (`tenant-repository.ts:148`)
performs on the write path. `save` still goes through the wrapper; `find` does
not.

The reviewer's C-2 PoC already demonstrated the leak rather than predicting it:

```text
returned tenantId: OTHER-TENANT   (operation tenant was victim-tenant)
```

**Why the initial severity was wrong.** The finding was filed as Important on
the reasoning that RLS still stands behind the missing check, making this a
defense-in-depth regression. That reasoning inverts ADR 020, which states that
RLS is the *second* barrier and explicitly not a substitute for domain
authorization — so "RLS still catches it" is the precise condition ADR 020
forbids relying on, not a mitigating factor. It also understates the observed
result: a foreign-tenant record was actually returned to a caller holding a
capability for a different tenant. A demonstrated cross-tenant read is a leak
between clients of a multi-tenant system, and the severity has to be read from
the data crossing the boundary, not from whether a second control might have
stopped it. Reclassified Critical.

Fix: restore the tenant equality check on the read path and add a test with a
fake database returning a foreign-tenant record, so the guard fails loudly if
removed again.

## Important

- **I-2 — the wallet half of the capability is vacuous for HUMAN actors.**
  `packages/domain/src/authorization.ts:60-66` decides from roles alone and never
  reads `walletId`/`walletGrants`; `authorization.test.ts:101-103` asserts this
  deliberately. Any `ANALISTA_DOSSIE` gets `READ_DOSSIER` on every wallet in the
  tenant. Cross-tenant is blocked; intra-tenant wallet isolation is not.
  AGENTS.md says "capability opaca de carteira + ação"; ADR 008 is ambiguous.
  **Needs a decision, not a silent fix.**
- **I-3 — identity/authorization repositories are unbound caller-supplied
  parameters.** `mapVerifiedKeycloakActor(principal, identities)` and
  `authorizeOperation(..., repository)` accept any conforming object, so
  `tenantId`/`roles` come from whatever the caller passes. Not reachable from
  request input today (no HTTP surface yet), but the same class of hole one
  layer up.
- **I-4 — six runtime guards have no test (ADR 019 violation).** These strings
  appear only in source, never in a test: `AUTHORIZED_OPERATION_REQUIRED`,
  `OPERATION_PRINCIPAL_MISMATCH`, `OPERATION_CONTEXT_IDENTITY_MISMATCH`,
  `SYSTEM_INGESTION_CAPABILITY_REQUIRED`, `AUTHORIZED_WALLET_CONTEXT_REQUIRED`,
  `INVALID_TENANT_CONTEXT`. Deleting any of those branches leaves the suite
  green. The `containsDebtor` post-filter (`authorize-actor.ts:308-314`) is also
  untested. No tests are skipped.
- **I-5 — `ActorIdentity` resolution is not unique and is unreadable under RLS.**
  The migration's unique key is `(tenantId, provider, subject)` but
  `IdentityActorRepository.findByIdentity` takes only `{provider, subject}`; two
  tenants registering the same subject makes resolution arbitrary — a
  tenant-hijack primitive once real data exists. Separately `ActorIdentity` has
  `FORCE ROW LEVEL SECURITY` keyed on `app.tenant_id`, which is not yet known at
  resolution time, so no implementation can work as written. Neither
  `IdentityActorRepository` nor `WalletAuthorizationRepository` has a Prisma
  implementation in the tree. **Needs a decision:** global unique
  `(provider, subject)`, or a `SECURITY DEFINER` resolution function.

## Minor

- `eslint.config.mjs:25` restricts `issueAuthenticatedActor`, which no longer
  exists — dead rule; the surfaces that do issue authority are unrestricted.
- `packages/domain/src/index.ts:19-27` still exports `createTenantContext` and a
  `TenantScopedRepository` interface whose signature is `save(context: TenantContext, value)`,
  contradicting ADR 020's "`TenantContext` nunca porta pública". Not exploitable
  today; loaded gun for the next author.
- `prisma-observation-repository.ts:198-202` accepts any `databaseUrl` string,
  letting a caller repoint the datasource at a schema without policies;
  `assertApplicationRole` catches superuser/`BYPASSRLS` but not "correct role,
  no policies".
- `docker-compose.yml` sets no `NODE_ENV` for `web`/`worker`, so the dev provider
  throws in local Compose. Fail-closed, but local dev cannot authenticate.
- `packages/application` ↔ `packages/adapters` workspace dependency cycle.

## New paths opened by the correction itself

Two, both introduced in this range:

1. `PrismaAuthorizedObservationRepository` was exported alongside the newly
   hardened factory, creating an unguarded alternative to the guard the factory
   adds (C-2).
2. The production read path was routed around
   `TransactionalTenantScopedRepository`, dropping the application-level tenant
   equality check (I-1).

No test-only escape hatches, `__test` exports or `NODE_ENV === 'test'` branches
exist in production code; `vi.stubEnv` appears only in test files.

## Confirmed strengths (not to be re-litigated)

- `RuntimeVerifiedPrincipal` (`identity-middleware.ts:33-93`) is a genuinely
  strong opaque token: `#`-private fields, module-private issuance authority
  checked in the constructor, issuance `WeakSet`, `instanceof`, and a brand
  probe. Reflected-constructor and reflected-`issue()` attacks are both blocked
  and tested (`keycloak.test.ts:88-115`).
- The capability in `tenant-repository.ts:41-69` binds to the principal by
  reference identity, pins the action, and requires `kind === "SYSTEM"` for
  `RUN_SOURCE`. It is not a replayable bearer token.
- `setLocalTenant` genuinely precedes `assertApplicationRole` and the data
  query; `prisma-observation-repository.test.ts:102-137` asserts the exact
  sequence `["SET_LOCAL:tenant-a", "ROLE_CHECK", "FIND_AUTHORIZED"]`.
- CPF hygiene is clean across the range: no CPF in any new error, log or
  exception; `$queryRawUnsafe` is parameterized on `tenantId` only.
