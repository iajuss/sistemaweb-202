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

Task 3: corrections `000a626` and `9249fb2` close C-1, C-2 and C-3, each with the failing test written and observed first. `000a626` added the per-call `assertDevelopmentIssuer`, the repository construction authority and the read-path tenant equality check. The independent re-review of `3990207..000a626` then found C-2 only half closed — the authority guard was constructor-only, and `Object.create(prototype)` plus two property assignments reproduced the original bypass on both read and write, on a repository whose instances were also unfrozen — so `9249fb2` applied the C-1 pattern: a `factoryIssuedRepositories` WeakSet checked per call plus `Object.freeze`. The re-review verified C-1 against eight structural attacks (detached method, `Object.create`, `Reflect.apply`, subclassing, `Object.setPrototypeOf`, `Symbol.hasInstance` override, `Reflect.construct`, post-construction environment flip), all failing closed, and confirmed the WeakSet rather than `instanceof` is the load-bearing control. C-3 was verified across every database return shape including null, undefined, case and whitespace variants. ADR 021's production prohibition now has per-call code enforcement: outside development no `VerifiedPrincipal` can be issued at all.

Task 3: mutation evidence — the re-review found that deleting the per-call environment re-check left the entire suite green. `9249fb2` adds the missing test; with the check removed that test now fails alone (`expected [Function] to throw an error`) and the guard is restored. Suite after both corrections: 87 tests, 0 failures, 0 skipped (domain 30, adapters 44, contracts 9, application 4); lint, typecheck and contract generation all exit 0.

Task 3: the C-2 completion in `9249fb2` has not itself been independently re-reviewed. It applies the same pattern the re-review already validated for C-1 and carries RED, GREEN and mutation evidence, but a third scoped review is the outstanding verification step before Task 3 closes.

Task 3: environment note — a clean host `node_modules` reinstall drops the generated Prisma Client, after which `tsc` reports `implicitly has an 'any' type` on `$transaction` callbacks. `pnpm exec prisma generate` restores it. Unrelated to product code; recorded so the failure is not misread as a regression.

Task 3: two open items need a decision and must not be silently fixed — (I-2) whether HUMAN wallet authorization is intentionally tenant-wide, since `authorization.ts:60-66` ignores `walletId` while AGENTS.md says "capability opaca de carteira + ação" and ADR 008 is ambiguous; (I-5) how `ActorIdentity` resolves identity to tenant, given the unique key is `(tenantId, provider, subject)` while lookup carries only `{provider, subject}`, and the table's forced RLS keys on a tenant not yet known at resolution time.

Task 3: the third scoped review of `000a626..9249fb2` returned NOT CLOSED. The attack the second review named was genuinely dead, but the property C-2 was meant to establish was not: TypeScript `private` is erased at runtime, so `database` and `writer` remained enumerable own properties of the object the factory returns (`Object.keys` returned both). Three ways through, two needing no reflection: (C-4) `bundle.observations.writer.find(...)` returned an observation belonging to another wallet in the same tenant, because the generic transactional reader checks tenant and no wallet — same tenant on both sides, so RLS sees nothing wrong, which per ADR 020 is the forbidden justification rather than a mitigation; (C-5) `bundle.observations.database.findAuthorized(tenantId, walletId, id)` returned a record with no principal and no operation, with the tenant fed to `set_config` chosen by the caller; (C-6) `database` was a parameter property, so its assignment hit an accessor planted on the prototype, producing a factory-issued WeakSet-registered instance reading from an attacker database while passing every per-call guard. All three were confirmed by reading the source before acting.

Task 3: correction `d6e135d` closes C-4, C-5 and C-6 with RED observed for each. ECMAScript `#` fields replace erased `private` on all four repository classes; prototypes are frozen so `find`/`save` cannot be swapped wholesale; the factory's `databaseUrl` parameter is gone, since it walked around the entire authority apparatus with a string; and the wallet-blind reader now refuses a record carrying `debtorId` instead of answering with data it cannot authorize. The architectural test added for the repository classes also caught `records` exposed on both in-memory repositories, where reading it skipped every principal, operation and wallet check. Mutation matrix: removing the prototype freeze, the instance freeze, or reverting a `#` field each fails exactly one named test and no other. Suite after: 99 tests, 0 failures, 0 skipped; lint, typecheck and contract generation exit 0; PostgreSQL/RLS integration ran against the real container.

