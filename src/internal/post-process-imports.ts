/**
 * Cleans imports after transformed declarations and helper references are removed.
 * Core concepts: unused import pruning, adapter import shadowing, and React import reconciliation.
 */
import type { Collection } from "jscodeshift";
import type { ImportSpec } from "../adapter.js";
import { isMemberExpression } from "./lower-rules/utils.js";
import { importSourceToModuleSpecifier } from "./utilities/import-source.js";

type PostProcessImportCleanupResult = {
  changed: boolean;
  needsReactImport: boolean;
};

export function cleanupPostProcessImports(args: {
  root: Collection<any>;
  j: any;
  preserveReactImport?: boolean;
  newImportLocalNames?: Set<string>;
  newImportSourcesByLocal?: Map<string, Set<string>>;
}): PostProcessImportCleanupResult {
  const { root, j, preserveReactImport, newImportLocalNames, newImportSourcesByLocal } = args;
  let changed = false;

  // If `@emotion/is-prop-valid` was only used inside removed styled declarations, drop the import.
  root
    .find(j.ImportDeclaration, { source: { value: "@emotion/is-prop-valid" } } as any)
    .forEach((p: any) => {
      const spec = p.node.specifiers?.find((s: any) => s.type === "ImportDefaultSpecifier") as any;
      const local = spec?.local?.type === "Identifier" ? spec.local.name : null;
      if (!local) {
        return;
      }
      const used =
        root
          .find(j.Identifier, { name: local } as any)
          .filter((idPath: any) => j(idPath).closest(j.ImportDeclaration).size() === 0)
          .size() > 0;
      if (!used) {
        j(p).remove();
        changed = true;
      }
    });

  // Drop unused import specifiers (common after removing styled declarations).
  // Keep side-effect imports (no specifiers) as-is.
  root.find(j.ImportDeclaration).forEach((p: any) => {
    // Some codebases intentionally keep `import React ... from "react"` even with automatic JSX runtimes,
    // either for classic runtime compatibility, global React typing, or local conventions.
    // Preserve existing `React` default/namespace imports when requested.
    if (preserveReactImport && (p.node?.source as any)?.value === "react") {
      const hasReactValueBinding = (p.node.specifiers ?? []).some(
        (s: any) =>
          (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
          s.local?.type === "Identifier" &&
          s.local.name === "React",
      );
      if (hasReactValueBinding) {
        return;
      }
    }

    const specs = (p.node.specifiers ?? []) as any[];
    if (specs.length === 0) {
      return;
    }

    // Preserve entire type-only import declarations.
    // `import type { ... }` has importKind on the declaration, not the specifiers.
    if ((p.node as any).importKind === "type") {
      return;
    }

    const nextSpecs = specs.filter((s: any) => {
      // Preserve type-only import specifiers - they're used for TypeScript types
      // and may not be detectable via standard Identifier lookup.
      if (s?.importKind === "type") {
        return true;
      }
      const local =
        s?.local?.type === "Identifier"
          ? s.local.name
          : s?.type === "ImportDefaultSpecifier" && s.local?.type === "Identifier"
            ? s.local.name
            : s?.type === "ImportNamespaceSpecifier" && s.local?.type === "Identifier"
              ? s.local.name
              : null;
      if (!local) {
        return true;
      }
      // If this identifier is being shadowed by a new import (added by the adapter),
      // only drop it when the import source does NOT match the adapter's source for that local.
      if (newImportLocalNames?.has(local)) {
        const sourceValue = (p.node?.source as any)?.value;
        const allowedSources = newImportSourcesByLocal?.get(local);
        if (!allowedSources || !allowedSources.has(sourceValue)) {
          return false;
        }
      }
      const importLocalNode = s.local?.type === "Identifier" ? s.local : null;
      return usedOutsideImports(root, j, local, importLocalNode);
    });

    if (nextSpecs.length !== specs.length) {
      p.node.specifiers = nextSpecs;
      changed = true;
    }
    if ((p.node.specifiers?.length ?? 0) === 0) {
      j(p).remove();
      changed = true;
    }
  });

  return {
    changed,
    needsReactImport: usesReactIdentifierWithoutImport(root, j),
  };
}

export function collectNewImportMetadata(
  resolverImports: Map<string, ImportSpec>,
  filePath: string,
): {
  newImportLocalNames: Set<string>;
  newImportSourcesByLocal: Map<string, Set<string>>;
} {
  const newImportLocalNames = new Set<string>();
  const newImportSourcesByLocal = new Map<string, Set<string>>();

  for (const imp of resolverImports.values()) {
    const source = importSourceToModuleSpecifier(imp.from, filePath);
    for (const n of imp.names ?? []) {
      const local = n.local ?? n.imported;
      if (local) {
        newImportLocalNames.add(local);
        const sources = newImportSourcesByLocal.get(local) ?? new Set<string>();
        sources.add(source);
        newImportSourcesByLocal.set(local, sources);
      }
    }
  }

  return { newImportLocalNames, newImportSourcesByLocal };
}

function usedOutsideImports(
  root: Collection<any>,
  j: any,
  localName: string,
  importLocalNode: unknown,
): boolean {
  const usedByIdentifier =
    root
      .find(j.Identifier, { name: localName } as any)
      .filter((idPath: any) => {
        if (j(idPath).closest(j.ImportDeclaration).size() > 0) {
          return false;
        }

        const parent = idPath.parent?.node as any;
        // Ignore identifiers used as non-computed member property keys: `obj.foo`.
        if (
          parent &&
          isMemberExpression(parent) &&
          parent.property === idPath.node &&
          parent.computed === false
        ) {
          return false;
        }
        // Ignore identifiers used as object literal keys when not shorthand: `{ foo: 1 }`.
        if (
          parent &&
          parent.type === "Property" &&
          parent.key === idPath.node &&
          parent.shorthand !== true
        ) {
          return false;
        }
        // Ignore identifiers that are declaration-only property names, not value references.
        if (parent?.type === "TSPropertySignature" && parent.key === idPath.node) {
          return false;
        }
        // Ignore JSX attribute names: `<Box color="accent" />` does not reference an import.
        if (parent?.type === "JSXAttribute" && parent.name === idPath.node) {
          return false;
        }

        return resolvesToImportBinding(idPath, localName, importLocalNode);
      })
      .size() > 0;

  // JSX element names are `JSXIdentifier`, not `Identifier`, so include those too:
  // - `styled(ExternalComponent)` becomes `<ExternalComponent ... />`
  const usedByJsxIdentifier =
    isProbablyJsxBindingName(localName) &&
    root
      .find(j.JSXIdentifier, { name: localName } as any)
      .filter((jsxPath: any) => {
        // No need for ImportDeclaration guard (JSXIdentifier doesn't appear in imports), but keep it symmetric.
        if (j(jsxPath).closest(j.ImportDeclaration).size() > 0) {
          return false;
        }
        return true;
      })
      .size() > 0;

  return usedByIdentifier || usedByJsxIdentifier;
}

function isProbablyJsxBindingName(name: string): boolean {
  // In JSX, lowercase tag names like `<div />` are treated as intrinsic elements, not scope bindings.
  // We only treat JSX identifiers as usage of an import when they look like component names.
  // (Uppercase is the conventional signal, and matches React/TSX binding semantics.)
  const first = name[0] ?? "";
  return first.toUpperCase() === first && first.toLowerCase() !== first;
}

function resolvesToImportBinding(
  idPath: any,
  localName: string,
  importLocalNode: unknown,
): boolean {
  try {
    const scope = idPath.scope?.lookup?.(localName);
    const bindings = scope?.getBindings?.()?.[localName];
    if (!Array.isArray(bindings)) {
      return true;
    }
    return bindings.some((bindingPath: any) => bindingPath?.node === importLocalNode);
  } catch {
    // Some TS/JSX AST patterns are not fully supported by ast-types scope scanning.
    // Keep the import when we cannot prove the reference resolves elsewhere.
    return true;
  }
}

function usesReactIdentifierWithoutImport(root: Collection<any>, j: any): boolean {
  // If we already have a value binding named `React` in scope, don't auto-insert `import React from "react";`.
  //
  // NOTE: Avoid relying on a strict matcher like `{ source: { value: "react" } }` here; different printers/parsers
  // can represent the module specifier slightly differently, but the `source.value` string remains stable.
  const hasReactImport =
    root
      .find(j.ImportDeclaration)
      .filter((p: any) => (p.node?.source as any)?.value === "react")
      .filter((p: any) =>
        (p.node.specifiers ?? []).some(
          (s: any) =>
            (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
            s.local?.type === "Identifier" &&
            s.local.name === "React",
        ),
      )
      .size() > 0;
  const usesReactIdent = root.find(j.Identifier, { name: "React" } as any).size() > 0;

  return usesReactIdent && !hasReactImport;
}
