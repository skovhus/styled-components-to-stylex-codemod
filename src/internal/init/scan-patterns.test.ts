import { describe, expect, it, beforeAll } from "vitest";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { scanPatterns } from "./scan-patterns.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "__test-fixtures__");

// ── Fixture file helpers ────────────────────────────────────────────────

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

// ── Tests ───────────────────────────────────────────────────────────────

describe("scanPatterns", () => {
  it("detects theme paths from props.theme.X.Y", () => {
    const file = writeFixture(
      "theme-props.tsx",
      `
import styled from "styled-components";
const Box = styled.div\`
  color: \${(props) => props.theme.color.labelBase};
  background: \${(props) => props.theme.color.background};
  padding: \${(props) => props.theme.spacing.sm};
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.themePaths).toContain("color.labelBase");
    expect(result.themePaths).toContain("color.background");
    expect(result.themePaths).toContain("spacing.sm");
    expect(result.themeRoots).toEqual(new Set(["color", "spacing"]));
    expect(result.filesWithStyledComponents).toBe(1);
  });

  it("detects theme paths from destructured ({ theme })", () => {
    const file = writeFixture(
      "theme-destructured.tsx",
      `
import styled from "styled-components";
const Box = styled.div\`
  color: \${({ theme }) => theme.color.primary};
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.themePaths).toContain("color.primary");
    expect(result.themeRoots).toContain("color");
  });

  it("detects indexed theme lookups", () => {
    const file = writeFixture(
      "theme-indexed.tsx",
      `
import styled from "styled-components";
const Box = styled.div\`
  color: \${(props) => props.theme.color[props.textColor]};
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.hasIndexedThemeLookup).toBe(true);
    expect(result.themeRoots).toContain("color");
  });

  it("detects CSS variables", () => {
    const file = writeFixture(
      "css-vars.tsx",
      `
import styled from "styled-components";
const Box = styled.div\`
  color: var(--primary-color);
  background: var(--bg-color, white);
  border: 1px solid var(--border);
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.cssVariables).toContain("--primary-color");
    expect(result.cssVariables).toContain("--bg-color");
    expect(result.cssVariables).toContain("--border");
  });

  it("detects helper function calls in interpolations", () => {
    const file = writeFixture(
      "helper-calls.tsx",
      `
import styled from "styled-components";
import { spacing } from "./design-tokens";
const Box = styled.div\`
  padding: \${spacing(2)};
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.helperCalls.has("spacing")).toBe(true);
    expect(result.helperCalls.get("spacing")).toEqual({
      source: "./design-tokens",
      importedName: "spacing",
    });
  });

  it("detects selector interpolations", () => {
    const file = writeFixture(
      "selector-interp.tsx",
      `
import styled from "styled-components";
import { Icon } from "./icon";
const Box = styled.div\`
  \${Icon} {
    fill: red;
  }
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.selectorInterpolations.has("Icon")).toBe(true);
    expect(result.selectorInterpolations.get("Icon")).toEqual({
      source: "./icon",
      importedName: "Icon",
    });
  });

  it("detects styled() wrappers around imported components", () => {
    const file = writeFixture(
      "styled-wrapper.tsx",
      `
import styled from "styled-components";
import { Button } from "./button";
const StyledButton = styled(Button)\`
  color: red;
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.styledWrappers.has("Button")).toBe(true);
    expect(result.styledWrappers.get("Button")).toEqual({
      source: "./button",
      importedName: "Button",
    });
  });

  it("detects useTheme import", () => {
    const file = writeFixture(
      "use-theme.tsx",
      `
import styled, { useTheme } from "styled-components";
const Box = styled.div\`
  color: red;
\`;
`,
    );
    const result = scanPatterns([file]);
    expect(result.hasUseTheme).toBe(true);
  });

  it("skips files without styled-components", () => {
    const file = writeFixture(
      "no-styled.tsx",
      `
import React from "react";
const Box = () => <div />;
`,
    );
    const result = scanPatterns([file]);
    expect(result.filesScanned).toBe(1);
    expect(result.filesWithStyledComponents).toBe(0);
    expect(result.themePaths.size).toBe(0);
  });

  it("counts files correctly", () => {
    const f1 = writeFixture(
      "multi-1.tsx",
      `
import styled from "styled-components";
const A = styled.div\`color: \${(p) => p.theme.color.x};\`;
`,
    );
    const f2 = writeFixture(
      "multi-2.tsx",
      `
import styled from "styled-components";
const B = styled.div\`color: red;\`;
`,
    );
    const f3 = writeFixture("multi-3.tsx", `const C = () => <div />;`);
    const result = scanPatterns([f1, f2, f3]);
    expect(result.filesScanned).toBe(3);
    expect(result.filesWithStyledComponents).toBe(2);
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