Task 3: two defects in the correction's own tests were caught by mutation and fixed before commit. The instance-freeze test passed for the wrong reason — with the prototype frozen, assignment already throws because the inherited property is non-writable, so it never exercised `Object.freeze(this)`; it now uses `Object.defineProperty`, the only path that reaches it. The prototype test corrupted shared state when it failed, taking five unrelated tests with it; it now restores the descriptor in a `finally`.

Task 3: CLOSED (commits `f10a588..d6e135d`). Closed on Critical findings only, by explicit user decision on 2026-07-31 taken for delivery-deadline reasons: the instruction to pull I-4 into the slice was revoked, and I-2, I-3, I-4, I-5 and the Minor list became a documented pendency list in `docs/limitacoes-v1.md` instead of implementation work. None of them is exercisable without an HTTP surface, which does not exist: `packages/adapters` exports only `identity-middleware` and `keycloak`, and the repositories module is not in the package `exports` map at all. The ADR 021 production prohibition remains in force and is recorded as P-1.

Execution mode change (user-directed 2026-07-31; preserve across session restarts): every task from Task 4 onward runs INLINE. No subagent, no separate reviewer, no re-review. The three-agent cycle earned its cost on the security slice and does not pay for importing CSV. TDD with observed RED and verification before declaring anything done continue to apply in full. Stop and ask only if something would require loosening an `AGENTS.md` invariant.

Task 3: full third-review evidence — attack table, mutation tables, findings and the agreed-but-unimplemented resolutions for I-2 and I-5 — is in `task-3-third-review.md`. It existed only in the review conversation until the 2026-07-31 checkpoint.

CHECKPOINT 2026-07-31 (commit `5de3c55`).

Slice in progress: **Task 4 — carteira, importação plugável e quarentena.** Execution mode: inline.

Done in Task 4: the domain layer. `packages/domain/src/wallet.ts` validates one raw spreadsheet row into either an accepted title or a quarantine record, with 10 tests each watched failing first. A quarantine record carries row number and reason and never the CPF, which has its own test, because the import report is read by humans and may be exported. One row yields exactly one reason: first failing field wins. CPF check digits are validated including the repeated-digit case; amounts stay in integer cents through `Money`; February 30th is rejected by comparing the parsed parts back, since `Date.UTC` rolls it into March. `normalizeSpreadsheetMoney` moved from `packages/adapters` into the domain with a re-export left behind, because rejecting a malformed amount is an invariant and the domain cannot import from the adapter layer to reach it.

Missing in Task 4: CSV parser (UTF-8 BOM vs CP1252 detection, `;` vs `,` delimiter), XLSX parser, `packages/application/src/import-wallet.ts` with a non-mutating `preview` and an idempotent `commit` keyed by `id_externo`, encrypted debtor CPF on commit, import audit, file-byte hashing without logging contents, and the fixtures `valid-cp1252-semicolon.csv`, `invalid-cpf.csv`, `titles.xlsx`. Deduplication must key on the external title id and not on CPF — two titles for the same person are two titles. XLSX will need a new dependency; the `node_modules` defect E-1 may recur on install.

Suite at checkpoint: 109 tests, 0 failures, 0 skipped (domain 40, adapters 56, contracts 9, application 4). Lint, typecheck and contract generation exit 0. PostgreSQL/RLS integration ran against the real container.

Open pendencies: `docs/limitacoes-v1.md` holds the full list — P-1 (ADR 021 JWT/JWKS, the only item blocking a real deploy), I-2, I-3, I-4, I-5, five Minors and two environment defects. None is exercisable without an HTTP surface, which arrives in Task 11.

