import type { ASTPath, ImportDeclaration } from "jscodeshift";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Adds a React import when React is referenced but missing.
 */
export function ensureReactImportStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;

  // If the file references `React` (types or values) but doesn't import it, add `import React from "react";`
  if (ctx.needsReactImport) {
    // Check if there's an existing import from "react" (e.g., `import { useCallback } from "react"`)
    const existingReactImport = root
      .find(j.ImportDeclaration)
      .filter(
        (p: ASTPath<ImportDeclaration>) =>
          (p.node?.source as { value?: unknown })?.value === "react",
      )
      .at(0);

    if (existingReactImport.size() > 0) {
      const importNode = existingReactImport.get().node;
      const specifiers = importNode.specifiers ?? [];
      // Check if there's already a default specifier (e.g., `import ReactAlias from "react"`)
      const hasDefaultSpecifier = specifiers.some(
        (s: { type: string }) => s.type === "ImportDefaultSpecifier",
      );
      if (!hasDefaultSpecifier) {
        // Add React as default specifier at the beginning
        specifiers.unshift(j.importDefaultSpecifier(j.identifier("React")));
        importNode.specifiers = specifiers;
      }
      // If there's already a default specifier with a different name, we leave it as-is
      // since the user explicitly aliased React and we shouldn't override that choice
    } else {
      // No existing react import, create a new one
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
    }
    ctx.markChanged();
  }

  return CONTINUE;
}
