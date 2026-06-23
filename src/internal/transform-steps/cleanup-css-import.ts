/**
 * Step: remove unused css helper imports after transform.
 * Core concepts: identifier reference scanning and import cleanup.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import { dropCssImportSpecifier, isIdentifierReference } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";

/**
 * Removes unused css helper imports after transformation.
 */
export function cleanupCssImportStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;
  const cssLocal = ctx.cssLocal;
  const styledImports = ctx.styledImports;
  if (!cssLocal || !styledImports) {
    return CONTINUE;
  }

  // Re-check `css` helper usage after styled-components declarations are removed.
  // This allows us to drop the import when all references were inside styled templates.
  const isStillReferenced = (): boolean =>
    root
      .find(j.Identifier, { name: cssLocal } as any)
      .filter((p: any) => isIdentifierReference(p))
      .size() > 0;

  if (!isStillReferenced()) {
    dropCssImportSpecifier(j, styledImports, () => ctx.markChanged());
  }

  return CONTINUE;
}
