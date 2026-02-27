import { describe, it, expect, vi } from "vitest";
import jscodeshift from "jscodeshift";
import { transformWithWarnings } from "../transform.js";
import { fixtureAdapter } from "./fixture-adapters.js";
import type { TransformOptions } from "../transform.js";
import type { Adapter } from "../adapter.js";

vi.mock("../internal/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    error: vi.fn(),
    logWarnings: vi.fn(),
  },
}));

const j = jscodeshift.withParser("tsx");

function run(source: string, adapter: Adapter = fixtureAdapter): string | null {
  const result = transformWithWarnings(
    { source, path: "/test/test.tsx" },
    { jscodeshift: j, j, stats: () => {} } as any,
    { adapter } as TransformOptions,
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

  it("extending an inlined component works (styled(Container) where Container was inlined)", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

const StyledContainer = styled(Container)\`
  background-color: red;
\`;

export function App() {
  return <StyledContainer>Extended</StyledContainer>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Should contain both base styles and extended styles
    expect(output).toContain('display: "flex"');
    expect(output).toContain('flexDirection: "column"');
    expect(output).toContain('padding: "8px"');
    expect(output).toContain('backgroundColor: "red"');
    expect(output).not.toContain('from "./lib/flex"');
    // The extension should reference the base style key
    expect(output).toContain("styles.container");
    expect(output).toContain("styles.styledContainer");
  });

  it("bails on function attrs (ArrowFunctionExpression)", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs(props => ({
  column: props.$isVertical,
}))\`
  padding: 8px;
\`;

export function App() {
  return <Container $isVertical>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Function attrs have dynamic prop derivation — skip inlining entirely
    expect(output).toContain("Flex");
  });

  it("bails on defaultAttrs (props.x ?? value)", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs(props => ({
  column: props.column ?? true,
}))\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // defaultAttrs mean the prop has dynamic behavior — skip inlining
    expect(output).toContain("Flex");
  });

  it("multiple styled(Flex) decls in same file", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Row = styled(Flex)\`
  gap: 8px;
\`;

const Column = styled(Flex).attrs({ column: true })\`
  gap: 4px;
\`;

export function App() {
  return (
    <Row>
      <Column>A</Column>
      <Column>B</Column>
    </Row>
  );
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Both should be inlined independently
    expect(output).not.toContain('from "./lib/flex"');
    expect(output).toContain("<div");
    // Row should have display: flex (no column)
    // Column should have display: flex + flexDirection: column
    expect(output).toContain('flexDirection: "column"');
  });

  it("exported inlined component gets a wrapper", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

export const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Should still inline the styles
    expect(output).toContain('display: "flex"');
    expect(output).toContain('flexDirection: "column"');
    // But should preserve the export (via wrapper)
    expect(output).toContain("function Container");
    expect(output).not.toContain('from "./lib/flex"');
  });

  it("Flex used directly in JSX alongside styled(Flex) — import preserved", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

export function App() {
  return (
    <div>
      <Container>Styled</Container>
      <Flex>Direct usage</Flex>
    </div>
  );
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Styles should be inlined for Container
    expect(output).toContain('display: "flex"');
    // Flex import should be preserved because it's used directly in JSX
    expect(output).toContain('from "./lib/flex"');
  });

  it("JSX spread attr — skips inlining entirely", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

export function App({ extra }: { extra: Record<string, unknown> }) {
  return <Container {...extra} align="center">content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Spread means consumed props could arrive dynamically — skip inlining
    expect(output).toContain("Flex");
    expect(output).not.toContain('display: "flex"');
  });

  it("dynamic consumed prop in JSX — skips inlining entirely", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

export function App({ dir }: { dir: string }) {
  return <Container align={dir}>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Dynamic consumed prop cannot be resolved statically — skip inlining
    expect(output).toContain("Flex");
    expect(output).not.toContain('display: "flex"');
  });

  it("attrs with non-consumed static props are preserved", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true, "data-testid": "container" })\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // column is consumed → becomes CSS
    expect(output).toContain('flexDirection: "column"');
    // data-testid is NOT consumed → should be preserved as a static attr
    expect(output).toContain("data-testid");
  });

  it("styled(Flex).withConfig({ shouldForwardProp }) keeps wrapper", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).withConfig({
  shouldForwardProp: (prop) => !["column", "gap"].includes(prop),
})\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Styles should be inlined
    expect(output).toContain('display: "flex"');
    // But wrapper should be preserved because withConfig shouldForwardProp is user-configured
    expect(output).toContain("function Container");
  });

  it("default import is passed to resolver with importedName='default'", () => {
    const input = `
import styled from "styled-components";
import Flex from "./lib/flex";

const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Fixture adapter checks importedName !== "Flex" for default imports,
    // so default Flex import should NOT be resolved (importedName is "default")
    // This verifies the codemod correctly passes importedName to the resolver
    expect(output).toContain("Flex");
  });

  it("component not in import map — no resolution", () => {
    const input = `
import styled from "styled-components";

function LocalFlex(props: any) {
  return <div {...props} />;
}

const Container = styled(LocalFlex)\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Should NOT be inlined (local component, not in import map → resolver not called)
    expect(output).toContain("LocalFlex");
  });

  it("mixin mode — resolver returns mixins instead of sx", () => {
    const mixinAdapter: Adapter = {
      ...fixtureAdapter,
      resolveBaseComponent(ctx) {
        if (!ctx.importSource.includes("lib/flex")) {
          return undefined;
        }
        if (ctx.importedName !== "Flex") {
          return undefined;
        }
        return {
          tagName: "div",
          consumedProps: ["column", "gap", "align", "direction", "as"],
          mixins: [
            {
              importSource: "@lib/mixins.stylex",
              importName: "mixins",
              styleKey: "flex",
            },
          ],
        };
      },
    };
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input, mixinAdapter);
    expect(output).not.toBeNull();
    // Should reference the mixin in stylex.props
    expect(output).toContain("mixins.flex");
    // Template CSS should still be present
    expect(output).toContain('padding: "8px"');
    // No sx-based CSS from the resolver
    expect(output).not.toContain('display: "flex"');
  });

  it("resolver returns both sx and mixins", () => {
    const bothAdapter: Adapter = {
      ...fixtureAdapter,
      resolveBaseComponent(ctx) {
        if (!ctx.importSource.includes("lib/flex")) {
          return undefined;
        }
        if (ctx.importedName !== "Flex") {
          return undefined;
        }
        return {
          tagName: "div",
          consumedProps: ["column", "gap", "align", "direction", "as"],
          sx: { display: "flex", flexDirection: "column" },
          mixins: [
            {
              importSource: "@lib/mixins.stylex",
              importName: "mixins",
              styleKey: "flex",
            },
          ],
        };
      },
    };
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true })\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input, bothAdapter);
    expect(output).not.toBeNull();
    // Both sx and mixins should be present
    expect(output).toContain('display: "flex"');
    expect(output).toContain("mixins.flex");
    expect(output).toContain('padding: "8px"');
  });

  it("resolver returns empty result (undefined) — treated as normal styled(Component)", () => {
    const noResolveAdapter: Adapter = {
      ...fixtureAdapter,
      resolveBaseComponent() {
        return undefined;
      },
    };
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex)\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input, noResolveAdapter);
    expect(output).not.toBeNull();
    // Should be treated as normal styled(Component) — Flex preserved
    expect(output).toContain("Flex");
  });

  it("resolver with no resolveBaseComponent defined — no inlining", () => {
    const noMethodAdapter: Adapter = {
      ...fixtureAdapter,
      resolveBaseComponent: undefined,
    };
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex)\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input, noMethodAdapter);
    expect(output).not.toBeNull();
    // No resolver → no inlining → Flex preserved
    expect(output).toContain("Flex");
  });

  it("resolver that throws an error — transform handles gracefully", () => {
    const throwingAdapter: Adapter = {
      ...fixtureAdapter,
      resolveBaseComponent() {
        throw new Error("Resolver error");
      },
    };
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex)\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    // Should not throw — errors in resolver are caught and the component is kept as-is
    const output = run(input, throwingAdapter);
    expect(output).not.toBeNull();
    // Component not inlined (resolver threw), Flex should still be present
    expect(output).toContain("Flex");
  });

  it("per-site boolean shorthand prop (e.g., <Container column>)", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex)\`
  padding: 8px;
\`;

export function App() {
  return (
    <>
      <Container column>Vertical</Container>
      <Container>Horizontal</Container>
    </>
  );
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // column={true} should create a variant dimension
    expect(output).toContain("containerColumnVariants");
    expect(output).toContain('flexDirection: "column"');
  });

  it("attrs with 'as' string prop overrides the tag name", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true, as: "section" })\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Resolver returns tagName based on 'as' prop (string literal)
    expect(output).toContain("<section");
    expect(output).toContain('display: "flex"');
  });

  it("attrs with 'as' component ref — bails resolver (attrsAsTag)", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";
import { OtherComponent } from "./lib/other";

const Container = styled(Flex).attrs({ column: true, as: OtherComponent })\`
  padding: 8px;
\`;

export function App() {
  return <Container>content</Container>;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // as: ComponentRef sets attrsAsTag → resolver bails, normal styled() path handles it
    // The normal path wraps OtherComponent and renders it
    expect(output).toContain("OtherComponent");
    // Resolver did NOT inline — no flex display from resolver
    expect(output).not.toContain('display: "flex"');
  });

  it("self-closing JSX element with consumed prop — detected by canSafelyInline", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Spacer = styled(Flex)\`
  min-height: 8px;
\`;

export function App({ dir }: { dir: string }) {
  return <Spacer align={dir} />;
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Dynamic consumed prop on self-closing element → bail inlining
    expect(output).toContain("Flex");
  });

  it("self-closing JSX element with static consumed prop — per-site variant created", () => {
    const input = `
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Spacer = styled(Flex)\`
  min-height: 8px;
\`;

export function App() {
  return (
    <>
      <Spacer align="center" />
      <Spacer align="start" />
    </>
  );
}
`;
    const output = run(input);
    expect(output).not.toBeNull();
    // Static consumed props on self-closing elements → variant dimension
    expect(output).toContain("spacerAlignVariants");
    expect(output).toContain('alignItems: "center"');
    expect(output).toContain('alignItems: "start"');
  });
});
