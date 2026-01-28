import type { ASTPath, ImportDeclaration, JSXAttribute } from "jscodeshift";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { isStyledTag as isStyledTagImpl } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";

/**
 * Normalizes JSX and gathers initial context such as React import preservation and styled import locals.
 */
export function preflight(ctx: TransformContext): StepResult {
  const { j, root } = ctx;

  // `forwardedAs` is styled-components-specific; in StyleX output we standardize on `as`.
  root
    .find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "forwardedAs" } })
    .forEach((p: ASTPath<JSXAttribute>) => {
      if (p.node.name.type === "JSXIdentifier") {
        p.node.name.name = "as";
      }
    });

  // Preserve existing `import React ... from "react"` (default or namespace import) even if it becomes "unused"
  // after the transform. JSX runtime differences and local conventions can make this import intentionally present.
  // NOTE: Check `.value` directly rather than relying on `.type === "StringLiteral"` since ESTree-style parsers
  // emit `Literal` nodes for import sources. Both node types have a `.value` property with the module specifier.
  ctx.preserveReactImport =
    root
      .find(j.ImportDeclaration)
      .filter((p: ASTPath<ImportDeclaration>) => (p.node?.source as any)?.value === "react")
      .filter((p: ASTPath<ImportDeclaration>) =>
        (p.node.specifiers ?? []).some(
          (s) =>
            (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
            s.local?.type === "Identifier" &&
            s.local.name === "React",
        ),
      )
      .size() > 0;

  // Find styled-components imports
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  });

  if (styledImports.length === 0) {
    return returnResult({ code: null, warnings: [] }, "skip");
  }

  ctx.styledImports = styledImports;

  // Identify local names that refer to the styled-components default import (e.g. `styled`)
  // for template ancestry checks.
  const styledLocalNames = new Set<string>();
  styledImports.forEach((imp: any) => {
    const specs = imp.node.specifiers ?? [];
    for (const spec of specs) {
      if (spec.type === "ImportDefaultSpecifier" && spec.local?.type === "Identifier") {
        styledLocalNames.add(spec.local.name);
      }
    }
  });
  ctx.styledLocalNames = styledLocalNames;
  ctx.isStyledTag = (tag: any): boolean => isStyledTagImpl(styledLocalNames, tag);

  return CONTINUE;
}
