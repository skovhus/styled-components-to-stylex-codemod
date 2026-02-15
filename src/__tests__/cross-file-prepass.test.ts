import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import jscodeshift from "jscodeshift";
import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import {
  scanCrossFileSelectors,
  type CrossFileInfo,
  type CrossFileSelectorUsage,
} from "../internal/prepass/scan-cross-file-selectors.js";
import { transformWithWarnings } from "../transform.js";
import { fixtureAdapter } from "./fixture-adapters.js";

// Suppress codemod logs in tests
vi.mock("../internal/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    error: vi.fn(),
    logWarnings: vi.fn(),
  },
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures", "cross-file");
const fixture = (name: string) => join(fixturesDir, name);

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

  it("handles multi-line named imports", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-multiline-import.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-multiline-import.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);
    expect(usages![0]!.localName).toBe("CollapseArrowIcon");
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

/* ── Scanner corner cases ─────────────────────────────────────────────── */

describe("scanCrossFileSelectors corner cases", () => {
  const resolver = createModuleResolver();

  it("does NOT detect value interpolation as a selector", () => {
    // ${Component} used as a CSS value (mixin), not inside a selector block
    const info = scanCrossFileSelectors(
      [fixture("consumer-value-interpolation.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    // Should NOT find any selector usages — the component is used as a value
    const usages = info.selectorUsages.get(fixture("consumer-value-interpolation.tsx"));
    expect(usages ?? []).toHaveLength(0);
  });

  it("detects aliased import used as selector (import { X as Y })", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-aliased-import.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-aliased-import.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);
    // The local name is the alias
    expect(usages![0]!.localName).toBe("Arrow");
    // The imported name is the original
    expect(usages![0]!.importedName).toBe("CollapseArrowIcon");
  });

  it("detects two parents styling the same cross-file child", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-two-parents.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-two-parents.tsx"));
    expect(usages).toBeDefined();
    // One usage entry (same import, same local name, same resolved path)
    expect(usages!.length).toBeGreaterThanOrEqual(1);
    expect(usages![0]!.localName).toBe("CollapseArrowIcon");
  });

  it("detects selector with renamed styled import (import styledComponents from ...)", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-renamed-styled.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-renamed-styled.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);
    expect(usages![0]!.localName).toBe("CollapseArrowIcon");
  });
});

/* ── Cross-file transform (end-to-end) ───────────────────────────────── */

const j = jscodeshift.withParser("tsx");
const api = { jscodeshift: j, j, stats: () => {}, report: () => {} };

describe("cross-file transform (Scenario A)", () => {
  // Tests 1-4 and 6-7 (forward selector, same-file sanity, aliased, two-parents,
  // base-only, reverse) are now covered by test-cases/:
  //   selector-crossFileComponent, selector-crossFileAliased,
  //   selector-crossFileTwoParents, selector-crossFileBaseOnly,
  //   selector-crossFileReverse

  // Value-interpolation prepass test is covered above in "scanCrossFileSelectors corner cases"

  it("reverse cross-file: adds marker to parent that already has stylex.props()", () => {
    // P2 regression: if the imported parent JSX already has a stylex.props() call
    // (e.g., from a partial migration), the marker must be appended to it, not skipped.
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { Link } from "./lib/collapse-arrow-icon";

const Icon = styled.svg\`
  fill: gray;

  \${Link}:hover & {
    fill: rebeccapurple;
  }
\`;

const linkStyles = stylex.create({ link: { textDecoration: "none" } });

export const App = () => (
  <Link href="#" {...stylex.props(linkStyles.link)}>
    <Icon viewBox="0 0 20 20" />
  </Link>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "Link",
          importSource: "./lib/collapse-arrow-icon",
          importedName: "Link",
          resolvedPath: fixture("lib/collapse-arrow-icon.tsx"),
        },
      ],
    };

    const result = transformWithWarnings(
      { source, path: fixture("consumer-reverse-selector.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // The marker should be added to the existing stylex.props call on <Link>
    expect(code).toContain("__LinkMarker");
    // It should appear as an argument inside stylex.props, not as a separate spread
    expect(code).toMatch(/stylex\.props\([^)]*__LinkMarker/);
  });
});
