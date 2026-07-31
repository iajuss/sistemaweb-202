# Task 2 report — domain primitives and versioned contracts

## Delivered files

- `packages/domain/src/money.ts`: `Money` stores cents as `bigint`; its only decimal input is an explicitly parsed string, never a `number`.
- `packages/domain/src/source-status.ts`: Zod enum and `SourceStatus` type with the four distinct source outcomes.
- `packages/domain/src/actor.ts` and `packages/domain/src/index.ts`: framework-free actor contract and package exports.
- `packages/contracts/src/dossier-schema.ts`: Zod-first provenance, field envelope, versioned dossier schemas, and compatibility gate.
- `packages/contracts/src/classification-schema.ts`: Zod-first classification schema with named, sourced signals.
- `packages/contracts/src/generate.ts`: writes JSON Schema and OpenAPI components exclusively via `z.toJSONSchema`.
- `packages/contracts/generated/dossier.schema.json` and `packages/contracts/generated/openapi.json`: generated artifacts.
- Tests: `money.test.ts`, `source-status.test.ts`, `schema-compatibility.test.ts`.

## TDD evidence

1. Added the three invariant test files before their production modules existed.
2. Red command:
   `pnpm --filter @panella/domain test -- money source-status; pnpm --filter @panella/contracts test -- schema-compatibility`
   failed because `./money.js`, `./source-status.js`, and `./dossier-schema.js` did not exist.
3. Implemented the minimum primitives and Zod schemas.
4. Green command:
   `pnpm --filter @panella/domain test -- money source-status; pnpm --filter @panella/contracts test -- schema-compatibility`
   passed: domain 5 tests in 3 files; contracts 1 test in 1 file.

## Generation debugging evidence

- Initial generator failure: top-level `await` was rejected because the contracts package was interpreted as CommonJS.
- Adding ESM package metadata exposed a second boundary: the domain package was still CommonJS and did not provide the named Zod export.
- After aligning both packages to ESM, the generator ran but its Windows main-module URL comparison did not trigger. Replacing the hand-built file URL with `pathToFileURL(process.argv[1]).href` fixed the root cause.
- `pnpm generate:contracts` then created `dossier.schema.json` (3411 bytes) and `openapi.json` (6781 bytes).

## Final verification

Executed from the isolated worktree:

```text
pnpm generate:contracts  # exit 0
pnpm test                # exit 0; domain 5/5 tests, contracts 1/1 test
pnpm lint                # exit 0
pnpm typecheck           # exit 0
git diff --check         # exit 0
```

## Commit

- `587d70f feat: add versioned domain contracts`

## Concerns

- Decimal strings with fractions beyond two digits are deliberately truncated toward zero, as required by the supplied `29163886.440000001 → 2916388644n` invariant; callers must supply a string, preserving the prohibition on float monetary values.
- `tsx` is a development dependency solely to run the TypeScript contract generator; generated artifacts remain checked in and ignored by lint/typecheck configuration.

## Review corrections (2026-07-30)

### TDD evidence

1. Added contract tests before changing production schemas.
2. Red command: `pnpm --filter @panella/contracts test -- schema-compatibility` failed 2/4 tests because a monetary envelope accepted `29163886.44` as a number and `ClassificationSchema` accepted a payload without `cobertura` or `confianca_global`.
3. Replaced the unconstrained `valor` with strict, discriminated field envelopes. `MONETARIO_CENTAVOS` accepts only an integer-cents string; text, boolean, datetime, text-list and empty values retain explicit non-monetary representations.
4. Added required `cobertura` and `[0, 1]` `confianca_global` to the strict classification contract. `DossierSchema` and its envelopes are now strict; the fixture proves that adding a named field is accepted while removing a required structural field requires a major schema version.
5. Green command: `pnpm --filter @panella/contracts test -- schema-compatibility` passed 4/4 tests. `pnpm generate:contracts` regenerated both artifacts, whose OpenAPI output contains `MONETARIO_CENTAVOS`, `cobertura` and `confianca_global`.

### Commit

- `9eb1063 fix: harden versioned contract schemas`

## Review corrections â€” round 2 (2026-07-30)

### Root-cause investigation

1. `ClassificationSchema` was a single strict object in which `category` and
   `cobertura` were validated independently. Consequently,
   `cobertura: "INSUFICIENTE"` combined with an operational category was valid;
   no Zod branch expressed the required outcome.
2. `assertSchemaCompatibility` called `DossierSchema.safeParse(candidate)`, but
   on failure it validated only the candidate's `schema_version`. A valid major
   version such as `2.0.0` then returned early, bypassing the structural
   validation failure.

### TDD RED

Before production changes, `packages/contracts/src/schema-compatibility.test.ts`
was adjusted with two focused regressions:

