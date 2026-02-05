/**
 * Step: extract css helper blocks into reusable style objects.
 * Core concepts: helper discovery and usage validation.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { extractAndRemoveCssHelpers } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";
import { buildUnsupportedCssWarnings, toStyleKey } from "../transform/helpers.js";

/**
 * Extracts css helper blocks into style objects and validates supported usage.
 */
export function extractCssHelpersStep(ctx: TransformContext): StepResult {
  const { styledImports, j, root } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  const cssImport = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s: any) => s.imported.type === "Identifier" && s.imported.name === "css");
  const cssLocal =
    cssImport?.local?.type === "Identifier"
      ? cssImport.local.name
      : cssImport?.imported?.type === "Identifier"
        ? cssImport.imported.name
        : undefined;

  ctx.cssLocal = cssLocal;

  const cssHelpers = extractAndRemoveCssHelpers({
    root,
    j,
    styledImports,
    cssLocal,
    toStyleKey,
  });

  if (cssHelpers.unsupportedCssUsages.length > 0) {
    return returnResult(
      { code: null, warnings: buildUnsupportedCssWarnings(cssHelpers.unsupportedCssUsages) },
      "bail",
    );
  }

  ctx.cssHelpers = cssHelpers;

  if (cssHelpers.changed) {
    ctx.markChanged();
  }

  return CONTINUE;
}
