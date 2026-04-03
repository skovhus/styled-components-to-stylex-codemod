import { describe, expect, it, beforeAll } from "vitest";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { scanPatterns } from "./scan-patterns.js";

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
});
