/**
 * Step: mark imported component roots that partial migration should preserve.
 * Core concepts: skip policy and imported member roots.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { shouldSkipPartialImportedComponentRoot } from "../utilities/partial-migration.js";

export function markPartialImportedRootsStep(ctx: TransformContext): StepResult {
  for (const decl of (ctx.styledDecls ?? []) as StyledDecl[]) {
    if (shouldSkipPartialImportedComponentRoot(ctx, decl)) {
      decl.skipTransform = true;
    }
  }
  return CONTINUE;
}
