import { emitWrappers } from "../emit-wrappers.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Emits wrapper components for styled declarations that must remain as components.
 */
export function emitWrappersStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls || !ctx.wrapperNames || !ctx.exportedComponents) {
    return CONTINUE;
  }

  emitWrappers({
    root: ctx.root,
    j: ctx.j,
    filePath: ctx.file.path,
    styledDecls,
    wrapperNames: ctx.wrapperNames,
    patternProp: ctx.patternProp,
    exportedComponents: ctx.exportedComponents,
    stylesIdentifier: ctx.stylesIdentifier ?? "styles",
    styleMerger: ctx.adapter.styleMerger,
  });

  return CONTINUE;
}
