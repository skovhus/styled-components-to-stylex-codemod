import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import jscodeshift from "jscodeshift";
import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import { runPrepass } from "../internal/prepass/run-prepass.js";
import {
  detectBridgeGlobalSelector,
  scanCrossFileSelectors,
  type CrossFileInfo,
  type CrossFileSelectorUsage,
} from "../internal/prepass/scan-cross-file-selectors.js";
import { transformWithWarnings } from "../transform.js";
import { fixtureAdapter } from "./fixture-adapters.js";
import {
  generateBridgeClassName,
  bridgeClassVarName,
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

    // Bridge is also emitted as fallback (in case consumer bails during transform)
    const bridge = info.componentsNeedingGlobalSelectorBridge.get(
      fixture("lib/collapse-arrow-icon.tsx"),
    );
    expect(bridge).toBeDefined();
    expect(bridge!.has("CollapseArrowIcon")).toBe(true);
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

  it("detects selector inside nested css`` helper template", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-css-helper-selector.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-css-helper-selector.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);
    expect(usages![0]!.localName).toBe("CollapseArrowIcon");
    expect(usages![0]!.importedName).toBe("CollapseArrowIcon");
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

  it("bridge forward in conditional JSX: adds marker on parent and override on imported child", () => {
    const source = `
import styled from "styled-components";
import { Button } from "./lib/button";
import { CollapseArrowIcon, CollapseArrowIconGlobalSelector } from "./lib/converted-collapse-icon";

const TitleContainer = styled(Button)\`
  &:hover \${CollapseArrowIconGlobalSelector} {
    background-color: rebeccapurple;
  }
\`;

export const App = ({ show = true }: { show?: boolean }) => (
  <div>
    {show ? (
      <TitleContainer>
        <CollapseArrowIcon />
      </TitleContainer>
    ) : null}
  </div>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "CollapseArrowIconGlobalSelector",
          importSource: "./lib/converted-collapse-icon",
          importedName: "CollapseArrowIconGlobalSelector",
          resolvedPath: fixture("lib/converted-collapse-icon.tsx"),
          bridgeComponentName: "CollapseArrowIcon",
          bridgeComponentLocalName: "CollapseArrowIcon",
        },
      ],
    };

    const result = transformWithWarnings(
      { source, path: fixture("consumer-bridge-conditional.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Bridge selector import is consumed during conversion.
    expect(code).not.toContain("CollapseArrowIconGlobalSelector");

    // Parent marker must be attached even when JSX is nested in a conditional expression.
    // (When the parent has no base styles, stylex.props may contain only the marker.)
    expect(code).toMatch(/<Button[^>]*stylex\.props\([^)]*TitleContainerMarker/);

    // Imported bridge child must receive the override style at its JSX usage site.
    expect(code).toMatch(
      /CollapseArrowIcon\s*\{\.\.\.stylex\.props\(styles\.collapseArrowIconInTitleContainer\)\}/,
    );
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

    // Should contain the bridge className value as an internal const
    const bridgeCn = generateBridgeClassName(absPath, "CollapseArrowIcon");
    const internalVar = bridgeClassVarName("CollapseArrowIcon");
    expect(code).toContain(`const ${internalVar} = "${bridgeCn}"`);

    // Should reference the internal const in the className expression
    expect(code).toContain(internalVar);

    // Should export a GlobalSelector variable using template literal
    expect(code).toContain("export const CollapseArrowIconGlobalSelector");
    expect(code).toContain(`\`.${`\${${internalVar}}`}\``);

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

  it("skips consumers that were actually transformed (in transformedFiles set)", () => {
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

    const transformedFiles = new Set(["/src/consumer.tsx"]);
    const result = buildConsumerReplacements(selectorUsages, bridgeResults, transformedFiles);
    expect(result.size).toBe(0);
  });

  it("patches consumer that was in filesToTransform but bailed (not in transformedFiles)", () => {
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
            consumerIsTransformed: true, // prepass predicted it would be transformed
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

    // Consumer bailed — not in transformedFiles
    const transformedFiles = new Set<string>();
    const result = buildConsumerReplacements(selectorUsages, bridgeResults, transformedFiles);
    expect(result.size).toBe(1);
    const replacements = result.get("/src/consumer.tsx")!;
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      localName: "Icon",
      importSource: "./lib/icon",
      globalSelectorVarName: "IconGlobalSelector",
    });
  });

  it("falls back to consumerIsTransformed when transformedFiles is not provided", () => {
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

    // No transformedFiles — should fall back to consumerIsTransformed flag
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

/* ── Bridge GlobalSelector detection ─────────────────────────────────── */

describe("bridge GlobalSelector detection", () => {
  const resolver = createModuleResolver();

  it("detects bridge and maps to original component name", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-bridge-forward.tsx"), fixture("lib/converted-stylex-component.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-bridge-forward.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);

    const usage = usages![0]!;
    expect(usage.localName).toBe("CollapseArrowIconGlobalSelector");
    expect(usage.importedName).toBe("CollapseArrowIconGlobalSelector");
    expect(usage.bridgeComponentName).toBe("CollapseArrowIcon");
    expect(usage.bridgeComponentLocalName).toBe("CollapseArrowIcon");
  });

  it("does NOT trigger for non-StyleX target files", () => {
    const readFile = (p: string) => readFileSync(p, "utf-8");
    const result = detectBridgeGlobalSelector(
      "CollapseArrowIconGlobalSelector",
      fixture("lib/non-stylex-component.tsx"),
      readFile,
    );
    expect(result).toBeNull();
  });

  it("does NOT trigger for non-.sc2sx- exports", () => {
    const readFile = (p: string) => readFileSync(p, "utf-8");
    const result = detectBridgeGlobalSelector(
      "CollapseArrowIconGlobalSelector",
      fixture("lib/stylex-no-bridge-export.tsx"),
      readFile,
    );
    expect(result).toBeNull();
  });

  it("handles aliased imports (as ArrowSel)", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-bridge-aliased.tsx"), fixture("lib/converted-stylex-component.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-bridge-aliased.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);

    const usage = usages![0]!;
    // Local name is the alias
    expect(usage.localName).toBe("ArrowSel");
    // Imported name is the original
    expect(usage.importedName).toBe("CollapseArrowIconGlobalSelector");
    // Bridge maps to the component name
    expect(usage.bridgeComponentName).toBe("CollapseArrowIcon");
    expect(usage.bridgeComponentLocalName).toBe("CollapseArrowIcon");
  });

  it("sets bridgeComponentLocalName when component is also imported", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-bridge-forward.tsx"), fixture("lib/converted-stylex-component.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-bridge-forward.tsx"));
    expect(usages).toBeDefined();
    const usage = usages![0]!;

    // The consumer also imports CollapseArrowIcon (the component) from the same source
    expect(usage.bridgeComponentLocalName).toBe("CollapseArrowIcon");
  });

  it("detects non-first bridge export from multi-export file", () => {
    // Issue: content.match(BRIDGE_EXPORT_RE) only returns the first export.
    // If the imported name is the *second* export, the match fails.
    const info = scanCrossFileSelectors(
      [fixture("consumer-bridge-second-export.tsx"), fixture("lib/converted-multi-export.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-bridge-second-export.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);

    const usage = usages![0]!;
    expect(usage.localName).toBe("SecondLinkGlobalSelector");
    expect(usage.importedName).toBe("SecondLinkGlobalSelector");
    expect(usage.bridgeComponentName).toBe("SecondLink");
    expect(usage.bridgeComponentLocalName).toBe("SecondLink");
  });

  it("detects bridge via detectBridgeGlobalSelector for non-first export", () => {
    // Direct unit test for detectBridgeGlobalSelector with multi-export file
    const readFile = (p: string) => readFileSync(p, "utf-8");

    // First export should still work
    const first = detectBridgeGlobalSelector(
      "FirstIconGlobalSelector",
      fixture("lib/converted-multi-export.tsx"),
      readFile,
    );
    expect(first).toBe("FirstIcon");

    // Second export must also work (this was the bug)
    const second = detectBridgeGlobalSelector(
      "SecondLinkGlobalSelector",
      fixture("lib/converted-multi-export.tsx"),
      readFile,
    );
    expect(second).toBe("SecondLink");
  });

  it("sets bridgeComponentLocalName for default import with different local name", () => {
    // Issue: `import Icon, { CollapseArrowIconGlobalSelector } from "./lib/component"`
    // Icon is a default import (importedName="default") with localName="Icon".
    // bridgeName="CollapseArrowIcon". The old check compared otherLocal ("Icon") to
    // bridgeName ("CollapseArrowIcon"), which fails. Default imports should match by
    // being the default export from the same source.
    const info = scanCrossFileSelectors(
      [fixture("consumer-bridge-default-import.tsx"), fixture("lib/converted-default-export.tsx")],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-bridge-default-import.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);

    const usage = usages![0]!;
    expect(usage.bridgeComponentName).toBe("CollapseArrowIcon");
    // bridgeComponentLocalName must be "Icon" (the default import's local name)
    expect(usage.bridgeComponentLocalName).toBe("Icon");
  });

  it("prefers named import over default import for bridgeComponentLocalName", () => {
    // Issue: `import Util, { CollapseArrowIcon, CollapseArrowIconGlobalSelector } from "..."`
    // The loop matched Util (default import) before CollapseArrowIcon (named import),
    // setting bridgeComponentLocalName to "Util" instead of "CollapseArrowIcon".
    const info = scanCrossFileSelectors(
      [
        fixture("consumer-bridge-default-plus-named.tsx"),
        fixture("lib/converted-default-plus-named.tsx"),
      ],
      [],
      resolver,
    );

    const usages = info.selectorUsages.get(fixture("consumer-bridge-default-plus-named.tsx"));
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);

    const usage = usages![0]!;
    expect(usage.bridgeComponentName).toBe("CollapseArrowIcon");
    // Must match the named import, NOT the unrelated default import "Util"
    expect(usage.bridgeComponentLocalName).toBe("CollapseArrowIcon");
  });

  it("skips bridge usages from componentsNeedingMarkerSidecar/Bridge", () => {
    const info = scanCrossFileSelectors(
      [fixture("consumer-bridge-forward.tsx"), fixture("lib/converted-stylex-component.tsx")],
      [],
      resolver,
    );

    // Bridge usages should NOT populate componentsNeedingMarkerSidecar or Bridge
    expect(info.componentsNeedingMarkerSidecar.size).toBe(0);
    expect(info.componentsNeedingGlobalSelectorBridge.size).toBe(0);
  });
});

