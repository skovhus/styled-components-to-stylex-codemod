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

  it("defineAdapter: throws a helpful message when externalInterface is not a function or 'auto'", () => {
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
    ).toThrowError(/"auto"/);
  });

  it("defineAdapter: accepts externalInterface 'auto' without throwing", () => {
    expect(() =>
      defineAdapter({
        resolveValue() {
          return undefined;
        },
        resolveCall() {
          return undefined;
        },
        resolveSelector() {
          return undefined;
        },
        externalInterface: "auto",
        styleMerger: null,
      }),
    ).not.toThrow();
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

  it('runTransform: throws when externalInterface is "auto" but consumerPaths is not set', async () => {
    const adapter = {
      resolveValue: () => undefined,
      resolveCall: () => undefined,
      resolveSelector: () => undefined,
      externalInterface: "auto" as const,
      styleMerger: null,
    };
    await expect(
      runTransform({ files: "src/__tests__/fixtures/**/*.tsx", adapter }),
    ).rejects.toThrowError(/consumerPaths is not set/);
  });

  it("runTransform: throws when consumerPaths matches no files", async () => {
    const adapter = {
      resolveValue: () => undefined,
      resolveCall: () => undefined,
      resolveSelector: () => undefined,
      externalInterface: "auto" as const,
      styleMerger: null,
    };
    await expect(
      runTransform({
        files: "src/__tests__/fixtures/**/*.tsx",
        consumerPaths: "nonexistent-dir-xyz/**/*.tsx",
        adapter,
      }),
    ).rejects.toThrowError(/consumerPaths matched no files/);
  });
});
