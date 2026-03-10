import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { detectUnsupportedPatternsStep } from "../internal/transform-steps/detect-unsupported-patterns.js";
import { CONTINUE } from "../internal/transform-types.js";

const j = jscodeshift.withParser("tsx");

function createCtx(code: string, styledNames: string[] = ["styled"]) {
  const root = j(code);
  return {
    root,
    j,
    warnings: [] as any[],
    styledLocalNames: new Set(styledNames),
    file: { path: "test.tsx", source: code },
    hasChanges: false,
    markChanged() {
      this.hasChanges = true;
    },
  } as any;
}

describe("detectUnsupportedPatternsStep", () => {
  it("returns CONTINUE for code without unsupported patterns", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      const Box = styled.div\`color: red;\`;
      export const App = () => <Box />;
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).toEqual(CONTINUE);
  });

  it("bails on theme prop override via JSX attribute", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      const Box = styled.div\`color: red;\`;
      export const App = () => <Box theme={{ color: "blue" }} />;
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).not.toEqual(CONTINUE);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0]!.type).toContain("Theme prop overrides");
  });

  it("bails on theme prop override via self-closing JSX", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      const Box = styled.div\`color: red;\`;
      export const App = () => <Box theme={myTheme} />;
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).not.toEqual(CONTINUE);
    expect(ctx.warnings).toHaveLength(1);
  });

  it("bails on defaultProps.theme = {...}", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      const Box = styled.div\`color: red;\`;
      Box.defaultProps = { theme: { color: "blue" } };
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).not.toEqual(CONTINUE);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0]!.type).toContain("Theme prop overrides");
  });

  it("bails on Component.defaultProps.theme = value", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      const Box = styled.div\`color: red;\`;
      Box.defaultProps.theme = { color: "blue" };
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).not.toEqual(CONTINUE);
    expect(ctx.warnings).toHaveLength(1);
  });

  it("bails on HOC factory pattern: hoc(styled)", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      const enhance = hoc(styled);
      const Box = enhance.div\`color: red;\`;
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).not.toEqual(CONTINUE);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0]!.type).toContain("Higher-order styled factory");
  });

  it("does not bail when styledLocalNames is empty", () => {
    const ctx = createCtx(`const Box = styled.div\`color: red;\`;`, []);
    ctx.styledLocalNames = new Set();
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).toEqual(CONTINUE);
  });

  it("detects styled inside function as HOC pattern", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      function createComponent() {
        styled.div\`color: red;\`;
      }
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).not.toEqual(CONTINUE);
    expect(ctx.warnings[0]!.type).toContain("Higher-order styled factory");
  });

  it("allows styled assigned inside function (local usage)", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      function createComponent() {
        const Box = styled.div\`color: red;\`;
        return <Box />;
      }
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).toEqual(CONTINUE);
  });

  it("detects styled inside class method as HOC pattern", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      class Factory {
        create() {
          styled.div\`color: red;\`;
        }
      }
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).not.toEqual(CONTINUE);
    expect(ctx.warnings[0]!.type).toContain("Higher-order styled factory");
  });

  it("detects styled inside object method as HOC pattern", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      const factory = {
        create() {
          styled.div\`color: red;\`;
        }
      };
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).not.toEqual(CONTINUE);
    expect(ctx.warnings[0]!.type).toContain("Higher-order styled factory");
  });

  it("allows styled assigned inside class method (local usage)", () => {
    const ctx = createCtx(`
      import styled from "styled-components";
      class Factory {
        create() {
          const Box = styled.div\`color: red;\`;
          return <Box />;
        }
      }
    `);
    const result = detectUnsupportedPatternsStep(ctx);
    expect(result).toEqual(CONTINUE);
  });
});
