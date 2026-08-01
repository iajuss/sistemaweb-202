import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GENERATED_ARTIFACTS } from "./generated-artifacts.js";

/**
 * The discipline for a file that is generated from code and committed.
 *
 * This exists because of a defect that only appeared in CI: the wallet example
 * was generated with CRLF, git stores it as LF, and the test comparing the two
 * passed on Windows — where the checkout had been rewritten to CRLF — and
 * failed on Linux. The repository already documented that exact trap for
 * `packages/contracts/generated/**`, and two new artefacts slipped past it.
 *
 * So the rule is asserted per artefact rather than per path in a comment:
 *
 * - the committed bytes equal what the generator produces **today**, which is
 *   what makes drift loud instead of silent;
 * - the path carries `eol=lf`, without which the first assertion holds on one
 *   operating system and fails on the other.
 *
 * A new generated file is covered by being added to `GENERATED_ARTIFACTS`.
 */

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..");

function gitAttribute(path: string, attribute: string): string {
  // `git check-attr` is the only honest answer to "what will git do to this
  // file", because it applies the same precedence rules git itself applies.
  const output = execFileSync(
    "git",
    ["check-attr", attribute, "--", path],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  );
  return output.trim().split(": ").at(-1) ?? "";
}

describe.each(GENERATED_ARTIFACTS.map((artifact) => [artifact.path, artifact] as const))(
  "%s",
  (path, artifact) => {
    it("is committed, so the repository does not depend on someone running a generator", () => {
      expect(existsSync(resolve(REPOSITORY_ROOT, path))).toBe(true);
    });

    it("matches what its generator produces right now", () => {
      // Read as bytes and compared as text: a difference of line endings is a
      // difference, and pretending otherwise is what hid the original defect.
      const committed = readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");

      expect(committed).toBe(artifact.content());
    });

    it("is pinned to LF, so the check above holds on every platform", () => {
      // Without this, autocrlf rewrites the working copy on Windows and the
      // comparison above passes or fails depending on the operating system —
      // which is a test that reports the platform, not the code.
      expect(gitAttribute(path, "eol")).toBe("lf");
    });

    it("carries no CRLF in what the generator emits", () => {
      // The other half of the same rule: the attribute governs the checkout,
      // this governs the generator. Both have to agree or the two disagree on
      // the first regeneration.
      expect(artifact.content()).not.toContain("\r\n");
    });
  },
);

describe("the list itself", () => {
  it("covers every artefact the contract generator writes", async () => {
    // The generator declares what it writes; this list must not fall behind.
    const { CONTRACT_ARTIFACTS } = await import("@panella/contracts");
    const listed = new Set(GENERATED_ARTIFACTS.map((artifact) => artifact.path));

    for (const artifact of CONTRACT_ARTIFACTS) {
      expect(listed).toContain(artifact.path);
    }
  });

  it("names paths relative to the repository, the way .gitattributes does", () => {
    for (const artifact of GENERATED_ARTIFACTS) {
      expect(artifact.path.startsWith("/")).toBe(false);
      expect(artifact.path).not.toContain("\\");
    }
  });
});
