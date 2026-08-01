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

---

## CHECKPOINT 2026-07-31 — sistema verificado rodando, do Compose aos três endpoints

Fatia em andamento: **nenhuma aberta.** A Task 12 (UI mínima) é a próxima e não
foi começada. As views redigidas por papel da Task 11 continuam abertas.

Suíte: **445 unitários** (era 418) e **13 de integração** (era 10), 0 falhas, 0
pulados. `lint`, `typecheck` e `generate:contracts` saem 0, sem deriva. A
integração roda contra o container real.

### O que faltava para o sistema simplesmente rodar

A auditoria encontrou três buracos entre "as fatias estão fechadas" e "o
sistema sobe", todos fechados aqui:

1. **Não havia projeção de fonte para observação.** Os adapters emitem as
   próprias formas, o domínio consome `RawObservation`, e todo teste até aqui
   construía a segunda à mão. `packages/adapters/src/observations/projection.ts`
   fecha a costura, e `storage.ts` faz o ida e volta com a linha do banco.
2. **`server.ts` exportava `createHttpServer` e ninguém o chamava.** Não existia
   raiz de composição: `pnpm dev` não subia nada.
3. **`PrismaWalletTitleRepository` não sabia resolver devedor por `id_externo`**,
   que é o único identificador que o caminho de leitura aceita. Sem isso a rota
   de lookup não tinha como ser servida pelo banco.

### Decisões tomadas inline

1. **Uma observação por slice declarada.** A cobertura é decidida slice a slice
   — é isso que separa `NAO_CONSULTADO` de `NAO_ENCONTRADO` —, então colapsar
   os três sistemas da PGFN num fato só tornaria sistema não lido
   indistinguível de sistema que não achou nada. A projeção itera o plano, não
   as inscrições que chegaram.
2. **Dinheiro atravessa o armazenamento como string de dígitos.** JSON tem um
   tipo numérico só e ele é float; centavos que voltam por `JSON.parse` como
   número são centavos que podem voltar errados, e a fonte real já publica
   `29163886,440000001`. Um `centavos` numérico na volta é recusado.
3. **Id de observação derivado de fonte + slice + devedor + `collectedAt`.**
   Reexecutar a mesma coleta cai na mesma linha; coleta nova é fato novo.
4. **Id de subject derivado de máscara + nome.** O resolvedor deduplica
   candidatos por esse id: dois ids para uma pessoa fabricariam um empate entre
   alguém e si mesmo.
5. **A demo semeia e serve no mesmo processo.** O cofre AEAD é em memória
   (F-5), então o processo que cifrou o CPF é o único que o lê de volta. O
   entrypoint recusa banco fora de loopback **antes** de assumir
   `NODE_ENV=development`, para que a identidade de desenvolvimento nunca possa
   ser apontada para dado real.
6. **Carteira de demonstração é fixture própria** (`fixtures/demo/carteira-demo.xlsx`,
   com gerador commitado ao lado). `fixtures/wallet/titles.xlsx` existe para os
   casos de borda do leitor; esta existe para o banco semeado contar uma
   história — as três pessoas foram escolhidas contra as fixtures da PGFN.
7. **`pnpm migrate` passou a rodar no host**, porque o serviço `migrate` do
   Compose depende de `workspace-dependencies` e dispara o defeito E-1 que o
   próprio `AGENTS.md` proíbe rodar no Windows. `pnpm migrate:compose` continua
   existindo para Linux e CI. `compose:up` ganhou `--wait`.

### Matriz de mutação

| Mutação | Testes que falham |
|---|---|
| Slice não lida responde `NAO_ENCONTRADO` | 1 |
| Parte com erro responde `NAO_ENCONTRADO` | 1 |
| Portão de máscara da lista manual removido | 1 |
| Portão de procedência removido | 1 |
| Id de subject só pela máscara | 1 |
| Escopo do bloco assumido íntegro | 1 |
| Centavos serializados como número JSON | 4 |
| Centavos numéricos aceitos na volta | 1 |
| Tipo desconhecido responde buraco em vez de erro | 1 |
| Escopo de carteira removido do lookup por `id_externo` | 1 |

**Dois defeitos encontrados pela própria matriz, não por leitura.** A guarda
que recusa centavos numéricos na volta **sobreviveu** à primeira passada: não
havia teste nenhum para ela, que é o defeito I-4 em miniatura; o teste foi
escrito antes de a matriz ser registrada. E o primeiro rascunho do lookup por
`id_externo` declarava o escopo de carteira **duas vezes** — na query e num
pós-filtro —, de modo que remover qualquer uma das duas deixava a suíte verde.
Duas guardas redundantes não conseguem carregar teste falsificador cada uma, e
o escopo passou a ser declarado uma vez só.

### Verificação de execução, feita de verdade

Executado nesta ordem, com saída conferida a cada passo: `pnpm exec prisma
generate` (o cliente não estava gerado — E-2, como previsto), `docker compose up
-d --wait postgres keycloak` (os dois `Healthy`), `node scripts/migrate.mjs`
(`2 migrations found`, `No pending migrations to apply`), `pnpm demo` (3
devedores, 0 linhas em quarentena, três dossiês classificados).

**Os três endpoints responderam 200 sobre socket real**, com dado vindo do
PostgreSQL e não de fixture em memória:

- `POST /api/v1/carteiras/carteira-demo/dossies/lookup` → dossiê + classificação
  `COBRANCA_PADRAO`, pontuação 0.4, sinal `divida_ativa_confirmada` aplicado.
- `GET /api/v1/carteiras/carteira-demo/prioridades` → três itens ordenados,
  `next_cursor: null`.
- `GET /api/v1/dossies/dossie-1/prompt?carteira=carteira-demo` → markdown,
  cobertura SUFICIENTE, 5 de 5 slices conclusivas.

