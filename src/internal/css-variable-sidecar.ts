/**
 * Emits generated StyleX variables for raw CSS custom-property definitions.
 * Core concepts: stable variable keys, sidecar serialization, and source values.
 */
import type { API } from "jscodeshift";
import type { TransformContext } from "./transform-context.js";
import type { CssVariableDefinition, CssVariableValue } from "./transform-types.js";
import { literalToAst } from "./transform/helpers.js";
import { isAstNode } from "./utilities/jscodeshift-utils.js";

export const CSS_VARIABLE_SIDE_CAR_IMPORT = "./stylex-vars.stylex";
export const CSS_VARIABLE_SIDE_CAR_FILENAME = "stylex-vars.stylex.ts";

export function buildCssVariableSidecarContent(
  exportName: string,
  definitions: CssVariableDefinition[],
  j: API["jscodeshift"],
): string {
  const sorted = [...definitions].sort((a, b) => a.cssName.localeCompare(b.cssName));
  const props = sorted.map((definition) =>
    j.property(
      "init",
      j.literal(definition.cssName),
      cssVariableValueToAst(j, definition.value) as Parameters<typeof j.property>[2],
    ),
  );
  const exportDecl = j.exportNamedDeclaration(
    j.variableDeclaration("const", [
      j.variableDeclarator(
        j.identifier(exportName),
        j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("defineVars")), [
          j.objectExpression(props),
        ]),
      ),
    ]),
  );
  const program = j.program([
    j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier("stylex"))],
      j.literal("@stylexjs/stylex"),
    ),
    exportDecl,
  ]);
  return `${j(program).toSource({ quote: "double", trailingComma: true })}\n`;
}

export function getCssVariableImportName(ctx: TransformContext): string {
  if (!ctx.cssVariableImportName) {
    const usedNames = collectBoundNames(ctx);
    ctx.cssVariableImportName = uniqueBindingName("cssVars", usedNames);
  }
  return ctx.cssVariableImportName;
}

function uniqueBindingName(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) {
    return base;
  }
  let index = 1;
  while (used.has(`${base}${index}`)) {
    index += 1;
  }
  return `${base}${index}`;
}

function collectBoundNames(ctx: TransformContext): Set<string> {
  const names = new Set<string>();
  ctx.root.find(ctx.j.Identifier).forEach((path) => {
    const name = path.node.name;
    if (name) {
      names.add(name);
    }
  });
  return names;
}

export function normalizeCssVariableValue(value: unknown): CssVariableValue {
  if (value && typeof value === "object" && !isAstNode(value) && !Array.isArray(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (key.startsWith("__")) {
        continue;
      }
      normalized[key] = normalizeCssVariableValue(nestedValue);
    }
    return normalized;
  }
  if (value === null || typeof value === "string" || typeof value === "number") {
    return value;
  }
  return null;
}

export function mergeCssVariableValue(
  current: CssVariableValue,
  next: CssVariableValue,
): CssVariableValue {
  if (isRecord(current) && isRecord(next)) {
    return { ...current, ...next };
  }
  if (isRecord(current)) {
    return { ...current, default: next };
  }
  if (isRecord(next)) {
    return { ...next, default: current };
  }
  return next;
}

function isRecord(value: CssVariableValue): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cssVariableValueToAst(j: API["jscodeshift"], value: CssVariableValue): unknown {
  if (isRecord(value)) {
    const props = Object.entries(value).map(([key, nestedValue]) =>
      j.property(
        "init",
        key === "default" ? j.identifier("default") : j.literal(key),
        cssVariableValueToAst(j, nestedValue as CssVariableValue) as Parameters<
          typeof j.property
        >[2],
      ),
    );
    return j.objectExpression(props);
  }
  return literalToAst(j, value);
}
