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
});
