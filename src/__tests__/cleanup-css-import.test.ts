import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { cleanupCssImportStep } from "../internal/transform-steps/cleanup-css-import.js";
import { CONTINUE } from "../internal/transform-types.js";

const j = jscodeshift.withParser("tsx");

function createCtx(
  code: string,
  cssLocal: string | null = "css",
): { ctx: any; getSource: () => string } {
  const root = j(code);
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  } as any);

  const ctx = {
    root,
    j,
    cssLocal,
    styledImports,
    hasChanges: false,
    markChanged() {
      this.hasChanges = true;
    },
  } as any;

  return {
    ctx,
    getSource: () => root.toSource(),
  };
}

describe("cleanupCssImportStep", () => {
  it("returns CONTINUE when cssLocal is null", () => {
    const { ctx } = createCtx(`import styled from "styled-components";`, null);
    const result = cleanupCssImportStep(ctx);
    expect(result).toEqual(CONTINUE);
  });

  it("returns CONTINUE when styledImports is null", () => {
    const root = j(`const x = 1;`);
    const ctx = {
      root,
      j,
      cssLocal: "css",
      styledImports: null,
      hasChanges: false,
      markChanged() {
        this.hasChanges = true;
      },
    } as any;
    const result = cleanupCssImportStep(ctx);
    expect(result).toEqual(CONTINUE);
  });

  it("removes css import when no references remain", () => {
    const { ctx, getSource } = createCtx(
      `import styled, { css } from "styled-components";\nconst Box = styled.div\`color: red;\`;`,
    );
    cleanupCssImportStep(ctx);
    const source = getSource();
    expect(source).not.toContain("css");
    expect(source).toContain("styled");
    expect(ctx.hasChanges).toBe(true);
  });

  it("keeps css import when references remain", () => {
    const { ctx, getSource } = createCtx(
      `import styled, { css } from "styled-components";\nconst styles = css\`color: red;\`;`,
    );
    cleanupCssImportStep(ctx);
    const source = getSource();
    expect(source).toContain("css");
    expect(ctx.hasChanges).toBe(false);
  });

  it("removes entire import when css is the only specifier", () => {
    const { ctx, getSource } = createCtx(`import { css } from "styled-components";\nconst x = 1;`);
    cleanupCssImportStep(ctx);
    const source = getSource();
    expect(source).not.toContain("styled-components");
    expect(ctx.hasChanges).toBe(true);
  });

  it("does not modify import when css is referenced in JSX", () => {
    const { ctx, getSource } = createCtx(
      `import styled, { css } from "styled-components";\nconst x = css\`color: red;\`;\nconst y = <div className={x} />;`,
    );
    cleanupCssImportStep(ctx);
    const source = getSource();
    expect(source).toContain("css");
  });
});