O prompt mostra o comportamento que interessa: `pgfn_dados_abertos_*` sai com
vínculo `CONFIRMADO`, e `pgfn_lista_*` sai com **valor retido** e vínculo
`REJEITADO`, porque a lista publica gente com a mesma máscara cujo nome o
resolvedor recusa. Publicado não é fato sobre esta pessoa.

**Limite honesto da verificação:** ela rodou contra o volume de desenvolvimento
existente, não contra volume vazio. `migrate deploy` é idempotente e o seed
reseta o próprio tenant, então a sequência é reprodutível; mas `docker compose
down -v` é reset de banco e o `AGENTS.md` manda perguntar antes — não perguntei
nem executei. A partida de volume genuinamente vazio segue não exercitada.

### Documentação

`README.md` reescrito: sequência numerada de clone limpo até os três endpoints,
com o comando exato de cada passo, a resposta correta de cada um, o curl de cada
endpoint com um exemplo do corpo devolvido, e as suítes unitária e de integração
separadas com o que cada uma exige. `AGENTS.md` teve a seção de comandos
corrigida junto, porque comando documentado que não roda é garantia falsa.

Pendências intocadas por instrução: I-2, M-1, M-3 e P-1.

Próxima ação: **views redigidas por papel** — último item aberto da Task 11.
`operador_cobranca` nunca vê CPF completo nem evidência de match integral; o
papel de auditoria lê a trilha sem acesso operacional à carteira. É invariante
de `AGENTS.md`, então precisa de teste que falhe se for afrouxado.

### Task 11 — visões redigidas por papel (último item aberto da fatia)

Suíte: **479 unitários** (era 445), 0 falhas. `lint`, `typecheck` e
`generate:contracts` saem 0, sem deriva.

`packages/contracts/src/role-view.ts` projeta o dossiê para um papel humano.
**A visibilidade é tabela declarada**, como os pesos da política — regra
espalhada em `if` é regra que ninguém revisa:

| papel | campos | devedor | classificação | evidência detalhada | trilha |
|---|---|---|---|---|---|
| `ADMIN_TENANT` | não | não | não | não | não |
| `ANALISTA_DOSSIE` | sim | sim | sim | **sim** | não |
| `OPERADOR_COBRANCA` | sim | sim | sim | **não** | não |
| `ENCARREGADO_LGPD` | **não** | não | sim | não | **sim** |

Decisões tomadas inline, não cobertas por ADR:

1. **Ninguém vê o documento — não só o operador.** A invariante nomeia
   `operador_cobranca`, mas nenhum papel precisa de CPF numa tela: o operador
   liga para a pessoa pelo nome, e o analista revisa o match por regra de nome.
   A guarda `assertNoDocument` roda sobre a visão pronta, conhece o CPF real
   porque a projeção o recebeu, e confere as três formas — 11 dígitos,
   pontuada e o fragmento 4-9 — mais o padrão pontuado de qualquer documento.
   O vazamento realista é o operador digitar o CPF na coluna de nome da
   planilha; aí a projeção falha fechada com `DOCUMENTO_EM_VISAO_DE_PAPEL` em
   vez de renderizar.
2. **O operador recebe quantas regras casaram, nunca quais.** "Evidência de
   match integral" é material de revisão; o trabalho do operador é decidir uma
   abordagem, não auditar um vínculo. A contagem diz que o match foi examinado
   sem dizer o que desta pessoa casou com que registro público.
3. **A auditoria lê o esqueleto da decisão, não a carteira.** `ENCARREGADO_LGPD`
   fica com a trilha mais categoria, versão de regras, sinais nomeados e
   explicação — que é exatamente o que o direito de revisão trata (`docs/lgpd.md`)
   — e sem devedor e sem valores. É a autorização espelhada na visão:
   `READ_AUDIT` e nada mais.
4. **`parametrosConsulta` não entra em visão nenhuma.** Os parâmetros da lista
   manual carregam os filtros publicados, e o caminho da PGFN trabalha com
   máscara; parâmetro de consulta é procedência para o dossiê, não texto de
   tela.
5. **`AGENTE` não é audiência desta projeção.** O agente já tem contrato
   próprio (JSON estrito e projeção de prompt), ambos com golden test. Uma
   segunda superfície para ele seria contrato duplicado.

`packages/contracts/src/format.ts` é **a única formatação brasileira, e mora na
borda de apresentação**. Agrupa milhar sobre os dígitos de um `bigint`: o
formatador de locale da plataforma recebe `number`, que é a conversão que este
código inteiro existe para evitar, e a fonte real publica `29163886,440000001`.
Um teste varre o próprio arquivo por `Number(`, `parseFloat`, `parseInt` e pelo
nome do formatador de locale. Instante sai como `31/07/2026 17:40 UTC`: a zona é
declarada e não convertida, porque converter exige fuso de tenant que ninguém
configurou e hora errada em trilha de auditoria é pior que zona explícita.

Matriz de mutação — cada mutação derruba exatamente os testes que a reivindicam:

| Mutação | Testes que falham |
|---|---|
| Chamada de `assertNoDocument` removida | 2 |
| `evidenciaDetalhada` do operador ligada | 1 |
| `campos` da auditoria ligados | 1 |
| `devedor` da auditoria ligado | 1 |
| `trilha` do operador ligada | 1 |
| Dinheiro renderizado sem formatação brasileira | 1 |

Dois testes de fixação entraram em `authorization.test.ts` — auditoria sem ação
operacional, operador sem `READ_AUDIT` nem `READ_DOSSIER`. Nasceram verdes, de
propósito: o comportamento já existia e o que faltava era a prova de que
alargar a tabela derruba alguma coisa.