Plan reordered to a thin vertical path (user-directed 2026-07-31): 4 → 8 → 5 → 6 → 7 → 11, then 9 → 10 → 12. The goal is the four features of the brief working narrowly end to end, not two of them complete. Scope reductions: Task 9 becomes documentation, with QSA/RFB and Portal da Transparência as mapped-and-not-integrated sources in `docs/fontes.md` plus an adapter stub, which the brief explicitly authorizes; Task 10 stays on the ADR 009 policy with a partial purge job; Task 12 becomes a minimal UI of two screens, wallet priorities and dossier. Cheap deliverables treated as mandatory: complete `docs/fontes.md`, `docs/lgpd.md` with legal basis per source, `README.md` with one-command reproducible setup, and the small set of hand-checkable test cases.

---

Task 4: CLOSED (commits `a41d74f..e62caa5`). Suite: 147 tests, 0 failures, 0
skipped. Lint, typecheck and contract generation exit 0, with no regenerated
artifact drift. PostgreSQL/RLS integration ran against the real container.

What landed beyond the domain layer already committed at the checkpoint:

- **CSV parser** (`packages/adapters/src/wallet-importers/csv.ts`). Encoding is
  decided rather than guessed: a BOM self-declares, and otherwise a strict UTF-8
  decode either succeeds or proves the file is CP1252, because CP1252 accented
  bytes are not valid UTF-8 sequences. The delimiter is counted on the header
  line alone — counting the whole file lets a decimal comma outvote the real
  delimiter on a semicolon file. Headers are matched folded (case, accent,
  padding). Row numbers are physical file lines, so a blank line in the middle
  does not shift what the operator sees in the report.
- **XLSX reader** without any new dependency — see ADR 022. SheetJS is off the
  public npm registry, exceljs is a dependency tree for a four-column read, and
  the E-1 `node_modules` defect had already cost two sessions. Covers the ZIP
  central directory (STORED and DEFLATE), shared strings including split runs,
  inline and formula cells, and date serials resolved through `styles.xml`
  (built-in date formats plus custom formats containing y/m/d). A numeric cell
  is reshaped into Brazilian decimal text, never parsed, so no wallet amount
  passes through binary floating point.
- **`packages/application/src/import-wallet.ts`**. `previewWalletImport` takes
  bytes and a parser and nothing else: non-mutation is structural, not a
  promise. `commitWalletImport` authorizes `IMPORT_WALLET`, derives the title id
  from tenant + wallet + `id_externo` so a re-import lands on the same rows
  without a read-before-write, resolves the debtor from the CPF HMAC index,
  encrypts the CPF through the existing AEAD service, and appends an import
  audit with actor, timestamp, file hash and per-reason quarantine counts.
- **`IMPORT_WALLET`** joins `AuthorizationActionSchema`, held by `ADMIN_TENANT`
  and by agent wallet grants. Three new repositories in
  `repositories/wallet-store.ts` inherit the layer's architectural invariants by
  being added to that `describe.each` list.
- **Fixtures** `valid-cp1252-semicolon.csv`, `invalid-cpf.csv` and `titles.xlsx`,
  with `scripts/make-wallet-fixtures.mjs` committed beside them: a fixture that
  claims to be synthetic should be provably synthetic, and neither the CP1252
  file nor the workbook can be reviewed by reading a diff. `.gitattributes`
  stops autocrlf from rewriting exactly the bytes under test.

Design decisions taken inline and recorded here:

1. **The wallet row now carries the debtor name.** Identity resolution starts
   from name + CPF, so a row without a name cannot produce a dossier; it is
   quarantined (`NOME_AUSENTE`) rather than accepted into a wallet it cannot
   serve. This is the input Task 5 consumes.
2. **`ID_EXTERNO_DUPLICADO`** quarantines the second row carrying an external id
   already seen in the same file. The rule needs the rest of the file to be
   visible, so it lives in the application service, not in `validateTitleRow`.
3. **An amount with more than two decimal places quarantines the row.** The
   parser emits the cell verbatim in Brazilian form and lets
   `normalizeSpreadsheetMoney` reject it. Truncating silently would change money;
   quarantine with a report is the `AGENTS.md` prescription.

