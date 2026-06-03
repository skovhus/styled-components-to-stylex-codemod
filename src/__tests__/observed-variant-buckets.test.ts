import { describe, it, expect } from "vitest";
import { resolveObservedVariantValues } from "../internal/lower-rules/observed-variant-buckets.js";
import type { ComponentPropUsageInfo } from "../internal/transform-types.js";

function usageWith(values: Array<string | number>, omittedCount: number): ComponentPropUsageInfo {
  return {
    componentName: "Badge",
    usageCount: values.length + omittedCount,
    hasUnknownUsage: false,
    props: {
      tone: { values, hasUnknown: false, usageCount: values.length, omittedCount },
    },
  };
}

describe("resolveObservedVariantValues", () => {
  const base = {
    usage: usageWith(["red", "blue"], 1),
    propName: "tone",
    isOptional: true,
    isExported: false,
    escapesAsValue: false,
  };

  it("returns observed values for a private optional prop with omissions", () => {
    expect(resolveObservedVariantValues(base)).toEqual(["red", "blue"]);
  });

  it("bails for exported components (unobserved call sites would lose styling)", () => {
    // No runtime fallback is emitted, so exported components — renderable by callers we never
    // observe — must not be bucketed.
    expect(resolveObservedVariantValues({ ...base, isExported: true })).toBeNull();
  });

  it("bails when the component escapes as a value (a host may render unobserved props)", () => {
    expect(resolveObservedVariantValues({ ...base, escapesAsValue: true })).toBeNull();
  });

  it("bails for required props and when the prop is never omitted", () => {
    expect(resolveObservedVariantValues({ ...base, isOptional: false })).toBeNull();
    expect(
      resolveObservedVariantValues({ ...base, usage: usageWith(["red", "blue"], 0) }),
    ).toBeNull();
  });
});
