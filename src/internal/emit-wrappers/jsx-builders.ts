/**
 * JSX attribute and element construction helpers for wrapper components.
 *
 * Provides factory functions for building JSX attributes (default, static,
 * conditional, inverted-boolean), composing merging attributes, and
 * assembling complete JSX elements and wrapper function declarations.
 */
import type {
  ASTNode,
  Identifier,
  JSCodeshift,
  JSXAttribute,
  JSXSpreadAttribute,
  Property,
  RestElement,
} from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind } from "./types.js";
import type { StyleMergingResult } from "./style-merger.js";

export type JsxAttr = JSXAttribute | JSXSpreadAttribute;
export type JsxTagName = Parameters<JSCodeshift["jsxOpeningElement"]>[0];
export type StatementKind = Parameters<JSCodeshift["blockStatement"]>[0][number];

// ---------------------------------------------------------------------------
// Primitive value → AST literal
// ---------------------------------------------------------------------------

export function literalExpr(j: JSCodeshift, value: unknown): ExpressionKind {
  if (typeof value === "boolean") {
    return j.booleanLiteral(value);
  }
  if (typeof value === "number") {
    return j.literal(value);
  }
  if (typeof value === "string") {
    return j.literal(value);
  }
  return j.literal(String(value));
}

// ---------------------------------------------------------------------------
// Attribute builders
// ---------------------------------------------------------------------------

export function buildDefaultAttrsFromProps(
  j: JSCodeshift,
  args: {
    defaultAttrs: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    propExprFor: (jsxProp: string) => ExpressionKind;
  },
): JsxAttr[] {
  const { defaultAttrs, propExprFor } = args;
  return defaultAttrs.map((a) =>
    j.jsxAttribute(
      j.jsxIdentifier(a.attrName),
      j.jsxExpressionContainer(
        j.logicalExpression("??", propExprFor(a.jsxProp), literalExpr(j, a.value) as any),
      ),
    ),
  );
}

export function buildStaticValueAttrs(
  j: JSCodeshift,
  args: { attrs: Array<{ attrName: string; value: unknown }> },
): JsxAttr[] {
  const { attrs } = args;
  return attrs.map((a) => {
    if (typeof a.value === "string") {
      return j.jsxAttribute(j.jsxIdentifier(a.attrName), j.literal(a.value));
    }
    if (typeof a.value === "number") {
      return j.jsxAttribute(
        j.jsxIdentifier(a.attrName),
        j.jsxExpressionContainer(j.literal(a.value)),
      );
    }
    if (typeof a.value === "boolean") {
      return j.jsxAttribute(
        j.jsxIdentifier(a.attrName),
        j.jsxExpressionContainer(j.booleanLiteral(a.value)),
      );
    }
    return j.jsxAttribute(
      j.jsxIdentifier(a.attrName),
      j.jsxExpressionContainer(literalExpr(j, a.value)),
    );
  });
}

export function buildConditionalAttrs(
  j: JSCodeshift,
  args: {
    conditionalAttrs: Array<{ jsxProp: string; attrName: string; value: unknown }>;
    testExprFor: (jsxProp: string) => ExpressionKind;
  },
): JsxAttr[] {
  const { conditionalAttrs, testExprFor } = args;
  return conditionalAttrs.map((cond) =>
    j.jsxAttribute(
      j.jsxIdentifier(cond.attrName),
      j.jsxExpressionContainer(
        j.conditionalExpression(
          testExprFor(cond.jsxProp),
          literalExpr(j, cond.value),
          j.identifier("undefined"),
        ),
      ),
    ),
  );
}

export function buildInvertedBoolAttrs(
  j: JSCodeshift,
  args: {
    invertedBoolAttrs: Array<{ jsxProp: string; attrName: string }>;
    testExprFor: (jsxProp: string) => ExpressionKind;
  },
): JsxAttr[] {
  const { invertedBoolAttrs, testExprFor } = args;
  return invertedBoolAttrs.map((inv) =>
    j.jsxAttribute(
      j.jsxIdentifier(inv.attrName),
      j.jsxExpressionContainer(
        j.binaryExpression("!==", testExprFor(inv.jsxProp), j.booleanLiteral(true)),
      ),
    ),
  );
}

export function buildStaticAttrsFromRecord(
  j: JSCodeshift,
  staticAttrs: Record<string, unknown>,
  options?: { booleanTrueAsShorthand?: boolean },
): JsxAttr[] {
  const booleanTrueAsShorthand = options?.booleanTrueAsShorthand ?? true;
  const attrs: JsxAttr[] = [];
  for (const [key, value] of Object.entries(staticAttrs)) {
    if (typeof value === "string") {
      attrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
    } else if (typeof value === "boolean") {
      if (value) {
        attrs.push(
          j.jsxAttribute(
            j.jsxIdentifier(key),
            booleanTrueAsShorthand ? null : j.jsxExpressionContainer(j.booleanLiteral(true)),
          ),
        );
      } else {
        attrs.push(
          j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(false))),
        );
      }
    } else if (typeof value === "number") {
      attrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))));
    }
  }
  return attrs;
}

