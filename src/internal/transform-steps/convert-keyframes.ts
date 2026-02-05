/**
 * Step: convert styled-components keyframes to stylex.keyframes.
 * Core concepts: keyframes detection and import updates.
 */
import { convertStyledKeyframes } from "../keyframes.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { objectToAst } from "../transform/helpers.js";

/**
 * Converts styled-components keyframes usage to stylex.keyframes and tracks created names.
 */
export function convertKeyframesStep(ctx: TransformContext): StepResult {
  const { styledImports, j, root } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  // Convert `styled-components` keyframes to `stylex.keyframes`.
  // Docs: https://stylexjs.com/docs/api/javascript/keyframes
  const keyframesImport = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s: any) => s.imported.type === "Identifier" && s.imported.name === "keyframes");
  const keyframesLocal =
    keyframesImport?.local?.type === "Identifier"
      ? keyframesImport.local.name
      : keyframesImport?.imported?.type === "Identifier"
        ? keyframesImport.imported.name
        : undefined;

  ctx.keyframesLocal = keyframesLocal;

  if (keyframesLocal) {
    const converted = convertStyledKeyframes({
      root,
      j,
      styledImports,
      keyframesLocal,
      objectToAst,
    });
    ctx.keyframesNames = converted.keyframesNames;
    if (converted.changed) {
      ctx.markChanged();
    }
  }

  return CONTINUE;
}
