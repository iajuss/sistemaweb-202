# SDD ledger — plan: .agents/plans/2026-07-29-motor-dossie-triagem.md

Execution started from branch `codex/dossie-triagem` at commit `f9575b8`.

Task 2: WIP — implementation commits 587d70f and 9eb1063. First review requested changes: monetary contract accepted numbers; classification lacked required cobertura and confianca_global; compatibility checking was permissive. The corrective commit 9eb1063 states those three points are addressed, but the correction has not been re-reviewed; therefore the Task 2 review remains incomplete. Docker Compose runtime verification is still pending because Docker is unavailable in this environment.

Task 1: fix round 1/5 (1 addressed, 0 open — Compose dependency install race; commits d744a67..c436178)
Task 1: complete (commits f9575b8..c436178, review clean)

Execution modes for remaining tasks (user-directed; preserve across session restarts):
Task 2: rounds 2-5 exposed the same root cause: acceptance criteria were absent from the brief and TypeScript types were treated as trust boundaries without executable runtime enforcement. The monetary invariant is now enforced by factories, Zod parsing, lint and red/green tests; Task 3 brief explicitly requires a runtime tenant-isolation leak test.
Task 2: complete (commits 587d70f..0e7ef2d, review clean; final review base 1db4f7e, informational plan observation recorded).
Task 3: WIP checkpoint — commits `a10a42d` and `7daff83` implement the runtime tenant guard, AEAD/HMAC boundaries, wallet authorization wrapper, PostgreSQL RLS policies, owner-only migration role, restricted application role, catalog coverage and direct SQL tenant-A→B denial. Docker Compose/RLS integration executed successfully; it is not an environmental pending item.
Task 3: WIP checkpoint (uncommitted changes to be committed now) — `SET LOCAL app.tenant_id` was corrected to precede every transaction query (including role inspection), with RED→GREEN coverage. In-memory crypto now distinguishes an explicitly destroyed debtor key from an invalid key reference; persistent tombstone/audit schema remains unfinished.
Task 3: security design agreed and recorded in `.agents/plans/2026-07-30-task-3-fix-round-1.md`; RED evidence of caller-forged Keycloak actor is in `task-3-report.md`. The five authorized conditions remain incomplete: (1) non-exported, ECMAScript-private `VerifiedPrincipal` factory in middleware; (2) repositories requiring the opaque principal plus authorization capability, never raw tenant ID; (3) distinct human/agent/system issuance paths with auditable origin; (4) fail-closed `DevInsecureIdentityProvider` guarded by development and explicit opt-in; (5) ADR 021, AGENTS invariant and final documentation of the JWT/JWKS prohibition.
Task 3: open security pending — JWT/JWKS token verification and the real realm contract are not implemented. Production deployment is prohibited until that boundary is completed. By explicit user decision, this pending item may remain recorded when Task 3 is later closed; no Task 4 may start in this session.
- Task 2: fix round 2/5 (2 addressed, 1 open — coverage now forces `DADOS_INSUFICIENTES`; invalid candidate is rejected after major change; `Money.fromCents` lacks a runtime bigint guard; commits 9eb1063..65b62cb).
- Task 3: subagents — one implementer followed by an independent reviewer; retain TDD and verification.
- Task 4: inline — no separate reviewer; retain TDD and verification.
- Task 5: subagents — one implementer followed by an independent reviewer; retain TDD and verification.
- Task 6: subagents — one implementer followed by an independent reviewer; retain TDD and verification.
- Task 7: subagents — one implementer followed by an independent reviewer; retain TDD and verification.
- Task 8: inline — no separate reviewer; retain TDD and verification.
- Task 9: inline — no separate reviewer; retain TDD and verification.
- Task 10: subagents — one implementer followed by an independent reviewer; retain TDD and verification.
- Task 11: inline — no separate reviewer; retain TDD and verification.
- Task 12: inline — no separate reviewer; retain TDD and verification.

Task 3: checkpoint — `a7a9d2d` commits the VerifiedPrincipal, opaque operation-capability, tenant+debtor observation-access, development-provider, and JWT/JWKS-prohibition changes. Observations remain immutable tenant+debtor facts; wallet is authorization topology only and no wallet backfill was written.

