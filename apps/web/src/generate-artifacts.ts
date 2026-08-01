import { writeArtifacts } from "@panella/contracts";

import { GENERATED_ARTIFACTS } from "./generated-artifacts.js";

/**
 * Writes every generated artefact, including the ones that do not belong to a
 * single package. The wallet example had no regeneration command at all until
 * this existed — it was produced once by hand, which is how a generated file
 * quietly becomes a hand-maintained one.
 */
await writeArtifacts(GENERATED_ARTIFACTS);
