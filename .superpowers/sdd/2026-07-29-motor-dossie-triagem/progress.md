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

---

Task 5: CLOSED (commits `7d0c3a3..` + the resolver commits). Suite: 243 tests,
0 failures, 0 skipped. Lint, typecheck and contract generation exit 0.

**Abstention is the load-bearing behaviour**, per explicit user acceptance
criterion. When two mask-compatible records score within `ambiguityMargin` of
each other the answer is `AMBIGUO` with `selected: null` and `isFact: false`.
The mask cannot discriminate — 10^5 CPFs share a fragment — so if the name
cannot either, choosing the better guess manufactures a fact about a person and
is wrong half the time. Proven twice: against inline records and against the
Excel-produced fixture end to end, where the shared mask genuinely holds two
people named JOSE SANTOS.

Modules: `identity/normalize.ts` (accent/case folding, connectives dropped so
"JOSÉ DA SILVA" is two tokens), `identity/policy.ts` (weights, thresholds and
margin, declarative and versioned as `2026-07-A`), `identity/resolver.ts`.

Expected values were calculated by hand before implementation; the table lives
in `resolver.test.ts`. Weights: `todos_os_tokens_presentes` 0.25,
`primeiro_token_coincide` 0.25, `ultimo_token_coincide` 0.20,
`ordem_preservada` 0.05, `completude` 0.25 × ratio. Gate: completude < 0.60
rejects outright. Thresholds: CONFIRMADO ≥ 0.95, PROVAVEL ≥ 0.75, POSSIVEL ≥
0.55.

The completeness gate is what kills the documented trap: the source matches
tokens with no notion of position, so "Jose Santos" returns `MARIA JOSE ALVES
PEREIRA SOARES SANTOS` (2/6) and "Ana" returns `ROGERIO SANT ANA DA SILVA`
(1/4). Both refused before any tie-break is considered.

Design decision taken during GREEN: **a gate-refused record reports confidence
0, not its raw total.** The homonym's contributions sum to 0.5833, and a
consumer thresholding on confidence would read that as a middling match rather
than a refusal. The individual contributions stay in `rules`, so the
explanation still says what matched. Only `CONFIRMADO` sets `isFact`.

Mutation matrix: best-guess instead of abstention fails 2; removing the
completeness gate fails 3; letting `PROVAVEL` count as a fact fails 1.

Earlier in the same session, by user direction:

- **`1,2` accepted.** The two-decimal requirement belongs to
  `Money.fromDecimalString`, where reais and cents are genuinely ambiguous, and
  was being enforced a layer early in the spreadsheet normalizer, where a
  column documented in reais is not ambiguous. `"1234.5"` is still refused by
  the constructor; a test ties both layers so the asymmetry is not "fixed"
  later. ADR 023 updated.
- **F-4 failure mode pinned.** A mis-split may cost a block its provenance, but
  no block ever inherits the filters of the block above it. A missing
  provenance is a gap; an inherited one is a false claim about which query
  produced those rows. Making a split block carry the previous preamble fails 2
  tests.
- **`AGENTS.md` rebuilt** (commit `db45802`): commands filled in and every one
  of them run before being written down, working mode corrected to inline with
  the subagent history and its rationale recorded, sources corrected to PGFN
  only, the three orphan paragraphs promoted into Invariantes, ADR index moved
  to `docs/decisions/README.md`. 163 lines against the previous 178, carrying
  more content, still above the file's own ~150 budget.
- `test:unit` and `test:integration` scripts added, because the suite silently
  required Docker: 215 unit tests run without it, 2 integration tests need it.

Next: Task 6 — observations, coverage and dossier composition, which consumes
this resolver and must propagate `AMBIGUO` and `PROVAVEL` as non-facts all the
way into the snapshot.

---

CHECKPOINT 2026-07-31 (segundo desta sessão).

Slice in progress: **none open.** Tasks 4, 8 and 5 are closed; Task 6 is the
next to start and has not been begun.

Suite at checkpoint: 243 tests, 0 failures, 0 skipped. Lint, typecheck and
contract generation exit 0, no regenerated-artifact drift. PostgreSQL/RLS
integration ran against the real container.

Done since the previous checkpoint: Task 4 closed (CSV and XLSX parsers,
`import-wallet` with non-mutating preview and idempotent commit), Task 8 closed
(mask verification, coverage manifest, Dados Abertos ingestion, manual list
importer with per-block provenance), Task 5 closed (identity resolution with
abstention), ADR 022 and ADR 023 written, `AGENTS.md` rebuilt, Task 6.5 created
and positioned after Task 6.

