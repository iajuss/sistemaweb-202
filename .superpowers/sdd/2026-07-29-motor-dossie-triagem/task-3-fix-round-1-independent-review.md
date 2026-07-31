# Task 3 fix round 1 — independent end-of-round review

## Verdict

**NOT READY TO MERGE.**

The focused suite, lint, and typecheck are green, and several intended boundaries
are materially stronger. However, three independently reproduced critical
authorization/identity bypasses remain. In particular, the concrete principal is
not actually unforgeable, structural identities can enter the authorization
bootstrap through raw `TenantContext`, and repository capabilities do not enforce
their wallet/action.

Scope reviewed: all tracked changes from base commit `80387fb` through the
current working tree, plus every untracked file reported by `git status --short`,
including `packages/adapters/src/identity-middleware.ts`,
`packages/application/src/index.ts`, and ADR 021. No Docker command was run.

The required implementation report
`.superpowers/sdd/2026-07-29-motor-dossie-triagem/task-3-fix-round-1-implementation-report.md`
does not exist in this worktree. The older `task-3-report.md` was inspected as
additional context, but it is not a substitute because it describes obsolete
behavior.

## Strengths

- The former public `issueAuthenticatedActor` implementation was removed from
  `packages/domain/src/actor.ts` and from the domain barrel. The runtime export
  test at `packages/adapters/src/keycloak.test.ts:45-48` passes.
- `mapVerifiedKeycloakActor` now has only a verified-principal plus resolver
  signature (`packages/adapters/src/keycloak.ts:95-104`), derives
  issuer/subject from the principal, resolves tenant/kind/roles through the
  repository, rejects origin/kind mismatch, never accepts wallet grants, and
  freezes the mapped actor (`packages/adapters/src/keycloak.ts:109-128`).
- The concrete tenant repositories require both a runtime-checked
  `VerifiedPrincipal` and a runtime-issued `AuthorizedOperation`; they reject a
  raw structural context at this boundary
  (`packages/adapters/src/repositories/tenant-repository.ts:37-54`).
- The transactional repository establishes tenant scope before every role or
  data query (`packages/adapters/src/repositories/tenant-repository.ts:97-121`).
  The Prisma test observes `SET_LOCAL → ROLE_CHECK → FIND`
  (`packages/adapters/src/repositories/prisma-observation-repository.test.ts:85-140`).
- `DevInsecureIdentityProvider` checks `NODE_ENV` during initialization and
  separately requires the literal opt-in
  (`packages/adapters/src/identity-middleware.ts:78-96`). Both genuine runtime
  tests pass, and there is no production token-accepting provider in the delta.
- ADR 021 and the new AGENTS invariant explicitly say JWT/JWKS is unimplemented
  and production deployment is forbidden
  (`docs/decisions/021-identidade-verificada-e-proibicao-de-producao-sem-jwt-jwks.md:5-27`;
  `AGENTS.md:68`).
- The reviewed delta does not modify the HMAC/AEAD implementation, KMS key
  separation, erasure migration, or RLS policies. No raw CPF, new source, or
  production JWT/JWKS behavior was introduced.
- Fresh verification:
  - focused Vitest command: **25/25 tests passed** across five files;
  - `pnpm lint`: exit 0;
  - `pnpm typecheck`: exit 0;
  - `git diff --check 80387fb`: exit 0.

## Critical issues

### C1 — `VerifiedPrincipal` can be minted outside middleware through its exposed runtime constructor

**Files:** `packages/adapters/src/identity-middleware.ts:23-27`,
`packages/adapters/src/identity-middleware.ts:29-39`,
`packages/adapters/src/identity-middleware.ts:60-76`

The class name is not exported and it has `#` fields, but any holder of one
legitimate principal can obtain the concrete class through
`principal.constructor`. Its public constructor accepts the principal input
directly and does not require an unforgeable module-private issuance token or
membership in an issuance registry. `assertVerifiedPrincipal` checks only
`instanceof` plus accessibility of the private fields, both of which a reflected
construction satisfies.

