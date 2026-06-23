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
import type { ComponentPropUsageInfo } from "../internal/transform-types.js";
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

const propUsageToSnapshot = (
  map: Map<string, Map<string, ComponentPropUsageInfo>>,
  base = process.cwd(),
) => {
  const realBase = realpathSync(base);
  const entries: Array<[string, ComponentPropUsageInfo]> = [];
  for (const [filePath, byComponent] of map) {
    for (const [name, value] of byComponent) {
      entries.push([`${path.relative(realBase, filePath)}:${name}`, value]);
    }
  }
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
};

// ---------------------------------------------------------------------------
// Integration tests (temp fixture files + runPrepass)
// ---------------------------------------------------------------------------

describe("runPrepass prop usage inventory", () => {
  it("records static prop values, aliases, spreads, and unknown expressions", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "prop-usage-prepass-test-"));
    writeFileSync(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { baseUrl: "." } }),
    );
    const componentsDir = path.join(fixtureDir, "components");
    const consumersDir = path.join(fixtureDir, "consumers");
    mkdirSync(componentsDir, { recursive: true });
    mkdirSync(consumersDir, { recursive: true });

    writeFileSync(
      path.join(componentsDir, "Panel.tsx"),
      'import styled from "styled-components";\nexport const Panel = styled.div<{ height: number }>`height: ${p => p.height};`;',
    );
    writeFileSync(
      path.join(consumersDir, "page.tsx"),
      [
        'import { Panel as UiPanel } from "../components/Panel";',
        "const dynamicHeight = 120;",
        "const rest = {};",
        "export const App = () => (",
        "  <>",
        '    <UiPanel height={40} tone="info" />',
        '    <UiPanel height={80} tone="warning" />',
        "    <UiPanel height={dynamicHeight} tone={dynamicHeight > 100 ? 'big' : 'small'} />",
        "    <UiPanel {...rest} />",
        "  </>",
        ");",
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(fixtureDir);
      const resolver = createModuleResolver();
      const prepassResult = await runPrepass({
        filesToTransform: collectFiles(fixtureDir),
        consumerPaths: [],
        resolver,
        createExternalInterface: false,
      });

      expect(propUsageToSnapshot(prepassResult.crossFileInfo.propUsageByFile!, fixtureDir))
        .toMatchInlineSnapshot(`
        {
          "components/Panel.tsx:Panel": {
            "componentName": "Panel",
            "hasUnknownUsage": true,
            "props": {
              "height": {
                "hasUnknown": false,
                "omittedCount": 1,
                "usageCount": 3,
                "values": [
                  40,
                  80,
                  120,
                ],
              },
              "tone": {
                "hasUnknown": true,
                "omittedCount": 1,
                "usageCount": 3,
                "values": [
                  "info",
                  "warning",
                ],
              },
            },
            "usageCount": 4,
          },
        }
      `);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("keeps namespace-sourced static prop observations tied to their source", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "prop-usage-namespace-source-test-"));
    writeFileSync(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { baseUrl: "." } }),
    );
    const componentsDir = path.join(fixtureDir, "components");
    const consumersDir = path.join(fixtureDir, "consumers");
    mkdirSync(componentsDir, { recursive: true });
    mkdirSync(consumersDir, { recursive: true });

    writeFileSync(
      path.join(componentsDir, "A.tsx"),
      'import styled from "styled-components";\nexport const Button = styled.button<{ size: number }>`font-size: ${p => p.size}px;`;',
    );
    writeFileSync(
      path.join(componentsDir, "B.tsx"),
      'import styled from "styled-components";\nexport const Button = styled.button<{ size: number }>`font-size: ${p => p.size}px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "cross-file.tsx"),
      [
        'import * as A from "../components/A";',
        'import { Button as BButton } from "../components/B";',
        "export const App = () => (",
        "  <>",
        "    <A.Button size={1}>A</A.Button>",
        "    <BButton>B</BButton>",
        "  </>",
        ");",
      ].join("\n"),
    );
    writeFileSync(
      path.join(componentsDir, "Other.tsx"),
      'import styled from "styled-components";\nexport const Button = styled.button<{ size: number }>`font-size: ${p => p.size}px;`;',
    );
    writeFileSync(
      path.join(componentsDir, "Local.tsx"),
      [
        'import styled from "styled-components";',
        'import * as Other from "./Other";',
        "export const Button = styled.button<{ size: number }>`font-size: ${p => p.size}px;`;",
        "export const App = () => <Other.Button size={2}>Other</Other.Button>;",
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(fixtureDir);
      const resolver = createModuleResolver();
      const prepassResult = await runPrepass({
        filesToTransform: collectFiles(fixtureDir),
        consumerPaths: [],
        resolver,
        createExternalInterface: false,
      });

      expect(propUsageToSnapshot(prepassResult.crossFileInfo.propUsageByFile!, fixtureDir))
        .toMatchInlineSnapshot(`
          {
            "components/A.tsx:Button": {
              "componentName": "Button",
              "hasUnknownUsage": false,
              "props": {
                "size": {
                  "hasUnknown": false,
                  "omittedCount": 0,
                  "usageCount": 1,
                  "values": [
                    1,
                  ],
                },
              },
              "usageCount": 1,
            },
            "components/B.tsx:Button": {
              "componentName": "Button",
              "hasUnknownUsage": false,
              "props": {},
              "usageCount": 1,
            },
            "components/Other.tsx:Button": {
              "componentName": "Button",
              "hasUnknownUsage": false,
              "props": {
                "size": {
                  "hasUnknown": false,
                  "omittedCount": 0,
                  "usageCount": 1,
                  "values": [
                    2,
                  ],
                },
              },
              "usageCount": 1,
            },
          }
        `);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

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

    // Component consumed only via className prop (no as-prop, no styled() wrapping)
    writeFileSync(
      path.join(componentsDir, "Alert.tsx"),
      'import styled from "styled-components";\nexport const Alert = styled.div`background: yellow;`;',
    );

    // Component consumed via style prop (no as-prop, no styled() wrapping)
    writeFileSync(
      path.join(componentsDir, "Panel.tsx"),
      'import styled from "styled-components";\nexport const Panel = styled.section`border: 1px solid;`;',
    );

    // Component consumed via ref prop (cross-file)
    writeFileSync(
      path.join(componentsDir, "TextInput.tsx"),
      'import styled from "styled-components";\nexport const TextInput = styled.input`border: 1px solid gray;`;',
    );

    // Component consumed with ref in same file
    writeFileSync(
      path.join(componentsDir, "FocusBox.tsx"),
      'import styled from "styled-components";\nimport * as React from "react";\nexport const FocusBox = styled.div`outline: none;`;\nexport const App = () => { const ref = React.useRef(null); return <FocusBox ref={ref} />; };',
    );

    // Component consumed via aliased import with ref (cross-file)
    writeFileSync(
      path.join(componentsDir, "SearchInput.tsx"),
      'import styled from "styled-components";\nexport const SearchInput = styled.input`border: 2px solid blue;`;',
    );

    // Component consumed via aliased import with as-prop (cross-file)
    writeFileSync(
      path.join(componentsDir, "NavLink.tsx"),
      'import styled from "styled-components";\nexport const NavLink = styled.a`color: navy;`;',
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

    // Consumer that passes className to Alert (NO styled-components import — Phase 1 skips it)
    writeFileSync(
      path.join(consumersDir, "className-consumer.tsx"),
      'import { Alert } from "../components/Alert";\nexport const App = () => <Alert className="custom">Warning</Alert>;',
    );

    // Consumer that passes style to Panel (NO styled-components import — Phase 1 skips it)
    writeFileSync(
      path.join(consumersDir, "style-consumer.tsx"),
      'import { Panel } from "../components/Panel";\nexport const App = () => <Panel style={{ opacity: 0.5 }}>Content</Panel>;',
    );

    // Consumer with multiline JSX passing className (component name on different line than className=)
    writeFileSync(
      path.join(consumersDir, "multiline-className.tsx"),
      [
        'import { Alert } from "../components/Alert";',
        "export const App = () => (",
        "  <Alert",
        '    className="highlighted"',
        "  >",
        "    Multiline",
        "  </Alert>",
        ");",
      ].join("\n"),
    );

    // Consumer that uses `ref` prop on TextInput (cross-file)
    writeFileSync(
      path.join(consumersDir, "ref-consumer.tsx"),
      'import * as React from "react";\nimport { TextInput } from "../components/TextInput";\nexport const App = () => { const ref = React.useRef(null); return <TextInput ref={ref} />; };',
    );

    // Consumer that uses `ref` on aliased import (import { SearchInput as MySearch })
    writeFileSync(
      path.join(consumersDir, "aliased-ref.tsx"),
      'import * as React from "react";\nimport { SearchInput as MySearch } from "../components/SearchInput";\nexport const App = () => { const ref = React.useRef(null); return <MySearch ref={ref} />; };',
    );

    // Consumer that uses `as` on aliased import (import { NavLink as MyLink })
    writeFileSync(
      path.join(consumersDir, "aliased-as.tsx"),
      'import { NavLink as MyLink } from "../components/NavLink";\nexport const App = () => <MyLink as="button">Click</MyLink>;',
    );

    // Consumer with TypeScript cast that should NOT create a false alias for ref detection.
    // `getValue() as TextInput` must not alias `TextInput → getValue()`.
    writeFileSync(
      path.join(consumersDir, "ts-cast-ref.tsx"),
      [
        'import * as React from "react";',
        'import { TextInput } from "../components/TextInput";',
        "const getValue = (): unknown => null;",
        "const input = getValue() as TextInput;",
        "export const App = () => { const ref = React.useRef(null); return <TextInput ref={ref} />; };",
      ].join("\n"),
    );

    // Consumer that passes className to a non-exported component (should NOT trigger styles: true)
    writeFileSync(
      path.join(consumersDir, "non-exported-className.tsx"),
      'import { Internal } from "../components/Internal";\nexport const App = () => <Internal className="x">Text</Internal>;',
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

  it("detects as-prop, re-styled, and className/style usage", () => {
    expect(toSnapshot(result, fixtureDir)).toMatchInlineSnapshot(`
      {
        "components/Alert.tsx:Alert": {
          "as": false,
          "className": true,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "components/Badge.tsx:Badge": {
          "as": true,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "components/Button.tsx:Button": {
          "as": true,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "components/Card.tsx:Card": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "components/FocusBox.tsx:FocusBox": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": true,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "components/Heading.tsx:Heading": {
          "as": true,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "components/Input.tsx:Input": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "components/Link.tsx:Link": {
          "as": true,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "components/NavLink.tsx:NavLink": {
          "as": true,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "components/Panel.tsx:Panel": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "components/SearchInput.tsx:SearchInput": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": true,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "components/Tag.tsx:Tag": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "components/TextInput.tsx:TextInput": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": true,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
      }
    `);
  });

  it("lookup returns flags for known components", () => {
    const badgePath = realpathSync(path.join(fixtureDir, "components/Badge.tsx"));
    const key = `${badgePath}:Badge`;
    expect(result.get(key)).toMatchObject({ as: true, ref: false, styles: true });
  });

  it("detects className consumer (no styled-components import)", () => {
    const alertPath = realpathSync(path.join(fixtureDir, "components/Alert.tsx"));
    const key = `${alertPath}:Alert`;
    expect(result.get(key)).toMatchObject({ as: false, ref: false, styles: true });
  });

  it("detects style consumer (no styled-components import)", () => {
    const panelPath = realpathSync(path.join(fixtureDir, "components/Panel.tsx"));
    const key = `${panelPath}:Panel`;
    expect(result.get(key)).toMatchObject({ as: false, ref: false, styles: true });
  });

  it("does not detect className on non-exported components", () => {
    const internalPath = realpathSync(path.join(fixtureDir, "components/Internal.tsx"));
    // Internal is not exported (const Internal = ..., but only App is exported)
    // so className usage should not trigger styles: true
    const key = `${internalPath}:Internal`;
    const entry = result.get(key);
    // Internal gets as: true from same-file as-prop usage, but styles should not
    // be set by the cross-file className consumer (Internal is not exported)
    expect(entry?.styles).not.toBe(true);
  });

  it("lookup returns undefined for unknown components", () => {
    expect(result.get("/unknown.tsx:Foo")).toBeUndefined();
  });

  it("detects cross-file ref usage", () => {
    const textInputPath = realpathSync(path.join(fixtureDir, "components/TextInput.tsx"));
    const key = `${textInputPath}:TextInput`;
    expect(result.get(key)).toMatchObject({ as: false, ref: true, styles: false });
  });

  it("detects same-file ref usage", () => {
    const focusBoxPath = realpathSync(path.join(fixtureDir, "components/FocusBox.tsx"));
    const key = `${focusBoxPath}:FocusBox`;
    expect(result.get(key)?.ref).toBe(true);
  });

  it("detects cross-file ref usage via aliased import", () => {
    const searchInputPath = realpathSync(path.join(fixtureDir, "components/SearchInput.tsx"));
    const key = `${searchInputPath}:SearchInput`;
    expect(result.get(key)?.ref).toBe(true);
  });

  it("detects ref even when file contains TypeScript as-cast on the same name", () => {
    const textInputPath = realpathSync(path.join(fixtureDir, "components/TextInput.tsx"));
    const key = `${textInputPath}:TextInput`;
    expect(result.get(key)?.ref).toBe(true);
  });

  it("detects cross-file as-prop usage via aliased import", () => {
    const navLinkPath = realpathSync(path.join(fixtureDir, "components/NavLink.tsx"));
    const key = `${navLinkPath}:NavLink`;
    expect(result.get(key)?.as).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// className/style prop detection — dedicated test with isolated fixture
// ---------------------------------------------------------------------------

describe("runPrepass createExternalInterface — className/style detection", () => {
  let fixtureDir: string;
  let result: Map<string, ExternalInterfaceResult>;

  beforeAll(async () => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), "extract-external-interface-classname-"));

    writeFileSync(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { baseUrl: "." } }),
    );

    const componentsDir = path.join(fixtureDir, "components");
    mkdirSync(componentsDir, { recursive: true });

    // Exported styled component
    writeFileSync(
      path.join(componentsDir, "Box.tsx"),
      'import styled from "styled-components";\nexport const Box = styled.div`display: flex;`;',
    );

    // Exported styled component (only consumed via style prop)
    writeFileSync(
      path.join(componentsDir, "Wrapper.tsx"),
      'import styled from "styled-components";\nexport const Wrapper = styled.div`padding: 16px;`;',
    );

    // Non-exported styled component
    writeFileSync(
      path.join(componentsDir, "Secret.tsx"),
      'import styled from "styled-components";\nconst Secret = styled.div`color: red;`;\nexport const App = () => <Secret />;',
    );

    // Exported styled component NOT consumed with className/style (control)
    writeFileSync(
      path.join(componentsDir, "Plain.tsx"),
      'import styled from "styled-components";\nexport const Plain = styled.div`margin: 0;`;',
    );

    const consumersDir = path.join(fixtureDir, "consumers");
    mkdirSync(consumersDir, { recursive: true });

    // Consumer with className (NO styled-components import)
    writeFileSync(
      path.join(consumersDir, "use-box.tsx"),
      'import { Box } from "../components/Box";\nexport const App = () => <Box className="extra">Content</Box>;',
    );

    // Consumer with style prop (NO styled-components import)
    writeFileSync(
      path.join(consumersDir, "use-wrapper.tsx"),
      'import { Wrapper } from "../components/Wrapper";\nexport const App = () => <Wrapper style={{ margin: 10 }}>Content</Wrapper>;',
    );

    // Consumer with multiline JSX className (component on different line than className=)
    writeFileSync(
      path.join(consumersDir, "multiline.tsx"),
      [
        'import { Box } from "../components/Box";',
        "export const App = () => (",
        "  <Box",
        '    className="stretched"',
        "    data-testid='box'",
        "  >",
        "    Multiline",
        "  </Box>",
        ");",
      ].join("\n"),
    );

    // Consumer passing className to non-exported Secret (should NOT trigger)
    writeFileSync(
      path.join(consumersDir, "use-secret.tsx"),
      'import { Secret } from "../components/Secret";\nexport const App = () => <Secret className="x">Text</Secret>;',
    );

    // Consumer that uses Plain without className/style (control — should NOT appear)
    writeFileSync(
      path.join(consumersDir, "use-plain.tsx"),
      'import { Plain } from "../components/Plain";\nexport const App = () => <Plain>Text</Plain>;',
    );

    // Same-file className usage (component + JSX in same file)
    writeFileSync(
      path.join(componentsDir, "SameFile.tsx"),
      'import styled from "styled-components";\nexport const SameFile = styled.div`color: blue;`;\nexport const App = () => <SameFile className="local">Text</SameFile>;',
    );

    // Aliased import with className (import { Box as MyBox })
    writeFileSync(
      path.join(componentsDir, "Aliased.tsx"),
      'import styled from "styled-components";\nexport const Aliased = styled.div`color: green;`;',
    );
    writeFileSync(
      path.join(consumersDir, "aliased-className.tsx"),
      'import { Aliased as MyAliased } from "../components/Aliased";\nexport const App = () => <MyAliased className="extra">Text</MyAliased>;',
    );

    // Button component for testing boolean shorthand attrs
    writeFileSync(
      path.join(componentsDir, "Button.tsx"),
      'import styled from "styled-components";\nexport const Button = styled.button`padding: 8px;`;',
    );
    // Consumer with boolean shorthand attribute (no `=` sign) - tests P2 fix
    writeFileSync(
      path.join(consumersDir, "boolean-shorthand.tsx"),
      'import { Button } from "../components/Button";\nexport const App = () => <Button className="btn" disabled>Click</Button>;',
    );

    // Consumer passes element props only. This should widen element props without enabling
    // className/style/sx support.
    writeFileSync(
      path.join(componentsDir, "ElementOnly.tsx"),
      'import styled from "styled-components";\nexport const ElementOnly = styled.div`padding: 8px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "element-only.tsx"),
      'import { ElementOnly } from "../components/ElementOnly";\nexport const App = () => <ElementOnly onClick={() => undefined} aria-label="Element only">Click</ElementOnly>;',
    );

    // Consumer spreads unknown props. This stays conservative because the spread may contain
    // className or style.
    writeFileSync(
      path.join(componentsDir, "SpreadOnly.tsx"),
      'import styled from "styled-components";\nexport const SpreadOnly = styled.div`padding: 8px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "spread-only.tsx"),
      'import { SpreadOnly } from "../components/SpreadOnly";\nconst props = {};\nexport const App = () => <SpreadOnly {...props}>Spread</SpreadOnly>;',
    );

    // JSX-looking comments and strings should not count as real consumers.
    writeFileSync(
      path.join(componentsDir, "Commented.tsx"),
      'import styled from "styled-components";\nexport const Commented = styled.div`padding: 8px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "commented.tsx"),
      [
        'import { Commented } from "../components/Commented";',
        "const example = '<Commented className=\"ghost\" />';",
        "/*",
        '  <Commented style={{ color: "red" }} />',
        "*/",
        "export const App = () => null;",
      ].join("\n"),
    );

    // Namespace/member JSX should still be attributed to the exported component.
    writeFileSync(
      path.join(componentsDir, "NamespaceButton.tsx"),
      'import styled from "styled-components";\nexport const NamespaceButton = styled.button`padding: 8px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "namespace-member.tsx"),
      'import * as Components from "../components/NamespaceButton";\nexport const App = () => <Components.NamespaceButton className="namespaced" data-testid="ns">NS</Components.NamespaceButton>;',
    );

    // Member JSX should only match when the member object is the namespace import.
    writeFileSync(
      path.join(componentsDir, "MenuButton.tsx"),
      'import styled from "styled-components";\nexport const MenuButton = styled.button`padding: 8px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "unrelated-member.tsx"),
      [
        'import { MenuButton } from "../components/MenuButton";',
        "const Menu = { MenuButton: (props: { className?: string }) => <button {...props} /> };",
        'export const App = () => <Menu.MenuButton className="local-menu" />;',
      ].join("\n"),
    );

    // Namespace imports should not validate unrelated local JSX identifiers.
    writeFileSync(
      path.join(componentsDir, "NamespaceOnly.tsx"),
      'import styled from "styled-components";\nexport const NamespaceOnly = styled.div`padding: 8px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "namespace-unrelated-local.tsx"),
      [
        'import * as NamespaceOnlyModule from "../components/NamespaceOnly";',
        "const NamespaceOnly = (props: { className?: string }) => <div {...props} />;",
        'export const App = () => <NamespaceOnly className="local-only" />;',
        "void NamespaceOnlyModule;",
      ].join("\n"),
    );

    // Valid DOM attrs should widen element props even when they are not explicitly listed.
    writeFileSync(
      path.join(componentsDir, "ResponsiveImage.tsx"),
      'import styled from "styled-components";\nexport const ResponsiveImage = styled.img`display: block;`;',
    );
    writeFileSync(
      path.join(consumersDir, "responsive-image.tsx"),
      'import { ResponsiveImage } from "../components/ResponsiveImage";\nexport const App = () => <ResponsiveImage srcSet="hero-2x.png 2x" sizes="100vw" />;',
    );

    // Lowercase namespace member JSX should still be scanned for element-only props.
    writeFileSync(
      path.join(componentsDir, "LowerNamespaceImage.tsx"),
      'import styled from "styled-components";\nexport const LowerNamespaceImage = styled.img`display: block;`;',
    );
    writeFileSync(
      path.join(consumersDir, "lower-namespace-image.tsx"),
      'import * as ui from "../components/LowerNamespaceImage";\nexport const App = () => <ui.LowerNamespaceImage srcSet="hero-2x.png 2x" sizes="100vw" />;',
    );

    // JSX passed through an attribute should still be scanned.
    writeFileSync(
      path.join(componentsDir, "SlottedButton.tsx"),
      'import styled from "styled-components";\nexport const SlottedButton = styled.button`padding: 8px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "slotted-button.tsx"),
      'import { SlottedButton } from "../components/SlottedButton";\nfunction Slot(props: { content: React.ReactNode }) { return <div>{props.content}</div>; }\nexport const App = () => <Slot content={<SlottedButton className="inside-slot">Slot</SlottedButton>} />;',
    );

    // Parse-failing consumers should fall back to conservative regex detection.
    writeFileSync(
      path.join(componentsDir, "ParseFallback.tsx"),
      'import styled from "styled-components";\nexport const ParseFallback = styled.div`padding: 8px;`;',
    );
    writeFileSync(
      path.join(consumersDir, "parse-fallback.tsx"),
      'import { ParseFallback } from "../components/ParseFallback";\nexport const App = () => <ParseFallback className="from-invalid-file">Fallback</ParseFallback>;\nconst broken = ;',
    );

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

  it("detects cross-file className usage (consumer has no styled-components import)", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/Box.tsx:Box"]).toMatchObject({
      as: false,
      ref: false,
      styles: true,
    });
  });

  it("detects cross-file style prop usage", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/Wrapper.tsx:Wrapper"]).toMatchObject({
      as: false,
      ref: false,
      styles: true,
    });
  });

  it("detects multiline JSX className usage", () => {
    // The regex should match `<Box\n    className=` across lines
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/Box.tsx:Box"]?.styles).toBe(true);
  });

  it("does not detect className on non-exported component", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    // Secret is not exported, so className usage should not trigger styles: true
    expect(snapshot["components/Secret.tsx:Secret"]).toBeUndefined();
  });

  it("does not detect components without className/style usage", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    // Plain has no className/style consumers, should not appear
    expect(snapshot["components/Plain.tsx:Plain"]).toBeUndefined();
  });

  it("detects same-file className usage", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/SameFile.tsx:SameFile"]).toMatchObject({
      as: false,
      ref: false,
      styles: true,
    });
  });

  it("detects aliased import className usage", () => {
    // import { Aliased as MyAliased } → <MyAliased className="extra">
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/Aliased.tsx:Aliased"]).toMatchObject({
      as: false,
      ref: false,
      styles: true,
    });
  });

  it("detects boolean shorthand attribute as element prop (P2 fix)", () => {
    // <Button className="btn" disabled> — `disabled` has no `=`, should still count as elementProps
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/Button.tsx:Button"]).toMatchObject({
      className: true,
      elementProps: true,
      styles: true,
    });
  });

  it("detects element-only consumers without enabling className/style support", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/ElementOnly.tsx:ElementOnly"]).toMatchObject({
      className: false,
      elementProps: true,
      spreadProps: false,
      style: false,
      styles: false,
    });
  });

  it("treats spread-only consumers as potential className/style usage", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/SpreadOnly.tsx:SpreadOnly"]).toMatchObject({
      className: false,
      elementProps: false,
      spreadProps: true,
      style: false,
      styles: true,
    });
  });

  it("ignores JSX-looking comments and strings", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/Commented.tsx:Commented"]).toBeUndefined();
  });

  it("detects namespace member JSX consumers", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/NamespaceButton.tsx:NamespaceButton"]).toMatchObject({
      className: true,
      elementProps: true,
      spreadProps: false,
      style: false,
      styles: true,
    });
  });

  it("does not match unrelated member JSX by property name only", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/MenuButton.tsx:MenuButton"]).toBeUndefined();
  });

  it("does not let namespace imports validate unrelated local JSX identifiers", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/NamespaceOnly.tsx:NamespaceOnly"]).toBeUndefined();
  });

  it("treats unlisted DOM attributes as element props", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/ResponsiveImage.tsx:ResponsiveImage"]).toMatchObject({
      className: false,
      elementProps: true,
      spreadProps: false,
      style: false,
      styles: false,
    });
  });

  it("detects element-only props on lowercase namespace member JSX", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/LowerNamespaceImage.tsx:LowerNamespaceImage"]).toMatchObject({
      className: false,
      elementProps: true,
      spreadProps: false,
      style: false,
      styles: false,
    });
  });

  it("detects JSX consumers nested inside attribute expressions", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/SlottedButton.tsx:SlottedButton"]).toMatchObject({
      className: true,
      elementProps: false,
      spreadProps: false,
      style: false,
      styles: true,
    });
  });

  it("falls back to regex consumer detection when parsing fails", () => {
    const snapshot = toSnapshot(result, fixtureDir);
    expect(snapshot["components/ParseFallback.tsx:ParseFallback"]).toMatchObject({
      className: true,
      elementProps: false,
      spreadProps: false,
      style: false,
      styles: true,
    });
  });

  it("full snapshot", () => {
    expect(toSnapshot(result, fixtureDir)).toMatchInlineSnapshot(`
      {
        "components/Aliased.tsx:Aliased": {
          "as": false,
          "className": true,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "components/Box.tsx:Box": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "components/Button.tsx:Button": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "components/ElementOnly.tsx:ElementOnly": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "components/LowerNamespaceImage.tsx:LowerNamespaceImage": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "components/NamespaceButton.tsx:NamespaceButton": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "components/ParseFallback.tsx:ParseFallback": {
          "as": false,
          "className": true,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "components/ResponsiveImage.tsx:ResponsiveImage": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "components/SameFile.tsx:SameFile": {
          "as": false,
          "className": true,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "components/SlottedButton.tsx:SlottedButton": {
          "as": false,
          "className": true,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "components/SpreadOnly.tsx:SpreadOnly": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": true,
          "style": false,
          "styles": true,
        },
        "components/Wrapper.tsx:Wrapper": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
      }
    `);
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
    expect(snapshot["packages/ui/src/components/Button.tsx:Button"]).toMatchObject({
      as: true,
      ref: false,
      styles: true,
    });
    expect(snapshot["packages/ui/src/components/Text.tsx:Text"]).toMatchObject({
      as: false,
      ref: false,
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
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "packages/ui/src/components/Text.tsx:Text": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
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
        "test-cases/_unsupported.wrapper-mergerImported.input.tsx:StyledLoading": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/asProp-crossFile.input.tsx:HeaderTitle": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/asProp-exported.input.tsx:ContentViewContainer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": true,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/asProp-exported.input.tsx:StaticAsWrapper": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/asProp-exported.input.tsx:StyledWrapper": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs-labelAs.input.tsx:Label": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": true,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs-polymorphicAs.input.tsx:FixedHrefText": {
          "as": true,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs-polymorphicAs.input.tsx:Label": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs-tabIndex.input.tsx:ScrollableDiv": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs-tabIndex.input.tsx:ScrollableFlex": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:Background": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:FocusIndexSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:FocusableScroll": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:ImportedIntersectionSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:ImportedSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:InheritedSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:MethodSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:MultiImportedSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:PickSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:ScrollableWithType": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:Section": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:SharedAttrsSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:SharedPlainSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:SharedTransientAttrsSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:SharedTransientPlainSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:TextInput": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:TransientUnionSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:UnionSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:UtilitySection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/attrs.input.tsx:UtilityWrappedUnionSection": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/basic-sharedBase.input.tsx:Absolute": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/basic-sharedBase.input.tsx:Relative": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/basic.input.tsx:Select": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/conditional-multiProp.input.tsx:Spacer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/conditional-nestedProp.input.tsx:Badge": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/conditional-propThemeFallback.input.tsx:ColorBadge": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/conditional-spacerObservedSizeVariants.input.tsx:Spacer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/conditional-styleType.input.tsx:IconWithTransform": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/conditional-wrappedComponentPropPassthrough.input.tsx:Icon": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-conditionalIfBlock.input.tsx:Container": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-conditionalProp.input.tsx:Container": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-conditionalProp.input.tsx:HighlightedShadowContainer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-conditionalProp.input.tsx:InvertedTernaryPureDynamicContainer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-conditionalProp.input.tsx:MixedContainer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-conditionalProp.input.tsx:PureDynamicContainer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-conditionalProp.input.tsx:TernaryPureDynamicContainer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-destructuredDefaultTemplateLiteral.input.tsx:Tile": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/cssHelper-dynamicPropertyNameNonProp.input.tsx:Stack": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/cssHelper-dynamicPropertyNamePropStatic.input.tsx:Strip": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/cssHelper-simple.input.tsx:BranchedContainer": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssHelper-simple.input.tsx:Container": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/cssVariable-flexShrinkFallback.input.tsx:ColumnContainer": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/example-actionMenuDivider-exported.input.tsx:TextDividerContainer": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/example-flex.input.tsx:Flex": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/externalStyles-element.input.tsx:ColorBadge": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/externalStyles-input.input.tsx:StyledInput": {
          "as": true,
          "className": false,
          "elementProps": true,
          "ref": true,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/helper-callPropArg.input.tsx:Box": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/htmlProp-element.input.tsx:TextColor": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/htmlProp-input.input.tsx:RangeInput": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/import-react.input.tsx:ChoiceButton": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/import-reactTypeOnly.input.tsx:ToolbarButton": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/inlineBase-booleanVariantKey.input.tsx:Container": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/inlineBase-hyphenatedValue.input.tsx:SpacedRow": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/inlineBase-singletonBooleanWithTemplateExpr.input.tsx:Container": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/inlineBase-stringVariantExported.input.tsx:Card": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/keyframes-nameCollision.input.tsx:MoveIcon": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/lib/action-menu-divider.tsx:ActionMenuGroupHeader": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/action-menu-divider.tsx:ActionMenuTextDivider": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/cross-file-icon.styled.tsx:CrossFileIcon": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": true,
          "style": false,
          "styles": true,
        },
        "test-cases/lib/cross-file-icon.styled.tsx:CrossFileLink": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": false,
          "styles": true,
        },
        "test-cases/lib/cross-file-icon.styled.tsx:TruncatedLabel": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": true,
          "style": false,
          "styles": true,
        },
        "test-cases/lib/external-component.tsx:ExternalComponent": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/flex.ts:Flex": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/icon.ts:Icon": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/inline-base-flex.tsx:Flex": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/inner-sx-control.tsx:InnerSxControl": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/loading.tsx:Loading": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/styled-codeblock.tsx:Codeblock": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/styled-group-header.tsx:GroupHeader": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/styled-text.tsx:Text": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/sx-aware-component.tsx:SxAwareButton": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/sx-aware-text.tsx:ImportedIcon": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/sx-aware-text.tsx:ImportedTooltip": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/sx-aware-text.tsx:Text": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/sx-branchy-box.tsx:BranchyBox": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/sx-branchy-box.tsx:NestedSxBox": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/sx-branchy-box.tsx:StaticFirstBranchyBox": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/sx-dynamic-flex.tsx:DynamicFlex": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/text.ts:Text": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/lib/user-avatar.tsx:UserAvatar": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": true,
          "styles": true,
        },
        "test-cases/naming-elementPropsOnly.input.tsx:ClickableBox": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/naming-narrowType.input.tsx:TextColor": {
          "as": false,
          "className": true,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "test-cases/ref-exported.input.tsx:StyledDiv": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": true,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/ref-exported.input.tsx:StyledInput": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": true,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/selector-attributeInputReadonly.input.tsx:TextInput": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/selector-attributeLinkExported.input.tsx:Link": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/selector-descendantComponent.input.tsx:ContainerLink": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/shouldForwardProp-dynamicDeclaration.input.tsx:FlexBox": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/shouldForwardProp-exported.input.tsx:ExplicitFilterButton": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/shouldForwardProp-withAttrs.input.tsx:Text": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/staticProp-basic.input.tsx:CommandMenuGroupHeader": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/staticProp-basic.input.tsx:CommandMenuTextDivider": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/staticProp-basic.input.tsx:ExtendedButton": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/staticProp-basic.input.tsx:ListItem": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/theme-conditionalIndexed.input.tsx:Badge": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/transientProp-exportedRename.input.tsx:ColorChip": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/transientProp-notForwarded.input.tsx:Image": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/transientProp-notForwarded.input.tsx:Scrollable": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/transientProp-sharedTypeSpread.input.tsx:CardB": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": true,
          "style": false,
          "styles": true,
        },
        "test-cases/typeHandling-duplicateIdentifier.input.tsx:Card": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "test-cases/typeHandling-duplicateIdentifier.input.tsx:IconButton": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/typeHandling-missingAnnotation.input.tsx:Box": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/typeHandling-missingAnnotation.input.tsx:Input": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/typeHandling-preservedExports.input.tsx:Button": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": true,
          "style": false,
          "styles": true,
        },
        "test-cases/variant-dynamicIndexAny.input.tsx:Badge": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/variant-localObservedNumeric.input.tsx:Fader": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/variant-localObservedNumeric.input.tsx:FlexiblePanel": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/variant-localObservedNumeric.input.tsx:Panel": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-children.input.tsx:StyledDivider": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-childrenPassthrough.input.tsx:Container": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-conditionalPropForwarding.input.tsx:Card": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-noChildren.input.tsx:StyledTextDivider": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-outOfScopeClassNameStyle.input.tsx:StatusBadge": {
          "as": false,
          "className": false,
          "elementProps": false,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/wrapper-propsIncomplete.input.tsx:Highlight": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": true,
        },
        "test-cases/wrapper-propsIncomplete.input.tsx:TextColor": {
          "as": false,
          "className": true,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/wrapper-samePropsType.input.tsx:Button": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-samePropsType.input.tsx:Wrapper": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": true,
          "styles": true,
        },
        "test-cases/wrapper-styleFnPropNotForwarded.input.tsx:Scrollable": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-sxAware.input.tsx:DraggableSxButton": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-sxAware.input.tsx:ExportedAccentButton": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
        "test-cases/wrapper-sxAware.input.tsx:ExportedToggleButton": {
          "as": false,
          "className": false,
          "elementProps": true,
          "ref": false,
          "spreadProps": false,
          "style": false,
          "styles": false,
        },
      }
    `);
  });
});
