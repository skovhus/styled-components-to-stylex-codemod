import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import {
  scanCrossFileSelectors,
  type CrossFileInfo,
  type CrossFileSelectorUsage,
} from "../internal/prepass/scan-cross-file-selectors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures", "cross-file");
const fixture = (name: string) => join(fixturesDir, name);

/* ── resolve-imports ──────────────────────────────────────────────────── */

describe("createModuleResolver", () => {
  const resolver = createModuleResolver();

  it("resolves relative .tsx import without extension", () => {
    const result = resolver.resolve(fixture("consumer-basic.tsx"), "./lib/collapse-arrow-icon");
    expect(result).toBe(fixture("lib/collapse-arrow-icon.tsx"));
  });

  it("resolves relative .ts barrel import (index.ts)", () => {
    const result = resolver.resolve(fixture("consumer-barrel.tsx"), "./lib");
    expect(result).toBe(fixture("lib/index.ts"));
  });

  it("resolves .js extension to .tsx file", () => {
    const result = resolver.resolve(
      fixture("consumer-js-extension.tsx"),
      "./lib/collapse-arrow-icon.js",
    );
    // With extensionAlias, .js resolves to .tsx
    expect(result).toBe(fixture("lib/collapse-arrow-icon.tsx"));
  });

  it("returns undefined for unresolvable specifier", () => {
    const result = resolver.resolve(fixture("consumer-basic.tsx"), "./nonexistent-module");
    expect(result).toBeUndefined();
  });

  it("resolves node_modules packages (styled-components)", () => {
    const result = resolver.resolve(fixture("consumer-basic.tsx"), "styled-components");
    // Should resolve to something in node_modules
    expect(result).toBeDefined();
    expect(result).toContain("styled-components");
  });
});

/* ── scan-cross-file-selectors ────────────────────────────────────────── */

describe("scanCrossFileSelectors", () => {
  const resolver = createModuleResolver();

  it("detects basic cross-file component selector usage", () => {
    const info: CrossFileInfo = scanCrossFileSelectors(
      [fixture("consumer-basic.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-basic.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);
    const usage: CrossFileSelectorUsage = usages![0]!;
    expect(usage).toMatchObject({
      localName: "CollapseArrowIcon",
      importSource: "./lib/collapse-arrow-icon",
      importedName: "CollapseArrowIcon",
      resolvedPath: fixture("lib/collapse-arrow-icon.tsx"),
      consumerIsTransformed: true,
    });

    // Target should need style acceptance (both files being transformed)
    const styleAcceptance = info.componentsNeedingStyleAcceptance.get(
      fixture("lib/collapse-arrow-icon.tsx"),
    );
    expect(styleAcceptance).toBeDefined();
    expect(styleAcceptance!.has("CollapseArrowIcon")).toBe(true);

    // No bridge needed (consumer is transformed)
    expect(info.componentsNeedingBridge.size).toBe(0);
  });

  it("detects barrel (index.ts) import with multiple selectors", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-barrel.tsx"), fixture("lib/index.ts")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-barrel.tsx"));
    expect(usages).toBeDefined();
    expect(usages!.length).toBeGreaterThanOrEqual(1);

    const collapseUsage = usages!.find((u) => u.localName === "CollapseArrowIcon");
    expect(collapseUsage).toBeDefined();
    expect(collapseUsage!.resolvedPath).toBe(fixture("lib/index.ts"));

    const plainUsage = usages!.find((u) => u.localName === "PlainIcon");
    expect(plainUsage).toBeDefined();
    expect(plainUsage!.resolvedPath).toBe(fixture("lib/index.ts"));
  });

  it("flags bridge when consumer is NOT in the transform set", () => {
    const info = scanCrossFileSelectors(
      [fixture("lib/collapse-arrow-icon.tsx")], // only the target
      [fixture("consumer-basic.tsx")], // consumer is scanned but not transformed
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-basic.tsx"));
    expect(usages).toBeDefined();
    expect(usages![0]!.consumerIsTransformed).toBe(false);

    // Target should need a bridge (consumer is NOT transformed)
    const bridge = info.componentsNeedingBridge.get(fixture("lib/collapse-arrow-icon.tsx"));
    expect(bridge).toBeDefined();
    expect(bridge!.has("CollapseArrowIcon")).toBe(true);

    // No style acceptance needed (consumer is not transformed)
    expect(info.componentsNeedingStyleAcceptance.size).toBe(0);
  });

  it("returns empty info for files with no cross-file selectors", () => {
    const info = scanCrossFileSelectors([fixture("no-cross-file.tsx")], [], resolver);

    expect(info.selectorUsages.size).toBe(0);
    expect(info.componentsNeedingStyleAcceptance.size).toBe(0);
    expect(info.componentsNeedingBridge.size).toBe(0);
  });

  it("skips files that don't use styled-components", () => {
    const info = scanCrossFileSelectors([fixture("no-styled.tsx")], [], resolver);

    expect(info.selectorUsages.size).toBe(0);
  });

  it("handles .js extension imports", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-js-extension.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-js-extension.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);
    expect(usages![0]!.resolvedPath).toBe(fixture("lib/collapse-arrow-icon.tsx"));
  });

  it("deduplicates files appearing in both filesToTransform and consumerPaths", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-basic.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [fixture("consumer-basic.tsx")], // duplicate
      resolver,
    );

    // Should still mark as transformed (filesToTransform takes precedence)
    const usages = info.selectorUsages.get(fixture("consumer-basic.tsx"));
    expect(usages).toBeDefined();
    expect(usages![0]!.consumerIsTransformed).toBe(true);
  });
});