Fixture hygiene fixed at this checkpoint, before the first push: the
Excel-produced `lista-manual.xlsx` still carried `lastModifiedBy` with the
user's real name and a sheet named after the real query that produced the
export. Both are residue of the real file and had no business in a fixture that
claims to be synthetic. `scripts/make-pgfn-list-fixture.ps1` now renames the
sheet and calls Excel's own Document Inspector removal
(`RemoveDocumentInformation(8)`) before saving. Verified absent afterwards, and
the workbook is still Excel-written.

Open pendencies, unchanged unless noted:

- P-1 — ADR 021 JWT/JWKS. Still the only item blocking a real deploy.
- I-2, I-3, I-4, I-5 and the five Minors — see `docs/limitacoes-v1.md`.
- F-3 — Dados Abertos column layout not contract-verified. Unexpected layout
  fails loudly rather than yielding empty fields.
- F-4 — block separator heuristic on a single sample. Failure mode pinned: a
  block never inherits the provenance of the block above it.
- E-1, E-2 — environment defects.
- **Task 6.5** — wallet and observations still persist in memory, not
  PostgreSQL. Positioned immediately after Task 6, with acceptance criteria in
  the plan.
- The wallet normalizer accepts `1,2` while `Money.fromDecimalString` still
  requires two decimals. Intentional and tested on both sides; recorded so it
  is not read later as an inconsistency to be "fixed".

Next action: **Task 6 — observations, coverage and dossier composition.** The
resolver's `AMBIGUO` and `PROVAVEL` must cross composition without becoming
fact anywhere, and insufficient coverage must produce `DADOS_INSUFICIENTES`
rather than a low score.

---

## Task 6: retomada após interrupção — estado auditado em 2026-07-31

A sessão anterior parou com `a98730f` ("chore: checkpoint WIP task 6"), commit
feito à mão, sem passar por aqui. **A auditoria contradiz a descrição de
"interrompido no meio do RED"**: nada está em RED de teste. O que o commit
trouxe — `packages/domain/src/dossier.ts` (533 linhas),
`packages/domain/src/observation.ts` (196) e `packages/domain/src/dossier.test.ts`
(705, 34 casos) — está inteiro **verde**. Suíte unitária completa: 275 testes, 0
falhas, 0 pulados. `pnpm lint` sai 0.

**O que estava realmente quebrado era o `pnpm typecheck`**, com dois erros, e é
por isso que o passo não fechou:

1. `dossier.ts:187` — `case "PRIMEIRO"` num `switch` sobre `FieldAggregation`,
   que é `"SOMA" | "UNIAO" | "EXISTE"`. Ramo morto de um tipo que encolheu
   durante o GREEN; `TS2678`. Removido.
2. `dossier.test.ts:512` — cast de `FieldValue` para `{ lista: string[] }` sem
   passar por `unknown`, recusado porque `readonly string[]` não é atribuível a
   `string[]`; `TS2352`. Passa por `unknown` agora. O teste é o do expurgo, e o
   cast existe justamente para violar o `readonly` e provar que o snapshot não
   se mexe.

Nenhuma das duas correções muda comportamento: a primeira apaga código
inalcançável por tipo, a segunda é sintaxe de cast em teste. Ambas confirmadas
pela suíte inteira verde depois.

### Cobertura dos critérios de aceite pelo que já está commitado

Auditei os seis critérios explicitados pelo usuário contra `dossier.test.ts`:

