import { describe, expect, it } from "vitest";
import { generateAdapterStub, generateSummary } from "./generate-adapter-stub.js";
import type { ScannedPatterns } from "./scan-patterns.js";

function emptyPatterns(): ScannedPatterns {
  return {
    themePaths: new Set(),
    themeRoots: new Set(),
    hasIndexedThemeLookup: false,
    cssVariables: new Set(),
    helperCalls: new Map(),
    selectorInterpolations: new Map(),
    styledWrappers: new Map(),
    hasUseTheme: false,
    filesScanned: 0,
    filesWithStyledComponents: 0,
  };
}

describe("generateAdapterStub", () => {
  it("generates valid adapter structure", () => {
    const stub = generateAdapterStub(emptyPatterns());
    expect(stub).toContain("defineAdapter");
    expect(stub).toContain("resolveValue(ctx)");
    expect(stub).toContain("resolveCall(ctx)");
    expect(stub).toContain("resolveSelector(ctx)");
    expect(stub).toContain('externalInterface: "auto"');
    expect(stub).toContain("styleMerger: null");
  });

  it("includes themeMapping when theme roots detected", () => {
    const patterns = emptyPatterns();
    patterns.themeRoots.add("color");
    patterns.themePaths.add("color.primary");
    patterns.themePaths.add("color.secondary");
    const stub = generateAdapterStub(patterns);
    expect(stub).toContain("themeMapping:");
    expect(stub).toContain('"color.*"');
    expect(stub).toContain("$color.{property}");
  });

  it("includes indexed lookup comments when detected", () => {
    const patterns = emptyPatterns();
    patterns.themeRoots.add("color");
    patterns.themePaths.add("color");
    patterns.hasIndexedThemeLookup = true;
    const stub = generateAdapterStub(patterns);
    expect(stub).toContain("indexed: true");
    expect(stub).toContain("$colorMixins");
  });

  it("omits themeMapping when no theme usage", () => {
    const stub = generateAdapterStub(emptyPatterns());
    expect(stub).not.toContain("themeMapping:");
  });

  it("includes CSS variable section when detected", () => {
    const patterns = emptyPatterns();
    patterns.cssVariables.add("--primary");
    const stub = generateAdapterStub(patterns);
    expect(stub).toContain('ctx.kind === "cssVariable"');
    expect(stub).toContain("--primary");
  });

  it("includes themeHook when useTheme detected", () => {
    const patterns = emptyPatterns();
    patterns.hasUseTheme = true;
    const stub = generateAdapterStub(patterns);
    expect(stub).toContain("themeHook:");
    expect(stub).toContain('"useTheme"');
  });

  it("omits themeHook when no useTheme", () => {
    const stub = generateAdapterStub(emptyPatterns());
    expect(stub).not.toContain("themeHook:");
  });

  it("includes helper call comments in resolveCall", () => {
    const patterns = emptyPatterns();
    patterns.helperCalls.set("spacing", { source: "./tokens", importedName: "spacing" });
    const stub = generateAdapterStub(patterns);
    expect(stub).toContain('spacing (from "./tokens")');
  });

  it("includes selector comments in resolveSelector", () => {
    const patterns = emptyPatterns();
    patterns.selectorInterpolations.set("Icon", { source: "./icon", importedName: "Icon" });
    const stub = generateAdapterStub(patterns);
    expect(stub).toContain("${Icon}");
    expect(stub).toContain('"./icon"');
  });
});

describe("generateSummary", () => {
  it("reports file counts", () => {
    const patterns = emptyPatterns();
    patterns.filesScanned = 100;
    patterns.filesWithStyledComponents = 42;
    const summary = generateSummary(patterns);
    expect(summary).toContain("100 files");
    expect(summary).toContain("42 files");
  });

  it("lists theme roots", () => {
    const patterns = emptyPatterns();
    patterns.themeRoots.add("color");
    patterns.themeRoots.add("spacing");
    patterns.themePaths.add("color.primary");
    patterns.themePaths.add("spacing.sm");
    const summary = generateSummary(patterns);
    expect(summary).toContain("color, spacing");
    expect(summary).toContain("theme.color.primary");
    expect(summary).toContain("theme.spacing.sm");
  });

  it("reports adapter hooks needed", () => {
    const patterns = emptyPatterns();
    patterns.themeRoots.add("color");
    patterns.cssVariables.add("--x");
    patterns.helperCalls.set("fn", { source: "./a", importedName: "fn" });
    const summary = generateSummary(patterns);
    expect(summary).toContain("resolveValue: 1 theme root(s), 1 CSS variable(s)");
    expect(summary).toContain("resolveCall: 1 helper(s)");
  });
});