### Delta de regularidade — integralidade derivada e ausência resolvida

Suíte: **503 unitários** (era 479), 0 falhas. `lint`, `typecheck` e
`generate:contracts` saem 0, sem deriva.

Três defeitos, e os três deixavam o mesmo sinal mitigador morto.

**1. O delta chaveava no estado bruto da fonte.** `pgfn_lista_presente` sai
`ENCONTRADO` sempre que qualquer linha volta. Na saída real do sistema ele sai
`ENCONTRADO` com vínculo `REJEITADO`: vieram registros, o resolvedor olhou um
por um e recusou todos. **Para o delta isso é ausência**, não presença — e
chavear no estado transformava ausência em presença justamente para quem o
sinal existe. `absenceEstablished` no domínio passa a ser a leitura: ausência é
conclusão do resolvedor, não estado da fonte. `REJEITADO` e `SEM_CANDIDATO`
estabelecem ausência tão firmemente quanto `NAO_ENCONTRADO`; `AMBIGUO`,
`PROVAVEL`, `POSSIVEL` e `DESCONHECIDO` são dúvida, e dúvida é silêncio.

O teste do caso foi escrito e visto vermelho antes de qualquer mudança, com a
fixture ganhando a força de vínculo `REJEITADO` produzida pelo resolvedor real
sobre a armadilha documentada (`JOSE SILVA` absorvido em `MARIA JOSE ALVES
PEREIRA SOARES SILVA`, completude 2/6).

A metade "dúvida" de `absenceEstablished` é infalsificável pela composição — ela
nunca produz valor `false` sob vínculo `PROVAVEL` —, então ganhou testes de
envelope construído à mão em `dossier.test.ts`. É fronteira de leitura: snapshot
vindo do banco ou de schema antigo não passou pela composição. Guarda que nenhum
teste derruba é garantia falsa (defeito I-4).

**2. A política lia uma chave que a produção nunca escrevia.** O gate de escopo
lia `parametrosConsulta[slice].queryScope.complete`, e
`projectPgfnListObservation` escrevia `escopoCompleto`. A fixture escrevia
`queryScope`, então todo teste passava. Com a fixture e a produção discordando,
o gate estava morto duas vezes e nenhum teste conseguia mostrar. Unificado em
`escopoCompleto`, que é a chave que os Dados Abertos já usavam.

**3. `queryScope.complete` era constante `false`.** Agora
`derivePgfnListQueryScope` deriva do preâmbulo capturado. A regra é allow-list e
falha fechada: filtro que seleciona **quem** foi pesquisado deixa o universo de
dívidas inteiro; qualquer outro — natureza da dívida, faixa de valor, rótulo que
este código nunca viu — é recorte. Uma amostra real é o sample inteiro, então
rótulo desconhecido recorta, e um formato que ninguém amostrou falha fechado em
vez de autorizar inferência em silêncio.

**Integralidade tem duas metades, e a segunda faltava inteira.** O importador
responde "o universo de dívidas foi recortado?", lendo o preâmbulo. A projeção
responde "essa consulta cobriu **esta** pessoa?" — porque um export íntegro para
outra pessoa não diz nada sobre a ausência deste devedor, e sinal mitigador que
dispara pela consulta de terceiro é pior que sinal que nunca dispara. A fonte
casa token sem noção de posição, então a consulta cobre o devedor quando todo
token pesquisado está no nome dele; não nomear ninguém cobre todo mundo; filtro
de documento não é comparável aqui e não estabelece cobertura.

**O sinal continua não disparando na demo, e agora por um motivo verdadeiro:** o
export real commitado carrega faixa de valor máximo e natureza da dívida, logo é
recorte. O que mudou é que a resposta vem do preâmbulo e não de uma constante —
um export sem filtros de recorte, para esta pessoa, faz o delta valer.

| Mutação | Testes que falham |
|---|---|
| Delta volta a chavear no estado bruto da fonte | 2 |
| Lista de vínculos duvidosos esvaziada | 4 |
| Bloco sem procedência declarado íntegro | 1 |
| Todo filtro tratado como seletor de sujeito | 9 |
| Checagem de cobertura do sujeito removida | 2 |

**Pendência registrada, não fechada:** `confianca_global` cai a zero quando o
delta se aplica, porque o sinal declara depender de `pgfn_lista_presente` e a
confiança do vínculo recusado é 0. Recusa é resposta, não incerteza, então o elo
mais fraco está sendo lido errado nesse caso. É anterior a esta mudança — vale
igual para `NAO_ENCONTRADO` — e mexer nisso é mudança de política com bump de
versão. Fica anotado para decisão sua.

### Dois defeitos achados rodando o sistema

Suíte: **505 unitários** (era 503), 0 falhas. `lint` e `typecheck` em 0.

**1. `multiplos_titulos_em_aberto` não se aplicava a uma carteira com dois
títulos. A avaliação está certa; o nome estava errado.** A política declara
`MINIMO_DE_TITULOS = 3` e os casos calculados à mão foram calibrados com três —
`UM_SINAL` vale 0.15 com três títulos. O que mentia era o rótulo: "múltiplos" se
lê como dois ou mais. Sinal nomeado é a unidade pela qual uma pessoa revisa
decisão automatizada, e isso é exigência legal, não recurso; nome que descreve
mal a própria regra é defeito na explicação. Renomeado para
`tres_ou_mais_titulos_em_aberto`, com a constante virando `MINIMO_DE_TITULOS` e
o campo da política `minimoDeTitulos`. **Peso e limiar não se mexeram** — mexer
mudaria a classificação de gente real, e o que estava quebrado era a etiqueta.
Os dois goldens de prompt acompanham.

