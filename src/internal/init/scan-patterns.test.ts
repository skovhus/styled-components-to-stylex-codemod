import { describe, expect, it, beforeAll } from "vitest";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { scanPatterns } from "./scan-patterns.js";
import { generateAdapterStub } from "./generate-adapter-stub.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "__test-fixtures__");

function writeFixture(name: string, content: string): string {
  const path = resolve(FIXTURES_DIR, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

beforeAll(() => {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  return () => {
    rmSync(FIXTURES_DIR, { recursive: true, force: true });
  };
});

// Edge cases not covered by the init-snapshot integration test (which runs against real test-cases).
describe("scanPatterns edge cases", () => {
  it("skips files without styled-components", () => {
    const file = writeFixture(
      "no-styled.tsx",
      `import React from "react";\nconst Box = () => <div />;`,
    );
    const result = scanPatterns([file]);
    expect(result.filesScanned).toBe(1);
    expect(result.filesWithStyledComponents).toBe(0);
  });

  it("counts multiple files correctly", () => {
    const f1 = writeFixture(
      "multi-1.tsx",
      'import styled from "styled-components";\nconst A = styled.div`color: red;`;',
    );
    const f2 = writeFixture("multi-2.tsx", "const C = () => <div />;");
    const result = scanPatterns([f1, f2]);
    expect(result.filesScanned).toBe(2);
    expect(result.filesWithStyledComponents).toBe(1);
  });

  it("handles styled(Component).attrs() chain", () => {
    const file = writeFixture(
      "attrs-wrapper.tsx",
      `
import styled from "styled-components";
import { Input } from "./input";
const StyledInput = styled(Input).attrs({ type: "text" })\`
  border: 1px solid \${(p) => p.theme.color.border};
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.styledWrappers.has("Input")).toBe(true);
    expect(result.themePaths).toContain("color.border");
  });

  it("detects helper calls inside arrow interpolations", () => {
    const file = writeFixture(
      "arrow-helper.tsx",
      `
import styled from "styled-components";
import { lighten } from "./color-utils";
const Box = styled.div\`
  color: \${(props) => lighten(props.color)};
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.helperCalls.has("lighten")).toBe(true);
    expect(result.helperCalls.get("lighten")?.importedName).toBe("lighten");
  });
});

describe("generateAdapterStub uses imported names (not local aliases)", () => {
  it("callMapping uses importedName, not local alias", () => {
    const file = writeFixture(
      "aliased-helper.tsx",
      `
import styled from "styled-components";
import { originalHelper as myAlias } from "./helpers";
const Box = styled.div\`
  color: \${myAlias("red")};
\`;
`,
    );
    const patterns = scanPatterns([file]);
    // Scanner stores under local alias — stub should emit importedName
    expect(patterns.helperCalls.has("myAlias")).toBe(true);
    const stub = generateAdapterStub(patterns);
    expect(stub).toContain('"originalHelper"');
    expect(stub).not.toMatch(/callMapping[\s\S]*"myAlias"/);
  });

  it("selectorMapping uses importedName, not local alias", () => {
    const file = writeFixture(
      "aliased-selector.tsx",
      `
import styled from "styled-components";
import { OriginalComp as AliasedComp } from "./components";
const Wrapper = styled.div\`
  \${AliasedComp} { color: red; }
\`;
`,
    );
    const patterns = scanPatterns([file]);
    expect(patterns.selectorInterpolations.has("AliasedComp")).toBe(true);
    const stub = generateAdapterStub(patterns);
    expect(stub).toContain('"OriginalComp');
    expect(stub).not.toMatch(/selectorMapping[\s\S]*"AliasedComp/);
  });

  it("generates exact pattern for bare selector, wildcard for member-access selector", () => {
    const file = writeFixture(
      "bare-vs-member-selector.tsx",
      `
import styled from "styled-components";
import { Icon } from "./icon";
import { screenSize } from "./breakpoints";
const Wrapper = styled.div\`
  \${Icon} { color: red; }
  @media \${screenSize.desktop} { padding: 8px; }
\`;
`,
    );
    const patterns = scanPatterns([file]);
    expect(patterns.selectorInterpolations.get("Icon")?.hasMemberAccess).toBe(false);
    expect(patterns.selectorInterpolations.get("screenSize")?.hasMemberAccess).toBe(true);

    const stub = generateAdapterStub(patterns);
    expect(stub).toContain('"Icon"');
    expect(stub).not.toContain('"Icon.*"');
    expect(stub).toContain('"screenSize.*"');
  });
});
