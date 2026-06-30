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
import { cloneAstNode } from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind, WrapperPropDefaults } from "./types.js";
import type { StyleMergingResult } from "./style-merger.js";

export type JsxAttr = JSXAttribute | JSXSpreadAttribute;
export type JsxTagName = Parameters<JSCodeshift["jsxOpeningElement"]>[0];
export type StatementKind = Parameters<JSCodeshift["blockStatement"]>[0][number];
export type FunctionParams = Parameters<JSCodeshift["functionDeclaration"]>[1];

/**
 * Builds the `<C extends React.ElementType = "tag">` type parameter for polymorphic wrappers.
 * Parses a dummy function declaration to extract a valid TypeScript type parameter AST node.
 * When defaultTag is a type expression (e.g. `typeof Flex`), it's emitted unquoted.
 */
export function buildPolymorphicTypeParams(j: JSCodeshift, defaultTag: string): unknown {
  const defaultExpr = defaultTag.startsWith("typeof ") ? defaultTag : `"${defaultTag}"`;
  return j(`function _<C extends React.ElementType = ${defaultExpr}>() { return null }`).get().node
    .program.body[0].typeParameters;
}

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

export function buildDynamicAttrsFromProps(
  j: JSCodeshift,
  args: {
    dynamicAttrs: Array<{ jsxProp: string; attrName: string; defaultValue?: unknown }>;
    propExprFor: (jsxProp: string) => ExpressionKind;
  },
): JsxAttr[] {
  const { dynamicAttrs, propExprFor } = args;
  return dynamicAttrs.map((attr) => {
    const propExpr = propExprFor(attr.jsxProp);
    const valueExpr =
      attr.defaultValue === undefined
        ? propExpr
        : j.conditionalExpression(
            j.binaryExpression("===", propExpr, j.identifier("undefined")),
            literalExprForAttrDefault(j, attr.defaultValue),
            propExpr,
          );
    return j.jsxAttribute(j.jsxIdentifier(attr.attrName), j.jsxExpressionContainer(valueExpr));
  });
}

function literalExprForAttrDefault(j: JSCodeshift, value: unknown): ExpressionKind {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return j.literal(value) as ExpressionKind;
  }
  if (value === null) {
    return j.literal(null) as ExpressionKind;
  }
  return j.identifier("undefined");
}

export function buildStaticAttrsFromRecord(
  j: JSCodeshift,
  staticAttrs: Record<string, unknown>,
  options?: { booleanTrueAsShorthand?: boolean },
): JsxAttr[] {
  const attrs: JsxAttr[] = [];
  for (const [key, value] of Object.entries(staticAttrs)) {
    const attr = buildStaticAttrFromValue(j, key, value, options);
    if (attr) {
      attrs.push(attr);
    }
  }
  return attrs;
}

export function buildStaticAttrFromValue(
  j: JSCodeshift,
  key: string,
  value: unknown,
  options?: { booleanTrueAsShorthand?: boolean },
): JSXAttribute | null {
  const booleanTrueAsShorthand = options?.booleanTrueAsShorthand ?? true;
  if (typeof value === "string") {
    // Emit strings with escape-requiring characters (newlines, tabs, etc.) as
    // expression containers so the JS escapes are interpreted at runtime.
    // JSX string attributes don't interpret escape sequences - they're literal.
    if (stringNeedsExpressionContainer(value)) {
      return j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value)));
    }
    return j.jsxAttribute(j.jsxIdentifier(key), j.literal(value));
  }
  if (typeof value === "boolean") {
    return j.jsxAttribute(
      j.jsxIdentifier(key),
      value && booleanTrueAsShorthand ? null : j.jsxExpressionContainer(j.booleanLiteral(value)),
    );
  }
  if (typeof value === "number") {
    return j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value)));
  }
  if (value === undefined) {
    return j.jsxAttribute(
      j.jsxIdentifier(key),
      j.jsxExpressionContainer(j.identifier("undefined")),
    );
  }
  if (value === null) {
    return j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(null)));
  }
  if (isStaticAttrExpression(value)) {
    return j.jsxAttribute(
      j.jsxIdentifier(key),
      j.jsxExpressionContainer(cloneAstNode(value) as ExpressionKind),
    );
  }
  return null;
}

function isStaticAttrExpression(value: unknown): value is ExpressionKind {
  return (
    !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * Check if a string contains characters that require escaping in a JS string literal.
 * Such strings must be emitted as JSX expression containers (`attr={"value"}`) rather
 * than direct JSX string attributes (`attr="value"`), because JSX string attributes
 * don't interpret JS escape sequences - they're literal strings.
 */
function stringNeedsExpressionContainer(value: string): boolean {
  // Check for control characters (ASCII 0-31) or backslash, which are common escape
  // sequences that would be mangled in JSX string attrs. Using Unicode escapes to
  // avoid lint errors about control characters in regex.
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\\]/.test(value);
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
    // Static attrs override caller props, so on a wrapper that spreads `{...rest}`
    // they must be emitted *after* the spread. Pass `false` to omit them here and
    // emit them after the rest spread via `buildStaticAttrsFromRecord` instead.
    includeStatic?: boolean;
  },
): JsxAttr[] {
  const { attrsInfo, propExprFor, includeStatic = true } = args;
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
    ...(includeStatic ? buildStaticAttrsFromRecord(j, attrsInfo.staticAttrs ?? {}) : []),
  ];
}

