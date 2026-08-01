import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { DossierSchema } from "./dossier-schema.js";
import { buildOpenApiDocument } from "./openapi.js";
import { renderOpenApiPage } from "./openapi-page.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..");

/**
 * Every artefact this package generates, declared once, as content rather than
 * as a side effect.
 *
 * Declaring them this way is what lets something other than the writer check
 * them: a test can compare the committed file against `content()` without
 * running the generator, and the line-ending rule can be asserted per path.
 * A generator that only wrote files could be verified only by running it and
 * diffing, which is what CI does — and CI is the last place a defect should
 * first be seen.
 */
export interface GeneratedArtifact {
  /** Repository-relative, because that is how `.gitattributes` names it. */
  readonly path: string;
  content(): string;
}

export const CONTRACT_ARTIFACTS: readonly GeneratedArtifact[] = Object.freeze([
  Object.freeze({
    path: "packages/contracts/generated/dossier.schema.json",
    content: () =>
      `${JSON.stringify(z.toJSONSchema(DossierSchema, { target: "draft-2020-12" }), null, 2)}\n`,
  }),
  Object.freeze({
    path: "packages/contracts/generated/openapi.json",
    // Operations and their request shapes come from the same Zod objects the
    // runtime validates against; nothing here is written by hand twice.
    content: () => `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`,
  }),
  Object.freeze({
    // Delivery material rather than a contract file, and generated for the
    // same reason: a contract page written by hand beside the code drifts.
    path: "docs/openapi.html",
    content: () => renderOpenApiPage(buildOpenApiDocument()),
  }),
]);

export async function writeArtifacts(
  artifacts: readonly GeneratedArtifact[],
): Promise<void> {
  for (const artifact of artifacts) {
    const target = resolve(REPOSITORY_ROOT, artifact.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, artifact.content(), "utf8");
  }
}

export async function generateContracts(): Promise<void> {
  await writeArtifacts(CONTRACT_ARTIFACTS);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateContracts();
}
