import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { ExternalInterfaceResult } from "../adapter.js";
import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import { runPrepass } from "../internal/prepass/run-prepass.js";

/** Recursively collect all .tsx/.ts/.jsx files in a directory. */
function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (/\.(tsx?|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Convert analysis Map to a snapshot-friendly sorted record with relative paths */
const toSnapshot = (map: Map<string, ExternalInterfaceResult>, base = process.cwd()) => {
  const realBase = realpathSync(base);
  return Object.fromEntries(
    [...map.entries()]
      .map(([key, value]) => {
        const i = key.lastIndexOf(":");
        return [`${path.relative(realBase, key.slice(0, i))}:${key.slice(i + 1)}`, value] as const;
      })
      .sort(([a], [b]) => a.localeCompare(b)),
  );
};

// ---------------------------------------------------------------------------
// Integration tests (temp fixture files + runPrepass)
// ---------------------------------------------------------------------------

describe("runPrepass createExternalInterface", () => {
  let fixtureDir: string;
  let result: Map<string, ExternalInterfaceResult>;

  beforeAll(async () => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), "extract-external-interface-test-"));

    // Create a minimal tsconfig so oxc-resolver can work
    writeFileSync(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { baseUrl: "." } }),
    );

    // --- Component definitions ---
    const componentsDir = path.join(fixtureDir, "components");
    mkdirSync(componentsDir, { recursive: true });

    writeFileSync(
      path.join(componentsDir, "Button.tsx"),
      'import styled from "styled-components";\nexport const Button = styled.button`color: red;`;',
    );

    writeFileSync(
      path.join(componentsDir, "Card.tsx"),
      'import styled from "styled-components";\nexport const Card = styled.div`padding: 8px;`;',
    );

    writeFileSync(
      path.join(componentsDir, "Badge.tsx"),
      'import styled from "styled-components";\nexport const Badge = styled.span`font-size: 12px;`;',
    );

    // Default-exported component (for default import tests)
    writeFileSync(
      path.join(componentsDir, "Link.tsx"),
      'import styled from "styled-components";\nconst Link = styled.a`color: blue;`;\nexport default Link;',
    );

    // Default-exported component with a named type export (for default+named import test)
    writeFileSync(
      path.join(componentsDir, "Input.tsx"),
      'import styled from "styled-components";\nexport type InputProps = { value: string };\nconst Input = styled.input`border: 1px solid;`;\nexport default Input;',
    );

    // Component only used with multiline as-prop (no single-line usage)
    writeFileSync(
      path.join(componentsDir, "Heading.tsx"),
      'import styled from "styled-components";\nexport const Heading = styled.h1`font-size: 24px;`;',
    );

    // Component only consumed via aliased import (for alias resolution test)
    writeFileSync(
      path.join(componentsDir, "Tag.tsx"),
      'import styled from "styled-components";\nexport const Tag = styled.span`border-radius: 4px;`;',
    );

    // Non-exported component used with as-prop in same file (should NOT appear in results)
    writeFileSync(
      path.join(componentsDir, "Internal.tsx"),
      'import styled from "styled-components";\nconst Internal = styled.div`color: green;`;\nexport const App = () => <Internal as="span">Text</Internal>;',
    );

    // Non-exported component wrapped in styled() in same file (should NOT appear in results)
    writeFileSync(
      path.join(componentsDir, "Private.tsx"),
      'import styled from "styled-components";\nconst Private = styled.div`color: red;`;\nconst Extended = styled(Private)`font-weight: bold;`;\nexport const App = () => <Extended />;',
    );

    // --- Consumer files ---
    const consumersDir = path.join(fixtureDir, "consumers");
    mkdirSync(consumersDir, { recursive: true });

    // Consumer that uses `as` prop on Button
    writeFileSync(
      path.join(consumersDir, "page.tsx"),
      'import { Button } from "../components/Button";\nexport const App = () => <Button as="a" href="/">Link</Button>;',
    );

    // Consumer that wraps Card in styled()
    writeFileSync(
      path.join(consumersDir, "extended.tsx"),
      'import styled from "styled-components";\nimport { Card } from "../components/Card";\nconst FancyCard = styled(Card)`border: 1px solid blue;`;\nexport const App = () => <FancyCard />;',
    );

    // Consumer that both uses `as` and wraps Badge
    writeFileSync(
      path.join(consumersDir, "both.tsx"),
      'import styled from "styled-components";\nimport { Badge } from "../components/Badge";\nconst SuperBadge = styled(Badge)`font-weight: bold;`;\nexport const App = () => <Badge as="div">Text</Badge>;',
    );

    // Issue: multiline JSX as-prop (component name on different line than `as=`)
    writeFileSync(
      path.join(consumersDir, "multiline-as.tsx"),
      [
        'import { Heading } from "../components/Heading";',
        "export const App = () => (",
        "  <Heading",
        '    as="h2"',
        "  >",
        "    Title",
        "  </Heading>",
        ");",
      ].join("\n"),
    );

    // Issue: default import with as-prop (cross-file)
    writeFileSync(
      path.join(consumersDir, "default-as.tsx"),
      'import Link from "../components/Link";\nexport const App = () => <Link as="span">Text</Link>;',
    );

    // Issue: default import with named specifiers + styled()
    writeFileSync(
      path.join(consumersDir, "default-named.tsx"),
      'import styled from "styled-components";\nimport Input, { type InputProps } from "../components/Input";\nconst FancyInput = styled(Input)`border-color: blue;`;\nexport const App = () => <FancyInput />;',
    );

    // Issue: aliased import with styled() wrapping (Tag is ONLY consumed via alias)
    writeFileSync(
      path.join(consumersDir, "aliased-styled.tsx"),
      'import styled from "styled-components";\nimport { Tag as MyTag } from "../components/Tag";\nconst FancyTag = styled(MyTag)`border: 2px solid red;`;\nexport const App = () => <FancyTag />;',
    );

    // Issue: `import { default as X }` form with styled() wrapping
    writeFileSync(
      path.join(consumersDir, "default-as-named.tsx"),
      'import styled from "styled-components";\nimport { default as Link } from "../components/Link";\nconst FancyLink = styled(Link)`text-decoration: underline;`;\nexport const App = () => <FancyLink />;',
    );

    // Run unified prepass
    const originalCwd = process.cwd();
    try {
      process.chdir(fixtureDir);
      const allFiles = collectFiles(fixtureDir);
      const resolver = createModuleResolver();
      const prepassResult = await runPrepass({
        filesToTransform: allFiles,
        consumerPaths: [],
        resolver,
        createExternalInterface: true,
      });
      result = prepassResult.consumerAnalysis!;
    } finally {
      process.chdir(originalCwd);
    }
  });

  afterAll(() => {
    if (fixtureDir) {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("detects as-prop and re-styled usage", () => {
    expect(toSnapshot(result, fixtureDir)).toMatchInlineSnapshot(`
      {
        "components/Badge.tsx:Badge": {
          "as": true,
          "styles": true,
        },
        "components/Button.tsx:Button": {
          "as": true,
          "styles": false,
        },
        "components/Card.tsx:Card": {
          "as": false,
          "styles": true,
        },
        "components/Heading.tsx:Heading": {
          "as": true,
          "styles": false,
        },
        "components/Input.tsx:Input": {
          "as": false,
          "styles": true,
        },
        "components/Link.tsx:Link": {
          "as": true,
          "styles": true,
        },
        "components/Tag.tsx:Tag": {
          "as": false,
          "styles": true,
        },
      }
    `);
  });

  it("lookup returns flags for known components", () => {
    const badgePath = realpathSync(path.join(fixtureDir, "components/Badge.tsx"));
    const key = `${badgePath}:Badge`;
    expect(result.get(key)).toEqual({ as: true, styles: true });
  });

  it("lookup returns undefined for unknown components", () => {
    expect(result.get("/unknown.tsx:Foo")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Wildcard exports fallback — monorepo with package.json "exports" wildcards
// ---------------------------------------------------------------------------
//
// Scenario: a monorepo where `@scope/ui` has wildcard exports:
//   "./*": ["./src/*.ts", "./src/*.tsx"]
//
// oxc-resolver resolves `.ts` files fine (first array element matches), but
// fails for `.tsx` files because it doesn't fall back to the second array
// element when the first doesn't match a file on disk.
//
// This test documents the need for the resolveViaExportsWildcard workaround.

describe("runPrepass createExternalInterface — wildcard exports in monorepo", () => {
  let fixtureDir: string;
  let result: Map<string, ExternalInterfaceResult>;

  beforeAll(async () => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), "extract-external-interface-wildcard-"));

    // --- Package: @scope/ui ---
    const pkgDir = path.join(fixtureDir, "packages", "ui");
    mkdirSync(path.join(pkgDir, "src", "components"), { recursive: true });

    writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({
        name: "@scope/ui",
        exports: {
          ".": "./src/index.ts",
          "./*": ["./src/*.ts", "./src/*.tsx"],
        },
      }),
    );

    // .tsx component — only matches second wildcard target ("./src/*.tsx")
    writeFileSync(
      path.join(pkgDir, "src", "components", "Button.tsx"),
      'import styled from "styled-components";\nexport const Button = styled.button`color: red;`;',
    );

    // .ts component — matches first wildcard target ("./src/*.ts")
    writeFileSync(
      path.join(pkgDir, "src", "components", "theme.ts"),
      "export const theme = { color: 'red' };",
    );

    // .tsx component with explicit export entry (barrel index)
    mkdirSync(path.join(pkgDir, "src", "components", "Tooltip"), { recursive: true });
    writeFileSync(
      path.join(pkgDir, "src", "components", "Tooltip", "index.ts"),
      'export { Tooltip } from "./Tooltip";',
    );
    writeFileSync(
      path.join(pkgDir, "src", "components", "Tooltip", "Tooltip.tsx"),
      'import styled from "styled-components";\nexport const Tooltip = styled.div`z-index: 100;`;',
    );

    // Another .tsx component
    writeFileSync(
      path.join(pkgDir, "src", "components", "Text.tsx"),
      'import styled from "styled-components";\nexport const Text = styled.span`font-size: 14px;`;',
    );

    writeFileSync(path.join(pkgDir, "src", "index.ts"), "export {};");

    // --- App directory (consumer) ---
    const appDir = path.join(fixtureDir, "app", "src");
    mkdirSync(appDir, { recursive: true });

    // Simulate monorepo node_modules symlink
    const nodeModulesDir = path.join(fixtureDir, "app", "node_modules", "@scope");
    mkdirSync(nodeModulesDir, { recursive: true });
    const symlinkTarget = path.relative(nodeModulesDir, pkgDir);
    symlinkSync(symlinkTarget, path.join(nodeModulesDir, "ui"));

    writeFileSync(
      path.join(appDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { baseUrl: "." } }),
    );

    // Consumer that wraps .tsx Button via styled()
    writeFileSync(
      path.join(appDir, "page.tsx"),
      [
        'import styled from "styled-components";',
        'import { Button } from "@scope/ui/components/Button";',
        "const PrimaryButton = styled(Button)`font-weight: bold;`;",
        "export const App = () => <PrimaryButton />;",
      ].join("\n"),
    );

    // Consumer that wraps .tsx Text via styled()
    writeFileSync(
      path.join(appDir, "card.tsx"),
      [
        'import styled from "styled-components";',
        'import { Text } from "@scope/ui/components/Text";',
        "const Title = styled(Text)`font-size: 24px;`;",
        "export const App = () => <Title />;",
      ].join("\n"),
    );

    // Consumer that uses `as` prop on Button
    writeFileSync(
      path.join(appDir, "link.tsx"),
      [
        'import { Button } from "@scope/ui/components/Button";',
        'export const App = () => <Button as="a" href="/">Link</Button>;',
      ].join("\n"),
    );

    // Run unified prepass from the fixture root
    const originalCwd = process.cwd();
    try {
      process.chdir(fixtureDir);
      const allFiles = [
        ...collectFiles(path.join(fixtureDir, "app", "src")),
        ...collectFiles(path.join(fixtureDir, "packages")),
      ];
      const resolver = createModuleResolver();
      const prepassResult = await runPrepass({
        filesToTransform: allFiles,
        consumerPaths: [],
        resolver,
        createExternalInterface: true,
      });
      result = prepassResult.consumerAnalysis!;
    } finally {
      process.chdir(originalCwd);
    }
  });

  afterAll(() => {
    if (fixtureDir) {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("detects styled() wrapping of .tsx components imported via wildcard exports", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    // Button.tsx and Text.tsx are .tsx files — they only match the second
    // wildcard target ("./src/*.tsx"), NOT the first ("./src/*.ts").
    // If the resolver can't handle this, styles will be false.
    expect(snapshot["packages/ui/src/components/Button.tsx:Button"]).toEqual({
      as: true,
      styles: true,
    });
    expect(snapshot["packages/ui/src/components/Text.tsx:Text"]).toEqual({
      as: false,
      styles: true,
    });
  });

  it("detects as-prop usage of .tsx components imported via wildcard exports", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["packages/ui/src/components/Button.tsx:Button"]?.as).toBe(true);
  });

  it("snapshot of full analysis map", () => {
    expect(toSnapshot(result, fixtureDir)).toMatchInlineSnapshot(`
      {
        "packages/ui/src/components/Button.tsx:Button": {
          "as": true,
          "styles": true,
        },
        "packages/ui/src/components/Text.tsx:Text": {
          "as": false,
          "styles": true,
        },
      }
    `);
  });
});