Mutation evidence, each mutation failing exactly the tests that claim it:
keying titles on `debtorId` instead of `externalId` fails 3 tests; downgrading
the commit gate from `IMPORT_WALLET` to `READ_DOSSIER` fails 8; removing the
XLSX rels resolution fails 3; removing custom `numFmt` date detection fails 1.

Task 4: open pendency — **titles are persisted in memory, not in PostgreSQL.**
`wallet-store.ts` implements the ports with the same authority pattern as the
Prisma repositories (factory-issued, `#` fields, frozen prototypes), so the
swap is local, but no `Title`/`Debtor` row is written to the database yet. The
schema already has both tables. Deliberate: the vertical path needs Tasks 5–8
running end to end more than it needs durable storage, and the HTTP surface
that would expose this arrives in Task 11. Trigger to close: Task 11.

Task 4: unverified — no Excel-produced workbook has been read in test. The
fixture is synthetic and shaped like Excel's output (DEFLATE, shared strings
with a split run, inline string, styled date serial), and the ZIP container was
verified against an independent implementation (.NET `ZipFile`), but that is
evidence of format, not of field. Recorded in ADR 022; the first real client
file is the test that is missing.

Next: Task 8 — PGFN Dados Abertos, one source working end to end.

---

Task 8: IN PROGRESS — Dados Abertos landed (commits `992112b..fdabc13`). Suite:
186 tests, 0 failures, 0 skipped. Lint, typecheck and contract generation exit
0, no regenerated artifact drift.

Done in Task 8:

- `packages/domain/src/identity/mask.ts`. Verifies a published mask against a
  CPF the caller already holds; exports nothing that takes a mask alone, and a
  test asserts the export surface so the next function added has to justify
  itself. Positions 4-9 are derived in memory for the comparison and never
  persisted. Shared with Task 5.
- `packages/adapters/src/pgfn/manifest.ts`. The four states stay apart: an
  unread system is `NAO_CONSULTADO`, a failed part is `ERRO_NA_FONTE` even
  though its slice is nominally covered, and only complete coverage of every
  required system and UF may answer `NAO_ENCONTRADO` (ADR 014). A record that
  was read stays `ENCONTRADO` whatever the rest of the coverage did.
- `packages/adapters/src/pgfn/open-data.ts`. Latin-1/UTF-8 detection, `;`,
  decimal comma into integer cents, `TIPO_SITUACAO_INSCRICAO` and
  `SITUACAO_INSCRICAO` kept as two fields, blank lines skipped, a lost column
  failing loudly as `LAYOUT_PGFN_INVALIDO`, and an unreadable amount named in
  `rejected` rather than dropped.
- `packages/adapters/src/pgfn/open-data-worker.ts`. Mask compatibility is the
  only gate on persistence, so a non-client record never leaves the loop.
  Observations are raw facts with no link confidence, carrying the query scope
  and the publication reference as `coletado_em`.
- `fixtures/pgfn/open-data/` plus `scripts/make-pgfn-fixtures.mjs`, preserving
  the 4-9 mask, a homonym sharing the name but not the mask, a candidate
  sharing the mask but not the name, blank lines mid-part, Latin-1, decimal
  commas.

Mutation evidence: removing the non-client mask gate fails 5 tests; letting
partial coverage answer `NAO_ENCONTRADO` fails 5.

Missing in Task 8: `list-importer.ts` for the manual PGFN list
(`PGFN_LISTA_DEVEDORES_MANUAL`), with preamble/filter provenance per block, a
block without provenance marked or refused, and `Valor Total` kept
semantically distinct from `Valor da Dívida Selecionada` with no silent
fallback between them (ADR 014, ADR 015 — no scraping under any circumstance).
The manual list is also what conditions `pgfn_regularidade_indiciada_por_delta`
in Task 7.

Task 8: column names for Dados Abertos follow the published layout and are
**not** contract-verified; `docs/fontes.md` already records the source as "não
verificado". Nothing in the code invents a response shape — an unexpected
layout fails loudly instead of yielding empty fields.