| Critério | Onde é imposto | Teste que falharia |
|---|---|---|
| Composição parte do plano declarado, nunca das observações | `composeSource` itera `planned.expectedSlices`; `indexObservations` recusa `OBSERVACAO_FORA_DO_PLANO` | "calls an unobserved slice NAO_CONSULTADO, never NAO_ENCONTRADO"; "keeps a partially covered source out of NAO_ENCONTRADO"; "answers NAO_ENCONTRADO only when every declared slice was read" |
| `AMBIGUO`/`PROVAVEL` atravessam sem virar fato | `vinculoConfirmado` derivado de `linkStatus`, nunca recebido; `factValue` só devolve sob vínculo confirmado | "carries a PROVAVEL link through without making it a fact"; "ignores a forged isFact on a link that is not CONFIRMADO"; "attributes nothing when the resolver abstained" |
| Cobertura insuficiente é categoria, não nota | `veredito` decidido por `fontesObrigatoriasInconclusivas.length`, e `proporcao` não entra na decisão | "returns DADOS_INSUFICIENTES rather than a lower number"; "stays insufficient even when most slices concluded" |
| Snapshot embute os valores | `copyValue` materializa; `Object.freeze` em todo nível | "keeps its values after the observation it came from is emptied"; "cannot be edited in place" |
| `resolver_version` gravado, correção por supersessão | `resolverVersionOf` + `recordSupersession` append-only | "records the resolver version that produced the links"; "corrects by supersession and never by editing" |
| Data do dossiê é a da composição | `composedAt` no snapshot, `coletadoEm` por envelope | "dates the dossier at composition and each field at collection"; "dates a multi-slice field at its stalest input" |

Duas decisões do commit anterior que merecem registro porque não estavam
escritas em lugar nenhum:

- **`existsValue` só responde `false` sob cobertura conclusiva e vínculo
  não-`AMBIGUO`.** "Ninguém com esse nome" é afirmação; sob abstenção do
  resolver ou slice não lida, o campo fica `null`. É o que impede a ausência de
  virar negativa.
- **`assertDossierFactDiscipline` não é chamada pela composição, de propósito**,
  e o comentário diz por quê: a composição deriva `vinculoConfirmado`, então não
  consegue produzir violação, e guarda que nenhum teste consegue derrubar é
  garantia falsa (defeito I-4). O lugar dela é a fronteira de leitura — que
  ainda não existe. **Pendência aberta:** quando o leitor de snapshot nascer
  (Task 6.5/11), a guarda precisa ser chamada lá e ganhar o teste de remoção.

### O que falta para fechar a Task 6

`packages/application/src/compose-dossier.ts` e seu teste, previstos no plano e
inexistentes: o serviço autorizado que carrega observações do tenant + devedor,
roda o resolver por fonte e chama `composeDossier`. É o próximo passo.

### Task 6: FECHADA — `compose-dossier` na camada de aplicação

Suíte: 292 testes, 0 falhas, 0 pulados (era 275). `lint`, `typecheck` e
`generate:contracts` saem 0, sem deriva de artefato regenerado.

`packages/application/src/compose-dossier.ts` é o serviço autorizado. **A ordem
dos passos é a propriedade de segurança**, e é isso que os testes prendem:
autorização antes de qualquer leitura, vínculo com a carteira antes de qualquer
observação, resolver por fonte sobre os subjects daquela fonte. Nada aqui decide
o que um match significa — isso fica no domínio, onde `vinculoConfirmado` é
derivado e não pode ser entregue de fora.

Três portas novas, todas com `VerifiedPrincipal` + `AuthorizedOperation`:
`WalletDebtorReader` (devedor como a carteira o tem, com CPF decifrado só em
memória para o matcher), `DebtorObservationReader` e `DossierSnapshotStore`.

**Decisões tomadas inline, não cobertas por ADR:**

1. **`WalletDebtorReader` é escopado por carteira, e devolver `null` é uma
   recusa, não um dossiê vazio.** A observação é fato tenant + devedor sem
   `walletId` (ADR 020); o que a carteira autoriza é o *vínculo atual* com o
   devedor, e é aqui que ele é conferido. Capability sobre a carteira não é
   capability sobre todo mundo do tenant. Erro `DEVEDOR_FORA_DA_CARTEIRA`, sem
   CPF e sem id do devedor na mensagem — recusa não pode virar oráculo de quem
   existe em qual carteira, e há teste que falha se o CPF aparecer.
2. **Observação fora do plano é filtrada, não é erro.** Um devedor acumula
   observações de vários planos: uma slice `SIDA|RJ` lida mês passado é fato
   armazenado legítimo, e não pode explodir um dossiê que declarou SP. O
   domínio continua recusando observação fora do plano — a mudança é que ele
   nunca recebe uma. Foi encontrada porque o filtro original era
   **infalsificável**: com ou sem ele o domínio lançava, então nenhum teste
   conseguia derrubá-lo. Guarda que nenhum teste derruba é garantia falsa
   (defeito I-4), então virou comportamento observável e ganhou teste.
3. **O resolver não roda sobre fonte não consultada.** Rodá-lo sobre lista
   vazia carimbaria `resolver_version` num dossiê onde nada foi lido.
