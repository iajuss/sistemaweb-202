# Imposição runtime de dinheiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as fronteiras monetárias da Task 2 sem permitir `number` ou
ambiguidade entre centavos e decimal.

**Architecture:** O domínio cria `Money` opaco apenas por fábricas estritas.
Zod valida centavos serializados antes da conversão; o normalizador de arquivos
é adapter separado e entrega decimal canônico ao domínio.

**Tech Stack:** TypeScript strict, Zod, Vitest e ESLint flat config.

## Global Constraints

- Dinheiro usa `bigint` ou string validada; `number` é proibido em toda
  fronteira monetária.
- Gramáticas são ancoradas e disjuntas: centavos `^-?\d+$`; decimal
  `^-?\d+\.\d{2}$`.
- Zod é a única fonte de verdade para schema runtime e contrato serializado.
- Nenhum teste toca rede; quinto defeito distinto da Task 2 interrompe a tarefa.

---

### Task 1: Valor monetário, schema e normalizador de fronteira

**Files:**
- Modify: `packages/domain/src/money.ts`, `packages/domain/src/index.ts`, `packages/domain/src/money.test.ts`
- Modify: `packages/contracts/src/dossier-schema.ts`, `packages/contracts/src/schema-compatibility.test.ts`
- Create: `packages/adapters/src/money-normalizer.ts`, `packages/adapters/src/money-normalizer.test.ts`
- Modify: `eslint.config.mjs`

**Interfaces:** Produces `Money.fromCents(bigint)`,
`Money.fromDecimalString(string)`, `SerializedCentsSchema`,
`parseSerializedCents(unknown): Money`, and
`normalizeSpreadsheetMoney(raw: string): string`.

- [ ] **Step 1: Write failing boundary tests**

Add parameterized tests that pass `number`, `string`, `null` and float to
`fromCents`; pass `number`, `null`, integer-centavos string, whitespace,
exponential notation and one-decimal input to `fromDecimalString`; and pass
`number`, `null`, float and decimal to `parseSerializedCents`. Add the explicit
overlap test: `"123456"` parses only as centavos and `"1234.56"` only as
decimal, with a comment explaining the 100× call-site risk.

- [ ] **Step 2: Run red tests**

Run: `pnpm --filter @panella/domain test -- money && pnpm --filter @panella/contracts test -- schema-compatibility`

Expected: the old decimal grammar accepts a non-canonical input or the schema
does not return `Money` after a serialized-centavos parse.

- [ ] **Step 3: Implement the smallest strict boundary**

Make the `Money` class nominal with an inaccessible constructor and private
brand. Require `bigint` in `fromCents`; require `^-?\d+\.\d{2}$` in
`fromDecimalString`. Export one Zod string schema for serialized cents and a
parser derived from it that creates `Money`. Reuse the serial schema in the
dossier monetary envelope. Implement the adapter normalizer for `1.234,56`,
`1234,56` and `1234` to emit canonical two-place decimal without `Number`.
Add scoped ESLint selectors that ban TypeScript `number` and `z.number()` in
the designated monetary modules.

- [x] **Step 4: Verify**

Run: `pnpm generate:contracts && pnpm test && pnpm lint && pnpm typecheck && git diff --check`

Expected: all boundaries reject `number`; generated schemas keep the serialized
centavos grammar; no monetary module contains prohibited numeric APIs.

- [x] **Step 5: Commit**

```bash
git add packages/domain packages/contracts packages/adapters eslint.config.mjs
git commit -m "feat: enforce monetary runtime boundaries"
```

### Task 2: Brief acceptance criteria and invariant evidence

**Files:**
- Modify: `C:/Users/damaz/.codex/plugins/cache/openai-curated-remote/superpowers/6.2.0/skills/subagent-driven-development/scripts/task-brief`
- Modify: `AGENTS.md`, `docs/decisions/019-imposicao-runtime-de-invariantes-monetarios.md`

**Interfaces:** A generated brief ends with `## Acceptance criteria from
AGENTS.md` and fails generation when a task has no explicit applicable list.

- [ ] **Step 1: Write a generator fixture/test or reproducible shell case**

Create a temporary synthetic plan containing an `Acceptance criteria from
AGENTS.md` section and verify the generated brief retains it; verify a task
without the section exits non-zero with an actionable message.

- [ ] **Step 2: Run red case**

Run the current `task-brief` against the synthetic task without acceptance
criteria; record that it currently succeeds.

- [ ] **Step 3: Make acceptance criteria mandatory**

Change the generator to extract the task only when it includes the named
section, preserve the section verbatim and emit a failure otherwise. Add an
explicit applicable-invariants section to Tasks 3, 6 and 7 of the active plan
before their briefs are generated.

- [ ] **Step 4: Verify**

Run the generator for Task 3 and inspect that its brief names tenant isolation,
CPF handling, closed monetary boundaries where applicable and testable runtime
acceptance criteria.

### Task 3: Fábricas públicas sobre valor monetário inacessível

**Files:**
- Modify: `packages/domain/src/money.ts`, `packages/domain/src/money.test.ts`, `packages/domain/src/index.ts`
- Modify: `docs/decisions/019-imposicao-runtime-de-invariantes-monetarios.md`, `docs/design/2026-07-30-imposicao-runtime-dinheiro.md`

**Interfaces:** Exports the type `Money` and an object `Money` containing
`fromCents`, `fromDecimalString` and a runtime assertion for trusted values;
the implementation class is module-private and never exported.

- [x] **Step 1: Write failing closure tests**

Assert at runtime that the exported `Money` value is not constructible and that
a forged object or `Object.create`d implementation prototype is rejected by the
public boundary assertion. Preserve factory and serialized-centavos behavior.

- [x] **Step 2: Run red tests**

Run: `pnpm --filter @panella/domain test -- money`

Expected: the current exported class remains constructible from JavaScript or
the forged object passes the boundary assertion.

- [x] **Step 3: Implement runtime closure**

Keep the implementation class private to `money.ts`. Export only a type alias
and frozen factory object. Store an ECMAScript private `#brand`; use its private
brand check in the exported assertion so a same-shape forged object fails. Do
not export a constructor, implementation class or structural conversion route.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm lint && pnpm typecheck && git diff --check`

Expected: the only runtime construction route is through named factories and
the existing monetary grammar/invariants remain green.

- [ ] **Step 5: Commit**

```bash
git add packages/domain docs/decisions/019-imposicao-runtime-de-invariantes-monetarios.md docs/design/2026-07-30-imposicao-runtime-dinheiro.md
git commit -m "fix: close monetary construction at runtime"
```
