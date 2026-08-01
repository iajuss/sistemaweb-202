import { CONTRACT_ARTIFACTS, type GeneratedArtifact } from "@panella/contracts";

import { exampleWalletCsv } from "../../../packages/adapters/src/wallet-importers/columns.js";

/**
 * Every file in this repository that is generated from code and committed.
 *
 * **Why the list lives here.** It is the only place that may see all of them
 * without inverting a dependency: `contracts` generates three of them and must
 * not import `adapters` to reach the fourth. This package already depends on
 * both, and its tests run under `pnpm test`, which is what CI runs.
 *
 * **Why a list at all.** Two of these artefacts were added without the
 * `eol=lf` rule the repository already documents for
 * `packages/contracts/generated/**`, and CI went red on a line ending. Naming
 * the two offenders in `.gitattributes` would fix those two and leave the
 * third to repeat it. So the property is asserted per entry instead, and a new
 * generated file inherits the check by being added here — the same shape as
 * the architectural test that enumerates the repository classes.
 */
export const GENERATED_ARTIFACTS: readonly GeneratedArtifact[] = Object.freeze([
  ...CONTRACT_ARTIFACTS,
  Object.freeze({
    path: "docs/exemplo-carteira.csv",
    content: exampleWalletCsv,
  }),
]);
