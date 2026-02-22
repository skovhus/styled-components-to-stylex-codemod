import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import jscodeshift from "jscodeshift";
import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import { runPrepass } from "../internal/prepass/run-prepass.js";
import {
  scanCrossFileSelectors,
  type CrossFileInfo,
  type CrossFileSelectorUsage,
} from "../internal/prepass/scan-cross-file-selectors.js";
import { transformWithWarnings } from "../transform.js";
import { fixtureAdapter } from "./fixture-adapters.js";
import {
  generateBridgeClassName,
  bridgeExportName,
} from "../internal/utilities/bridge-classname.js";
import {
  buildConsumerReplacements,
  patchConsumerFile,
} from "../internal/bridge-consumer-patcher.js";

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
    const styleAcceptance = info.componentsNeedingMarkerSidecar.get(
      fixture("lib/collapse-arrow-icon.tsx"),
    );
    expect(styleAcceptance).toBeDefined();
    expect(styleAcceptance!.has("CollapseArrowIcon")).toBe(true);

    // No bridge needed (consumer is transformed)
    expect(info.componentsNeedingGlobalSelectorBridge.size).toBe(0);
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
    const bridge = info.componentsNeedingGlobalSelectorBridge.get(
      fixture("lib/collapse-arrow-icon.tsx"),
    );
    expect(bridge).toBeDefined();
    expect(bridge!.has("CollapseArrowIcon")).toBe(true);

    // No style acceptance needed (consumer is not transformed)
    expect(info.componentsNeedingMarkerSidecar.size).toBe(0);
  });

  it("returns empty info for files with no cross-file selectors", () => {
    const info = scanCrossFileSelectors([fixture("no-cross-file.tsx")], [], resolver);

    expect(info.selectorUsages.size).toBe(0);
    expect(info.componentsNeedingMarkerSidecar.size).toBe(0);
    expect(info.componentsNeedingGlobalSelectorBridge.size).toBe(0);
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

  it("detects selector preceded by interpolated pseudo-class (&:${expr} ${Comp})", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-interpolated-pseudo.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-interpolated-pseudo.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);
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

describe("cross-file transform (both consumer and target transformed)", () => {
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
    expect(code).toContain("LinkMarker");
    // It should appear as an argument inside stylex.props, not as a separate spread
    expect(code).toMatch(/stylex\.props\([^)]*LinkMarker/);
  });

  it("forward cross-file: merges overrides into existing stylex.props() instead of adding new spread", () => {
    // Issue: cross-file forward overrides appended a new {...stylex.props(...)} spread
    // instead of merging into the existing one. Later spreads clobber className/style.
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { CrossFileIcon } from "./lib/cross-file-icon.styled";

const iconStyles = stylex.create({ icon: { opacity: 0.5 } });

const Container = styled.div\`
  padding: 16px;

  \${CrossFileIcon} {
    width: 30px;
  }
\`;

export const App = () => (
  <Container>
    <CrossFileIcon {...stylex.props(iconStyles.icon)} />
  </Container>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "CrossFileIcon",
          importSource: "./lib/cross-file-icon.styled",
          importedName: "CrossFileIcon",
          resolvedPath: fixture("lib/cross-file-icon.styled.tsx"),
        },
      ],
    };

    const result = transformWithWarnings(
      { source, path: fixture("consumer-forward-existing-props.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // The override should be merged INTO the existing stylex.props() call
    // NOT added as a second {...stylex.props(...)} spread
    const stylexPropsCount = (code.match(/stylex\.props\(/g) ?? []).length;

    // There should be exactly 2 stylex.props calls: one on <div> (Container) and one on <CrossFileIcon>
    // NOT 3 (which would indicate a separate spread was added)
    expect(stylexPropsCount).toBeLessThanOrEqual(2);

    // The CrossFileIcon's stylex.props should contain both the existing iconStyles.icon
    // AND the override styles.crossFileIconInContainer
    expect(code).toMatch(/stylex\.props\(iconStyles\.icon.*styles\./);
  });
});

/* ── Bridge className utilities ──────────────────────────────────────── */

describe("generateBridgeClassName", () => {
  it("produces a deterministic className", () => {
    const a = generateBridgeClassName("/src/foo.tsx", "Foo");
    const b = generateBridgeClassName("/src/foo.tsx", "Foo");
    expect(a).toBe(b);
  });

  it("produces different classNames for different components", () => {
    const a = generateBridgeClassName("/src/foo.tsx", "Foo");
    const b = generateBridgeClassName("/src/foo.tsx", "Bar");
    expect(a).not.toBe(b);
  });

  it("produces different classNames for different files", () => {
    const a = generateBridgeClassName("/src/foo.tsx", "Foo");
    const b = generateBridgeClassName("/src/bar.tsx", "Foo");
    expect(a).not.toBe(b);
  });

  it("has the expected format: sc2sx-ComponentName-hash", () => {
    const cn = generateBridgeClassName("/src/foo.tsx", "MyComponent");
    expect(cn).toMatch(/^sc2sx-MyComponent-[0-9a-f]{8}$/);
  });
});

describe("bridgeExportName", () => {
  it("appends GlobalSelector suffix", () => {
    expect(bridgeExportName("Foo")).toBe("FooGlobalSelector");
    expect(bridgeExportName("CollapseArrowIcon")).toBe("CollapseArrowIconGlobalSelector");
  });
});

/* ── Bridge transform (end-to-end) ───────────────────────────────────── */

describe("cross-file bridge transform (consumer not transformed)", () => {
  it("emits bridge className and GlobalSelector export for bridge components", () => {
    const source = `
import styled from "styled-components";

export const CollapseArrowIcon = styled.svg\`
  width: 16px;
  height: 16px;
  fill: currentColor;
\`;

export const App = () => <CollapseArrowIcon />;
`;

    const absPath = pathResolve("/src/lib/collapse-arrow-icon.tsx");
    const bridgeComponentNames = new Set(["CollapseArrowIcon"]);

    const result = transformWithWarnings(
      { source, path: "/src/lib/collapse-arrow-icon.tsx" },
      api,
      { adapter: fixtureAdapter, crossFileInfo: { selectorUsages: [], bridgeComponentNames } },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Should contain the bridge className on the component
    const bridgeCn = generateBridgeClassName(absPath, "CollapseArrowIcon");
    expect(code).toContain(bridgeCn);

    // Should export a GlobalSelector variable
    expect(code).toContain("export const CollapseArrowIconGlobalSelector");
    expect(code).toContain(`.${bridgeCn}`);

    // Should have bridgeResults
    expect(result.bridgeResults).toBeDefined();
    expect(result.bridgeResults).toHaveLength(1);
    expect(result.bridgeResults![0]).toMatchObject({
      componentName: "CollapseArrowIcon",
      className: bridgeCn,
      globalSelectorVarName: "CollapseArrowIconGlobalSelector",
    });
  });

  it("emits bridge for default-exported component when bridgeComponentNames has 'default'", () => {
    // Issue: scanner stores importedName: "default" for default imports, but
    // bridge matching checked decl.localName, silently missing default-exported components.
    const source = `
import styled from "styled-components";

const CollapseArrowIcon = styled.svg\`
  width: 16px;
  height: 16px;
  fill: currentColor;
\`;

export default CollapseArrowIcon;

export const App = () => <CollapseArrowIcon />;
`;

    const absPath = pathResolve("/src/lib/collapse-arrow-icon.tsx");
    // The prepass stores "default" as the importedName for default imports
    const bridgeComponentNames = new Set(["default"]);

    const result = transformWithWarnings(
      { source, path: "/src/lib/collapse-arrow-icon.tsx" },
      api,
      { adapter: fixtureAdapter, crossFileInfo: { selectorUsages: [], bridgeComponentNames } },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Should contain the bridge className
    const bridgeCn = generateBridgeClassName(absPath, "CollapseArrowIcon");
    expect(code).toContain(bridgeCn);

    // Should export a GlobalSelector variable
    expect(code).toContain("GlobalSelector");

    // Should have bridgeResults
    expect(result.bridgeResults).toBeDefined();
    expect(result.bridgeResults).toHaveLength(1);
  });

  it("does NOT emit bridge for components not in bridgeComponentNames", () => {
    const source = `
import styled from "styled-components";

export const Foo = styled.div\`
  color: red;
\`;

export const App = () => <Foo>test</Foo>;
`;

    const result = transformWithWarnings({ source, path: "/src/foo.tsx" }, api, {
      adapter: fixtureAdapter,
      crossFileInfo: { selectorUsages: [], bridgeComponentNames: new Set(["Bar"]) },
    });

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // No bridge export
    expect(code).not.toContain("GlobalSelector");
    expect(result.bridgeResults).toBeUndefined();
  });
});

/* ── Consumer patcher ────────────────────────────────────────────────── */

describe("buildConsumerReplacements", () => {
  it("maps consumer files to their needed replacements", () => {
    const selectorUsages = new Map<string, CrossFileSelectorUsage[]>([
      [
        "/src/consumer.tsx",
        [
          {
            localName: "Icon",
            importSource: "./lib/icon",
            importedName: "Icon",
            resolvedPath: "/src/lib/icon.tsx",
            consumerPath: "/src/consumer.tsx",
            consumerIsTransformed: false,
          },
        ],
      ],
    ]);

    const bridgeResults = new Map([
      [
        "/src/lib/icon.tsx",
        [
          {
            componentName: "Icon",
            className: "sc2sx-Icon-abc12345",
            globalSelectorVarName: "IconGlobalSelector",
          },
        ],
      ],
    ]);

    const result = buildConsumerReplacements(selectorUsages, bridgeResults);
    expect(result.size).toBe(1);
    const replacements = result.get("/src/consumer.tsx")!;
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      localName: "Icon",
      importSource: "./lib/icon",
      globalSelectorVarName: "IconGlobalSelector",
    });
  });

  it("skips consumers where the target bailed (no bridge result)", () => {
    const selectorUsages = new Map<string, CrossFileSelectorUsage[]>([
      [
        "/src/consumer.tsx",
        [
          {
            localName: "Icon",
            importSource: "./lib/icon",
            importedName: "Icon",
            resolvedPath: "/src/lib/icon.tsx",
            consumerPath: "/src/consumer.tsx",
            consumerIsTransformed: false,
          },
        ],
      ],
    ]);

    const bridgeResults = new Map<
      string,
      { componentName: string; className: string; globalSelectorVarName: string }[]
    >();

    const result = buildConsumerReplacements(selectorUsages, bridgeResults);
    expect(result.size).toBe(0);
  });

  it("skips transformed consumers (only patch unconverted consumers)", () => {
    const selectorUsages = new Map<string, CrossFileSelectorUsage[]>([
      [
        "/src/consumer.tsx",
        [
          {
            localName: "Icon",
            importSource: "./lib/icon",
            importedName: "Icon",
            resolvedPath: "/src/lib/icon.tsx",
            consumerPath: "/src/consumer.tsx",
            consumerIsTransformed: true,
          },
        ],
      ],
    ]);

    const bridgeResults = new Map([
      [
        "/src/lib/icon.tsx",
        [
          {
            componentName: "Icon",
            className: "sc2sx-Icon-abc12345",
            globalSelectorVarName: "IconGlobalSelector",
          },
        ],
      ],
    ]);

    const result = buildConsumerReplacements(selectorUsages, bridgeResults);
    expect(result.size).toBe(0);
  });

  it("matches default-imported component (importedName='default') to bridge result", () => {
    // Issue: scanner stores importedName: "default" for default imports,
    // but bridge results use componentName (the local name). The lookup must handle both.
    const selectorUsages = new Map<string, CrossFileSelectorUsage[]>([
      [
        "/src/consumer.tsx",
        [
          {
            localName: "Icon",
            importSource: "./lib/icon",
            importedName: "default",
            resolvedPath: "/src/lib/icon.tsx",
            consumerPath: "/src/consumer.tsx",
            consumerIsTransformed: false,
          },
        ],
      ],
    ]);

    const bridgeResults = new Map([
      [
        "/src/lib/icon.tsx",
        [
          {
            componentName: "Icon",
            exportName: "default" as const,
            className: "sc2sx-Icon-abc12345",
            globalSelectorVarName: "IconGlobalSelector",
          },
        ],
      ],
    ]);

    const result = buildConsumerReplacements(selectorUsages, bridgeResults);
    expect(result.size).toBe(1);
    const replacements = result.get("/src/consumer.tsx")!;
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      localName: "Icon",
      importSource: "./lib/icon",
      globalSelectorVarName: "IconGlobalSelector",
    });
  });
});