O teste que prende: o sinal aplica a três e não a dois, **e** a lista de sinais
da política não contém mais o nome antigo. Os dois foram vistos vermelhos antes.

**2. Dinheiro saía como `R$ 29175886.44`.** `packages/contracts/src/format.ts`
(commit anterior) é a formatação brasileira e mora na borda de apresentação; a
visão por papel já a usa em valor e em data. Auditei as outras superfícies que
uma pessoa lê: o relatório de quarentena carrega número de linha e motivo, sem
valor; a saída de console da demo imprime pontuação e não dinheiro; mensagens de
erro são códigos. A projeção de prompt fica como está, por sua instrução. Fora
isso, o único lugar humano que renderiza dinheiro é a UI da Task 12, que nasce
usando `formatBrlFromCents`.

**Versão de política mantida em `2026-07-A`, e é decisão consciente.** Pesos,
faixas e limiares declarados não mudaram. A correção do delta alinhou a
implementação à regra que a política já enunciava — "a lista não encontrou esta
pessoa" estava implementado como "o estado da fonte é `NAO_ENCONTRADO`" — e a
renomeação é rótulo. Nenhuma classificação está armazenada para ser invalidada:
elas são computadas na leitura. Se você preferir tratar como política nova, é
uma constante.

### Verificação a partir de volume genuinamente vazio, seguindo o README à risca

`docker compose down -v` executado com autorização explícita sua. `docker volume
ls` devolveu lista vazia depois, então a partida foi de volume inexistente e não
de banco reaproveitado — o limite honesto registrado no checkpoint anterior está
fechado.

Sequência do README, na ordem, com a saída conferida a cada passo:

| Passo | Comando | Resultado |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | `Already up to date`, como o README prevê |
| 2 | `pnpm exec prisma generate` | `Generated Prisma Client (v6.19.0)` |
| 3 | `pnpm compose:up` | `Healthy` para postgres e keycloak, saída 0 |
| 4 | `pnpm migrate` | `2 migrations found`, **as duas aplicadas** — banco novo |
| 5 | `pnpm demo` | 3 devedores, 0 em quarentena, API no ar |
| 6 | lookup | 200, `COBRANCA_PADRAO`, pontuação 0.4 |
| 7 | prioridades | 200, três itens, `next_cursor: null` |
| 8 | prompt | 200, markdown, cobertura SUFICIENTE |

Também rodado contra o banco novo: `pnpm test:integration`, 13 testes, 0 falhas.
Os nomes semeados conferidos direto no PostgreSQL batem com o exemplo do
README, e confirmam o defeito 1 desta sessão: `DEMO-001` e `DEMO-002` são dois
títulos de `JOSE DA SILVA`, e dois é menos que o mínimo de três da política.

**Três correções no README, todas achadas testando o documento:**

1. **Os `curl` não rodavam no PowerShell.** Reproduzido: `curl` é apelido de
   `Invoke-WebRequest` e recusa com "Não é possível associar o parâmetro
   'Headers'". Cada passo ganhou a versão PowerShell ao lado.
2. **`curl.exe` resolve os `GET`, mas não o `POST`.** Testado: com aspas simples
   no corpo, e também com `--%`, o PowerShell reescreve as aspas internas antes
   de o curl vê-las e a resposta é `{"erro":"CORPO_NAO_E_JSON"}`. Só a forma com
   escape de crase funciona, e é impossível de colar sem errar — por isso a
   versão Windows do passo 6 é `Invoke-RestMethod`, verificada respondendo 200.
3. **O passo 7 dizia que dava para abrir no navegador.** Não dá: sem
   `Authorization` a resposta é 401, confirmado por requisição sem cabeçalho.
   O texto agora diz isso e explica que barra de endereço não manda cabeçalho.

Contagem de testes unitários do README atualizada de 445 para 505.

### Documentação exigida, completada

**`docs/fontes.md` reescrito.** Antes tinha uma tabela de situação e nenhuma das
três colunas que o enunciado pede. Agora traz, por fonte: o que entrega em
campos concretos, método de acesso, custo com preço marcado como pago ou
gratuito, base legal resumida, e uma coluna **verificado** que separa o que foi
conferido contra arquivo real do que é leitura de página pública. A Lista PGFN é
a única marcada como verificada, com o que a verificação mostrou; os Dados
Abertos continuam com o layout não verificado (F-3). Nenhum custo de bureau foi
inventado: são "pago, preço não verificado, sem contrato".

**`docs/lgpd.md` ganhou as três seções que faltavam.** Base legal por par fonte ×
finalidade, com âncora e a situação de validação de cada linha — inclusive a
carteira e o CPF completo, que não estavam lá. Direitos do titular, um por um,
dizendo **como** cada um é atendido hoje e qual é o limite conhecido: correção é
supersessão, eliminação é crypto-shredding com esqueleto preservado, revisão de
decisão automatizada se apoia nos sinais nomeados. E o bloqueio de produção do
ADR 021 escrito como o que ele é — imposição de runtime a cada chamada, não
aviso em prosa.

**`docs/casos-de-teste.md` criado.** Os casos obrigatórios do `AGENTS.md`, as
pontuações calculadas à mão com a conta ao lado, os pesos da resolução de
identidade com um exemplo conferível (0,9167 → `PROVAVEL`, logo não é fato), os
casos negativos que carregam invariante, e os de integração. Cada linha aponta
arquivo **e** nome do teste. Todos os nomes citados foram conferidos por busca
contra os arquivos antes do commit — documento que aponta para teste inexistente
é pior que documento nenhum.

Linkado no `README.md` e na seção "Onde as coisas ficam" do `AGENTS.md`.

## Task 12: FECHADA — UI mínima, duas telas

