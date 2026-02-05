/**
 * Step: remove unused css helper imports after transform.
 * Core concepts: identifier reference scanning and import cleanup.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import { isIdentifierReference } from "../transform/css-helpers.js";
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
    styledImports.forEach((imp: any) => {
      const specs = imp.node.specifiers ?? [];
      const next = specs.filter((s: any) => {
        if (s.type !== "ImportSpecifier") {
          return true;
        }
        if (s.imported.type !== "Identifier") {
          return true;
        }
        return s.imported.name !== "css";
      });
      if (next.length !== specs.length) {
        imp.node.specifiers = next;
        if (imp.node.specifiers.length === 0) {
          j(imp).remove();
        }
        ctx.markChanged();
      }
    });
  }

  return CONTINUE;
}
