/**
 * Step: post-process transformed AST and cleanup imports.
 * Core concepts: relation overrides and import reconciliation.
 */
import { cleanupConsumedLocalHelpers } from "../post-process-consumed-helpers.js";
import { postProcessTransformedAst } from "../rewrite-jsx.js";
import { collectNewImportMetadata } from "../post-process-imports.js";
import { CONTINUE, getActiveStyledDecls, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Performs post-processing rewrites, import cleanup, and descendant/ancestor selector adjustments.
 */
export function postProcessStep(ctx: TransformContext): StepResult {
  const { root, j, file } = ctx;
  const allStyledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!allStyledDecls) {
    return CONTINUE;
  }
  // Skip decls that couldn't be lowered — their helpers and JSX must remain untouched.
  const styledDecls = getActiveStyledDecls(allStyledDecls) ?? [];

  const { newImportLocalNames, newImportSourcesByLocal } = collectNewImportMetadata(
    ctx.resolverImports,
    String(file.path),
  );
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
    localElementOverridesByParent: new Map(
      styledDecls
        .filter((decl) => decl.localElementOverrides?.length)
        .map((decl) => [decl.styleKey, decl.localElementOverrides ?? []]),
    ),
    componentNameToStyleKey,
    emptyStyleKeys: ctx.emptyStyleKeys ?? new Set<string>(),
    preserveReactImport: ctx.preserveReactImport,
    newImportLocalNames,
    newImportSourcesByLocal,
    stylesIdentifier: ctx.stylesIdentifier,
    crossFileMarkers: ctx.crossFileMarkers,
    parentsNeedingDefaultMarker: ctx.parentsNeedingDefaultMarker,
  });
  if (post.changed) {
    ctx.markChanged();
  }
  ctx.needsReactImport = post.needsReactImport;

  cleanupConsumedLocalHelpers(ctx, styledDecls);

  return CONTINUE;
}
