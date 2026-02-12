/**
 * Step: post-process transformed AST and cleanup imports.
 * Core concepts: descendant overrides and import reconciliation.
 */
import path from "node:path";
import { postProcessTransformedAst } from "../rewrite-jsx.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import type { ImportSource } from "../../adapter.js";
import { TransformContext } from "../transform-context.js";

/**
 * Performs post-processing rewrites, import cleanup, and descendant/ancestor selector adjustments.
 */
export function postProcessStep(ctx: TransformContext): StepResult {
  const { root, j, file } = ctx;
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls) {
    return CONTINUE;
  }

  // Extract local names of identifiers added as new imports by the adapter.
  // These should shadow old imports with the same name (e.g., when adapter replaces
  // `transitionSpeed` from `./lib/helpers` with `transitionSpeed` from `./tokens.stylex`).
  const toModuleSpecifier = (from: ImportSource): string => {
    if (from.kind === "specifier") {
      return from.value;
    }
    const baseDir = path.dirname(String(file.path));
    let rel = path.relative(baseDir, from.value);
    rel = rel.split(path.sep).join("/");
    if (!rel.startsWith(".")) {
      rel = `./${rel}`;
    }
    return rel;
  };

  const newImportLocalNames = new Set<string>();
  const newImportSourcesByLocal = new Map<string, Set<string>>();
  for (const imp of ctx.resolverImports.values()) {
    const source = toModuleSpecifier(imp.from);
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

  ctx.newImportLocalNames = newImportLocalNames;
  ctx.newImportSourcesByLocal = newImportSourcesByLocal;

  // Create a map from component local names to style keys for ancestor selector matching
  const componentNameToStyleKey = new Map<string, string>();
  for (const decl of styledDecls) {
    componentNameToStyleKey.set(decl.localName, decl.styleKey);
  }

  const post = postProcessTransformedAst({
    root,
    j,
    relationOverrides: ctx.relationOverrides ?? [],
    ancestorSelectorParents: ctx.ancestorSelectorParents ?? new Set<string>(),
    namedAncestorMarkersByStyleKey: ctx.namedAncestorMarkersByStyleKey ?? new Map<string, string>(),
    namedAncestorMarkersByComponentName:
      ctx.namedAncestorMarkersByComponentName ?? new Map<string, string>(),
    componentNameToStyleKey,
    emptyStyleKeys: ctx.emptyStyleKeys ?? new Set<string>(),
    preserveReactImport: ctx.preserveReactImport,
    newImportLocalNames,
    newImportSourcesByLocal,
  });
  if (post.changed) {
    ctx.markChanged();
  }
  ctx.needsReactImport = post.needsReactImport;

  return CONTINUE;
}
