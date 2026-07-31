import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { DossierSchema } from "./dossier-schema.js";
import { buildOpenApiDocument } from "./openapi.js";

const GENERATED_DIRECTORY = resolve(import.meta.dirname, "../generated");

export async function generateContracts(): Promise<void> {
  const dossierSchema = z.toJSONSchema(DossierSchema, { target: "draft-2020-12" });
  // Operations and their request shapes come from the same Zod objects the
  // runtime validates against; nothing here is written by hand twice.
  const openApi = buildOpenApiDocument();

  await mkdir(GENERATED_DIRECTORY, { recursive: true });
  await Promise.all([
    writeFile(resolve(GENERATED_DIRECTORY, "dossier.schema.json"), `${JSON.stringify(dossierSchema, null, 2)}\n`),
    writeFile(resolve(GENERATED_DIRECTORY, "openapi.json"), `${JSON.stringify(openApi, null, 2)}\n`),
  ]);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateContracts();
}