4. **Subjects são deduplicados por id antes do resolver.** A mesma pessoa
   publicada aparece em SIDA e FGTS; resolvê-la como dois candidatos fabricaria
   um empate entre alguém e si mesmo e recusaria um match que não está em
   dúvida.

**Matriz de mutação** — cada mutação derruba exatamente os testes que a
reivindicam, e nenhum outro:

| Mutação | Testes que falham |
|---|---|
| `READ_DOSSIER` rebaixado para `READ_ACTIONABLE` | 14 |
| Vínculo com a carteira substituído por devedor vazio | 2 (`refuses a debtor the wallet does not contain`, `never names the CPF in the refusal`) |
| Resolver rodando sobre fonte não consultada | 1 (`leaves the resolver version null when no source was consulted`) |
| Dedupe de subjects removido | 1 (`does not turn one person appearing in two slices into an ambiguity`) |
| Filtro de plano removido | 1 (`ignores an observation for a slice outside this dossier's plan`) |

**Pendência que atravessa para a Task 6.5:** `assertDossierFactDiscipline`
continua sem chamador. O lugar dela é a leitura de snapshot vinda de fora —
banco ou upcast de schema — que nasce na 6.5. Lá ela precisa ser chamada **e**
ganhar o teste que falha quando a chamada é removida.

Próximo: Task 6.5 — persistência de carteira e observações em PostgreSQL.

---

## Task 6.5: FECHADA — persistência em PostgreSQL

Suíte: 300 unitários e 10 de integração, 0 falhas, 0 pulados. `lint`,
`typecheck` e `generate:contracts` saem 0, sem deriva. A integração roda contra
o container real, não contra mock.

`packages/adapters/src/repositories/prisma-wallet-repository.ts` traz quatro
classes com a mesma autoridade das existentes — emissão por fábrica conferida
**a cada chamada**, campos `#`, protótipo congelado, instância congelada — e as
quatro entraram na lista `describe.each` dos invariantes arquiteturais de
`tenant-repository.test.ts`, que subiu de 20 para 28 testes.

O que mudou de verdade é **onde a garantia mora**:

- **Idempotência é índice único**, não chave de `Map`. `(tenantId, walletId,
  externalId)` no banco; um repositório que esquecesse a derivação da chave
  ainda assim não cria duplicata, e há teste que prova isso com `INSERT` direto.
- **Isolamento é política RLS** mais a checagem de aplicação. Os dois tenants
  importam o mesmo arquivo, existem seis títulos, e a leitura devolve três: é
  filtro, não banco vazio. RLS continua sendo a segunda barreira e nunca a
  única (ADR 020).
- **Append-only é privilégio revogado.** `dossie_app` tem `INSERT, SELECT` em
  `WalletImport` e mais nada; o teste lê `information_schema.table_privileges` e
  falha se `UPDATE` ou `DELETE` reaparecerem. Uma importação que aconteceu não
  pode deixar de ter acontecido, nem ser reescrita.
- **CPF cifrado em repouso com índice HMAC.** A consulta carrega o HMAC; o CPF
  não chega a parâmetro de statement, log nem mensagem de erro. Teste faz
  `"Debtor"::text LIKE '%CPF%'` e exige zero.
- **Observação continua fato tenant + devedor sem `walletId`.** Lida a partir de
  uma segunda carteira que contém o mesmo devedor, sem recoleta e sem cópia; um
  teste confere no `information_schema` que a coluna `walletId` não existe.

### Mudanças de schema

`Title.name` (a resolução de identidade parte de nome + CPF), `Observation.sliceId`
e `Observation.referenceDate` — slice é coluna e não campo de payload porque é
ela que decide `NAO_CONSULTADO` contra `NAO_ENCONTRADO` —, e a tabela
`WalletImport`. Migração única, `20260731140000_wallet_persistence_and_import_audit`.

**Reset do banco de desenvolvimento, autorizado explicitamente pelo usuário em
2026-07-31.** A migração já aplicada estava sem a FK de `tenantId` em
`WalletImport` e `migrate diff` acusava drift. Corrigida no lugar, volume
derrubado, reaplicada do zero: banco novo, migrado desde a primeira migração,
`migrate diff --exit-code` devolve **`No difference detected.`** e sai 0.

### Decisões tomadas inline

