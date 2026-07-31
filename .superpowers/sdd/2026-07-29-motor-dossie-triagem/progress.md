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