/* ── Bridge GlobalSelector transform (end-to-end) ───────────────────── */

describe("bridge GlobalSelector transform", () => {
  it("transforms bridge forward selector with correct style key and JSX matching", () => {
    const source = `
import styled from "styled-components";
import { CollapseArrowIcon, CollapseArrowIconGlobalSelector } from "./lib/converted-stylex-component";

const Container = styled.div\`
  padding: 16px;

  &:hover \${CollapseArrowIconGlobalSelector} {
    background-color: rebeccapurple;
  }
\`;

export const App = () => (
  <Container>
    <CollapseArrowIcon />
  </Container>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "CollapseArrowIconGlobalSelector",
          importSource: "./lib/converted-stylex-component",
          importedName: "CollapseArrowIconGlobalSelector",
          resolvedPath: fixture("lib/converted-stylex-component.tsx"),
          bridgeComponentName: "CollapseArrowIcon",
          bridgeComponentLocalName: "CollapseArrowIcon",
        },
      ],
    };

    const result = transformWithWarnings(
      { source, path: fixture("consumer-bridge-forward.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Style key uses original component name, not GlobalSelector
    expect(code).toContain("collapseArrowIconInContainer");
    expect(code).not.toContain("GlobalSelector");

    // JSX applies styles to CollapseArrowIcon (the component)
    expect(code).toMatch(/<CollapseArrowIcon\s[^>]*stylex\.props/);

    // Hover pseudo is preserved via stylex.when.ancestor
    expect(code).toContain('stylex.when.ancestor(":hover"');

    // Marker is generated for the consumer
    expect(code).toContain("ContainerMarker");

    // CollapseArrowIconGlobalSelector import is removed
    expect(code).not.toContain("CollapseArrowIconGlobalSelector");
  });

  it("reverse bridge selector with aliased import classifies correctly and injects marker", () => {
    // Issue: When bridgeComponentName ("Foo") differs from bridgeComponentLocalName ("Icon")
    // due to aliased imports, the reverse selector classification fails because
    // parentStyleKey (toStyleKey("Foo")) !== toStyleKey(crossFileComponentLocalName ("Icon")).
    const source = `
import styled from "styled-components";
import { CollapseArrowIcon as Icon, CollapseArrowIconGlobalSelector as IconSel } from "./lib/converted-stylex-component";

const Badge = styled.span\`
  color: gray;

  \${IconSel}:hover & {
    color: rebeccapurple;
  }
\`;

export const App = () => (
  <Icon>
    <Badge>Hello</Badge>
  </Icon>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "IconSel",
          importSource: "./lib/converted-stylex-component",
          importedName: "CollapseArrowIconGlobalSelector",
          resolvedPath: fixture("lib/converted-stylex-component.tsx"),
          bridgeComponentName: "CollapseArrowIcon",
          bridgeComponentLocalName: "Icon",
        },
      ],
    };

    const result = transformWithWarnings(
      { source, path: fixture("consumer-bridge-reverse-aliased.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // The marker should be applied to the parent component (Icon) in JSX
    // This requires correct reverse classification so the marker is injected on <Icon>
    expect(code).toContain("IconMarker");
    expect(code).toMatch(/<Icon\s[^>]*stylex\.props\([^)]*IconMarker/);

    // Badge should have the override style (uses local alias, not canonical name)
    expect(code).toContain("badgeInIcon");

    // Hover pseudo preserved
    expect(code).toContain('stylex.when.ancestor(":hover"');

    // GlobalSelector import removed
    expect(code).not.toContain("CollapseArrowIconGlobalSelector");
    expect(code).not.toContain("IconSel");
  });

  it("aliased bridge overrideStyleKey does not collide with local component of same canonical name", () => {
    // Issue: `import { CollapseArrowIcon as Icon, CollapseArrowIconGlobalSelector as IconSel }`
    // plus a local `const CollapseArrowIcon = styled.div...` in the same parent.
    // Both `${IconSel}` and `${CollapseArrowIcon}` would produce overrideStyleKey
    // "collapseArrowIconInContainer" if bridgeComponentName is used, causing collision.
    const source = `
import styled from "styled-components";
import { CollapseArrowIcon as Icon, CollapseArrowIconGlobalSelector as IconSel } from "./lib/converted-stylex-component";

const CollapseArrowIcon = styled.div\`
  padding: 8px;
\`;

const Container = styled.div\`
  padding: 16px;

  \${IconSel} {
    color: red;
  }

  \${CollapseArrowIcon} {
    color: blue;
  }
\`;

export const App = () => (
  <Container>
    <Icon />
    <CollapseArrowIcon />
  </Container>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "IconSel",
          importSource: "./lib/converted-stylex-component",
          importedName: "CollapseArrowIconGlobalSelector",
          resolvedPath: fixture("lib/converted-stylex-component.tsx"),
          bridgeComponentName: "CollapseArrowIcon",
          bridgeComponentLocalName: "Icon",
        },
      ],
    };

    const result = transformWithWarnings(
      { source, path: fixture("consumer-bridge-collision.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Both overrides must produce DISTINCT style keys (no collision)
    // Bridge child (Icon) should use "iconInContainer"
    expect(code).toContain("iconInContainer");
    // Local child (CollapseArrowIcon) should use "collapseArrowIconInContainer"
    expect(code).toContain("collapseArrowIconInContainer");
    // They must be different keys
    expect("iconInContainer").not.toBe("collapseArrowIconInContainer");

    // Both color values must be present (collision would drop one)
    expect(code).toContain('"red"');
    expect(code).toContain('"blue"');
  });
});
