import { describe, expect, it } from "vitest";

import * as maskModule from "./mask.js";
import { isMaskCompatibleWithCpf, parseCpfMask } from "./mask.js";

// 529.982.247-25 masked the way the PGFN publishes it: positions 4 to 9.
const CPF = "52998224725";
const MASK = "***.982.247-**";

describe("parseCpfMask", () => {
  it.each([
    ["***.982.247-**", "982247"],
    ["***982247**", "982247"],
    ["***.982.247-**  ", "982247"],
  ])("reads the revealed positions of %s", (raw, fragment) => {
    expect(parseCpfMask(raw)?.fragment).toBe(fragment);
  });

  it.each([
    ["529.982.247-25", "a full CPF, which a masked field never carries"],
    ["***.98.247-**", "too few revealed digits"],
    ["***.982.24X-**", "a non-digit in a revealed position"],
    ["", "an empty cell"],
  ])("refuses %s (%s)", (raw) => {
    expect(parseCpfMask(raw)).toBeNull();
  });
});

describe("isMaskCompatibleWithCpf", () => {
  it("accepts a mask whose revealed positions match the wallet CPF", () => {
    expect(isMaskCompatibleWithCpf(MASK, CPF)).toBe(true);
  });

  it("rejects a mask revealing different positions", () => {
    expect(isMaskCompatibleWithCpf("***.111.222-**", CPF)).toBe(false);
  });

  it("rejects an unreadable mask instead of treating it as a match", () => {
    expect(isMaskCompatibleWithCpf("nao-informado", CPF)).toBe(false);
  });

  it("is compatibility, never proof: two CPFs can share one mask", () => {
    // 10^5 CPFs share any given fragment. Compatibility narrows the candidate
    // set; it is the name ranking that decides, and neither is a fact on its
    // own. A mask that "matches" is not an identity.
    const sameFragment = "12398224712";

    expect(isMaskCompatibleWithCpf(MASK, CPF)).toBe(true);
    expect(isMaskCompatibleWithCpf(MASK, sameFragment)).toBe(true);
  });

  it("exposes no way to go from a mask to a person", () => {
    // AGENTS.md: identity is verification, never discovery. Every exported
    // function needs a full CPF from an authorized wallet as an input; none
    // takes a mask alone and answers with candidates.
    expect(Object.keys(maskModule).sort()).toEqual([
      "isMaskCompatibleWithCpf",
      "parseCpfMask",
    ]);
  });
});