1. **A fábrica não aceita datasource.** Só o serviço de cripto entra; a string
   de conexão vem de configuração. Um datasource passado pelo chamador anda em
   volta de todo o aparato de autoridade com uma string — os repositórios
   voltariam emitidos-pela-fábrica e plenamente funcionais, apontando para um
   banco onde nenhuma política de tenant existe. É a correção C-6 da fatia 3, e
   o primeiro rascunho do teste desta fatia a violou; corrigi o teste, não o
   invariante.
2. **Porta 5433 exposta só em loopback** no Compose. A suíte de integração roda
   no host e precisa de conexão real; a alternativa era mandar toda asserção por
   `psql`, o que testaria SQL em vez do repositório que produção vai usar.

### Dois defeitos de teste corrigidos, ambos anteriores ou introduzidos aqui

- **`import-wallet.test.ts` era instável.** Afirmava que a auditoria não contém
  `"529"` — três dígitos do CPF — varrendo o JSON inteiro, que inclui um UUID
  aleatório e um SHA-256. O UUID sorteou `529` e o teste quebrou sem defeito
  nenhum no produto. Agora `importId` e `fileHash` ficam fora da varredura,
  porque nenhum dos dois pode carregar CPF por construção, e o CPF completo é
  exigido ausente do payload inteiro.
- **As duas suítes de integração disputavam o mesmo banco.** A minha dava
  `TRUNCATE` global enquanto a de RLS semeava as próprias linhas. Agora cada
  arquivo tem tenants próprios, a limpeza é escopada, e todo id que escrevo é
  prefixado — chave primária é global enquanto a limpeza é por tenant, e um
  `obs-1` sem prefixo colide com linha que este arquivo não pode apagar.
  Verificado passando sequencial **e** em paralelo.

### Pendências

- **`assertDossierFactDiscipline` continua sem chamador.** Nenhum leitor de
  snapshot nasceu nesta fatia: o dossiê ainda não é persistido, só composto em
  memória. Passa para a Task 11 junto com o teste de remoção.
- **O cofre de chaves em memória não sobrevive ao processo.** O `Debtor` fica
  cifrado no banco, mas a chave AEAD mora em memória (`createInMemoryCpfCrypto`),
  então um processo novo não decifra o CPF de uma importação anterior. Para
  produção é o cofre KMS do ADR 006. Registrado como F-5 em `docs/limitacoes-v1.md`.
- **E-1 reincidiu**, como previsto: `pnpm migrate` depende de
  `workspace-dependencies`, que reescreveu `packages/*/node_modules` e derrubou
  17 arquivos de teste. Reparo confirmado e agora documentado com precisão.

Próximo: Task 7 — política de triagem, ordenação e desfechos.

---

## Task 7: FECHADA — política de triagem, ordenação e desfechos

Suíte: 361 unitários (era 300), 0 falhas. `lint`, `typecheck` e
`generate:contracts` saem 0, sem deriva.

Política `2026-07-A`, declarativa e versionada. **Os valores esperados foram
calculados à mão antes de existir avaliador**, e a tabela está no topo de
`evaluate.test.ts`:

| sinal | peso | sentido |
|---|---|---|
| `divida_ativa_confirmada` | 0.40 | AGRAVANTE |
| `presenca_na_lista_de_devedores` | 0.25 | AGRAVANTE |
| `valor_elevado_em_aberto` | 0.20 | AGRAVANTE |
| `multiplos_titulos_em_aberto` | 0.15 | AGRAVANTE |
| `pgfn_regularidade_indiciada_por_delta` | −0.30 | MITIGADOR |
| `vinculo_societario_qsa_contextual` | 0.00 | CONTEXTUAL |

Faixas: `COBRANCA_INTENSIVA` ≥ 0.70, `COBRANCA_PADRAO` ≥ 0.30, abaixo disso
`MONITORAMENTO`. Cobertura insuficiente curto-circuita para
`DADOS_INSUFICIENTES` qualquer que seja a pontuação — **categoria, nunca nota
mais baixa**. Casos de mão: casa cheia 1.00, só carteira 0.35, um sinal 0.15,
com delta 0.45 (0.75 sem ele).

### O delta PGFN, que era o ponto

