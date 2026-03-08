import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { finalize } from "../internal/transform-steps/finalize.js";
import { TransformContext } from "../internal/transform-context.js";

const j = jscodeshift.withParser("tsx");

function createCtx(code: string, hasChanges: boolean): TransformContext {
  const root = j(code);
  return {
    root,
    j,
    warnings: [],
    hasChanges,
    file: { path: "test.tsx", source: code },
    sidecarStylexContent: null,
    bridgeResults: [],
  } as any;
}

describe("finalize", () => {
  it("returns null code when hasChanges is false", () => {
    const ctx = createCtx(`const x = 1;`, false);
    const result = finalize(ctx);
    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("returns formatted code when hasChanges is true", () => {
    const ctx = createCtx(`const x = 1;`, true);
    const result = finalize(ctx);
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("const x = 1");
  });

  it("includes warnings in result", () => {
    const ctx = createCtx(`const x = 1;`, false);
    ctx.warnings.push({
      severity: "warning",
      type: "Test warning",
    } as any);
    const result = finalize(ctx);
    expect(result.warnings).toHaveLength(1);
  });

  it("includes sidecar content and bridge results", () => {
    const ctx = createCtx(`const x = 1;`, false);
    (ctx as any).sidecarStylexContent = "some content";
    (ctx as any).bridgeResults = [{ test: true }];
    const result = finalize(ctx);
    expect(result.sidecarContent).toBe("some content");
    expect(result.bridgeResults).toEqual([{ test: true }]);
  });

  it("throws with file path info when AST has null nodes in arrays", () => {
    const ctx = createCtx(`const x = 1;`, true);

    const program = ctx.root.get().node.program;
    program.body.push(null as any);

    expect(() => finalize(ctx)).toThrow(/Null AST node/);
  });

  it("returns formatted code with multiple statements", () => {
    const ctx = createCtx(`const x = 1;\nconst y = 2;\nconst z = x + y;`, true);
    const result = finalize(ctx);
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("const x = 1");
    expect(result.code).toContain("const y = 2");
    expect(result.code).toContain("const z = x + y");
  });
});