Suíte: **523 unitários** (era 505) e 13 de integração, 0 falhas. `lint`,
`typecheck` e `generate:contracts` saem 0, sem deriva. As duas telas foram
buscadas do servidor real, com dado vindo do PostgreSQL.

`apps/web/src/http/views.ts` renderiza HTML no servidor a partir dos mesmos
handlers, **sem dependência nova e sem framework**. Duas rotas no mesmo
roteador: `GET /carteiras/:walletId/prioridades` e
`GET /carteiras/:walletId/dossies/:dossierId`. Decisões em
[ADR 024](../../../docs/decisions/024-ui-servida-pelo-mesmo-roteador-sem-framework.md).

**A audiência da visão é função da ação autorizada.** `READ_ACTIONABLE` rende a
visão do operador, `READ_DOSSIER` a do analista, `READ_AUDIT` a da auditoria. A
página do dossiê autoriza `READ_ACTIONABLE` como piso e pergunta ao **mesmo
caminho de autorização** se aquela concessão também alcança `READ_DOSSIER`.
Papel escolhido por query string seria escalonamento de privilégio com barra de
endereço.

**Um defeito que só o sistema rodando encontrou.** A tela do dossiê chamava
`findInWallet`, que decifra o CPF e por isso exige `READ_DOSSIER`; sob a
autorização de operador o repositório real respondeu
`OPERATION_ACTION_FORBIDDEN`. Os testes unitários não pegaram porque o fake da
suíte não impõe ação. **A correção não foi alargar a permissão** — foi tirar o
CPF do caminho: `findNameInWallet` lê o nome dos próprios títulos da carteira
sob `READ_ACTIONABLE` e não toca a linha do devedor. O CPF existe para o
matcher, e tela não é matcher. `projectDossierForRole` passou a aceitar devedor
sem CPF, com a guarda rodando só o padrão pontuado nesse caso — garantia mais
estreita e posição mais forte, porque página não vaza documento que nunca
recebeu. Isso é estrutura, e vale mais que varredura.

**White label sem valor padrão.** `PrismaTenantThemeRepository` lê nome do
produto, marca e cores da linha do tenant, com a mesma autoridade das outras —
emissão por fábrica conferida a cada chamada, campos `#`, protótipo e instância
congelados — e entrou na lista `describe.each` dos invariantes arquiteturais.
Tenant sem tema devolve 500 `TEMA_NAO_CONFIGURADO`: um padrão embutido seria a
marca da desenvolvedora com outro nome. O favicon é um disco na cor do tenant,
gerado inline.

**Credencial no navegador por HTTP Basic**, e só na raiz de composição da
demonstração. O roteador continua chamando `deps.authenticate(request)`, fixado
na construção e inalcançável pela requisição (I-3 segue fechado); o que mudou é
que a resposta 401 **de página** acompanha `WWW-Authenticate`, então o navegador
pede a credencial e a manda no mesmo cabeçalho `Authorization` que a API já usa.
Sessão com cookie exigiria emissão, expiração e rotação — um sistema de
autenticação de verdade, que é o que o ADR 021 bloqueia até o JWT/JWKS entrar.

Formatação brasileira só na borda: `R$ 29.175.886,44` e `27/07/2026`, ambas por
`packages/contracts/src/format.ts`. Tudo que é interpolado é escapado, e cor de
tema é validada contra `#hex` antes de virar CSS.

| Mutação | Testes que falham |
|---|---|
| Escape de HTML removido | 1 |
| Audiência deixa de seguir a concessão | 1 |
| Tema padrão inventado quando o tenant não tem | 1 |
| Ordenação da fila removida | 1 |

Duas linhas novas nos invariantes do `AGENTS.md`, apontando para o ADR 024:
tema sem padrão, e visão como função da ação autorizada.

**Pendências intocadas, por instrução:** I-2, M-1, M-3 e P-1. I-2 em especial
segue valendo — ator `HUMAN` é autorizado por papel e alcança toda carteira do
tenant —, e a UI não a exercita porque o único ator construído fora de teste
continua sendo um agente com concessão por carteira.

---

## Bump de versão de política: `2026-07-A` → `2026-07-B` (ADR 025)

Suíte: **526 unitários** (era 523) e 13 de integração, 0 falhas. `lint`,
`typecheck` e `generate:contracts` saem 0, sem deriva de artefato regenerado.

**Item 1 da revisão foi revertido por decisão sua.** A sessão anterior manteve
`2026-07-A` argumentando que pesos, faixas e limiares declarados não se mexeram.
O argumento trata a versão como declaração de intenção; quem consome o contrato
lê comportamento. Antes da correção do delta o sinal mitigador **não podia
disparar em execução nenhuma**, e um sinal mudou de nome na saída publicada —
duas execuções rotuladas `2026-07-A` devolveriam resultados diferentes, que é a
mesma garantia falsa removida em todo o resto do projeto.

`ADR 025` registra o gatilho como regra: mudança que altere o resultado de
alguma execução possível, ou o nome de um sinal publicado, exige bump mesmo com
a tabela intacta. Uma linha nova nos invariantes do `AGENTS.md` aponta para lá.

`2026-07-A` **deixa de existir no código**: o arquivo virou
`policy-2026-07-b.ts`, a constante virou `POLICY_2026_07_B` e não há caminho que
produza o rótulo antigo. A versão anterior não foi reconstruída como política
histórica — exigiria manter em código o delta inalcançável e a chave de escopo
morta, e comparar contra um defeito reconstruído não informa nada (ADR 016 pede
versões comparáveis, não versões defeituosas preservadas).

`plano de fontes` e `versão do resolvedor` continuam em `2026-07-A`: são versões
independentes que só coincidiam de etiqueta, e nenhuma das duas mudou de
comportamento. Os dois goldens de prompt acompanham só a linha da política.

