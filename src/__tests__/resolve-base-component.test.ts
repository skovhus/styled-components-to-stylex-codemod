import { describe, it, expect, vi } from "vitest";
import jscodeshift from "jscodeshift";
import { transformWithWarnings } from "../transform.js";
import { fixtureAdapter } from "./fixture-adapters.js";
import type { TransformOptions } from "../transform.js";

vi.mock("../internal/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    error: vi.fn(),
    logWarnings: vi.fn(),
  },
}));

const j = jscodeshift.withParser("tsx");

function run(source: string): string | null {
  const result = transformWithWarnings(
    { source, path: "/test/test.tsx" },
    { jscodeshift: j, j, stats: () => {} } as any,
    { adapter: fixtureAdapter } as TransformOptions,
  );
  return result.code;
}

describe("resolveBaseComponent", () => {
  it("inlines attrs-only Flex — no wrapper for unexported component", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true, gap: 16 })\`
  padding: 8px;
  background-color: white;
\`;

export function App() {
  return <Container>Flex content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    expect(output).toContain('display: "flex"');
    expect(output).toContain('flexDirection: "column"');
    expect(output).toContain('gap: "16px"');
    expect(output).not.toContain('from "./lib/flex"');
    expect(output).not.toContain("function Container");
    expect(output).toContain("<div");
  });

  it("inlines Flex with no attrs — gets base defaults", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex)\`
  padding: 12px;
\`;

export function App() {
  return <Container>Default flex</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    expect(output).toContain('display: "flex"');
    expect(output).toContain('padding: "12px"');
    expect(output).not.toContain('from "./lib/flex"');
  });

  it("template CSS overrides inlined base CSS", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const GridContainer = styled(Flex).attrs({ column: true })\`
  display: grid;
  grid-template-columns: 1fr 1fr;
\`;

export function App() {
  return <GridContainer>content</GridContainer>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    expect(output).toContain('display: "grid"');
    expect(output).toContain('flexDirection: "column"');
    expect(output).not.toContain('"flex"');
  });

  it("per-site JSX props create variant dimensions", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

export function App() {
  return (
    <>
      <Container align="center">Center</Container>
      <Container align="start">Start</Container>
      <Container>Default</Container>
    </>
  );
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    expect(output).toContain("containerAlignVariants");
    expect(output).toContain('alignItems: "center"');
    expect(output).toContain('alignItems: "start"');
    expect(output).toContain('display: "flex"');
    expect(output).toContain('flexDirection: "column"');
  });

  it("returns undefined for unknown components — no inlining", () => {
    const input = `
import styled from "styled-components";
import { UnknownComponent } from "./lib/unknown";

const Wrapper = styled(UnknownComponent)\`
  color: red;
\`;

export function App() {
  return <Wrapper>content</Wrapper>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    expect(output).toContain("UnknownComponent");
  });
});