Independent reproduction:

```text
Constructor = legitimatePrincipal.constructor
forged = Reflect.construct(Constructor, [{
  issuer: "attacker",
  subject: "attacker",
  origin: "SYSTEM_WORKER"
}])
assertVerifiedPrincipal(forged)
=> accepted
```

Observed output:

```json
{"accepted":true,"issuer":"attacker","origin":"SYSTEM_WORKER"}
```

This bypasses the private factory and can manufacture an auditable-looking
SYSTEM principal outside middleware. The public `VerifiedPrincipal` interface
is also structurally assignable, so the compile-time negative proof required by
the plan at `.agents/plans/2026-07-30-task-3-fix-round-1.md:28` is absent.
The principal needs an issuance mechanism that cannot be reproduced from an
instance (for example, module-private runtime authority/registry), and an
adversarial regression test must exercise the reflected-constructor path.

### C2 — Structural identities still authorize through raw `TenantContext`

**Files:** `packages/application/src/authorize-actor.ts:10-40`,
`packages/application/src/authorize-actor.ts:174-212`,
`packages/application/src/authorize-actor.ts:214-238`,
`packages/domain/src/authorization.ts:75-90`

`AuthenticatedOperationIdentity` and `OperationPrincipal` are public structural
interfaces. `authorizeActor`/`authorizeOperation` never assert that the identity
was emitted by `mapVerifiedKeycloakActor`. At the same time,
`createTenantContext` now registers any schema-valid actor in its `WeakSet`, and
the entire `WalletAuthorizationRepository` port accepts that raw context before
any opaque operation capability exists.

This is not limited to an invalid operation that the concrete observation
repository later rejects. `authorizeWalletCpfLookup` consumes the operation
internally and invokes the CPF indexer and wallet repository without ever
checking `assertAuthenticatedIdentity` or a concrete verified principal.

Independent reproduction with a fully structural HUMAN identity produced:

```json
{"allowed":true,"indexedTenant":"tenant-a"}
```

Thus a caller-selected tenant/role can reach the CPF membership authorization
path. It also directly contradicts the global constraint that tenant-scoped
repository access must never accept a raw `TenantContext`. Identity provenance
must be established before authorization repository access, and the
authorization bootstrap needs an opaque, runtime-verifiable authority rather
than a structural identity/context.

### C3 — Repository capabilities do not enforce action or wallet

**Files:** `packages/adapters/src/repositories/tenant-repository.ts:19-22`,
`packages/adapters/src/repositories/tenant-repository.ts:37-66`,
`packages/adapters/src/repositories/tenant-repository.ts:69-121`

`assertOperation` proves that an operation and principal belong together, but it
never examines `operation.action` or `operation.walletId`. Consequently every
valid operation authorizes both `find` and `save` for every tenant record. The
record contract contains only `tenantId`, so the capability's wallet cannot be
bound to the record either.

Two independent reproductions succeeded:

```json
{"issuedAction":"READ_DOSSIER","writeSucceeded":true}
```

and:

```json
{"readerWallet":"wallet-a","writerWallet":"wallet-b","crossWalletRead":true}
```

The second result used two valid capabilities in the same tenant: SYSTEM
`RUN_SOURCE` wrote through wallet B, and AGENT `READ_DOSSIER` for wallet A read
the record directly. `readAuthorizedObservation` performs a debtor-membership
check after the repository read, but the public repository already returned the
data to its direct caller. This violates action authorization, wallet
authorization, and the requirement for an explicit SYSTEM ingestion
capability. Repository methods must require/enforce operation-specific actions
and bind wallet/debtor scope before returning or mutating protected data.

## Important issues

### I1 — Human, agent, and worker do not have distinct issuance paths

**File:** `packages/adapters/src/identity-middleware.ts:3-13`,
`packages/adapters/src/identity-middleware.ts:88-100`

The three origin labels are distinct, but issuance is a single generic
`authenticate(unknown)` method whose caller supplies `origin`. The only runtime
validation is that the value is one of the three enum members. There are no
separate validated human-Keycloak, machine-credential, and system-worker adapter
inputs/paths that determine the origin themselves. A development caller can
choose `SYSTEM_WORKER` just as easily as `HUMAN_KEYCLOAK`.

