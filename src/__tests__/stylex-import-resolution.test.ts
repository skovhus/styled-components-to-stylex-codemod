import { describe, it, expect, vi } from "vitest";
import type { Adapter, ImportSource } from "../adapter.js";
import { createResolveAdapterSafe } from "../internal/transform-resolve-value.js";

function stubAdapter(overrides?: Partial<Adapter>): Adapter {
  return {
    resolveValue: vi.fn(() => undefined),
    resolveCall: vi.fn(() => undefined),
    resolveSelector: vi.fn(() => undefined),
    externalInterface: vi.fn(() => ({ styles: false, as: false, ref: false })),
    styleMerger: null,
    useSxProp: false,
    ...overrides,
  };
}

const STYLEX_ABS: ImportSource = { kind: "absolutePath", value: "/project/src/tokens.stylex" };
const STYLEX_SPECIFIER: ImportSource = { kind: "specifier", value: "./tokens.stylex" };
const STYLEX_WITH_EXT: ImportSource = {
  kind: "absolutePath",
  value: "/project/src/vars.stylex.ts",
};
const NON_STYLEX: ImportSource = { kind: "absolutePath", value: "/project/src/lib/helpers" };
const NON_STYLEX_SPEC: ImportSource = { kind: "specifier", value: "./lib/helpers" };

describe("stylex import resolution — skip adapter for .stylex sources", () => {
  describe("resolveValue (importedValue)", () => {
    it("returns passthrough for a .stylex absolute path", () => {
      const adapter = stubAdapter();
      const { resolveValueSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      const result = resolveValueSafe({
        kind: "importedValue",
        importedName: "$zIndex",
        source: STYLEX_ABS,
        path: "modal",
        filePath: "/project/src/App.tsx",
      });

      expect(result).toEqual({
        expr: "$zIndex.modal",
        imports: [{ from: STYLEX_ABS, names: [{ imported: "$zIndex" }] }],
      });
      expect(adapter.resolveValue).not.toHaveBeenCalled();
    });

    it("returns passthrough for a .stylex specifier", () => {
      const adapter = stubAdapter();
      const { resolveValueSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      const result = resolveValueSafe({
        kind: "importedValue",
        importedName: "spacing",
        source: STYLEX_SPECIFIER,
        filePath: "/project/src/App.tsx",
      });

      expect(result).toEqual({
        expr: "spacing",
        imports: [{ from: STYLEX_SPECIFIER, names: [{ imported: "spacing" }] }],
      });
      expect(adapter.resolveValue).not.toHaveBeenCalled();
    });

    it("returns passthrough for .stylex.ts extension", () => {
      const adapter = stubAdapter();
      const { resolveValueSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      const result = resolveValueSafe({
        kind: "importedValue",
        importedName: "vars",
        source: STYLEX_WITH_EXT,
        path: "primary",
        filePath: "/project/src/App.tsx",
      });

      expect(result).toEqual({
        expr: "vars.primary",
        imports: [{ from: STYLEX_WITH_EXT, names: [{ imported: "vars" }] }],
      });
      expect(adapter.resolveValue).not.toHaveBeenCalled();
    });

    it("uses the original importedName for aliased imports (import { $zIndex as z })", () => {
      const adapter = stubAdapter();
      const { resolveValueSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      // When user writes `import { $zIndex as z } from "./tokens.stylex"`,
      // the import map resolves local name "z" to importedName "$zIndex".
      // The passthrough should use the canonical export name.
      const result = resolveValueSafe({
        kind: "importedValue",
        importedName: "$zIndex",
        source: STYLEX_ABS,
        path: "popover",
        filePath: "/project/src/App.tsx",
      });

      expect(result).toEqual({
        expr: "$zIndex.popover",
        imports: [{ from: STYLEX_ABS, names: [{ imported: "$zIndex" }] }],
      });
      expect(adapter.resolveValue).not.toHaveBeenCalled();
    });

    it("delegates to adapter for non-.stylex sources", () => {
      const adapter = stubAdapter({
        resolveValue: vi.fn(() => ({
          expr: "$zIndex.modal",
          imports: [{ from: STYLEX_ABS, names: [{ imported: "$zIndex" }] }],
        })),
      });
      const { resolveValueSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      resolveValueSafe({
        kind: "importedValue",
        importedName: "zIndex",
        source: NON_STYLEX,
        path: "modal",
        filePath: "/project/src/App.tsx",
      });

      expect(adapter.resolveValue).toHaveBeenCalled();
    });

    it("still delegates theme contexts to adapter (not importedValue)", () => {
      const adapter = stubAdapter({
        resolveValue: vi.fn(() => ({
          expr: "$colors.main",
          imports: [{ from: STYLEX_ABS, names: [{ imported: "$colors" }] }],
        })),
      });
      const { resolveValueSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      resolveValueSafe({
        kind: "theme",
        path: "color.main",
        filePath: "/project/src/App.tsx",
      });

      expect(adapter.resolveValue).toHaveBeenCalled();
    });
  });

  describe("resolveCall", () => {
    it("returns passthrough for callee from .stylex file", () => {
      const adapter = stubAdapter();
      const { resolveCallSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      const result = resolveCallSafe({
        callSiteFilePath: "/project/src/App.tsx",
        calleeImportedName: "helpers",
        calleeMemberPath: ["truncate"],
        calleeSource: STYLEX_ABS,
        args: [{ kind: "literal", value: 3 }],
      });

      expect(result).toEqual({
        expr: "helpers.truncate",
        imports: [{ from: STYLEX_ABS, names: [{ imported: "helpers" }] }],
      });
      expect(adapter.resolveCall).not.toHaveBeenCalled();
    });

    it("delegates to adapter for non-.stylex callee", () => {
      const adapter = stubAdapter({
        resolveCall: vi.fn(() => ({
          expr: "helpers.truncate",
          imports: [],
        })),
      });
      const { resolveCallSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      resolveCallSafe({
        callSiteFilePath: "/project/src/App.tsx",
        calleeImportedName: "truncate",
        calleeSource: NON_STYLEX_SPEC,
        args: [],
      });

      expect(adapter.resolveCall).toHaveBeenCalled();
    });
  });

  describe("resolveSelector", () => {
    it("returns media passthrough for selector from .stylex file", () => {
      const adapter = stubAdapter();
      const { resolveSelectorSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      const result = resolveSelectorSafe({
        kind: "selectorInterpolation",
        importedName: "breakpoints",
        source: STYLEX_ABS,
        path: "phone",
        filePath: "/project/src/App.tsx",
      });

      expect(result).toEqual({
        kind: "media",
        expr: "breakpoints.phone",
        imports: [{ from: STYLEX_ABS, names: [{ imported: "breakpoints" }] }],
      });
      expect(adapter.resolveSelector).not.toHaveBeenCalled();
    });

    it("delegates to adapter for non-.stylex selector source", () => {
      const adapter = stubAdapter({
        resolveSelector: vi.fn(() => ({
          kind: "media" as const,
          expr: "breakpoints.phone",
          imports: [],
        })),
      });
      const { resolveSelectorSafe } = createResolveAdapterSafe({ adapter, warnings: [] });

      resolveSelectorSafe({
        kind: "selectorInterpolation",
        importedName: "screenSize",
        source: NON_STYLEX,
        path: "phone",
        filePath: "/project/src/App.tsx",
      });

      expect(adapter.resolveSelector).toHaveBeenCalled();
    });
  });
});
