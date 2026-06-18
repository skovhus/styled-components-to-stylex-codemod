/**
 * JSX attribute helpers for the rewrite-jsx step: className/style merge call
 * construction, attribute value extraction, and small literal builders.
 */
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { type ExpressionKind } from "../utilities/jscodeshift-utils.js";

/**
 * Builds an inline style/class merge call for inlined components that receive
 * className and/or style at a call site.
 *
 * - With configured styleMerger: calls adapter merger (e.g. `stylexProps(...)`).
 * - Without styleMerger: emits a verbose inline fallback around `stylex.props(...)`.
 */
export function buildInlineMergeCall(
  j: TransformContext["j"]["jscodeshift"],
  styleArgs: ExpressionKind[],
  classNameAttr: unknown,
  styleAttr: unknown,
  styleMergerFunctionName: string | undefined,
): ExpressionKind {
  const stylesArg = styleArgs.length === 1 ? styleArgs[0]! : j.arrayExpression([...styleArgs]);

  const classNameExpr = extractJsxAttrValueExpr(j, classNameAttr);
  const styleExpr = extractJsxAttrValueExpr(j, styleAttr);

  if (styleMergerFunctionName) {
    return j.callExpression(j.identifier(styleMergerFunctionName), [
      stylesArg,
      ...(classNameExpr ? [classNameExpr] : styleExpr ? [j.identifier("undefined")] : []),
      ...(styleExpr ? [styleExpr] : []),
    ]);
  }

  return buildInlineVerboseMergeFallback(j, stylesArg, classNameExpr, styleExpr);
}

export function mergeClassNameAttrs(
  j: TransformContext["j"]["jscodeshift"],
  first: unknown,
  second: unknown,
): ReturnType<TransformContext["j"]["jscodeshift"]["jsxAttribute"]> {
  const firstExpr = extractJsxAttrValueExpr(j, first);
  const secondExpr = extractJsxAttrValueExpr(j, second);
  const parts = [firstExpr, secondExpr].filter((expr): expr is ExpressionKind => !!expr);
  const expr = parts.length === 1 ? parts[0]! : buildClassNameJoinExpr(j, parts);
  return j.jsxAttribute(j.jsxIdentifier("className"), j.jsxExpressionContainer(expr));
}

export function removeJsxAttrsByName(attrs: Array<unknown>, name: string): void {
  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs[i] as { type?: string; name?: { type?: string; name?: string } } | undefined;
    if (
      attr?.type === "JSXAttribute" &&
      attr.name?.type === "JSXIdentifier" &&
      attr.name.name === name
    ) {
      attrs.splice(i, 1);
    }
  }
}

export function literalExprForDynamicAttrDefault(
  j: TransformContext["j"]["jscodeshift"],
  value: unknown,
): ExpressionKind {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return j.literal(value) as ExpressionKind;
  }
  if (value === null) {
    return j.literal(null) as ExpressionKind;
  }
  return j.identifier("undefined");
}

/** Extracts the value expression from a JSX attribute node. */
export function extractJsxAttrValueExpr(
  j: TransformContext["j"]["jscodeshift"],
  attr: unknown,
): ExpressionKind | undefined {
  if (!attr) {
    return undefined;
  }
  const a = attr as {
    value?: { type?: string; value?: unknown; expression?: unknown };
  };
  if (!a.value) {
    return j.literal(true) as unknown as ExpressionKind;
  }
  if (a.value.type === "StringLiteral" || a.value.type === "Literal") {
    return j.literal(a.value.value as string | number | boolean) as unknown as ExpressionKind;
  }
  if (a.value.type === "JSXExpressionContainer") {
    return a.value.expression as ExpressionKind;
  }
  return undefined;
}

/**
 * Builds a single expression from extra className entries (CSS module classes).
 * Single entry: returns the expression directly.
 * Multiple entries: joins with a template literal `${a} ${b}`.
 */
export function buildExtraClassNameExpr(
  j: TransformContext["j"]["jscodeshift"],
  extraClassNames: NonNullable<StyledDecl["extraClassNames"]>,
): ExpressionKind {
  const exprs = extraClassNames.map((cn) => cn.expr);
  if (exprs.length === 1 && exprs[0]) {
    return exprs[0];
  }
  const qs: ReturnType<typeof j.templateElement>[] = [];
  for (let i = 0; i <= exprs.length; i++) {
    const isLast = i === exprs.length;
    const raw = i === 0 || isLast ? "" : " ";
    qs.push(j.templateElement({ raw, cooked: raw }, isLast));
  }
  return j.templateLiteral(qs, exprs);
}

function buildInlineVerboseMergeFallback(
  j: TransformContext["j"]["jscodeshift"],
  stylesArg: ExpressionKind,
  classNameExpr: ExpressionKind | undefined,
  styleExpr: ExpressionKind | undefined,
): ExpressionKind {
  const sxIdentifier = j.identifier("sx");
  const sxClassName = j.memberExpression(sxIdentifier, j.identifier("className"));
  const sxStyle = j.memberExpression(sxIdentifier, j.identifier("style"));

  const classNameValue = classNameExpr
    ? j.callExpression(
        j.memberExpression(
          j.callExpression(
            j.memberExpression(
              j.arrayExpression([sxClassName, ...flattenClassNameExpr(classNameExpr)]),
              j.identifier("filter"),
            ),
            [j.identifier("Boolean")],
          ),
          j.identifier("join"),
        ),
        [j.literal(" ")],
      )
    : sxClassName;

  const styleValue = styleExpr
    ? j.conditionalExpression(
        sxStyle,
        j.objectExpression([j.spreadElement(sxStyle), j.spreadElement(styleExpr)]),
        styleExpr,
      )
    : sxStyle;

  return j.callExpression(
    j.arrowFunctionExpression(
      [],
      j.blockStatement([
        j.variableDeclaration("const", [
          j.variableDeclarator(
            sxIdentifier,
            j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
              stylesArg,
            ]),
          ),
        ]),
        j.returnStatement(
          j.objectExpression([
            j.property("init", j.identifier("className"), classNameValue),
            j.property("init", j.identifier("style"), styleValue),
          ]),
        ),
      ]),
    ),
    [],
  );
}

function flattenClassNameExpr(classNameExpr: ExpressionKind): ExpressionKind[] {
  return classNameExpr.type === "ArrayExpression" &&
    classNameExpr.elements.every((element): element is ExpressionKind => !!element)
    ? [...classNameExpr.elements]
    : [classNameExpr];
}

function buildClassNameJoinExpr(
  j: TransformContext["j"]["jscodeshift"],
  parts: ExpressionKind[],
): ExpressionKind {
  return j.callExpression(
    j.memberExpression(
      j.callExpression(j.memberExpression(j.arrayExpression(parts), j.identifier("filter")), [
        j.identifier("Boolean"),
      ]),
      j.identifier("join"),
    ),
    [j.literal(" ")],
  );
}