`regularidadeIndiciadaPorDelta` exige, cumulativamente: Dados Abertos em
`ENCONTRADO` **com vínculo `CONFIRMADO`**, Lista em `NAO_ENCONTRADO` —
exatamente esse estado, não "qualquer coisa menos encontrado" — e escopo de
consulta declarado íntegro. Nove casos negativos cobertos: lista filtrada, não
consultada, com erro, com o devedor presente; Dados Abertos não consultados,
com erro, sem achado, com vínculo `AMBIGUO` e com vínculo `PROVAVEL`. Quando
aplica, a categoria fica **limitada** a `COBRANCA_PADRAO` e a estratégia vira
`RENEGOCIACAO_COLABORATIVA`: o ADR 014 manda tom colaborativo, nunca escalada.

**O sinal é inalcançável hoje**, e há teste dizendo isso. O importador da lista
manual fixa `queryScope.complete = false`, porque todo export manual é recorte
sob filtros do operador. Enquanto não existir um caminho para o operador
declarar export integral, o delta não dispara. Preferi deixar a regra correta e
o caminho morto documentado a afrouxar a pré-condição.

### Decisões tomadas inline

1. **Identidade confirmada é por fonte que devolveu registro.** A primeira
   versão exigia vínculo confirmado em toda fonte de resolução, e um teste
   derrubou: fonte que concluiu `NAO_ENCONTRADO` não devolveu ninguém, logo não
   há identidade a resolver, e o vínculo não resolvido dela não é dúvida. Já
   fonte que **devolveu registros** sob vínculo `AMBIGUO` ou `PROVAVEL` é
   dúvida e bloqueia a escalada mesmo com outra fonte certa — escalaríamos
   contra alguém que não sabemos ser o titular daqueles registros.
2. **`confianca_global` não é probabilidade de pagamento.** É a fração do plano
   efetivamente lida, multiplicada pelo elo mais fraco em que a classificação
   se apoiou. Quando nenhum sinal se apoiou em vínculo, o fator é 1.
3. **O mapeamento para o contrato mora em `packages/contracts`**, que já
   dependia do domínio. `contribuicao` e `sentido` **não vão para o fio**: o
   shape publicado do sinal é estrito e fixado pelo schema, e a contribuição de
   cada sinal aplicado está por extenso em `explicacao`, que é o campo de que o
   direito de revisão trata. Colocá-los no contrato é mudança de schema com
   bump de versão, e isso pertence à fatia que desenha o contrato do agente.
4. **`classified_at` é parâmetro do mapeador.** A avaliação é pura; relógio
   dentro dela quebraria silenciosamente a reexecução de dossiê antigo sob
   política nova, que é o que o ADR 016 existe para preservar.

### Validação sem rótulo (ADR 016), as três pernas

- **Casos calculados à mão** antes da implementação — 27 testes.
- **Sensibilidade de ±20% por peso, um de cada vez** — 15 testes. Um por vez é
  o ponto: mexer em todos juntos não é análise de sensibilidade, é outra
  política. Nenhuma fixture troca de categoria. Também provado que a
  perturbação de fato move a pontuação (0.35 para 0.31), que peso nenhum
  resgata cobertura insuficiente, e que multiplicar o peso do QSA por 1000
  mantém contribuição zero.
- **Distribuição sobre carteira sintética** de 8 dossiês — 8 testes. As quatro
  categorias aparecem, nenhuma abocanha a carteira inteira, a ordenação
  independe da ordem de entrada e cobertura insuficiente vai para o fim da
  fila, não para o começo.

`comparePolicies` roda duas versões sobre os mesmos dossiês sem tocar em
nenhuma classificação armazenada, e há teste de que reavaliar a original depois
da comparação devolve o mesmo. `recordOutcome` é append-only, recusa id
duplicado e desfecho de outro tenant, e congela cada entrada.

### Matriz de mutação

| Mutação | Testes que falham |
|---|---|
| Cobertura insuficiente deixa de forçar `DADOS_INSUFICIENTES` | 8 |
| Exigência de escopo íntegro na lista removida | 3 |
| Lista aceita "qualquer estado menos `ENCONTRADO`" | 2 |
| Valor lido de `envelope.valor` em vez de `factValue` | 2 |
| Portão conservador de identidade removido | 1 |
| Estratégia colaborativa do delta removida | 1 |

**Um defeito de teste encontrado pela própria matriz.** A mutação "qualquer
estado menos `ENCONTRADO`" sobreviveu na primeira passada: os casos de lista
`NAO_CONSULTADO` e `ERRO_NA_FONTE` passavam porque o escopo estava incompleto,
não porque o estado fosse recusado. Passaram a declarar `escopoCompleto: true`,
de modo que só a regra de estado pode recusá-los, e aí a mutação cai.