RED observado antes: `expected '2026-07-A' to be '2026-07-B'`, um teste só.

O teste que afirma que os pesos não se mexeram lista a tabela item a item, em
vez de descrevê-la em prosa — a frase "nenhum peso mudou" precisa ser
falsificável para valer alguma coisa.

| Mutação | Testes que falham |
|---|---|
| `version` volta para `2026-07-A` | 6 (versão, comparação, os dois goldens, prompt, explicação) |
| `divida_ativa_confirmada` de 0,40 para 0,45 | 6 (tabela de pesos, três do delta, os dois goldens) |

Um defeito de teste corrigido de passagem: `prompt.test.ts` afirmava carregar
"a versão da política **e** a do resolvedor" com um único `toContain("2026-07-A")`.
Uma substring não consegue checar duas coisas; enquanto os rótulos coincidiam o
teste passava sem exercitar nada. Agora são duas asserções ancoradas no rótulo
de cada linha.

### Checagem pedida: `confianca_global` não cascateia (não corrigida, por instrução)

**Não cascateia.** Confirmado por leitura e por teste executável, e nada foi
mexido.

- `cobertura.veredito` é decidido em `composeDossier`, na composição do dossiê,
  **antes de a classificação existir**, e depende só de
  `fontesObrigatoriasInconclusivas.length === 0`. Nenhuma confiança de vínculo
  entra na conta.
- `confianca_global` é calculada na última linha de `evaluatePolicy` e escrita
  uma vez no resultado congelado. `categoryFor`, o curto-circuito de
  `DADOS_INSUFICIENTES`, o cap do delta, a estratégia e a explicação são todos
  calculados **antes** dela e nenhum a lê.
- Fora do domínio ela só é copiada (`classification-mapper.ts`), validada
  (`classification-schema.ts`) e impressa (`prompt.ts`). Nenhum consumidor
  decide nada com ela.