Next: finish Task 8 with the manual list importer, then Task 5.

---

Task 8: CLOSED (commits `3172464..28abb9d`). Suite: 217 tests, 0 failures, 0
skipped. Lint, typecheck and contract generation exit 0, no drift.

**The XLSX gap is closed, and closing it changed a decision.**

Local verification against the real, gitignored export
(`lista-devedores-pgfn-2026-07-27.xlsx`, run locally, file not committed, no
cell content printed): the hand-written reader read an Excel-produced workbook
in full — 11 zip entries, 102 rows spanning row numbers 1 to 109, the filter
preamble, the header at row 13, 91 data rows, four blank rows (17, 67, 70, 75)
and seven row numbers Excel omits from the XML entirely (2, 3, 8, 9, 11, 12 and
**60**, that last one inside the data). `Valor Total` diverges from `Valor da
Dívida Selecionada` in **31 of 91** records, exactly as `AGENTS.md` records.

Two things that verification found, neither of which the synthetic fixture
could have shown:

1. **17 of 91 `Valor Total` cells carry non-zero excess precision**, up to
   fourteen decimal places. The strict wallet rule would have quarantined a
   fifth of the real source. ADR 023 splits the two cases: the wallet keeps the
   strict rule (padding zeros exact, non-zero precision quarantined), while a
   published value is rounded half up on the third decimal in `BigInt`
   arithmetic, keeps its published text verbatim, and declares the rounding via
   `roundedFromExcessPrecision`. `normalizeSourceMoney` contains no `Number`,
   `parseFloat` or `parseInt`, and a test asserts that.
2. **A one-row gap is formatting, not a block boundary** — Excel drops empty
   row 60 from the middle of the data. The first block-detection attempt split
   the file into three blocks of 45 rows. Threshold is now two empty rows,
   documented as an unverified heuristic (F-4).

`fixtures/pgfn/lista-manual.xlsx` is now **produced by Excel itself**: the real
export opened read-only, every mask and name replaced with a synthetic one,
saved through Excel via `scripts/make-pgfn-list-fixture.ps1`. The XML is
genuinely Excel's — theme, styles, docProps — and no real person is in the
repository. Preserved patterns: 4-9 mask format, two people sharing one mask,
the search term scattered through names in different positions and orders, the
filter preamble, blank rows, rows absent from the XML, the
`29163886,440000001` artefact, and an orphan block with no preamble.

Also landed: `list-importer.ts` with per-block provenance, `queryScope.complete
= false` so filtered absence can never read as "no debt", both amounts kept as
independent fields with no fallback, and a block without provenance marked
`SEM_PROCEDENCIA` rather than merged.

Two corrections to my own work, both caught by mutation rather than by reading:
a test claiming the importer survived non-breaking spaces in amounts passed
with the defense removed; the defense was unnecessary anyway, because
JavaScript `trim` removes every Zs code point and not only U+0020, so the
comment asserting the opposite was wrong. Behaviour is now pinned in the domain
instead.

`AGENTS.md` commit rule corrected (user-directed): commit each stable step
without asking; ask before anything destructive — history rewrite, database
reset, migration deletion, tracked-file removal. An invariant that execution
disobeys session after session is a false guarantee, the same class of defect
as the dead lint rule in M-1.

**Task 6.5 created and positioned** (user-directed): persistence of wallet and
observations in PostgreSQL, immediately after Task 6 and before Task 7, so
dossier and classification are born on real storage rather than on the
in-memory store Task 4 shipped. Full acceptance criteria are in the plan. This
replaces the "natural trigger at Task 11" framing, which was a pendency with no
position — the thing that keeps pendencies from ever being done.

New documented limits: F-3 (Dados Abertos column layout not contract-verified;
unexpected layout fails loudly) and F-4 (block separator heuristic).

Next: Task 5 — identity resolution, which already has `mask.ts` and the
homonym/shared-mask fixtures waiting for it.