- An incomplete candidate with `schema_version: "2.0.0"` must throw
  `BREAKING_SCHEMA_CHANGE_REQUIRES_MAJOR_VERSION`.
- A classification with `cobertura: "INSUFICIENTE"` and
  `category: "TRATAMENTO_LEVE"` must fail, while the same payload with
  `category: "DADOS_INSUFICIENTES"` must pass.

Command and observed RED output:

```text
pnpm --filter @panella/contracts test -- schema-compatibility
FAIL src/schema-compatibility.test.ts (5 tests | 2 failed)
  expected [Function] to throw an error
  expected true to be false
Exit status 1
```

### Minimal production correction

- Replaced the unconstrained classification combination with a Zod union of two
  strict branches: sufficient coverage accepts any non-empty category;
  insufficient coverage requires the `DADOS_INSUFICIENTES` literal. The
  regenerated OpenAPI now represents this rule as `anyOf`, rather than relying
  on a handwritten generated artifact.
- Changed `assertSchemaCompatibility` to throw immediately when the complete
  candidate fails `DossierSchema.safeParse`. Version comparison now occurs only
  after Zod has accepted the complete payload.

Money and source-state contracts were not changed. Their focused tests continue
to prove that `Money` rejects `number` input and that all four source statuses
remain distinct.

### GREEN and final verification

```text
pnpm --filter @panella/contracts test -- schema-compatibility
PASS 1 file, 5 tests

pnpm --filter @panella/domain test -- money source-status
PASS 3 files, 5 tests

pnpm generate:contracts
PASS (OpenAPI regenerated from Zod schemas)

pnpm test
PASS (domain 5/5; contracts 5/5; other workspaces have no test files)

pnpm lint
PASS (exit 0)

pnpm typecheck
PASS (exit 0)

git diff --check
PASS (exit 0)
```

### Files modified in this round

- `packages/contracts/src/classification-schema.ts`
- `packages/contracts/src/dossier-schema.ts`
- `packages/contracts/src/schema-compatibility.test.ts`
- `packages/contracts/generated/openapi.json` (via `pnpm generate:contracts`)
- `.superpowers/sdd/2026-07-29-motor-dossie-triagem/task-2-report.md`

### Concerns

- No product-contract concerns remain for these two findings. The existing,
  unrelated modification to `.superpowers/sdd/2026-07-29-motor-dossie-triagem/progress.md`
  was left untouched.
- No commit was made, per the repository rule requiring explicit user approval.

## Review correction — round 3 (2026-07-30)

### Root-cause diagnosis

`Money.fromCents` declared its parameter as `bigint` only at compile time and
forwarded it directly to the private constructor. JavaScript callers can bypass
that annotation, so `Money.fromCents(123 as unknown as bigint)` constructed an
instance that stored and returned a `number`. This contradicted the absolute
money invariant. `Money.fromDecimalString` already had the corresponding
runtime-type validation pattern.

### TDD RED

Before editing production code, added this focused regression to
`packages/domain/src/money.test.ts`:

```ts
it("rejects number inputs passed to fromCents at runtime", () => {
  expect(() => Money.fromCents(123 as unknown as bigint)).toThrow(TypeError);
});
```

Command and observed RED output:

```text
pnpm --filter @panella/domain test -- money
FAIL src/money.test.ts (3 tests | 1 failed)
Money > rejects number inputs passed to fromCents at runtime
expected function to throw an error, but it didn't
Exit status 1
```

### Minimal production correction

Added a runtime guard in `Money.fromCents`:

```ts
if (typeof cents !== "bigint") {
  throw new TypeError("MONEY_CENTS_MUST_BE_A_BIGINT");
}
```

Valid `bigint` inputs continue unchanged to the existing private constructor;
no decimal parsing, source-status, classification, or Zod contract behavior was
modified.

### GREEN and verification

```text
pnpm --filter @panella/domain test -- money source-status
PASS 3 files, 6 tests

pnpm test
PASS: domain 6/6; contracts 5/5; remaining workspaces have no test files

pnpm lint
PASS (exit 0)

pnpm typecheck
PASS (exit 0)

git diff --check
PASS (exit 0; only Git LF-to-CRLF informational warnings)
```

### Files modified in this round

- `packages/domain/src/money.test.ts`
- `packages/domain/src/money.ts`
- `.superpowers/sdd/2026-07-29-motor-dossie-triagem/task-2-report.md`

### Concerns

- No remaining concern identified for the reported runtime `number` path.
- The pre-existing unrelated modification to
  `.superpowers/sdd/2026-07-29-motor-dossie-triagem/progress.md` remains
  untouched.
- No commit was made; the repository requires explicit user authorization.