export function appendMergingAttrs(
  j: JSCodeshift,
  attrs: JsxAttr[],
  merging: StyleMergingResult,
): void {
  if (merging.externalAttrsBeforeSxProp && merging.sxPropExpr) {
    if (merging.classNameAttr) {
      attrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("className"),
          j.jsxExpressionContainer(merging.classNameAttr),
        ),
      );
    }
    if (merging.styleAttr) {
      attrs.push(
        j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
      );
    }
    attrs.push(j.jsxAttribute(j.jsxIdentifier("sx"), j.jsxExpressionContainer(merging.sxPropExpr)));
    return;
  }
  if (merging.classNameBeforeSpread && merging.classNameAttr) {
    attrs.push(
      j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(merging.classNameAttr)),
    );
  }
  if (merging.sxPropExpr) {
    attrs.push(j.jsxAttribute(j.jsxIdentifier("sx"), j.jsxExpressionContainer(merging.sxPropExpr)));
  } else if (merging.jsxSpreadExpr) {
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
    params: FunctionParams;
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

export function buildShorthandDefaultPatternProp(
  j: JSCodeshift,
  name: string,
  defaultVal: string | number | boolean,
): Property {
  return j.property.from({
    kind: "init",
    key: j.identifier(name),
    value: j.assignmentPattern(j.identifier(name), j.literal(defaultVal)),
    // Emit shorthand form (`foo = "bar"`) instead of redundant `foo: foo = "bar"`.
    shorthand: true,
  }) as Property;
}

export function shouldPassChildrenThroughRest(args: {
  includeChildren: boolean;
  includeRest?: boolean;
  restId?: Identifier | null;
  destructureProps?: Array<string | null | undefined>;
  defaultAttrs?: Array<{ attrName?: string; jsxProp?: string }>;
  dynamicAttrs?: Array<{ attrName?: string; jsxProp?: string }>;
  staticAttrs?: Record<string, unknown>;
}): boolean {
  const {
    includeChildren,
    includeRest = false,
    restId,
    destructureProps = [],
    defaultAttrs = [],
    dynamicAttrs = [],
    staticAttrs = {},
  } = args;
  if (!includeChildren || !includeRest || !restId) {
    return false;
  }
  if (destructureProps.some((name) => name === "children")) {
    return false;
  }
  if (
    [...defaultAttrs, ...dynamicAttrs].some(
      (attr) => attr.attrName === "children" || attr.jsxProp === "children",
    )
  ) {
    return false;
  }
  return !Object.hasOwn(staticAttrs, "children");
}

export function buildDestructurePatternProps(
  j: JSCodeshift,
  patternProp: (keyName: string, valueId?: ASTNode) => Property,
  args: {
    baseProps: Array<Property | RestElement>;
    destructureProps: Array<string | null | undefined>;
    propDefaults?: WrapperPropDefaults;
    includeRest?: boolean;
    restId?: Identifier;
  },
): Array<Property | RestElement> {
  const { baseProps, destructureProps, propDefaults, includeRest = false, restId } = args;
  const patternProps: Array<Property | RestElement> = [...baseProps];

  // Collect names already present in baseProps to avoid duplicate bindings
  // (e.g. pseudo guard props overlapping with intrinsic props like href/type)
  const existingNames = new Set<string>();
  for (const prop of baseProps) {
    if (prop.type !== "RestElement") {
      const key = (prop as { key?: { type?: string; name?: string } }).key;
      if (key?.type === "Identifier" && key.name) {
        existingNames.add(key.name);
      }
    }
  }

  for (const name of destructureProps.filter(
    (n): n is string => typeof n === "string" && n.length > 0 && !existingNames.has(n),
  )) {
    const defaultVal = propDefaults?.get(name);
    if (defaultVal !== undefined) {
      patternProps.push(buildShorthandDefaultPatternProp(j, name, defaultVal));
    } else {
      patternProps.push(patternProp(name));
    }
  }

  if (includeRest && restId) {
    patternProps.push(j.restElement(restId));
  }

  return patternProps;
}

/**
 * Returns true when an object-destructure pattern only extracts `children`.
 */
export function isChildrenOnlyDestructurePattern(
  patternProps: Array<Property | RestElement>,
): boolean {
  if (patternProps.length !== 1) {
    return false;
  }
  const onlyProp = patternProps[0] as unknown as {
    type?: string;
    computed?: boolean;
    key?: { type?: string; name?: string };
    value?: { type?: string; name?: string };
  };
  if (!onlyProp || (onlyProp.type !== "Property" && onlyProp.type !== "ObjectProperty")) {
    return false;
  }
  if (onlyProp.computed) {
    return false;
  }
  if (onlyProp.key?.type !== "Identifier" || onlyProp.key.name !== "children") {
    return false;
  }
  return onlyProp.value?.type === "Identifier" && onlyProp.value.name === "children";
}