// ---------------------------------------------------------------------------
// Snapshot test — on test-cases/
// ---------------------------------------------------------------------------

describe("runPrepass createExternalInterface snapshot on test-cases", () => {
  it("matches snapshot for test-cases directory", async () => {
    const testCasesDir = path.resolve("test-cases");
    const allFiles = collectFiles(testCasesDir);
    const resolver = createModuleResolver();
    const prepassResult = await runPrepass({
      filesToTransform: allFiles,
      consumerPaths: [],
      resolver,
      createExternalInterface: true,
    });
    expect(toSnapshot(prepassResult.consumerAnalysis!)).toMatchInlineSnapshot(`
      {
        "test-cases/externalStyles-input.input.tsx:StyledInput": {
          "as": true,
          "styles": false,
        },
        "test-cases/lib/action-menu-divider.tsx:ActionMenuGroupHeader": {
          "as": false,
          "styles": true,
        },
        "test-cases/lib/action-menu-divider.tsx:ActionMenuTextDivider": {
          "as": false,
          "styles": true,
        },
        "test-cases/lib/external-component.tsx:ExternalComponent": {
          "as": false,
          "styles": true,
        },
        "test-cases/lib/loading.tsx:Loading": {
          "as": false,
          "styles": true,
        },
        "test-cases/lib/text.ts:Text": {
          "as": false,
          "styles": true,
        },
        "test-cases/lib/user-avatar.tsx:UserAvatar": {
          "as": false,
          "styles": true,
        },
      }
    `);
  });
});
