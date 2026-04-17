/**
 * Step: detect partial-file cascade conflicts. When a base (non-leaf) styled component
 * was transformed to StyleX but a component that extends it (leaf) was skipped, the
 * leaf's styled-components override cannot reliably beat StyleX's atomic CSS due to
 * stylesheet ordering — bail the whole file to preserve semantics.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";

export function detectPartialCascadeConflictStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls || styledDecls.length === 0) {
    return CONTINUE;
  }

  const hasSkipped = styledDecls.some((d) => d.skipTransform);
  if (!hasSkipped) {
    return CONTINUE;
  }

  for (const base of styledDecls) {
    if (base.skipTransform) {
      continue;
    }
    const extendingLeaves = styledDecls.filter(
      (d) =>
        d !== base &&
        d.skipTransform &&
        d.base.kind === "component" &&
        d.base.ident === base.localName,
    );
    if (extendingLeaves.length === 0) {
      continue;
    }
    const leaf = extendingLeaves[0]!;
    ctx.warnings.push({
      severity: "warning",
      type: "Partial transform would mix StyleX with styled-components across an extends chain — the base was transformed but an extending component could not be, so the extending component's CSS cannot reliably override the base",
      loc: base.loc,
      context: {
        base: base.localName,
        extendedBy: extendingLeaves.map((d) => d.localName).join(", "),
        exampleLeaf: leaf.localName,
      },
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}
