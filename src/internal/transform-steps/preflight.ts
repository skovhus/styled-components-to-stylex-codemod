/**
 * Preflight step to normalize JSX and gather transform context.
 * Core concepts: import detection and JSX attribute normalization.
 */
import type { ASTPath, ImportDeclaration } from "jscodeshift";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import {
  collectStyledDefaultImportLocalNames,
  isStyledTag as isStyledTagImpl,
} from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";

/**
 * Normalizes JSX and gathers initial context such as React import preservation and styled import locals.
 */
export function preflight(ctx: TransformContext): StepResult {
  const { j, root } = ctx;

  if (isNonJsxTypeScriptModule(ctx.file.path)) {
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

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
  const styledLocalNames = collectStyledDefaultImportLocalNames(styledImports);
  ctx.styledLocalNames = styledLocalNames;
  ctx.isStyledTag = (tag: any): boolean => isStyledTagImpl(styledLocalNames, tag);

  return CONTINUE;
}

/**
 * TypeScript module files (`.ts`, `.mts`, `.cts`) cannot contain JSX. Bail before
 * any step might rewrite the file into JSX-emitting output. Declaration files
 * (`.d.ts`, `.d.mts`, `.d.cts`) never carry runtime code and pass through unchanged.
 */
function isNonJsxTypeScriptModule(path: string): boolean {
  const extensions = [".ts", ".mts", ".cts"];
  for (const ext of extensions) {
    if (path.endsWith(ext) && !path.endsWith(`.d${ext}`)) {
      return true;
    }
  }
  return false;
}
