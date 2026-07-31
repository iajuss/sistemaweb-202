# Task 3 fix round 1 — implementation report

**Status:** IMPLEMENTED; focused verification, lint and typecheck are green.
The single independent end-of-round review occurred before the fix wave recorded
below. The user explicitly did not commission a second review. No commit was
made.

## Scope executed

This round implements only the five requested identity/tenant boundary
conditions from Tasks 1–4. The erasure/persistence work in plan Task 3 is not
part of these five conditions and was not changed.

## RED evidence

| Command | Expected RED observed |
| --- | --- |
| `pnpm --filter @panella/adapters test -- keycloak` | The new adapter contract could not load `./identity-middleware.js`, proving the middleware/provider boundary did not exist. The package command also attempted the known Docker integration test, which was blocked by the stopped Docker daemon. |
| `pnpm exec vitest run packages/application/src/authorize-actor.test.ts` | The new operation-capability test could not resolve `@panella/adapters/identity-middleware`; the application had no such authenticated-operation boundary. |
| `pnpm exec vitest run packages/adapters/src/repositories/tenant-repository.test.ts` | The repository contract test could not resolve `@panella/application`; repositories had no operation-capability dependency and still accepted `TenantContext`. |
| `pnpm exec vitest run packages/adapters/src/keycloak.test.ts` after a temporary mutation that added and consumed `callerProfile` | One test failed exactly with `IDENTITY_ORIGIN_KIND_MISMATCH`. The caller-controlled profile was consumed, proving `ignores a caller-controlled profile argument` catches the bypass. The mutation was immediately reverted before all GREEN runs. |

## GREEN evidence

| Command | Result |
| --- | --- |
| `pnpm exec vitest run packages/adapters/src/keycloak.test.ts` | 8/8 passing. |
| `pnpm exec vitest run packages/application/src/authorize-actor.test.ts` | 3/3 passing. |
| `pnpm exec vitest run packages/adapters/src/repositories/tenant-repository.test.ts` | 4/4 passing. |
| `pnpm exec vitest run packages/adapters/src/repositories/prisma-observation-repository.test.ts` | 3/3 passing; confirms `SET_LOCAL` precedes role and observation queries under the new operation signature. |
| `pnpm exec vitest run packages/adapters/src/keycloak.test.ts packages/application/src/authorize-actor.test.ts packages/adapters/src/repositories/tenant-repository.test.ts packages/adapters/src/repositories/prisma-observation-repository.test.ts packages/domain/src/authorization.test.ts` | 25/25 passing in 5 files. This is the targeted end-state suite. |
| `pnpm lint` | Exit 0. |
| `pnpm typecheck` | Exit 0. |
| `pnpm test` | Domain 30/30, application 3/3, contracts 9/9 and adapter unit tests 27/27 passed. One PostgreSQL/RLS integration test could not connect to `dockerDesktopLinuxEngine`; exit 1 is environmental, not a unit-test regression. Docker was not started. |

## Condition-by-condition evidence

1. **Opaque verified principal.**
   `packages/adapters/src/identity-middleware.ts` keeps the concrete
   `RuntimeVerifiedPrincipal` non-exported and uses ECMAScript `#` fields.
   `assertVerifiedPrincipal` requires both class identity and readable private
   state. The only factory is module-private. `issueAuthenticatedActor` was
   removed from domain exports; the adapter test dynamically proves it is not
   exposed from `@panella/domain`.

2. **Repository requires principal plus operation capability.**
   `TenantScopedRepository` implementations now accept
   `(principal, operation, ...)`, verify the principal, opaque application
   capability, mapped identity, principal identity, and context identity before
   touching storage. A raw `TenantContext` is rejected with
   `VERIFIED_PRINCIPAL_REQUIRED`. The Prisma repository inherits the same
   signature through the transactional repository.

3. **Auditable validated origins.**
   `Actor` now has required `issuanceOrigin`; mapping derives it from the
   verified principal as `HUMAN_KEYCLOAK`, `AGENT_MACHINE_CREDENTIAL`, or
   `SYSTEM_WORKER`. `mapVerifiedKeycloakActor` accepts only an opaque principal
   and `IdentityActorRepository`; it resolves actor ID, tenant, kind and roles
   from persistence. It has no profile/grant input. The third-argument mutation
   RED demonstrates the profile bypass test fails if that is reintroduced.

