import { describe, it, expect } from "vitest";
import {
  describeValue,
  assertValidAdapter,
  assertValidAdapterInput,
} from "../internal/public-api-validation.js";

describe("describeValue", () => {
  it("returns 'null' for null", () => {
    expect(describeValue(null)).toBe("null");
  });

  it("returns 'undefined' for undefined", () => {
    expect(describeValue(undefined)).toBe("undefined");
  });

  it("returns Array(N) for arrays", () => {
    expect(describeValue([])).toBe("Array(0)");
    expect(describeValue([1, 2, 3])).toBe("Array(3)");
  });

  it("returns quoted string for strings", () => {
    expect(describeValue("hello")).toBe('"hello"');
    expect(describeValue("")).toBe('""');
  });

  it("returns string representation for numbers", () => {
    expect(describeValue(42)).toBe("42");
    expect(describeValue(3.14)).toBe("3.14");
    expect(describeValue(0)).toBe("0");
    expect(describeValue(-1)).toBe("-1");
  });

  it("returns string representation for booleans", () => {
    expect(describeValue(true)).toBe("true");
    expect(describeValue(false)).toBe("false");
  });

  it("returns string representation for bigint", () => {
    expect(describeValue(BigInt(42))).toBe("42");
  });

  it("returns Symbol() for symbols", () => {
    expect(describeValue(Symbol("test"))).toBe("Symbol(test)");
    expect(describeValue(Symbol())).toBe("Symbol()");
  });

  it("returns [Function] for functions", () => {
    expect(describeValue(() => {})).toBe("[Function]");
    expect(describeValue(function named() {})).toBe("[Function]");
  });

  it("returns constructor name with keys for objects", () => {
    expect(describeValue({ a: 1, b: 2 })).toBe("Object { a, b }");
  });

  it("returns constructor name without keys for empty objects", () => {
    expect(describeValue({})).toBe("Object");
  });

  it("truncates keys beyond 5", () => {
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
  it("passes for valid adapter", () => {
    expect(() => assertValidAdapter(makeMinimalAdapter(), "test")).not.toThrow();
  });

  it("throws for non-object", () => {
    expect(() => assertValidAdapter(null, "test")).toThrow(/expected an adapter object/);
    expect(() => assertValidAdapter(42, "test")).toThrow(/expected an adapter object/);
    expect(() => assertValidAdapter("string", "test")).toThrow(/expected an adapter object/);
  });

  it("throws when resolveValue is not a function", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), resolveValue: "nope" }, "test"),
    ).toThrow(/resolveValue must be a function/);
  });

  it("throws when resolveCall is not a function", () => {
    expect(() => assertValidAdapter({ ...makeMinimalAdapter(), resolveCall: 123 }, "test")).toThrow(
      /resolveCall must be a function/,
    );
  });

  it("throws when resolveSelector is not a function", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), resolveSelector: true }, "test"),
    ).toThrow(/resolveSelector must be a function/);
  });

  it("throws when resolveBaseComponent is provided but not a function", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), resolveBaseComponent: "nope" }, "test"),
    ).toThrow(/resolveBaseComponent must be a function/);
  });

  it("accepts resolveBaseComponent when it is a function", () => {
    expect(() =>
      assertValidAdapter(
        { ...makeMinimalAdapter(), resolveBaseComponent: () => undefined },
        "test",
      ),
    ).not.toThrow();
  });

  it("throws when externalInterface is not a function (string)", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), externalInterface: "auto" }, "test"),
    ).toThrow(/externalInterface must be a function/);
  });

  it("throws when styleMerger is invalid type", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), styleMerger: "invalid" }, "test"),
    ).toThrow(/styleMerger must be null or an object/);
  });

  it("throws when styleMerger.functionName is not a string", () => {
    expect(() =>
      assertValidAdapter(
        {
          ...makeMinimalAdapter(),
          styleMerger: { functionName: 123, importSource: { kind: "specifier", value: "x" } },
        },
        "test",
      ),
    ).toThrow(/functionName must be a non-empty string/);
  });

  it("throws when styleMerger.importSource is missing", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), styleMerger: { functionName: "fn" } }, "test"),
    ).toThrow(/importSource must be an object/);
  });

  it("throws when styleMerger.importSource.kind is invalid", () => {
    expect(() =>
      assertValidAdapter(
        {
          ...makeMinimalAdapter(),
          styleMerger: {
            functionName: "fn",
            importSource: { kind: "invalid", value: "x" },
          },
        },
        "test",
      ),
    ).toThrow(/kind must be "specifier" or "absolutePath"/);
  });

  it("throws when styleMerger.importSource.value is empty", () => {
    expect(() =>
      assertValidAdapter(
        {
          ...makeMinimalAdapter(),
          styleMerger: {
            functionName: "fn",
            importSource: { kind: "specifier", value: "" },
          },
        },
        "test",
      ),
    ).toThrow(/value must be a non-empty string/);
  });

  it("accepts valid styleMerger", () => {
    expect(() =>
      assertValidAdapter(
        {
          ...makeMinimalAdapter(),
          styleMerger: {
            functionName: "mergedSx",
            importSource: { kind: "specifier", value: "@company/utils" },
          },
        },
        "test",
      ),
    ).not.toThrow();
  });

  it("throws when themeHook is invalid type", () => {
    expect(() =>
      assertValidAdapter({ ...makeMinimalAdapter(), themeHook: "invalid" }, "test"),
    ).toThrow(/themeHook must be an object/);
  });

  it("accepts null styleMerger and valid themeHook", () => {
    expect(() =>
      assertValidAdapter(
        {
          ...makeMinimalAdapter(),
          styleMerger: null,
          themeHook: {
            functionName: "useTheme",
            importSource: { kind: "specifier", value: "@company/theme" },
          },
        },
        "test",
      ),
    ).not.toThrow();
  });
});

describe("assertValidAdapterInput", () => {
  it("accepts externalInterface 'auto'", () => {
    expect(() =>
      assertValidAdapterInput({ ...makeMinimalAdapter(), externalInterface: "auto" }, "test"),
    ).not.toThrow();
  });

  it("accepts externalInterface as function", () => {
    expect(() => assertValidAdapterInput(makeMinimalAdapter(), "test")).not.toThrow();
  });

  it("throws when externalInterface is neither function nor 'auto'", () => {
    expect(() =>
      assertValidAdapterInput({ ...makeMinimalAdapter(), externalInterface: "nope" }, "test"),
    ).toThrow(/externalInterface/);
  });
});
