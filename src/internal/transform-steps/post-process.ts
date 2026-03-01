/**
 * Step: post-process transformed AST and cleanup imports.
 * Core concepts: relation overrides, import reconciliation, and event handler annotations.
 */
import path from "node:path";
import { postProcessTransformedAst } from "../rewrite-jsx.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import type { ImportSource } from "../../adapter.js";
import { TransformContext } from "../transform-context.js";
import { annotateEventHandlerParams } from "../post-process/event-handler-annotations.js";

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

  // Build lookup map from component local name to its style key (for ancestor selector matching)
  const componentNameToStyleKey = new Map<string, string>();
  for (const decl of styledDecls) {
    componentNameToStyleKey.set(decl.localName, decl.styleKey);
  }

  const post = postProcessTransformedAst({
    root,
    j,
    relationOverrides: ctx.relationOverrides ?? [],
    ancestorSelectorParents: ctx.ancestorSelectorParents ?? new Set<string>(),
    componentNameToStyleKey,
    emptyStyleKeys: ctx.emptyStyleKeys ?? new Set<string>(),
    preserveReactImport: ctx.preserveReactImport,
    newImportLocalNames,
    newImportSourcesByLocal,
    stylesIdentifier: ctx.stylesIdentifier,
    crossFileMarkers: ctx.crossFileMarkers,
  });
  if (post.changed) {
    ctx.markChanged();
  }
  ctx.needsReactImport = post.needsReactImport;

  // Remove local helper functions that were consumed during interpolation processing.
  // Only remove when no remaining references exist (the function may be exported
  // or called from non-styled code elsewhere in the file).
  for (const decl of styledDecls) {
    for (const helperName of decl.consumedLocalHelpers ?? []) {
      const fnPaths = root.find(j.FunctionDeclaration, { id: { name: helperName } });
      if (fnPaths.size() === 0) {
        continue;
      }
      // Skip exported functions — they're part of the module's public API
      const isExported = fnPaths.some(
        (p: { parentPath?: { node?: { type?: string } } }) =>
          p.parentPath?.node?.type === "ExportNamedDeclaration" ||
          p.parentPath?.node?.type === "ExportDefaultDeclaration",
      );
      if (isExported) {
        continue;
      }
      // Check for remaining references outside the declaration itself
      const refs = root
        .find(j.Identifier, { name: helperName })
        .filter(
          (idPath: { node?: unknown; parentPath?: { node?: { type?: string; id?: unknown } } }) => {
            const parent = idPath.parentPath?.node;
            if (parent?.type === "FunctionDeclaration" && parent.id === idPath.node) {
              return false;
            }
            return true;
          },
        );
      if (refs.size() === 0) {
        fnPaths.forEach((p: { prune: () => void }) => p.prune());
      }
    }
  }

  // Annotate event handler parameters at usage sites of converted components.
  // After conversion, inline arrow function event handlers may lose type inference
  // (e.g., `onKeyDown={e => ...}` gets implicit-any). Add explicit React event type annotations.
  if (/\.(ts|tsx)$/.test(file.path)) {
    // Only annotate event handlers for intrinsic-based components (styled.div, etc.).
    // Wrappers around custom components may use callback props with non-React payloads,
    // so injecting React.*Event annotations could make those handlers type-incompatible.
    const convertedNames = new Set<string>();
    const componentTagMap = new Map<string, string>();
    for (const decl of styledDecls) {
      if (decl.base.kind === "intrinsic") {
        convertedNames.add(decl.localName);
        componentTagMap.set(decl.localName, decl.base.tagName);
      }
    }
    if (annotateEventHandlerParams({ root, j, convertedNames, componentTagMap })) {
      ctx.markChanged();
    }
  }

  return CONTINUE;
}
