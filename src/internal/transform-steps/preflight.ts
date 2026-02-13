/**
 * Preflight step to normalize JSX and gather transform context.
 * Core concepts: import detection and JSX attribute normalization.
 */
import type { ASTPath, ImportDeclaration, JSXAttribute } from "jscodeshift";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { isStyledTag as isStyledTagImpl } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";

/**
 * Normalizes JSX and gathers initial context such as React import preservation and styled import locals.
 */
export function preflight(ctx: TransformContext): StepResult {
  const { j, root } = ctx;

  // `forwardedAs` is styled-components-specific; normalize to `as` so it doesn't
  // leak to the DOM as an invalid attribute. Track which components had forwardedAs
  // so rewrite-jsx can strip it from component wrapper callsites (where forwarding
  // `as` to the inner component would incorrectly change its rendered element).
  // First, collect component names that have forwardedAs on their JSX callsites
  const forwardedAsComponents = new Set<string>();
  root.find(j.JSXOpeningElement).forEach((p) => {
    const attrs = p.node.attributes ?? [];
    const hasForwardedAs = attrs.some(
      (a) =>
        a.type === "JSXAttribute" &&
        a.name.type === "JSXIdentifier" &&
        a.name.name === "forwardedAs",
    );
    if (hasForwardedAs && p.node.name.type === "JSXIdentifier") {
      forwardedAsComponents.add(p.node.name.name);
    }
  });
  ctx.forwardedAsComponents = forwardedAsComponents;

  // Then convert forwardedAs → as to prevent DOM leakage.
  // Mark each converted attr so rewrite-jsx only strips these specific attrs,
  // not legitimate `as` props on other callsites of the same component.
  root
    .find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "forwardedAs" } })
    .forEach((p: ASTPath<JSXAttribute>) => {
      if (p.node.name.type === "JSXIdentifier") {
        p.node.name.name = "as";
        (p.node as JSXAttribute & { __fromForwardedAs?: boolean }).__fromForwardedAs = true;
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
