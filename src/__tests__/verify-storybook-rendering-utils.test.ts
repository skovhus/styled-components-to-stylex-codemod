import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONCURRENCY,
  normalizeConcurrency,
} from "../../scripts/verify-storybook-rendering-utils.mts";

describe("normalizeConcurrency", () => {
  it("preserves valid positive integer values", () => {
    expect(normalizeConcurrency(1)).toBe(1);
    expect(normalizeConcurrency(8)).toBe(8);
  });

  it("falls back for zero, negatives, and non-integers", () => {
    expect(normalizeConcurrency(0)).toBe(DEFAULT_CONCURRENCY);
    expect(normalizeConcurrency(-1)).toBe(DEFAULT_CONCURRENCY);
    expect(normalizeConcurrency(2.5)).toBe(DEFAULT_CONCURRENCY);
  });

  it("falls back for NaN and infinity", () => {
    expect(normalizeConcurrency(Number.NaN)).toBe(DEFAULT_CONCURRENCY);
    expect(normalizeConcurrency(Number.POSITIVE_INFINITY)).toBe(DEFAULT_CONCURRENCY);
  });

  it("supports overriding the fallback value", () => {
    expect(normalizeConcurrency(0, 3)).toBe(3);
  });
});
