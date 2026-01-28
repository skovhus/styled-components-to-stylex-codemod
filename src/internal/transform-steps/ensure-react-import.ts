import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Adds a React import when React is referenced but missing.
 */
export function ensureReactImportStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;

  // If the file references `React` (types or values) but doesn't import it, add `import React from "react";`
  if (ctx.needsReactImport) {
    const firstImport = root.find(j.ImportDeclaration).at(0);
    const reactImport = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier("React"))],
      j.literal("react"),
    );
    if (firstImport.size() > 0) {
      firstImport.insertBefore(reactImport);
    } else {
      root.get().node.program.body.unshift(reactImport);
    }
    ctx.markChanged();
  }

  return CONTINUE;
}
