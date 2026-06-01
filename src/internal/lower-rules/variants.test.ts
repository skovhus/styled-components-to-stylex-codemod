import { describe, expect, it } from "vitest";
import { groupVariantBucketsIntoDimensions } from "./variants.js";

describe("groupVariantBucketsIntoDimensions", () => {
  it("keeps mixed guarded and unguarded variants as conditional buckets", () => {
    const variantBuckets = new Map<string, Record<string, unknown>>([
      ['show(color) && color === "blue"', { color: "blue" }],
      ['color === "red"', { color: "red" }],
    ]);
    const variantStyleKeys = {
      'show(color) && color === "blue"': "badgeColorBlue",
      'color === "red"': "badgeColorRed",
    };

    const result = groupVariantBucketsIntoDimensions(variantBuckets, variantStyleKeys, "badge", {});

    expect(result.dimensions).toEqual([]);
    expect([...result.remainingBuckets.keys()]).toEqual([
      'show(color) && color === "blue"',
      'color === "red"',
    ]);
    expect(result.remainingStyleKeys).toEqual(variantStyleKeys);
  });

  it("groups simple boolean guarded variants into a guarded dimension", () => {
    const variantBuckets = new Map<string, Record<string, unknown>>([
      ['active && color === "blue"', { backgroundColor: "blue" }],
      ['active && color === "red"', { backgroundColor: "red" }],
    ]);
    const variantStyleKeys = {
      'active && color === "blue"': "badgeColorBlue",
      'active && color === "red"': "badgeColorRed",
    };

    const result = groupVariantBucketsIntoDimensions(variantBuckets, variantStyleKeys, "badge", {});

    expect(result.dimensions).toHaveLength(1);
    const dim = result.dimensions[0];
    expect(dim?.propName).toBe("color");
    expect(dim?.conditionWhen).toBe("active");
    expect(Object.keys(dim?.variants ?? {})).toEqual(["blue", "red"]);
    expect(result.remainingBuckets.size).toBe(0);
  });

  it("keeps simple boolean guarded and unguarded mixed variants as remaining buckets", () => {
    const variantBuckets = new Map<string, Record<string, unknown>>([
      ['active && color === "blue"', { backgroundColor: "blue" }],
      ['color === "red"', { backgroundColor: "red" }],
    ]);
    const variantStyleKeys = {
      'active && color === "blue"': "badgeColorBlue",
      'color === "red"': "badgeColorRed",
    };

    const result = groupVariantBucketsIntoDimensions(variantBuckets, variantStyleKeys, "badge", {});

    expect(result.dimensions).toEqual([]);
    expect([...result.remainingBuckets.keys()]).toEqual([
      'active && color === "blue"',
      'color === "red"',
    ]);
  });

  it("does not create namespace dimensions for guarded buckets with boolean overlap", () => {
    const variantBuckets = new Map<string, Record<string, unknown>>([
      ['isShown(size) && size === "lg"', { padding: "16px" }],
      ['isShown(size) && size === "sm"', { padding: "8px" }],
      ["disabled", { padding: "0" }],
    ]);
    const variantStyleKeys = {
      'isShown(size) && size === "lg"': "sizeLg",
      'isShown(size) && size === "sm"': "sizeSm",
      disabled: "disabled",
    };

    const result = groupVariantBucketsIntoDimensions(
      variantBuckets,
      variantStyleKeys,
      "button",
      {},
    );

    // Guarded dimensions with boolean overlap should create a simple guarded dimension,
    // NOT namespace dimensions. The boolean bucket should remain.
    expect(result.dimensions).toHaveLength(1);
    const dim = result.dimensions[0];
    expect(dim?.propName).toBe("size");
    expect(dim?.conditionWhen).toBe("isShown(size)");
    expect(dim?.namespaceBooleanProp).toBeUndefined();
    expect([...result.remainingBuckets.keys()]).toEqual(["disabled"]);
  });
});
