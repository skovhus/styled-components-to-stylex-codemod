/**
 * Ensures React binding imports exist when JSX needs them.
 * Core concepts: import inspection and React binding insertion.
 */
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";

/**
 * Ensures a `React` binding is available in the file.
 *
 * - If there's already `import React from "react"` or `import * as React from "react"`, does nothing.
 * - If there's a named import like `import { useCallback } from "react"`, adds `React` as default specifier.
 * - If there's no react import at all, creates a new one.
 *
 * @param useNamespaceStyle - When creating a new import, use `import * as React` instead of `import React`
 */
export function ensureReactBinding(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  useNamespaceStyle?: boolean;
}): void {
  const { root, j, useNamespaceStyle = false } = args;

  // Check if React binding already exists (default or namespace import named "React")
  const hasReactBinding =
    root
      .find(j.ImportDeclaration)
      .filter((p) => (p.node?.source as { value?: unknown })?.value === "react")
      .filter((p) =>
        (p.node.specifiers ?? []).some(
          (s) =>
            (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
            s.local?.type === "Identifier" &&
            s.local.name === "React",
        ),
      )
      .size() > 0;

  if (hasReactBinding) {
    return;
  }

  // Check if there's an existing import from "react" (e.g., `import { useCallback } from "react"`)
  const existingReactImport = root
    .find(j.ImportDeclaration)
    .filter((p) => (p.node?.source as { value?: unknown })?.value === "react")
    .at(0);

  if (existingReactImport.size() > 0) {
    const importNode = existingReactImport.get().node;
    const specifiers = importNode.specifiers ?? [];
    // Check if there's already a default specifier (e.g., `import ReactAlias from "react"`)
    const hasDefaultSpecifier = specifiers.some(
      (s: { type: string }) => s.type === "ImportDefaultSpecifier",
    );
    if (!hasDefaultSpecifier) {
      // Add React as default specifier at the beginning (can't mix namespace with named imports)
      // This turns `import { useCallback } from "react"` into `import React, { useCallback } from "react"`
      specifiers.unshift(j.importDefaultSpecifier(j.identifier("React")));
      importNode.specifiers = specifiers;
    }
    // If there's already a default specifier with a different name, we leave it as-is
    // since the user explicitly aliased React and we shouldn't override that choice
  } else {
    // No existing react import, create a new one
    const firstImport = root.find(j.ImportDeclaration).at(0);
    const specifier = useNamespaceStyle
      ? j.importNamespaceSpecifier(j.identifier("React"))
      : j.importDefaultSpecifier(j.identifier("React"));
    const reactImport = j.importDeclaration([specifier], j.literal("react"));
    if (firstImport.size() > 0) {
      firstImport.insertBefore(reactImport);
    } else {
      root.get().node.program.body.unshift(reactImport);
    }
  }
}
