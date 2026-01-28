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

  it("defineAdapter: throws a helpful message when resolveSelector is missing", () => {
    expect(() =>
      defineAdapter({
        resolveValue() {
          return null;
        },
        resolveCall() {
          return null;
        },
      } as any),
    ).toThrowError(/resolveSelector/);
  });

  it("defineAdapter: throws a helpful message when externalInterface is missing", () => {
    expect(() =>
      defineAdapter({
        resolveValue() {
          return null;
        },
        resolveCall() {
          return null;
        },
        resolveSelector() {
          return undefined;
        },
      } as any),
    ).toThrowError(/externalInterface/);
  });

  it("defineAdapter: throws a helpful message when resolveCall is missing", () => {
    expect(() => defineAdapter({ resolveValue() {}, externalInterface() {} } as any)).toThrowError(
      /resolveCall/,
    );
  });

  it("defineAdapter: throws a helpful message when externalInterface is not a function", () => {
    expect(() =>
      defineAdapter({
        resolveValue() {
          return null;
        },
        resolveCall() {
          return null;
        },
        resolveSelector() {
          return undefined;
        },
        externalInterface: "nope",
      } as any),
    ).toThrowError(/externalInterface/);
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
