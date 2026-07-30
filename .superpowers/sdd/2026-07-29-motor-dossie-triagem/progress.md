# SDD ledger — plan: .agents/plans/2026-07-29-motor-dossie-triagem.md

Execution started from branch `codex/dossie-triagem` at commit `f9575b8`.

Task 2: WIP — implementation commits 587d70f and 9eb1063. First review requested changes: monetary contract accepted numbers; classification lacked required cobertura and confianca_global; compatibility checking was permissive. The corrective commit 9eb1063 states those three points are addressed, but the correction has not been re-reviewed; therefore the Task 2 review remains incomplete. Docker Compose runtime verification is still pending because Docker is unavailable in this environment.

Task 1: fix round 1/5 (1 addressed, 0 open — Compose dependency install race; commits d744a67..c436178)
Task 1: complete (commits f9575b8..c436178, review clean)

Execution modes for remaining tasks (user-directed; preserve across session restarts):
Task 2: rounds 2-5 exposed the same root cause: acceptance criteria were absent from the brief and TypeScript types were treated as trust boundaries without executable runtime enforcement. The monetary invariant is now enforced by factories, Zod parsing, lint and red/green tests; Task 3 brief explicitly requires a runtime tenant-isolation leak test.
Task 2: complete (commits 587d70f..0e7ef2d, review clean; final review base 1db4f7e, informational plan observation recorded).
Task 3: WIP checkpoint — repository guard with required TenantContext is complete; RED evidence of A-to-B read/write leakage is preserved in `task-3-report.md`. Remaining: complete and verify AEAD boundary with tenant/debtor associated data, separate-secret HMAC boundary and rotation/reindexing handling, and RLS wrapper/policy. Docker/PostgreSQL absence leaves real RLS validation pending verification, never a reduced policy.
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