4. **Development-only provider.**
   `DevInsecureIdentityProvider` throws
   `DEV_INSECURE_IDENTITY_PROVIDER_FORBIDDEN` unless `NODE_ENV=development`,
   and separately requires `allowInsecureDevelopmentIdentity: true`. Its tests
   cover both failure paths. There is no production token-accepting provider.

5. **JWT/JWKS production prohibition.**
   ADR 021 and `AGENTS.md` state that JWT/JWKS validation remains open and
   production deployment is prohibited until issuer, audience, expiration and
   key rotation are verified fail-closed. No Keycloak/JWT/JWKS API was invented.

## Files changed

- `AGENTS.md`
- `docs/decisions/021-identidade-verificada-e-proibicao-de-producao-sem-jwt-jwks.md`
- `packages/domain/src/actor.ts`, `authorization.ts`, `index.ts`, and tests
- `packages/adapters/src/identity-middleware.ts`, `keycloak.ts`, repository
  boundary code, and focused tests
- `packages/application/src/authorize-actor.ts`, `index.ts`, and focused tests
- `packages/adapters/package.json`, `packages/application/package.json`, and
  `pnpm-lock.yaml` for the one-way adapter → application capability contract

## Unresolved issues and handoff concerns

- **Independent review:** the one independent whole-boundary review occurred
  before the corrective wave appended below. No second review was commissioned
  by user instruction.
- **Docker integration blocked:** Docker Desktop daemon is unavailable. The
  full suite's PostgreSQL/RLS test remains blocked and needs re-run in an
  environment with the daemon running. No Docker service was started here.
- **JWT/JWKS remains open:** deployment to production is prohibited by ADR 021;
  no production request may be authenticated by this code yet.
- **AWS KMS remains NEEDS_CONTEXT:** no approved AWS/KMS deployment contract was
  supplied and no AWS API was invented.
- **No commit:** AGENTS.md requires explicit approval and none was requested for
  these changes.

## Fix wave after the independent review

The independent review was performed before this wave and identified C1, C2,
C3, I1 and I2. This wave fixes all five without weakening the five security
conditions. User instruction prohibited commissioning another independent
review, so this section records implementation and verification only.

### RED evidence — fix wave

| Command | Expected RED observed |
| --- | --- |
| `pnpm exec vitest run packages/adapters/src/keycloak.test.ts` | 2 failures: `assertVerifiedPrincipal` accepted a `Reflect.construct` principal from `legitimate.constructor`, and `authenticateHumanKeycloak` did not exist. |
| `pnpm exec vitest run packages/application/src/authorize-actor.test.ts` | Structural HUMAN identity resolved `{ allowed: true }` instead of rejecting; it therefore reached the wallet/CPF bootstrap. |
| `pnpm exec vitest run packages/adapters/src/repositories/tenant-repository.test.ts` | `READ_DOSSIER` capability saved successfully, and an AGENT wallet-A capability read same-tenant wallet-B data. |
| `pnpm exec vitest run packages/adapters/src/repositories/prisma-observation-repository.test.ts` | The new wallet persistence test observed an upsert payload without `walletId`; pre-existing read tests also exposed that `RUN_SOURCE` must no longer read. |
| `pnpm typecheck` after adding the negative principal type test | Failed with `Unused '@ts-expect-error' directive`, proving `VerifiedPrincipal` remained structurally assignable before the module-private brand. |

### GREEN evidence — fix wave

| Command | Result |
| --- | --- |
| `pnpm exec vitest run packages/adapters/src/keycloak.test.ts` | 11/11 passing: reflected constructor/static issuer are denied, the module-private brand rejects structural typing, and distinct human/agent/worker dev paths determine origin. |
| `pnpm exec vitest run packages/application/src/authorize-actor.test.ts` | 4/4 passing: structural HUMAN identity throws `AUTHENTICATED_IDENTITY_REQUIRED` before wallet lookup or CPF indexing. |
| `pnpm exec vitest run packages/adapters/src/repositories/tenant-repository.test.ts` | 6/6 passing: only SYSTEM `RUN_SOURCE` saves; only `READ_DOSSIER` reads; wallet-A cannot receive a wallet-B record. |
| `pnpm exec vitest run packages/adapters/src/repositories/prisma-observation-repository.test.ts` | 4/4 passing: the record stores wallet scope and reads retain `SET_LOCAL → ROLE_CHECK → FIND`. |
| `pnpm exec prisma generate` | Prisma Client regenerated from the updated schema. |
| `DATABASE_URL=postgresql://validation-only:validation-only@127.0.0.1:5432/validation_only pnpm exec prisma validate` | Schema valid; no database connection was required. |
| Focused five-file Vitest command | 32/32 tests passing. |
| `pnpm lint`, `pnpm typecheck`, `git diff --check` | All exit 0. |
| `pnpm test` | Domain 30/30, application 4/4, contracts 9/9 and adapter unit tests 33/33 pass. The one PostgreSQL/RLS integration test remains blocked solely by unavailable `dockerDesktopLinuxEngine`; Docker was not launched. |