// ---------------------------------------------------------------------------
// Composite helpers
// ---------------------------------------------------------------------------

/**
 * Build all attrs from attrsInfo in the correct order:
 * defaultAttrs, conditionalAttrs, invertedBoolAttrs, staticAttrs
 */
export function buildAttrsFromAttrsInfo(
  j: JSCodeshift,
  args: {
    attrsInfo: StyledDecl["attrsInfo"];
    propExprFor: (prop: string) => ExpressionKind;
  },
): JsxAttr[] {
  const { attrsInfo, propExprFor } = args;
  if (!attrsInfo) {
    return [];
  }
  return [
    ...buildDefaultAttrsFromProps(j, {
      defaultAttrs: attrsInfo.defaultAttrs ?? [],
      propExprFor,
    }),
    ...buildConditionalAttrs(j, {
      conditionalAttrs: attrsInfo.conditionalAttrs ?? [],
      testExprFor: propExprFor,
    }),
    ...buildInvertedBoolAttrs(j, {
      invertedBoolAttrs: attrsInfo.invertedBoolAttrs ?? [],
      testExprFor: propExprFor,
    }),
    ...buildStaticAttrsFromRecord(j, attrsInfo.staticAttrs ?? {}),
  ];
}

export function appendMergingAttrs(
  j: JSCodeshift,
  attrs: JsxAttr[],
  merging: StyleMergingResult,
): void {
  if (merging.classNameBeforeSpread && merging.classNameAttr) {
    attrs.push(
      j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(merging.classNameAttr)),
    );
  }
  if (merging.jsxSpreadExpr) {
    attrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));
  }
  if (merging.classNameAttr && !merging.classNameBeforeSpread) {
    attrs.push(
      j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(merging.classNameAttr)),
    );
  }
  if (merging.styleAttr) {
    attrs.push(
      j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
    );
  }
}

// ---------------------------------------------------------------------------
// JSX element & wrapper function
// ---------------------------------------------------------------------------

export function buildJsxElement(
  j: JSCodeshift,
  args: {
    tagName: string | JsxTagName;
    attrs: JsxAttr[];
    includeChildren: boolean;
    childrenExpr?: ExpressionKind;
  },
): ASTNode {
  const { tagName, attrs, includeChildren, childrenExpr } = args;
  const jsxTag = typeof tagName === "string" ? j.jsxIdentifier(tagName) : (tagName as JsxTagName);
  const openingEl = j.jsxOpeningElement(jsxTag, attrs, !includeChildren);
  if (!includeChildren) {
    return j.jsxElement(openingEl, null, []);
  }
  const children = childrenExpr ? [j.jsxExpressionContainer(childrenExpr)] : [];
  return j.jsxElement(openingEl, j.jsxClosingElement(jsxTag), children);
}

export function buildWrapperFunction(
  j: JSCodeshift,
  args: {
    localName: string;
    params: Identifier[];
    bodyStmts: StatementKind[];
    typeParameters?: unknown;
    moveTypeParamsFromParam?: Identifier;
  },
): ASTNode {
  const { localName, params, bodyStmts, typeParameters, moveTypeParamsFromParam } = args;
  const filteredBody = bodyStmts.filter((stmt) => stmt && (stmt as any).type !== "EmptyStatement");
  const fn = j.functionDeclaration(j.identifier(localName), params, j.blockStatement(filteredBody));
  if (typeParameters) {
    (fn as any).typeParameters = typeParameters;
  }
  if (moveTypeParamsFromParam && (moveTypeParamsFromParam as any).typeParameters) {
    (fn as any).typeParameters = (moveTypeParamsFromParam as any).typeParameters;
    (moveTypeParamsFromParam as any).typeParameters = undefined;
  }
  return fn;
}

export function buildDestructurePatternProps(
  j: JSCodeshift,
  patternProp: (keyName: string, valueId?: ASTNode) => Property,
  args: {
    baseProps: Array<Property | RestElement>;
    destructureProps: Array<string | null | undefined>;
    propDefaults?: Map<string, string>;
    includeRest?: boolean;
    restId?: Identifier;
  },
): Array<Property | RestElement> {
  const { baseProps, destructureProps, propDefaults, includeRest = false, restId } = args;
  const patternProps: Array<Property | RestElement> = [...baseProps];

  for (const name of destructureProps.filter((n): n is string => Boolean(n))) {
    const defaultVal = propDefaults?.get(name);
    if (defaultVal) {
      patternProps.push(
        j.property.from({
          kind: "init",
          key: j.identifier(name),
          value: j.assignmentPattern(j.identifier(name), j.literal(defaultVal)),
          shorthand: false,
        }) as Property,
      );
    } else {
      patternProps.push(patternProp(name));
    }
  }

  if (includeRest && restId) {
    patternProps.push(j.restElement(restId));
  }

  return patternProps;
}
