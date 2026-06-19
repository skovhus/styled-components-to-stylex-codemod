/**
 * Step: extract css helper blocks into reusable style objects.
 * Core concepts: helper discovery and usage validation.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { extractAndRemoveCssHelpers } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";
import { buildUnsupportedCssWarnings, toStyleKey } from "../transform/helpers.js";
import { collectIdentifiers } from "../utilities/jscodeshift-utils.js";
import { isImportedComponentIdent } from "../utilities/partial-migration.js";
import { collectMemberExpressionPaths } from "../utilities/member-expression-paths.js";

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
    preservedStyledComponentSelectorNames: collectSkippedImportedRootStyledComponentNames(ctx),
    preserveUniversalSelectorHelpers:
      ctx.options.allowPartialMigration === true && ctx.options.transformMode !== "leavesOnly",
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

function collectSkippedImportedRootStyledComponentNames(ctx: TransformContext): Set<string> {
  if (ctx.options.allowPartialMigration !== true || ctx.options.transformMode === "leavesOnly") {
    return new Set();
  }
  const names = new Set<string>();
  ctx.root.find(ctx.j.VariableDeclarator).forEach((path) => {
    const id = path.node.id;
    if (id.type !== "Identifier") {
      return;
    }
    if (initializerWrapsImportedComponent(ctx, path.node.init)) {
      names.add(id.name);
    }
  });
  return names;
}

function initializerWrapsImportedComponent(ctx: TransformContext, init: unknown): boolean {
  const node = init as { type?: string; tag?: unknown; callee?: unknown } | null;
  if (!node) {
    return false;
  }
  if (node.type === "TaggedTemplateExpression") {
    return tagWrapsImportedComponent(ctx, node.tag);
  }
  if (node.type === "CallExpression") {
    const callee = node.callee as { type?: string; tag?: unknown } | null;
    return (
      callee?.type === "TaggedTemplateExpression" && tagWrapsImportedComponent(ctx, callee.tag)
    );
  }
  return false;
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
    if (!tagWrapsImportedComponent(ctx, path.node.tag)) {
      return;
    }
    for (const expression of path.node.quasi.expressions ?? []) {
      collectIdentifiers(expression, names);
      collectMemberExpressionPaths(expression, names);
    }
  });
  return names;
}

function tagWrapsImportedComponent(ctx: TransformContext, tag: unknown): boolean {
  const node = tag as { type?: string; callee?: unknown; arguments?: unknown[]; object?: unknown };
  if (!node) {
    return false;
  }
  if (node.type === "CallExpression") {
    if (isStyledComponentCall(ctx, node)) {
      return true;
    }
    return tagWrapsImportedComponent(ctx, node.callee);
  }
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    return tagWrapsImportedComponent(ctx, node.object);
  }
  return false;
}

function isStyledComponentCall(
  ctx: TransformContext,
  node: { callee?: unknown; arguments?: unknown[] },
): boolean {
  const callee = node.callee as { type?: string; name?: string } | null;
  const firstArgIdent = expressionIdent(node.arguments?.[0]);
  return (
    !!callee &&
    ctx.isStyledTag(callee) &&
    !!firstArgIdent &&
    isImportedComponentIdent(ctx, firstArgIdent)
  );
}

function expressionIdent(node: unknown): string | null {
  const typed = node as {
    type?: string;
    name?: string;
    object?: unknown;
    property?: { type?: string; name?: string };
    computed?: boolean;
  };
  if (typed?.type === "Identifier" && typed.name) {
    return typed.name;
  }
  if (
    typed?.type === "MemberExpression" &&
    typed.computed !== true &&
    typed.property?.type === "Identifier" &&
    typed.property.name
  ) {
    const objectIdent = expressionIdent(typed.object);
    return objectIdent ? `${objectIdent}.${typed.property.name}` : null;
  }
  return null;
}
