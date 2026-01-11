import { describe, it, expect } from "vitest";
import { defineAdapter } from "../adapter.js";
import { runTransform } from "../run.js";

describe("public API runtime validation (DX)", () => {
  it("defineAdapter: throws a helpful message when adapter is missing", () => {
    expect(() => defineAdapter(undefined as any)).toThrowError(/defineAdapter\(adapter\)/);
    expect(() => defineAdapter(undefined as any)).toThrowError(/resolveValue/);
  });

  it("defineAdapter: throws a helpful message when resolveValue is not a function", () => {
    expect(() => defineAdapter({ resolveValue: 123 } as any)).toThrowError(/resolveValue/);
    expect(() => defineAdapter({ resolveValue: 123 } as any)).toThrowError(/must be a function/);
  });

  it("defineAdapter: throws a helpful message when shouldSupportExternalStyling is missing", () => {
    expect(() => defineAdapter({ resolveValue() {} } as any)).toThrowError(
      /shouldSupportExternalStyling/,
    );
  });

  it("defineAdapter: throws a helpful message when shouldSupportExternalStyling is not a function", () => {
    expect(() =>
      defineAdapter({ resolveValue() {}, shouldSupportExternalStyling: "nope" } as any),
    ).toThrowError(/shouldSupportExternalStyling/);
  });

  it("runTransform: throws a helpful message when options is missing", async () => {
    await expect(runTransform(undefined as any)).rejects.toThrowError(/runTransform\(options\)/);
    await expect(runTransform(undefined as any)).rejects.toThrowError(/Example \(plain JS\)/);
  });

  it("runTransform: throws a helpful message when files is missing", async () => {
    await expect(runTransform({ adapter: {} } as any)).rejects.toThrowError(/`files` is required/);
  });

  it("runTransform: throws a helpful message when adapter is missing", async () => {
    await expect(runTransform({ files: "src/**/*.tsx" } as any)).rejects.toThrowError(
      /expected an adapter object/i,
    );
  });
});
