import { describe, expect, it } from "vitest";
import { collectCompoundVariantKeys } from "../internal/emit-wrappers/emit-intrinsic-helpers.js";

describe("collectCompoundVariantKeys", () => {
  const threeBranch = {
    kind: "3branch" as const,
    outerProp: "disabled",
    outerTruthyKey: "cardContainerDisabled",
    innerProp: "checked",
    innerTruthyKey: "cardContainerCheckedTrue",
    innerFalsyKey: "cardContainerCheckedFalse",
  };

  const fourBranch = {
    kind: "4branch" as const,
    outerProp: "active",
    innerProp: "highlighted",
    outerTruthyInnerTruthyKey: "k1",
    outerTruthyInnerFalsyKey: "k2",
    outerFalsyInnerTruthyKey: "k3",
    outerFalsyInnerFalsyKey: "k4",
  };

  it("returns all when-keys by default", () => {
    const keys = collectCompoundVariantKeys([threeBranch]);
    expect(keys).toEqual(new Set(["disabled", "checkedTrue", "checkedFalse"]));
  });

  it("returns only synthetic when-keys with syntheticOnly for 3-branch", () => {
    const keys = collectCompoundVariantKeys([threeBranch], { syntheticOnly: true });
    // "disabled" is a real prop name and must NOT be included
    expect(keys).toEqual(new Set(["checkedTrue", "checkedFalse"]));
    expect(keys.has("disabled")).toBe(false);
  });

  it("returns all keys for 4-branch regardless of syntheticOnly (all are synthetic)", () => {
    const allKeys = collectCompoundVariantKeys([fourBranch]);
    const syntheticKeys = collectCompoundVariantKeys([fourBranch], { syntheticOnly: true });
    expect(syntheticKeys).toEqual(allKeys);
    expect(syntheticKeys).toEqual(
      new Set([
        "active_highlighted",
        "active_!highlighted",
        "!active_highlighted",
        "!active_!highlighted",
      ]),
    );
  });

  it("handles mixed 3-branch and 4-branch", () => {
    const keys = collectCompoundVariantKeys([threeBranch, fourBranch], { syntheticOnly: true });
    // "disabled" must not be present (it's a real prop from 3-branch)
    expect(keys.has("disabled")).toBe(false);
    expect(keys.has("checkedTrue")).toBe(true);
    expect(keys.has("active_highlighted")).toBe(true);
  });
});
