import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { createExternalInterface } from "../consumer-analyzer.js";

/** Convert analysis Map to a snapshot-friendly sorted record with relative paths */
const toSnapshot = (
  map: ReturnType<typeof createExternalInterface>["map"],
  base = process.cwd(),
) => {
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
// Integration tests (temp fixture files + rg)
// ---------------------------------------------------------------------------

describe("createExternalInterface", () => {
  let fixtureDir: string;
  let result: ReturnType<typeof createExternalInterface>;

  beforeAll(() => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), "consumer-analyzer-test-"));

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

    // Run analysis once for all tests
    const originalCwd = process.cwd();
    try {
      process.chdir(fixtureDir);
      result = createExternalInterface({ searchDirs: ["."] });
    } finally {
      process.chdir(originalCwd);
    }
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("detects as-prop and re-styled usage", () => {
    expect(toSnapshot(result.map, fixtureDir)).toMatchInlineSnapshot(`
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
          "styles": false,
        },
      }
    `);
  });

  it("get returns flags for known components", () => {
    const badgePath = realpathSync(path.join(fixtureDir, "components/Badge.tsx"));
    expect(
      result.get({
        filePath: badgePath,
        componentName: "Badge",
        exportName: "Badge",
        isDefaultExport: false,
      }),
    ).toEqual({ as: true, styles: true });
  });

  it("get returns default for unknown components", () => {
    expect(
      result.get({
        filePath: "/unknown.tsx",
        componentName: "Foo",
        exportName: "Foo",
        isDefaultExport: false,
      }),
    ).toEqual({ styles: false, as: false });
  });
});

// ---------------------------------------------------------------------------
// Snapshot test — on test-cases/
// ---------------------------------------------------------------------------

describe("createExternalInterface snapshot on test-cases", () => {
  it("matches snapshot for test-cases directory", () => {
    const result = createExternalInterface({ searchDirs: ["test-cases/"] });
    expect(toSnapshot(result.map)).toMatchInlineSnapshot(`
      {
        "test-cases/asProp-basic.input.tsx:Button": {
          "as": true,
          "styles": false,
        },
        "test-cases/asProp-basic.input.tsx:StyledText": {
          "as": true,
          "styles": false,
        },
        "test-cases/asProp-componentRef.input.tsx:AnimatedText": {
          "as": true,
          "styles": false,
        },
        "test-cases/asProp-forwarded.input.tsx:Button": {
          "as": true,
          "styles": false,
        },
        "test-cases/asProp-forwarded.input.tsx:ButtonWrapper": {
          "as": true,
          "styles": false,
        },
        "test-cases/asProp-usage.input.tsx:FullWidthCopyText": {
          "as": true,
          "styles": false,
        },
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
        "test-cases/lib/external-component.tsx:Link": {
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
