import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { ClassificationSchema } from "./classification-schema.js";
import { DossierSchema } from "./dossier-schema.js";

const GENERATED_DIRECTORY = resolve(import.meta.dirname, "../generated");

export async function generateContracts(): Promise<void> {
  const dossierSchema = z.toJSONSchema(DossierSchema, { target: "draft-2020-12" });
  const classificationSchema = z.toJSONSchema(ClassificationSchema, { target: "draft-2020-12" });
  const openApi = {
    openapi: "3.1.0",
    info: { title: "Dossier triage contracts", version: "1.0.0" },
    components: { schemas: { Dossier: dossierSchema, Classification: classificationSchema } },
  };

  await mkdir(GENERATED_DIRECTORY, { recursive: true });
  await Promise.all([
    writeFile(resolve(GENERATED_DIRECTORY, "dossier.schema.json"), `${JSON.stringify(dossierSchema, null, 2)}\n`),
    writeFile(resolve(GENERATED_DIRECTORY, "openapi.json"), `${JSON.stringify(openApi, null, 2)}\n`),
  ]);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateContracts();
}