Teste de fixação em `evaluate.test.ts` ("confianca_global is an output, never an
input"): sobre o dossiê `COM_DELTA`, `confianca_global` é 0, o veredito de
cobertura do dossiê é `SUFICIENTE`, a classificação sai `SUFICIENTE` /
`COBRANCA_PADRAO`, e a explicação não menciona cobertura insuficiente. Nasceu
verde de propósito — é prova de contenção, não correção.

**A pendência em si continua aberta e não foi tocada:** `confianca_global` cai a
zero quando o delta se aplica, porque o elo mais fraco lê a confiança de um
vínculo recusado como 0, e recusa é resposta, não incerteza. O efeito é local ao
próprio campo publicado.

---

## Entrega: branch para a `main`, CI, leitura final de documentação e roteiro

### O estado que encontrei

`main` estava em `f9575b8` — só documentação, **zero implementação**. O sistema
inteiro vivia em `codex/dossie-triagem`, 67 commits à frente. Quem clonasse o
repositório via um projeto vazio.

### PR

PR [#1](https://github.com/iajuss/sistemaweb-202/pull/1) para a `main`. Já
existia, aberto e sem descrição, com o título automático "Codex/dossie triagem";
foi atualizado no lugar em vez de aberto um segundo. **Não foi mergeado**, por
instrução.

### A CI estava vermelha, e nunca tinha sido verde

Achado ao conferir os checks do PR. O workflow rodava `pnpm test`, que inclui a
suíte de integração chamando `docker compose exec` contra um PostgreSQL real,
**sem nunca subir o stack**: toda execução morria em
`service "postgres" is not running`, e os passos de `lint` e `typecheck`, que
vinham depois, nunca chegaram a executar. Também faltava `prisma generate`, sem
o qual o `typecheck` falharia por conta própria (defeito E-2).

Corrigido para a sequência do README, com os comandos do README, mais uma
checagem de deriva dos contratos gerados. **Verde nas duas execuções**
(`push` e `pull_request`) do commit `fcd9536`.

Uma CI que verifica outra coisa não verifica nada sobre o documento que uma
pessoa de fato segue — é a mesma família de defeito da regra de lint sem alvo
(M-1).

### Leitura final de documentação

`README.md`, `docs/fontes.md`, `docs/lgpd.md`, `docs/limitacoes-v1.md` e
`docs/decisions/README.md`. Os 34 arquivos markdown do repositório tiveram todos
os links relativos conferidos por script: nenhum quebrado.

`fontes.md`, `lgpd.md` e `casos-de-teste.md` estavam consistentes. O que estava
velho:

- **`limitacoes-v1.md` afirmava que nenhum item era exercitável porque não havia
  superfície HTTP.** Falso desde a Task 11. Reescrito: cada linha declara o
  motivo que vale hoje. P-1 dizia "não há rota que receba um token" — as rotas
  leem o cabeçalho `Authorization`, só que apenas o esquema; o que segura é o
  fecho do ADR 021. I-2 dizia "não há login" — as telas pedem credencial ao
  navegador, e mesmo assim nenhum ator `HUMAN` é construído fora de teste,
  porque a raiz de composição devolve sempre o agente. M-3 dizia "não há portas
  públicas" — há, e o símbolo continua exportado sem que nenhuma o chame.
- **I-3 fechou.** O gatilho declarado era a primeira rota que montasse os
  argumentos a partir de dados de requisição; a rota chegou e não virou bypass.
  Movido para uma seção de fechados, com o teste que fecha.
- **I-4 reconferido e ainda aberto.** Os seis códigos de guarda aparecem em
  exatamente um arquivo de produção cada e em **nenhum** arquivo de teste. O
  gatilho declarado era "a revisão final antes da entrega", que é agora; fica
  registrado que o item entra na entrega em aberto por escopo, não por falta de
  conferência.
- **C-1 criado** para a queda de `confianca_global` a zero, que só existia no
  ledger.
- **README** dizia 505 testes unitários; são 526.

### `docs/demonstracao.md`

Roteiro de dez minutos, com a preparação declarada fora do relógio. Quatro
momentos: o valor retido porque o vínculo foi recusado, os sinais nomeados com
peso atrás da classificação, os quatro estados de fonte, e o que o sistema
recusa fazer. **Todo comando e toda saída citada foram rodados contra o sistema
no ar**, não escritos de memória — inclusive a recusa de consulta por CPF (400
`REQUISICAO_INVALIDA`) e o filtro de vitest que mostra os três estados por nome.

Os quatro estados não aparecem todos na tela: o seed lê as cinco slices com
sucesso, então só `ENCONTRADO` e `NAO_ENCONTRADO` saem naturalmente. O roteiro
diz isso e leva os outros dois ao teste que os prende, em vez de fingir que a
demonstração os mostra.

Verificado de passagem que a demonstração no ar publica `política: 2026-07-B`.

### Pendências intocadas, por instrução

I-2, M-1, M-3 e P-1. Nenhuma linha de código delas foi mexida; o que mudou foi a
descrição do motivo, que estava desatualizada.

Próxima ação: **verificar a `main` depois do merge**, a partir de clone novo em
diretório temporário, seguindo o README à risca.

---

## Verificação da `main` e I-4

Suíte: **534 unitários** (era 526) e 13 de integração, 0 falhas. `lint`,
`typecheck` e `generate:contracts` saem 0, sem deriva.

### `main` verificada de clone limpo, volume vazio

`docker compose down -v` com autorização, `docker volume ls` vazio depois.
Clone novo de `main` (`e515435`) em diretório temporário, README seguido à
risca, sem improvisar passo nenhum. Passos 1 a 9 conferidos um a um: install,
`prisma generate` (v6.19.0), Compose `Healthy` nos dois containers, **as duas
migrações aplicadas** — banco genuinamente novo —, `pnpm demo` com 3 devedores
e 0 em quarentena, os três endpoints em 200 e as duas telas renderizando **em
navegador de verdade**, não só em `curl`. `test:unit` 526, `test:integration`
13, lint e typecheck em 0. A demonstração no ar publica `política: 2026-07-B`.

Dois defeitos, ambos do documento e não do sistema:

1. **As telas eram inacháveis.** O README citava só o primeiro terço da saída do
   `pnpm demo`, cortando justamente o bloco que imprime os endpoints e as URLs
   das duas telas; e as URLs só apareciam no passo 9, depois de três seções de
   `curl`. Agora a saída é citada inteira, há uma tabela de atalho no topo e o
   passo 5 manda parar e abrir o navegador para quem só quer ver.
2. **`generate:contracts` acusava deriva falsa em clone novo no Windows.**
   `git status` marcava os dois JSON gerados como modificados logo depois de
   regenerar. `git diff --exit-code` devolvia 0 o tempo todo: o conteúdo nunca
   mudou. Causa: `core.autocrlf` faz checkout em CRLF, o gerador escreve LF.
   `packages/contracts/generated/** text eol=lf` no `.gitattributes` resolve.
   Acusar deriva fantasma justamente nos dois arquivos cujo diff deveria
   significar "o contrato mudou" é pior que não acusar nada.

A contagem de 526 testes no README já estava correta na `main` — a correção
entrou junto no merge.

### I-4: cinco guardas e o pós-filtro fechados, duas restam

**Cada mutação derruba exatamente um teste nomeado**, sobre uma suíte de 534.
RED observado por mutação antes de cada guarda ser considerada coberta.

| Guarda removida | Testes que falham |
|---|---|
| `AUTHORIZED_OPERATION_REQUIRED` | 1 |
| `OPERATION_PRINCIPAL_MISMATCH` | 1 |
| `SYSTEM_INGESTION_CAPABILITY_REQUIRED` | 1 |
| `INVALID_TENANT_CONTEXT` | 1 |
| pós-filtro `containsDebtor` | 1 |
| `OPERATION_CONTEXT_IDENTITY_MISMATCH` | **0** |
| `AUTHORIZED_WALLET_CONTEXT_REQUIRED` | **0** |

**As duas que restam não estão quebradas — são vazias por construção**, e isso
foi estabelecido lendo os caminhos de chamada, não supondo:

- `issueAuthorizedOperation` é o **único** emissor de `AuthorizedOperation`, e
  monta a operação com a mesma `identity` e com `createTenantContext(identity.actor)`.
  `context.actor` e `identity.actor` são a mesma referência, sempre; e só objeto
  registrado no `WeakSet` do emissor passa pela barreira anterior. Logo
  `OPERATION_CONTEXT_IDENTITY_MISMATCH` não tem entrada que a faça disparar.
- `assertAuthorizedWalletContext` é privada de módulo, tem **um** chamador, e
  recebe um contexto criado na linha imediatamente acima.
- Conferido que isso não esconde furo: `authorize()` tem um único ponto de
  chamada e decide sobre `runtimeActor`, nunca sobre `context.actor`; e
  `context.actor` só alimenta validação de tenant e o `actorId` da auditoria.

Escrever "teste" para condição que o código não consegue produzir seria fabricar
a prova — o defeito que o próprio I-4 nomeia. Fica como decisão de desenho:
apagar a guarda vazia, ou mover a fronteira para que um valor de fora chegue até
ela. **Não decidi sozinho.**

Um detalhe que vale registro: `INVALID_TENANT_CONTEXT` só é alcançável porque
`createTenantContext` guarda a referência do ator do chamador em vez de cloná-la
e está exportada no barrel do domínio — ou seja, o teste que fecha essa guarda
depende do defeito M-3 continuar aberto. Fechar M-3 exige reescrever esse teste.

Pendências intocadas, por instrução: I-2, M-1, M-3, P-1 e C-1. Descrições
reconferidas contra o sistema depois do merge e continuam válidas.

---

# Sessão de fechamento — 2026-08-01

Entrega no domingo 23:59. Prioridade: fechar com segurança, não acrescentar
escopo. Trabalho direto na `main`, modo inline.

## Estado encontrado

`main` local estava **um commit atrás** de `origin/main`: o merge do PR #1
(`e515435`) nunca tinha sido puxado para cá, o que fazia a árvore de trabalho
parecer conter só documentação. O PR #2 era `codex/entrega-final` (`24127b0`),
três commits à frente, com o diff que prometia — `.gitattributes`, `progress.md`,
README, `limitacoes-v1.md` e três arquivos de teste.

`gh` não está instalado nesta máquina, então o PR #2 foi fechado por merge
`--no-ff` local e push: o GitHub marca como merged quando os commits do head
chegam à base.

**O worktree removido tinha um arquivo não commitado**: `docs/proximos-passos.md`,
que teria sido destruído pelo `--force`. Foi resgatado para a `main` antes da
remoção (`5abcda1`). Junto dele havia um `pnpm demo` de ontem ainda rodando,
segurando o diretório e a porta 3000.

## O que esta sessão fechou

### 1. Terceira tela: importação de carteira com quarentena

O laço de uso estava aberto — carregar carteira exigia rodar script, que é a
resposta errada para "como o cliente carrega a dele" num sistema web.

Três requisições: formulário, conferência que não grava, commit dos mesmos
bytes conferidos. **Nenhum importador novo**: a tela chama `previewWalletImport`
e `commitWalletImport`, as mesmas funções do seeder, pela mesma autorização
`IMPORT_WALLET`.

Peças novas, cada uma com teste vermelho observado antes da implementação:

| Peça | Por que existe |
|---|---|
| `wallet-importers/wallet-file.ts` | O formato sai dos **bytes** (assinatura zip), não da extensão nem do `content-type` que o navegador mandou |
| `http/multipart.ts` | `node:http` entrega upload cru. Decodificar como texto para achar o limite corromperia o workbook: o payload nunca vira string |
| `http/import-staging.ts` | A conferência não pode gravar e o commit tem de importar os bytes conferidos. Token aleatório, escopado por tenant+carteira, gasto no uso e com prazo — a alternativa (devolver o arquivo ao navegador em campo oculto) poria uma planilha de CPFs no markup |

O transporte passou a decidir o corpo pelo `content-type` declarado: upload fica
`Uint8Array` (teto próprio de 8 MiB), formulário vira registro de campos, e o
resto continua JSON.

### 2. Um defeito que só a execução real pegou

A tela autorizava `IMPORT_WALLET` e lia o tema do tenant **com essa operação**,
mas `PrismaTenantThemeRepository` exige uma operação `READ_ACTIONABLE`. Os 20
testes passavam porque o fixture de tema aceitava qualquer operação; a página de
verdade respondia **400 `OPERATION_ACTION_FORBIDDEN`**.

Corrigido na ordem certa: o fixture passou a espelhar o repositório real (16
testes ficaram vermelhos), e só então a tela passou a pedir uma operação de
leitura própria — em vez de afrouxar o que o repositório aceita.

**A lição, para o ledger:** fixture mais permissiva que o adapter real esconde
exatamente a classe de defeito que a fatia introduz. Rodar a aplicação foi o que
achou; nenhum teste teria achado.

### 3. I-4 fechado

As duas guardas vazias por construção **saíram**, e no lugar ficou o invariante
que as tornava inalcançáveis: emissor único de `AuthorizedOperation`, montando
contexto e identidade da mesma referência, e nenhuma função exportada aceitando
`AuthorizedWalletContext`.

Três mutações foram aplicadas ao fonte e executadas — segundo emissor, contexto
montado de uma cópia do ator, função exportada recebendo contexto —, e cada uma
derruba exatamente o teste que a nomeia. Raciocínio e alternativas descartadas
no [ADR 026](../../../docs/decisions/026-guarda-inalcancavel-vira-invariante-de-emissor-unico.md).

Uma correção de premissa registrada: a afirmação "nenhuma função do módulo
aceita `AuthorizedWalletContext`" era **falsa** — `actorWithRuntimeGrant` aceita
uma. A propriedade verdadeira é mais estreita: nenhuma função **exportada**
aceita. Passagem interna é segura enquanto nada entra de fora.

### 4. Fontes, escopo e material de entrega

- `fontes.md` e `lgpd.md` ganharam **CENPROT e DataJud na tabela de base legal**,
  onde faltavam. Agora cada fonte que o enunciado nomeia tem as cinco coisas:
  entrega, acesso, custo, base legal e veredito. Uma tabela de cobertura no topo
  mapeia cada fonte do enunciado para onde ela está respondida.
- `limitacoes-v1.md` ganhou as duas **decisões de escopo** — por que a interface
  é fina e por que não há deploy — e o registro explícito de que **a coleta da
  PGFN nunca foi exercida contra a fonte viva**, com a tabela do que foi
  conferido contra export real e do que não foi (F-6).
- `docs/openapi.html`: contrato legível, autocontido, gerado por
  `pnpm generate:contracts` a partir do mesmo documento que o runtime valida.
  Sem CDN — um viewer de terceiro seria dependência nova pela porta dos fundos.
  **Publicar é decisão do dono do repositório e não foi feito nesta sessão.**

## Números

585 unitários (eram 534), lint e typecheck limpos, `generate:contracts` sem
deriva. As três telas conferidas rodando contra o Compose real.

## Pendências intocadas, por instrução

I-2, M-1, M-3, P-1 e C-1.