### Corrective implementation

- **C1/I1:** `RuntimeVerifiedPrincipal` now requires module-private issuance
  authority and `WeakSet` registry membership. Its concrete class remains
  non-exported, carries ECMAScript private state and a private TypeScript brand.
  Reflected constructor/static calls lack authority and fail. Development emits
  only through distinct `authenticateHumanKeycloak`,
  `authenticateMachineAgent` and `authenticateSystemWorker` paths; origin is no
  longer caller input.
- **C2:** Application entry points runtime-assert the adapter-mapped
  `AuthenticatedIdentity` before creating an opaque `AuthorizedWalletContext`.
  `WalletAuthorizationRepository` no longer accepts raw `TenantContext`; its
  methods receive this runtime-issued context. Capability issuance and CPF
  indexing cannot proceed with a structural identity.
- **C3:** Tenant records now carry `walletId`; repository writes require SYSTEM
  `RUN_SOURCE` and same-wallet record scope, while reads require
  `READ_DOSSIER` and return only records in the capability wallet. Prisma
  observation persistence includes `walletId`; migration
  `20260730221000_observation_wallet_scope` adds the composite wallet foreign
  key and index. A non-empty legacy table fails closed rather than guessing a
  wallet backfill.
- **I2:** ADR 020, ADR 007, ADR 008 and AGENTS now consistently describe
  verified principal + opaque wallet/action capability, and mark JWT/JWKS
  verification as pending. ADR 021 remains the source of the production
  prohibition.

## Correction: observation ownership is tenant + debtor

The later architectural clarification supersedes the wallet-scoped portion of
the preceding C3 entry. An observation is a reusable immutable public-source
fact for one tenant and one debtor; a wallet is authorization topology only.

- Removed `Observation.walletId` from the Prisma model and from persistence.
  The uncommitted migration `20260730221000_observation_wallet_scope` was
  removed; there is no production data and therefore no backfill.
- `PrismaAuthorizedObservationRepository` now returns an observation only from
  a query constrained by `debtor.titles.some.walletId`. RLS is set and the
  restricted role is checked before that query. The repository interface no
  longer exposes a generic observation read that could bypass this predicate.
- The in-memory counterpart applies the same tenant + debtor / wallet-membership
  rule. Focused RED-to-GREEN tests demonstrate the identical fact is available
  to two wallets containing the debtor, while a wallet without that debtor gets
  `null` before the fact is returned.
- ADR 020, ADR 021 and `AGENTS.md` now explicitly prohibit
  `Observation.walletId` and distinguish data ownership from authorization.

### Verification after correction

| Command | Result |
| --- | --- |
| `pnpm exec vitest run packages/adapters/src/repositories/tenant-repository.test.ts packages/adapters/src/repositories/prisma-observation-repository.test.ts` | 13/13 passing, including real Prisma query-shape coverage for two authorized wallets and a denied wallet. |
| `pnpm exec prisma generate` | Passed after removing the invalid field. |
| `DATABASE_URL=postgresql://validation-only:validation-only@127.0.0.1:5432/validation_only pnpm exec prisma validate` | Schema valid; no database connection required. |
| `pnpm typecheck`, `pnpm lint`, `git diff --check` | All passed. |
| `pnpm test` | All unit suites passed (domain 30/30, contracts 9/9, application 4/4, adapters 36/36); the sole PostgreSQL/RLS integration test is blocked because Docker's `postgres` service is not running. |

The one independent review remains the review before the corrective wave; no
second independent review was commissioned, per user instruction.

### Commit

`a7a9d2d04d5cab67a7808657ea7cf80c92579171`
(`fix: enforce verified observation access`) contains the product code,
documentation and schema correction. This report and `.pnpm-store` remain
unstaged/ignored.
