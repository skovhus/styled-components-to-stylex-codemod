/**
 * Merges `.attrs({ style: { ... } })` declarations into a styled component's
 * style object and style functions.
 */
import type { JSCodeshift } from "jscodeshift";
import type { DeclProcessingState } from "./decl-setup.js";
import type { StyledDecl } from "../transform-types.js";
import { cloneAstNode } from "../utilities/jscodeshift-utils.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";
import { cssPropertyToIdentifier, makeCssProperty } from "./shared.js";
import { ensureShouldForwardPropDrop, resolveTypeNodeFromTsType } from "./types.js";
import { setStyleObjectValue } from "./utils.js";

/**
 * Merges CSS properties from `.attrs({ style: { ... } })` into the styled component's
 * style object and style functions.
 *
 * - Static properties (e.g., `whiteSpace: "nowrap"`) are added to `styleObj`
 * - Dynamic properties (e.g., `height: $prop ? expr : undefined`) become
 *   `styleFnFromProps` entries with corresponding `styleFnDecls`
 */
export function mergeAttrsStyles(ctx: DeclProcessingState): void {
  const { state, decl, styleObj } = ctx;
  const attrsInfo = decl.attrsInfo;
  if (!attrsInfo) {
    return;
  }

  // Merge static style properties into the style object
  if (attrsInfo.attrsStaticStyles) {
    for (const [prop, value] of Object.entries(attrsInfo.attrsStaticStyles)) {
      setStyleObjectValue(styleObj, prop, value);
    }
  }

  // Convert dynamic style properties into styleFnFromProps entries
  if (attrsInfo.attrsDynamicStyles?.length) {
    const { j } = state;
    for (const entry of attrsInfo.attrsDynamicStyles) {
      const fnKey = styleKeyWithSuffix(decl.styleKey, entry.cssProp);
      const paramName = cssPropertyToIdentifier(entry.cssProp);
      const param = j.identifier(paramName);
      const condition = getAttrsDynamicStyleCondition(ctx, entry);
      (param as any).typeAnnotation = j.tsTypeAnnotation(getAttrsDynamicStyleParamType(ctx, entry));
      const p = makeCssProperty(j, entry.cssProp, paramName);
      const body = j.objectExpression([p]);
      ctx.styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
      ctx.styleFnFromProps.push({
        fnKey,
        jsxProp: entry.jsxProp,
        ...(condition ? { condition } : {}),
        callArg: entry.callArgExpr as any,
      });
      ensureShouldForwardPropDrop(decl, entry.jsxProp);
      decl.needsWrapperComponent = true;
    }
  }
}

type AttrsDynamicStyleEntry = NonNullable<
  NonNullable<StyledDecl["attrsInfo"]>["attrsDynamicStyles"]
>[number];
type TypeAnnotationInput = Parameters<JSCodeshift["tsTypeAnnotation"]>[0];

function getAttrsDynamicStyleCondition(
  ctx: DeclProcessingState,
  entry: AttrsDynamicStyleEntry,
): "truthy" | "always" | undefined {
  if (entry.condition) {
    return entry.condition;
  }
  const propType = ctx.findJsxPropTsType(entry.jsxProp);
  if (propType && !ctx.isJsxPropOptional(entry.jsxProp)) {
    return "always";
  }
  return undefined;
}

function getAttrsDynamicStyleParamType(
  ctx: DeclProcessingState,
  entry: AttrsDynamicStyleEntry,
): TypeAnnotationInput {
  const { j } = ctx.state;
  if (isDirectAttrsPropValue(entry)) {
    const propType = resolveTypeNodeFromTsType(j, ctx.findJsxPropTsType(entry.jsxProp));
    if (propType) {
      return cloneAstNode(propType) as TypeAnnotationInput;
    }
  }
  if (entry.condition === "truthy") {
    return j.tsStringKeyword();
  }
  return j.tsUnionType([j.tsStringKeyword(), j.tsNumberKeyword()]);
}

function isDirectAttrsPropValue(entry: AttrsDynamicStyleEntry): boolean {
  const callArg = entry.callArgExpr;
  if (!callArg || typeof callArg !== "object") {
    return false;
  }
  const node = callArg as { type?: string; name?: string; left?: unknown };
  return node.type === "Identifier" && node.name === entry.jsxProp;
}