The development-only constructor limits the immediate environment, so this is
Important rather than a separate production Critical, but requirement 3 and
plan lines 18/30 are not satisfied.

### I2 — Architecture and identity documentation contradict ADR 021

**Files:** `AGENTS.md:158-160`,
`docs/decisions/020-isolamento-tenant-por-repositorio-e-rls.md:11-15`,
`docs/decisions/007-keycloak-como-provedor-de-identidade.md:11-14`,
`docs/decisions/008-identidade-de-agente-e-autorizacao-por-carteira.md:11-20`,
`docs/decisions/021-identidade-verificada-e-proibicao-de-producao-sem-jwt-jwks.md:20-24`

ADR 020 and AGENTS still define raw `TenantContext` as the repository contract,
while ADR 021 and the current fix plan require verified principal plus
capability and explicitly reject raw context. ADRs 007 and 008 also state in the
present tense that the application validates OIDC/resource-server tokens,
signature, issuer, audience, and expiration, although ADR 021 correctly says
that verifier is not implemented and production is prohibited.

The new ADR 021 and AGENTS line 68 are accurate in isolation, but the overall
documentation is internally inconsistent and can direct later work back toward
the unsafe boundary or imply production authentication exists.

### I3 — Required fix-round implementation report is missing; the available report is obsolete

**Files:** `.agents/plans/2026-07-30-task-3-fix-round-1.md:51-58`,
`.superpowers/sdd/2026-07-29-motor-dossie-triagem/task-3-report.md:3-15`,
`.superpowers/sdd/2026-07-29-motor-dossie-triagem/task-3-report.md:70-98`

The handoff task requires an updated report with RED/GREEN and verification
evidence, but the specifically requested
`task-3-fix-round-1-implementation-report.md` is absent. The older report says a
raw actor fails `createTenantContext`, which is no longer true, and records
obsolete query order (`ROLE_CHECK → SET_LOCAL`) while current code correctly
does the reverse. This prevents the round from being auditable and violates the
repository's definition of a ready slice.

## Minor issues

None.

## Four explicitly requested checks

| Check | Demonstrably satisfied? | Evidence |
| --- | --- | --- |
| Public/exported `issueAuthenticatedActor` removed | **Yes** | No implementation/export remains in domain; runtime barrel test passes at `packages/adapters/src/keycloak.test.ts:45-48`. The stale ESLint restriction is not an export. |
| Caller-controlled `mapVerifiedKeycloakActor` profile removed | **Yes, for the direct API shape** | Signature is principal + resolver only at `packages/adapters/src/keycloak.ts:95-98`; a third profile argument is ignored and wallet grants are always empty. This does not cure C1/C2. |
| Raw `TenantContext` rejected by repositories | **No, not across the boundary** | The concrete observation repository rejects it, but `WalletAuthorizationRepository` still requires raw contexts and `createTenantContext` accepts structural actors (C2). |
| Non-development provider initialization throws | **Yes** | Fresh focused test passed; constructor check is at `packages/adapters/src/identity-middleware.ts:89-95`. Missing opt-in also throws in development. |

## Verification notes

Executed read-only/non-Docker checks:

```text
pnpm exec vitest run \
  packages/adapters/src/keycloak.test.ts \
  packages/application/src/authorize-actor.test.ts \
  packages/adapters/src/repositories/tenant-repository.test.ts \
  packages/adapters/src/repositories/prisma-observation-repository.test.ts \
  packages/domain/src/authorization.test.ts
=> 5 files passed, 25 tests passed

pnpm lint
=> exit 0

pnpm typecheck
=> exit 0

git diff --check 80387fb
=> exit 0
```

Docker/PostgreSQL integration was intentionally not launched. The known absent
Docker daemon was not treated as a code failure. The three adversarial
reproductions above were executed through `tsx -e` without writing repository
files or using network access.
