/**
 * Step: extract css helper blocks into reusable style objects.
 * Core concepts: helper discovery and usage validation.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { extractAndRemoveCssHelpers } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";
import { buildUnsupportedCssWarnings, toStyleKey } from "../transform/helpers.js";
import { collectIdentifiers } from "../utilities/jscodeshift-utils.js";

/**
 * Extracts css helper blocks into style objects and validates supported usage.
 */
export function extractCssHelpersStep(ctx: TransformContext): StepResult {
  const { styledImports, j, root } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  const cssImport = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s: any) => s.imported.type === "Identifier" && s.imported.name === "css");
  const cssLocal =
    cssImport?.local?.type === "Identifier"
      ? cssImport.local.name
      : cssImport?.imported?.type === "Identifier"
        ? cssImport.imported.name
        : undefined;

  ctx.cssLocal = cssLocal;

  const cssHelpers = extractAndRemoveCssHelpers({
    root,
    j,
    styledImports,
    cssLocal,
    toStyleKey,
    preserveDeclarationOnlyNames: collectCssHelpersUsedBySkippedImportedRoots(ctx),
  });

  if (cssHelpers.unsupportedCssUsages.length > 0) {
    return returnResult(
      { code: null, warnings: buildUnsupportedCssWarnings(cssHelpers.unsupportedCssUsages) },
      "bail",
    );
  }

  ctx.cssHelpers = cssHelpers;

  if (cssHelpers.changed) {
    ctx.markChanged();
  }

  return CONTINUE;
}

function collectCssHelpersUsedBySkippedImportedRoots(ctx: TransformContext): Set<string> {
  if (ctx.options.allowPartialMigration !== true || ctx.options.transformMode === "leavesOnly") {
    return new Set();
  }
  const importMap = ctx.importMap ?? new Map();
  if (importMap.size === 0) {
    return new Set();
  }
  const names = new Set<string>();
  ctx.root.find(ctx.j.TaggedTemplateExpression).forEach((path) => {
    if (!tagWrapsImportedComponent(ctx, path.node.tag, importMap)) {
      return;
    }
    for (const expression of path.node.quasi.expressions ?? []) {
      collectIdentifiers(expression, names);
    }
  });
  return names;
}

function tagWrapsImportedComponent(
  ctx: TransformContext,
  tag: unknown,
  importMap: Map<string, unknown>,
): boolean {
  const node = tag as { type?: string; callee?: unknown; arguments?: unknown[]; object?: unknown };
  if (!node) {
    return false;
  }
  if (node.type === "CallExpression") {
    if (isStyledComponentCall(ctx, node, importMap)) {
      return true;
    }
    return tagWrapsImportedComponent(ctx, node.callee, importMap);
  }
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    return tagWrapsImportedComponent(ctx, node.object, importMap);
  }
  return false;
}

function isStyledComponentCall(
  ctx: TransformContext,
  node: { callee?: unknown; arguments?: unknown[] },
  importMap: Map<string, unknown>,
): boolean {
  const callee = node.callee as { type?: string; name?: string } | null;
  const firstArg = node.arguments?.[0] as { type?: string; name?: string } | undefined;
  return (
    !!callee &&
    ctx.isStyledTag(callee) &&
    firstArg?.type === "Identifier" &&
    !!firstArg.name &&
    importMap.has(firstArg.name)
  );
}
