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
  const base = { usage: usageWith(["red", "blue"], 1), propName: "tone", isOptional: true };

  it("returns observed values for a private optional prop with omissions", () => {
    expect(resolveObservedVariantValues({ ...base, isExported: false })).toEqual(["red", "blue"]);
  });

  it("bails for exported components (unobserved call sites would lose styling)", () => {
    // No runtime fallback is emitted, so exported components — renderable by callers we never
    // observe — must not be bucketed.
    expect(resolveObservedVariantValues({ ...base, isExported: true })).toBeNull();
  });

  it("bails for required props and when the prop is never omitted", () => {
    expect(
      resolveObservedVariantValues({ ...base, isExported: false, isOptional: false }),
    ).toBeNull();
    expect(
      resolveObservedVariantValues({
        usage: usageWith(["red", "blue"], 0),
        propName: "tone",
        isOptional: true,
        isExported: false,
      }),
    ).toBeNull();
  });
});