Próximo: Task 11 — API agent-first, contratos e endpoint de prompt.

---

## Task 11: EM ANDAMENTO — API agent-first

Suíte no ponto do commit: 389 unitários (era 361) e 10 de integração, 0 falhas.
`lint`, `typecheck` e `generate:contracts` saem 0, sem deriva. Integração roda
contra o container real.

### O que está pronto

**`packages/contracts/src/prompt.ts` — a projeção para prompt, com golden
test.** O consumidor é um agente de AI, então este texto é contrato de saída
como qualquer outro: versionado (`prompt_version: 1.0.0`), determinístico e
preso por golden em `fixtures/prompt/`. Dois goldens: dossiê confirmado e
dossiê com cobertura insuficiente. 15 testes.

Regras que o texto impõe, cada uma com teste:

- **Campo com vínculo não confirmado tem o valor retido** e sai marcado com o
  status do vínculo mais as palavras "não confirmado". Alguém publicou aquele
  dado, mas ninguém estabeleceu que é desta pessoa; imprimir o valor convida o
  agente a usá-lo assim mesmo. `AMBIGUO` e `PROVAVEL` cobertos separadamente.
- **Nenhum CPF, inteiro ou mascarado.** Teste procura o CPF completo, o
  fragmento 4-9 e o formato pontuado.
- **Fonte que falhou é distinguível de fonte que não achou nada**, e de fonte
  que ninguém consultou. Os três textos são diferentes entre si.
- **Cobertura insuficiente diz por extenso que não é indício de mau pagador**
  nem nota baixa.
- **A pontuação é descrita como ordenação de esforço**, nunca como previsão.

**`packages/contracts/src/requests.ts` + `packages/application/src/lookup-dossier.ts`
— consulta por `id_externo` e paginação por cursor.** 13 testes.

- **O único identificador que o chamador segura é o id externo do título.** Não
  existe consulta por CPF, em corpo, URL ou query. O schema é `.strict()`, então
  `{ cpf }` e `{ id_externo, cpf }` são recusados **pela forma**, não porque
  alguém lembrou de checar aquele nome de campo.
- **A recusa é deliberadamente pobre em informação** (`REQUISICAO_INVALIDA`):
  ecoar qual chave foi rejeitada confirmaria ao chamador que `cpf` é um campo
  que o sistema conhece.
- **Paginação é keyset, não offset**, e o cursor é opaco por contrato: base64url
  de prioridade + pontuação + id do dossiê, sem nada sobre pessoa. Há teste de
  que uma entrada nova acima do cursor não empurra página já servida.

### Decisões tomadas inline

1. **`packages/contracts` ganhou `exports` e `index.ts`**, e `application`
   passou a depender dele. Zod é a fonte única de verdade e o schema publicado
   é onde a validação de fronteira pertence; a direção `application → contracts
   → domain` não cria ciclo.
2. **A frase proibida foi reescrita no domínio.** A explicação da política
   dizia "não estima probabilidade de pagamento" — e um teste que proíbe a
   substring não distingue negação de afirmação. Virou "não prevê pagamento",
   de modo que a proibição do ADR 016 fique verificável por substring. Regra
   que só dá para checar de um jeito precisa ser escrita para esse jeito
   funcionar.

### O que falta na Task 11

- **A superfície HTTP.** `apps/web` é stub: não há Next.js instalado, só um
  `package.json` com um `dev` que imprime "not implemented". O plano nomeia
  route handlers do Next; instalar o framework agora é dependência nova, com
  risco conhecido do defeito E-1, para a camada que o próprio enunciado trata
  como entrega e não como produto. **Preciso da sua decisão** entre instalar o
  Next e fazer as rotas como no plano, ou expor os mesmos serviços por um
  servidor `node:http` sem dependência nova, deixando o Next para a Task 12.
- **OpenAPI das operações novas.** `generate.ts` publica hoje só os schemas de
  dossiê e classificação. Falta descrever `lookup`, `prioridades` e `prompt`
  como operações, derivadas do Zod e nunca escritas à mão.
- **Views redigidas por papel**, previstas no plano e não implementadas.
- **`assertDossierFactDiscipline` continua sem chamador.** Este era o gatilho:
  o leitor de snapshot vindo do banco nasce aqui. Segue aberta.
- **I-2, I-3, M-1 e M-3** de `docs/limitacoes-v1.md` têm a Task 11 como
  gatilho declarado e continuam abertas — não as fechei, conforme sua
  instrução de não encostar nelas sem pedido.

