/**
 * Step: finalize output formatting and error handling.
 * Core concepts: AST serialization and formatter integration.
 */
import { assertNoNullNodesInArrays } from "../utilities/ast-safety.js";
import { formatOutput } from "../utilities/format-output.js";
import type { TransformResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Formats and returns the transformed output, with detailed error context on print failures.
 */
export function finalize(ctx: TransformContext): TransformResult {
  let code: string | null = null;
  if (ctx.hasChanges) {
    assertNoNullNodesInArrays(ctx.root.get().node);
    try {
      code = formatOutput(
        ctx.root.toSource({
          quote: "double",
          trailingComma: true,
          reuseWhitespace: true,
        }),
      );
    } catch (e) {
      // Debug: find the smallest top-level statement that crashes recast printing.
      const program: any = ctx.root.get().node.program;
      let failing: string | null = null;
      if (program?.body && Array.isArray(program.body)) {
        for (let i = 0; i < program.body.length; i++) {
          const stmt = program.body[i];
          try {
            ctx.j(ctx.j.program([stmt as any])).toSource({
              quote: "double",
              trailingComma: true,
              reuseWhitespace: false,
            });
          } catch {
            failing = `program.body[${i}] type=${stmt?.type ?? "unknown"}`;
            break;
          }
        }
      }
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Failed to print transformed output for ${ctx.file.path}: ${errorMessage}${failing ? `\nFirst failing statement: ${failing}` : ""}`,
      );
    }
  }

  return { code, warnings: ctx.warnings, sidecarContent: ctx.sidecarStylexContent };
}
