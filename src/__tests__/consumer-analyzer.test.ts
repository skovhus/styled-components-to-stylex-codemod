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
