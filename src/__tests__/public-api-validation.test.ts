import { describe, it, expect } from "vitest";
import {
  describeValue,
  assertValidAdapter,
  assertValidAdapterInput,
} from "../internal/public-api-validation.js";

describe("describeValue", () => {
  it("produces human-readable descriptions for all JS types", () => {
    expect(describeValue(null)).toBe("null");
    expect(describeValue(undefined)).toBe("undefined");
    expect(describeValue(42)).toBe("42");
    expect(describeValue(true)).toBe("true");
    expect(describeValue("hello")).toBe('"hello"');
    expect(describeValue([])).toBe("Array(0)");
    expect(describeValue([1, 2, 3])).toBe("Array(3)");
    expect(describeValue(() => {})).toBe("[Function]");
    expect(describeValue(Symbol("test"))).toBe("Symbol(test)");
    expect(describeValue(Symbol())).toBe("Symbol()");
    expect(describeValue(BigInt(42))).toBe("42");
  });

  it("shows constructor name and key preview for objects", () => {
    expect(describeValue({ a: 1, b: 2 })).toBe("Object { a, b }");
    expect(describeValue({})).toBe("Object");
  });

  it("truncates object keys beyond 5", () => {
    const obj = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 };
    expect(describeValue(obj)).toBe("Object { a, b, c, d, e, ... }");
  });
});

function makeMinimalAdapter() {
  return {
    resolveValue: () => null,
    resolveCall: () => null,
    resolveSelector: () => undefined,
    externalInterface: () => ({ allowClassNameProp: false, allowStyleProp: false }),
  };
}

describe("assertValidAdapter", () => {
  it("accepts a valid adapter", () => {
    expect(() => assertValidAdapter(makeMinimalAdapter(), "test")).not.toThrow();
  });

  it("rejects non-objects with helpful message", () => {
    expect(() => assertValidAdapter(null, "test")).toThrow(/expected an adapter object/);
    expect(() => assertValidAdapter(42, "test")).toThrow(/expected an adapter object/);
  });

  it("validates each required function field", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), resolveValue: "nope" }, "test"),
    ).toThrow(/resolveValue must be a function/);

    expect(() => assertValidAdapter({ ...makeMinimalAdapter(), resolveCall: 123 }, "test")).toThrow(
      /resolveCall must be a function/,
    );

    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), resolveSelector: true }, "test"),
    ).toThrow(/resolveSelector must be a function/);
  });

  it("rejects non-function resolveBaseComponent when provided", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), resolveBaseComponent: "nope" }, "test"),
    ).toThrow(/resolveBaseComponent must be a function/);
  });

  it("rejects 'auto' for externalInterface (only functions allowed in resolved adapter)", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), externalInterface: "auto" }, "test"),
    ).toThrow(/externalInterface must be a function/);
  });

  it("validates styleMerger shape", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), styleMerger: "invalid" }, "test"),
    ).toThrow(/styleMerger must be null or an object/);

    expect(() =>
      assertValidAdapter(
        { ...makeMinimalAdapter(), styleMerger: { functionName: 123, importSource: {} } },
        "test",
      ),
    ).toThrow(/functionName must be a non-empty string/);

    expect(() =>
      assertValidAdapter(
        {
          ...makeMinimalAdapter(),
          styleMerger: { functionName: "fn", importSource: { kind: "bad", value: "x" } },
        },
        "test",
      ),
    ).toThrow(/kind must be "specifier" or "absolutePath"/);
  });

  it("validates themeHook shape", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), themeHook: "invalid" }, "test"),
    ).toThrow(/themeHook must be an object/);
  });
});

describe("assertValidAdapterInput", () => {
  it("accepts 'auto' for externalInterface (allowed in input)", () => {
    expect(() =>
      assertValidAdapterInput({ ...makeMinimalAdapter(), externalInterface: "auto" }, "test"),
    ).not.toThrow();
  });

  it("rejects other string values for externalInterface", () => {
    expect(() =>
      assertValidAdapterInput({ ...makeMinimalAdapter(), externalInterface: "nope" }, "test"),
    ).toThrow(/externalInterface/);
  });
});
