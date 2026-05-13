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

/**
 * Collects qualified dot paths from `MemberExpression` nodes (e.g. `mixins.root`
 * yields the string `"mixins.root"`). Lets the css-helper extractor recognize
 * object-member helpers that a skipped imported-root template still references.
 */
function collectMemberExpressionPaths(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectMemberExpressionPaths(child, out);
    }
    return;
  }
  const typed = node as {
    type?: string;
    object?: unknown;
    property?: { type?: string; name?: string; value?: unknown };
    computed?: boolean;
  };
  if (typed.type === "MemberExpression") {
    const propertyName = memberPropertyName(typed.property, typed.computed === true);
    const objectPath = memberExpressionRoot(typed.object);
    if (objectPath && propertyName) {
      out.add(`${objectPath}.${propertyName}`);
    }
  }
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    collectMemberExpressionPaths((node as Record<string, unknown>)[key], out);
  }
}

function memberExpressionRoot(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const typed = node as {
    type?: string;
    name?: string;
    object?: unknown;
    property?: { type?: string; name?: string; value?: unknown };
    computed?: boolean;
  };
  if (typed.type === "Identifier" && typed.name) {
    return typed.name;
  }
  if (typed.type === "MemberExpression") {
    const propertyName = memberPropertyName(typed.property, typed.computed === true);
    if (!propertyName) {
      return null;
    }
    const inner = memberExpressionRoot(typed.object);
    return inner ? `${inner}.${propertyName}` : null;
  }
  return null;
}

function memberPropertyName(
  property: { type?: string; name?: string; value?: unknown } | undefined,
  computed: boolean,
): string | null {
  if (!computed && property?.type === "Identifier" && property.name) {
    return property.name;
  }
  if (
    computed &&
    (property?.type === "StringLiteral" || property?.type === "Literal") &&
    typeof property.value === "string"
  ) {
    return property.value;
  }
  return null;
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