Task 3: checkpoint evidence — Docker Compose migration failed with Prisma `P3015`: the removed `20260730221000_observation_wallet_scope` migration left an empty directory without `migration.sql`. Correction pending: delete that empty directory, then recreate the development Compose stack (the development DB reset is authorized) and rerun Compose.

Task 3: pending — run the full suite with PostgreSQL/RLS active after Compose migration succeeds.
Task 3: pending — run a scoped independent re-review of the authentication critical-bypass correction range, confirming the bypasses remain closed and no new path was opened.

Task 3: P3015 resolved — the empty `20260730221000_observation_wallet_scope` directory was deleted and the development Compose stack was recreated from an empty volume. `prisma migrate deploy` applied `20260730104500_tenant_identity_keys` cleanly; `prisma migrate status` reports the schema up to date. Verified against the live database: `Observation` has no `walletId` (only `tenantId` + `debtorId`), RLS is forced with policy `Observation_scope` on `app.tenant_id`, and `dossie_app` has `rolsuper = f` and `rolbypassrls = f`. No file in the tree references the removed migration.

Task 3: schema drift closed — `migrate diff --from-url <db> --to-schema-datamodel` initially proposed renaming five foreign keys, because the hand-written `migration.sql` used short constraint names (`Title_wallet_fkey`) while `schema.prisma` carried no `map:` and would generate the long composite-column form. Five `map:` entries were added to `schema.prisma` to declare the names already applied in the database; the applied migration was not edited. The diff is now empty (`--exit-code` returns 0). This change is uncommitted pending authorization.

Task 3: full suite executed with PostgreSQL and RLS active — 80 tests, 0 failures, 0 skipped (domain 30, adapters 37, contracts 9, application 4; web/worker have no test files). `postgres-rls.integration.test.ts` ran against the real container via `docker compose exec` (2243 ms), not a mock. `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm generate:contracts` exit 0 with no regenerated-artifact drift.

Task 3: environment defect found while running the suite — the Compose `workspace-dependencies` service bind-mounts the repository while the named volume covers only the root `node_modules`, so the Linux container rewrites `packages/*/node_modules` on the host with reparse points Windows cannot resolve. `pnpm install --frozen-lockfile` reports "Already up to date" and does not repair them, with or without `--force`. Repair: delete the per-package `node_modules` and reinstall on the host. Recurs on every host run of that service; a permanent fix is not yet designed.

Task 3: scoped independent re-review executed over `e77a5d3..a7a9d2d`; full findings in `task-3-auth-bypass-rereview.md`. **The bypasses are NOT all closed and the correction opened two new paths, so Task 3 cannot be closed on this evidence.** Two Critical, both with executable PoCs and both independently confirmed by direct source reading: (C-1) `DevInsecureIdentityProvider` gates `NODE_ENV`/opt-in only in its constructor, so the detached prototype methods mint `WeakSet`-registered verified principals under `NODE_ENV=production` — chained to a write capability on an arbitrary tenant, which also means ADR 021's production prohibition has no code enforcement; (C-2) `PrismaAuthorizedObservationRepository` is exported with a public constructor, walking around the factory's `PRISMA_CLIENT_OVERRIDE_FORBIDDEN`. Both new paths were introduced by the correction range itself. Four of six bypasses (C1, structural forgery, transaction ordering/context identity, observation access boundary) are genuinely closed with real runtime guards and mutation-style tests.

Task 3: severity correction — the reviewer's Important I-1 (production observation read returning a foreign-tenant record) was reclassified to Critical C-3 by user decision. It was filed as Important on the reasoning that RLS still stands behind the missing application check, which inverts ADR 020: RLS is the second barrier and explicitly not a substitute for domain authorization, so "RLS still catches it" is the forbidden condition rather than a mitigating one. The PoC also returned an actual foreign-tenant record to a caller holding a capability for another tenant, which is a leak between clients, not a defense-in-depth regression.

Task 3: two open items need a decision and must not be silently fixed — (I-2) whether HUMAN wallet authorization is intentionally tenant-wide, since `authorization.ts:60-66` ignores `walletId` while AGENTS.md says "capability opaca de carteira + ação" and ADR 008 is ambiguous; (I-5) how `ActorIdentity` resolves identity to tenant, given the unique key is `(tenantId, provider, subject)` while lookup carries only `{provider, subject}`, and the table's forced RLS keys on a tenant not yet known at resolution time.