### Decisões desta sessão que já estão em arquivo

Todas registradas acima ou nas seções das Tasks 6, 6.5 e 7 deste mesmo
documento, além de: regra de idioma no `AGENTS.md` (commit `c811164`, escrita
por você), F-5 e a precisão do reparo de E-1 em `docs/limitacoes-v1.md`.

### Task 11 — superfície HTTP no ar

Suíte: 412 unitários (era 389), 0 falhas. `lint` e `typecheck` em 0. **Os três
endpoints respondem sobre socket real**, provado por teste que sobe o servidor
numa porta efêmera e faz `fetch`.

Decisão sua, registrada: **handlers puros sobre `node:http`, sem dependência
nova.** `apps/web/src/http/router.ts` é função de valor de requisição para
valor de resposta — testável sem servidor e envolvível pelo Next na Task 12 sem
reescrever nada. `server.ts` é a única parte que sabe o que é um socket.

Rotas: `POST /api/v1/carteiras/:walletId/dossies/lookup`,
`GET /api/v1/carteiras/:walletId/prioridades`,
`GET /api/v1/dossies/:dossierId/prompt`.

**A camada HTTP não virou bypass, e isso é o I-3 deixando de ser teórico.**
Toda dependência que decide quem é o chamador — provedor de identidade,
repositório de identidade, repositório de autorização — é fixada na construção
do router e **não é escolhível por requisição**. O teste que prende isso usa um
repositório que devolve `tenant-b` contra uma carteira de `tenant-a` e exige
403: se a requisição pudesse escolher o repositório, ele passaria.

Outras regras que os 23 testes impõem:

- **`lookup` é `POST` e um `GET` na mesma rota devolve 405.** Um `GET` poria o
  identificador na URL, e dali em todo log de acesso e cache de proxy.
- **Não existe rota que aceite CPF no caminho** — `/api/v1/dossies/<cpf>` é 404.
- **Título fora da carteira é 404, não 403.** Um 403 deixaria distinguir título
  que existe noutra carteira de título que nunca existiu.
- **Corpo de erro nomeia código, nunca a entrada.** Um corpo que falhou o parse
  pode conter CPF, e ecoá-lo o colocaria em log.
- **`cache-control: no-store` em toda resposta.** O dossiê é dado pessoal de
  pessoa identificada.

**Pendência fechada: `assertDossierFactDiscipline` agora tem chamador.** O
endpoint de prompt a executa sobre o snapshot lido do armazenamento antes de
renderizar — que é exatamente a fronteira para a qual ela foi escrita, já que
um snapshot vindo do banco ou de schema antigo não passou pela composição. Há
teste que forja um snapshot com `vinculoConfirmado: true` sob vínculo
`PROVAVEL` e exige 500 com o código do erro.

**O servidor não sobe em produção, por desenho.** Fora de
`NODE_ENV=development` a emissão de `VerifiedPrincipal` falha fechada em toda
chamada (ADR 021), então um start em produção não autentica ninguém. É o
comportamento pretendido até o JWT/JWKS entrar — pendência P-1, inalterada.

Falta ainda na Task 11: **operações no OpenAPI** derivadas do Zod (hoje
`generate.ts` publica só os schemas de dossiê e classificação) e **views
redigidas por papel**.

### Task 11 — OpenAPI das operações, derivado do Zod

Suíte: 418 unitários, 0 falhas. `lint`, `typecheck` e `generate:contracts` em
0. `packages/contracts/src/openapi.ts` descreve as três operações, e **cada
forma de requisição vem do mesmo objeto Zod que o validador de runtime usa** —
não existe segunda definição para ficar para trás. `generate.ts` deixou de
montar o documento à mão e passou a chamar `buildOpenApiDocument`.

Seis testes prendem o documento, e dois deles são invariante e não estilo:
**nenhum parâmetro de CPF ou documento em lugar nenhum** — um parâmetro de CPF
documentado é uma forma documentada de perguntar ao sistema sobre alguém que
ninguém lhe deu — e **nenhum identificador de pessoa em caminho de rota**.
Também está preso que a estritura do schema sobrevive à projeção: o contrato
publicado diz `additionalProperties: false`, ou seja, afirma exatamente o que o
validador de runtime faz.

**Resta na Task 11 apenas as views redigidas por papel.** Todo o resto do
escopo da fatia está entregue e verificado.
