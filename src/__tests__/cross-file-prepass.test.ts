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
  it("transforms consumer file with cross-file selector using defineMarker", () => {
    const source = `
import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

const Button = styled.button\`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
\`;

const StyledCollapseButton = styled(Button)\`
  gap: 8px;

  \${CollapseArrowIcon} {
    width: 18px;
    height: auto;
  }

  &:hover \${CollapseArrowIcon} {
    transform: rotate(180deg);
  }
\`;

export const App = () => (
  <div>
    <StyledCollapseButton>
      <CollapseArrowIcon />
      Toggle
    </StyledCollapseButton>
  </div>
);
`;

    // Build the cross-file info as the prepass would
    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "CollapseArrowIcon",
          importSource: "./lib/collapse-arrow-icon",
          importedName: "CollapseArrowIcon",
          resolvedPath: fixture("lib/collapse-arrow-icon.tsx"),
        },
      ],
      componentsNeedingStyleAcceptance: new Set<string>(),
    };

    const result = transformWithWarnings({ source, path: fixture("consumer-basic.tsx") }, api, {
      adapter: fixtureAdapter,
      crossFileInfo,
    });

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Should emit defineMarker()
    expect(code).toContain("stylex.defineMarker()");
    // Should have the marker variable
    expect(code).toContain("__StyledCollapseButtonMarker");
    // Should use stylex.when.ancestor with the marker
    expect(code).toContain("stylex.when.ancestor");
    // Should apply override styles to CollapseArrowIcon
    expect(code).toContain("collapseArrowIconInStyledCollapseButton");
    // Should NOT have the "unknown component selector" bail
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ type: "Unsupported selector: unknown component selector" }),
    );
    // Should spread override styles onto CollapseArrowIcon
    expect(code).toContain("stylex.props(styles.collapseArrowIconInStyledCollapseButton)");
  });

  it("does not break same-file descendant overrides", () => {
    // Ensure same-file selectors still use defaultMarker()
    const source = `
import styled from "styled-components";

const Icon = styled.svg\`
  width: 16px;
  height: 16px;
\`;

const Button = styled.button\`
  display: flex;
  \${Icon} {
    fill: currentColor;
  }
\`;

export const App = () => (
  <Button>
    <Icon />
  </Button>
);
`;

    const result = transformWithWarnings({ source, path: "same-file-test.tsx" }, api, {
      adapter: fixtureAdapter,
    });

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Same-file should use defaultMarker, not defineMarker
    expect(code).toContain("stylex.defaultMarker()");
    expect(code).not.toContain("stylex.defineMarker()");
  });

  it("handles aliased cross-file import (import { X as Y })", () => {
    const source = `
import styled from "styled-components";
import { CollapseArrowIcon as Arrow } from "./lib/collapse-arrow-icon";

const Card = styled.div\`
  padding: 16px;
  \${Arrow} {
    fill: blue;
  }
\`;

export const App = () => (
  <Card><Arrow /></Card>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "Arrow",
          importSource: "./lib/collapse-arrow-icon",
          importedName: "CollapseArrowIcon",
          resolvedPath: fixture("lib/collapse-arrow-icon.tsx"),
        },
      ],
      componentsNeedingStyleAcceptance: new Set<string>(),
    };

    const result = transformWithWarnings(
      { source, path: fixture("consumer-aliased-import.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Should not bail
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ type: "Unsupported selector: unknown component selector" }),
    );
    // Should emit defineMarker and override styles
    expect(code).toContain("stylex.defineMarker()");
    expect(code).toContain("arrowInCard");
    // Should spread overrides onto Arrow (the alias)
    expect(code).toContain("stylex.props(styles.arrowInCard)");
  });

  it("handles two parents styling the same cross-file child", () => {
    const source = `
import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

const ButtonA = styled.button\`
  \${CollapseArrowIcon} {
    fill: red;
  }
\`;

const ButtonB = styled.button\`
  \${CollapseArrowIcon} {
    fill: blue;
  }
\`;

export const App = () => (
  <div>
    <ButtonA><CollapseArrowIcon /></ButtonA>
    <ButtonB><CollapseArrowIcon /></ButtonB>
  </div>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "CollapseArrowIcon",
          importSource: "./lib/collapse-arrow-icon",
          importedName: "CollapseArrowIcon",
          resolvedPath: fixture("lib/collapse-arrow-icon.tsx"),
        },
      ],
      componentsNeedingStyleAcceptance: new Set<string>(),
    };

    const result = transformWithWarnings(
      { source, path: fixture("consumer-two-parents.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Should not bail
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ type: "Unsupported selector: unknown component selector" }),
    );
    // Should have overrides for both parents
    expect(code).toContain("collapseArrowIconInButtonA");
    expect(code).toContain("collapseArrowIconInButtonB");
    // Each parent needs its own marker
    expect(code).toContain("__ButtonAMarker");
    expect(code).toContain("__ButtonBMarker");
  });

  it("value interpolation is not detected as selector by prepass", () => {
    // This is a prepass-level test: when ${Component} is used as a CSS *value*
    // (not a selector), the prepass should NOT flag it as a cross-file selector.
    // The value-interpolation fixture has `color: ${CollapseArrowIcon}` — the
    // prepass's isPlaceholderInSelectorContext correctly rejects this because
    // it's preceded by `:` in a value context. See the scanner test above:
    // "does NOT detect value interpolation as a selector"
    //
    // The transform-level behavior (bail or resolve) depends on the adapter.
    // We don't test the transform here — just verify the prepass is correct.
    const info = scanCrossFileSelectors(
      [fixture("consumer-value-interpolation.tsx"), fixture("lib/collapse-arrow-icon.tsx")],
      [],
      createModuleResolver(),
    );
    expect(info.selectorUsages.get(fixture("consumer-value-interpolation.tsx")) ?? []).toHaveLength(
      0,
    );
  });

  it("handles base-only cross-file selector (no pseudo)", () => {
    // ${Icon} { width: 18px; } — no &:hover, just a plain descendant selector
    const source = `
import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

const Card = styled.div\`
  padding: 16px;
  \${CollapseArrowIcon} {
    width: 24px;
    height: 24px;
  }
\`;

export const App = () => (
  <Card><CollapseArrowIcon /></Card>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "CollapseArrowIcon",
          importSource: "./lib/collapse-arrow-icon",
          importedName: "CollapseArrowIcon",
          resolvedPath: fixture("lib/collapse-arrow-icon.tsx"),
        },
      ],
      componentsNeedingStyleAcceptance: new Set<string>(),
    };

    const result = transformWithWarnings({ source, path: fixture("consumer-basic.tsx") }, api, {
      adapter: fixtureAdapter,
      crossFileInfo,
    });

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Should have the override style key
    expect(code).toContain("collapseArrowIconInCard");
    // Base-only selector: values should be flat (not wrapped in default/when.ancestor)
    expect(code).toContain('"24px"');
  });

  it("handles reverse cross-file selector (${Parent}:hover &)", () => {
    const source = `
import styled from "styled-components";
import { Link } from "./lib/collapse-arrow-icon";

const Icon = styled.svg\`
  fill: gray;
  transition: fill 0.25s;

  \${Link}:hover & {
    fill: rebeccapurple;
  }
\`;

export const App = () => (
  <Link href="#">
    <Icon viewBox="0 0 20 20" />
    Hover me
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

    // Should NOT bail
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ type: "Unsupported selector: unknown component selector" }),
    );
    // Should emit defineMarker for the cross-file parent
    expect(code).toContain("stylex.defineMarker()");
    expect(code).toContain("__LinkMarker");
    // Override styles should use when.ancestor with the marker
    expect(code).toContain("stylex.when.ancestor");
    // Should produce the override style key (self "in" parent)
    expect(code).toContain("iconInLink");
    // Should add marker to the imported Link component's JSX
    expect(code).toContain("__LinkMarker");
  });
});

/* ── Monorepo workspace resolution ────────────────────────────────────── */

import { existsSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { beforeAll } from "vitest";

const monoFixturesDir = join(__dirname, "fixtures", "cross-file-monorepo");
const monoFixture = (name: string) => join(monoFixturesDir, name);

// Create the workspace symlink that pnpm would normally create.
// This can't be committed to git (node_modules is gitignored) so we create it at test time.
const symlinkPath = monoFixture("packages/app/node_modules/@myorg/icons");
beforeAll(() => {
  if (!existsSync(symlinkPath)) {
    mkdirSync(dirname(symlinkPath), { recursive: true });
    symlinkSync("../../../icons", symlinkPath);
  }
  return () => {
    // Cleanup: remove the symlink after tests (optional, keeps fixtures clean)
    try {
      rmSync(symlinkPath);
    } catch {
      // ignore
    }
  };
});

describe("monorepo workspace resolution", () => {
  const resolver = createModuleResolver();

  it("resolves workspace package via symlink (@myorg/icons barrel)", () => {
    const result = resolver.resolve(monoFixture("packages/app/src/button.tsx"), "@myorg/icons");
    expect(result).toBeDefined();
    // Should resolve through symlink to the real icons package
    expect(result).toContain("packages/icons/src/index.ts");
  });

  it("resolves workspace package subpath export (@myorg/icons/collapse-arrow-icon)", () => {
    const result = resolver.resolve(
      monoFixture("packages/app/src/card-subpath.tsx"),
      "@myorg/icons/collapse-arrow-icon",
    );
    expect(result).toBeDefined();
    expect(result).toContain("packages/icons/src/collapse-arrow-icon.tsx");
  });
});

describe("scanCrossFileSelectors with monorepo workspace packages", () => {
  const resolver = createModuleResolver();

  it("detects cross-file selector via workspace package barrel import", () => {
    const consumerPath = monoFixture("packages/app/src/button.tsx");
    const targetPath = monoFixture("packages/icons/src/index.ts");

    const info = scanCrossFileSelectors([consumerPath, targetPath], [], resolver);

    const usages = info.selectorUsages.get(consumerPath);
    expect(usages).toBeDefined();
    expect(usages!.length).toBeGreaterThanOrEqual(1);

    const usage = usages!.find((u) => u.localName === "CollapseArrowIcon");
    expect(usage).toBeDefined();
    expect(usage!.importSource).toBe("@myorg/icons");
    // Resolved path should be the real path (through symlink)
    expect(usage!.resolvedPath).toContain("packages/icons/src/index.ts");
    expect(usage!.consumerIsTransformed).toBe(true);
  });

  it("detects cross-file selector via workspace package subpath import", () => {
    const consumerPath = monoFixture("packages/app/src/card-subpath.tsx");
    const targetPath = monoFixture("packages/icons/src/collapse-arrow-icon.tsx");

    const info = scanCrossFileSelectors([consumerPath, targetPath], [], resolver);

    const usages = info.selectorUsages.get(consumerPath);
    expect(usages).toBeDefined();
    expect(usages).toHaveLength(1);

    const usage = usages![0]!;
    expect(usage.localName).toBe("CollapseArrowIcon");
    expect(usage.importSource).toBe("@myorg/icons/collapse-arrow-icon");
    expect(usage.resolvedPath).toContain("packages/icons/src/collapse-arrow-icon.tsx");
  });
});

describe("cross-file transform with monorepo workspace package", () => {
  it("transforms consumer importing from workspace package", () => {
    const source = `
import styled from "styled-components";
import { CollapseArrowIcon } from "@myorg/icons";

const Button = styled.button\`
  display: inline-flex;
  gap: 8px;

  \${CollapseArrowIcon} {
    width: 18px;
    height: auto;
  }

  &:hover \${CollapseArrowIcon} {
    transform: rotate(180deg);
  }
\`;

export const App = () => (
  <Button>
    <CollapseArrowIcon />
    Toggle
  </Button>
);
`;

    const crossFileInfo = {
      selectorUsages: [
        {
          localName: "CollapseArrowIcon",
          importSource: "@myorg/icons",
          importedName: "CollapseArrowIcon",
          resolvedPath: monoFixture("packages/icons/src/index.ts"),
        },
      ],
      componentsNeedingStyleAcceptance: new Set<string>(),
    };

    const result = transformWithWarnings(
      { source, path: monoFixture("packages/app/src/button.tsx") },
      api,
      { adapter: fixtureAdapter, crossFileInfo },
    );

    expect(result.code).not.toBeNull();
    const code = result.code!;

    // Should emit defineMarker for the cross-file parent
    expect(code).toContain("stylex.defineMarker()");
    expect(code).toContain("__ButtonMarker");
    // Should generate override styles using marker
    expect(code).toContain("stylex.when.ancestor");
    expect(code).toContain("collapseArrowIconInButton");
    // Should NOT bail with unknown component selector
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ type: "Unsupported selector: unknown component selector" }),
    );
    // Should spread overrides onto the imported component
    expect(code).toContain("stylex.props(styles.collapseArrowIconInButton)");
    // The import for @myorg/icons should be preserved
    expect(code).toContain("@myorg/icons");
  });
});