/* ── patchConsumerFile: substring import matching ────────────────────── */

describe("patchConsumerFile import merging", () => {
  let tmpDir: string;

  function writeTmp(name: string, content: string): string {
    const filePath = join(tmpDir, name);
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "consumer-patcher-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not treat substring match as existing import (IconGlobalSelectorOld vs IconGlobalSelector)", () => {
    // Issue: existingNames.includes(name) is substring-based, so
    // "IconGlobalSelectorOld" satisfies "IconGlobalSelector".
    // This causes the import to not be added, producing a missing identifier.
    const source = [
      'import styled from "styled-components";',
      'import { Icon, IconGlobalSelectorOld } from "./icon";',
      "",
      "const Container = styled.div`",
      "  ${Icon} {",
      "    color: red;",
      "  }",
      "`;",
    ].join("\n");

    const filePath = writeTmp("consumer.tsx", source);
    const result = patchConsumerFile(filePath, [
      {
        localName: "Icon",
        importSource: "./icon",
        globalSelectorVarName: "IconGlobalSelector",
        importedName: "Icon",
      },
    ]);

    expect(result).not.toBeNull();
    // Both the old and new names must be present as separate identifiers in the import
    expect(result).toContain("IconGlobalSelectorOld");
    // Verify IconGlobalSelector appears as a distinct import specifier (not just as substring of Old)
    // The import should contain both: { Icon, IconGlobalSelectorOld, IconGlobalSelector }
    const importMatch = result!.match(/import\s*\{([^}]+)\}\s*from\s*["']\.\/icon["']/);
    expect(importMatch).not.toBeNull();
    const importedNames = importMatch![1]!.split(",").map((s) => s.trim());
    expect(importedNames).toContain("IconGlobalSelector");
    expect(importedNames).toContain("IconGlobalSelectorOld");
  });
});

/* ── Prepass parse error handling ────────────────────────────────────── */

describe("prepass parse error handling", () => {
  const resolver = createModuleResolver();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "prepass-parse-error-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeInvalidConsumer(): string {
    // File has styled-components imports and selector usage but invalid syntax
    // (unclosed brace) that will cause parse failure.
    const content = [
      'import styled from "styled-components";',
      'import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";',
      "",
      "const Container = styled.div`",
      "  ${CollapseArrowIcon} {",
      "    color: red;",
      "  }",
      "`;",
      "",
      "export const App = () => {",
      "  return <Container />;",
    ].join("\n");
    const filePath = join(tmpDir, "consumer-invalid.tsx");
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  it("throws on parse errors in consumer files when createExternalInterface is true (auto mode)", async () => {
    // Issue: scanFileForSelectorsAst silently returns [] on parse errors,
    // bypassing the fail-fast contract for externalInterface "auto".
    const invalidFile = writeInvalidConsumer();
    await expect(
      runPrepass({
        filesToTransform: [fixture("lib/collapse-arrow-icon.tsx")],
        consumerPaths: [invalidFile],
        resolver,
        parserName: "tsx",
        createExternalInterface: true,
      }),
    ).rejects.toThrow();
  });

  it("silently skips parse errors in consumer files when createExternalInterface is false", async () => {
    // When not in "auto" mode, parse errors are tolerated (best-effort).
    const invalidFile = writeInvalidConsumer();
    const result = await runPrepass({
      filesToTransform: [fixture("lib/collapse-arrow-icon.tsx")],
      consumerPaths: [invalidFile],
      resolver,
      parserName: "tsx",
      createExternalInterface: false,
    });

    // Should complete without error, just returning empty selectors for that file
    expect(result.crossFileInfo.selectorUsages.size).toBe(0);
  });
});
