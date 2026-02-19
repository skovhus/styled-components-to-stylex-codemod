/**
 * Emits inline style functions for interpolated prop-based values.
 * Core concepts: preserving pseudos/media and wrapping prop access safely.
 */
import type { JSCodeshift } from "jscodeshift";
import type { CssDeclarationIR } from "../css-ir.js";
import type { WarningLog, WarningType } from "../logger.js";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  buildTemplateWithStaticParts,
  collectPropsFromArrowFn,
  countConditionalExpressions,
  hasThemeAccessInArrowFn,
  hasUnsupportedConditionalTest,
  inlineArrowFunctionBody,
  unwrapArrowFunctionToPropsExpr,
} from "./inline-styles.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import { extractStaticParts } from "./interpolations.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import { cloneAstNode, getFunctionBodyExpr } from "../utilities/jscodeshift-utils.js";
import { makeCssPropKey } from "./shared.js";
import { toSuffixFromProp } from "../transform/helpers.js";

type InlineStyleFromPropsContext = {
  j: JSCodeshift;
  decl: StyledDecl;
  d: CssDeclarationIR;
  res: { type?: string } | null | undefined;
  slotId: number;
  pseudos: string[] | null;
  media: string | undefined;
  filePath: string;
  loc: { line: number; column: number } | null | undefined;
  warnings: WarningLog[];
  styleFnDecls: Map<string, unknown>;
  styleFnFromProps: Array<{
    fnKey: string;
    jsxProp: string;
    condition?: "truthy" | "always";
    conditionWhen?: string;
    callArg?: ExpressionKind;
  }>;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }>;
  warnPropInlineStyle: (
    decl: StyledDecl,
    type: WarningType,
    propName: string | null | undefined,
    loc: { line: number; column: number } | null | undefined,
  ) => void;
  setBail: () => void;
};

export function handleInlineStyleValueFromProps(ctx: InlineStyleFromPropsContext): boolean {
  const {
    j,
    decl,
    d,
    res,
    slotId,
    pseudos,
    media,
    filePath,
    loc,
    warnings,
    styleFnDecls,
    styleFnFromProps,
    inlineStyleProps,
    warnPropInlineStyle,
    setBail,
  } = ctx;

  if (!res || res.type !== "emitInlineStyleValueFromProps") {
    return false;
  }
  if (!d.property) {
    // This handler is only intended for value interpolations on concrete properties.
    // If the IR is missing a property, fall through to other handlers.
    return false;
  }

  const e = decl.templateExpressions[slotId] as any;
  const bailNow = () => {
    setBail();
    return true;
  };

  if (e?.type === "ArrowFunctionExpression") {
    if (pseudos?.length || media) {
      const bodyExpr = getFunctionBodyExpr(e);
      if (countConditionalExpressions(bodyExpr) > 1) {
        warnings.push({
          severity: "warning",
          type: `Unsupported nested conditional interpolation`,
          loc,
          context: { localName: decl.localName },
        });
        return bailNow();
      }
      const propsParam = j.identifier("props");
      if (/\.(ts|tsx)$/.test(filePath)) {
        const typeName = `${decl.localName}Props`;
        (propsParam as any).typeAnnotation = j.tsTypeAnnotation(
          j.tsTypeReference(j.identifier(typeName)),
        );
      }
      const valueExprRaw = (() => {
        if (hasThemeAccessInArrowFn(e)) {
          warnPropInlineStyle(
            decl,
            "Unsupported prop-based inline style props.theme access is not supported",
            d.property,
            loc,
          );
          setBail();
          return null;
        }
        const inlineExpr = inlineArrowFunctionBody(j, e);
        if (!inlineExpr) {
          warnPropInlineStyle(
            decl,
            "Unsupported prop-based inline style expression cannot be safely inlined",
            d.property,
            loc,
          );
          setBail();
          return null;
        }
        const baseExpr = inlineExpr;
        const { prefix, suffix } = extractStaticParts(d.value);
        return prefix || suffix
          ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
          : baseExpr;
      })();
      if (!valueExprRaw) {
        return true;
      }
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        const wrapValue = (expr: ExpressionKind): ExpressionKind => {
          const needsString =
            out.prop === "boxShadow" ||
            out.prop === "backgroundColor" ||
            out.prop.toLowerCase().endsWith("color");
          if (!needsString) {
            return expr;
          }
          return j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: "", cooked: "" }, true),
            ],
            [expr],
          );
        };
        const valueExpr = wrapValue(valueExprRaw);
        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}FromProps`;
        if (!styleFnDecls.has(fnKey)) {
          const p = j.property(
            "init",
            makeCssPropKey(j, out.prop),
            buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
          ) as any;
          const body = j.objectExpression([p]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([propsParam], body));
        }
        if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
          styleFnFromProps.push({ fnKey, jsxProp: "__props" });
        }
      }
      return true;
    }

    if (decl.shouldForwardProp && hasUnsupportedConditionalTest(e)) {
      warnings.push({
        severity: "warning",
        type: "Unsupported conditional test in shouldForwardProp",
        loc,
        context: { localName: decl.localName },
      });
      return bailNow();
    }
    const propsUsed = collectPropsFromArrowFn(e);
    for (const propName of propsUsed) {
      ensureShouldForwardPropDrop(decl, propName);
    }
    if (hasThemeAccessInArrowFn(e)) {
      warnPropInlineStyle(
        decl,
        "Unsupported prop-based inline style props.theme access is not supported",
        d.property,
        loc,
      );
      return bailNow();
    }
    const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
    const inlineExpr = unwrapped?.expr ?? inlineArrowFunctionBody(j, e);
    if (!inlineExpr) {
      warnPropInlineStyle(
        decl,
        "Unsupported prop-based inline style expression cannot be safely inlined",
        d.property,
        loc,
      );
      return bailNow();
    }
    decl.needsWrapperComponent = true;
    const baseExpr = inlineExpr;
    // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
    const { prefix, suffix } = extractStaticParts(d.value);
    const valueExpr =
      prefix || suffix ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix) : baseExpr;
    for (const out of cssDeclarationToStylexDeclarations(d)) {
      if (!out.prop) {
        continue;
      }
      inlineStyleProps.push({ prop: out.prop, expr: valueExpr });
    }
    return true;
  }

  if (e) {
    const buildRuntimeValueExpr = (expr: ExpressionKind): ExpressionKind => {
      const valueId = j.identifier("__scValue");
      const exprClone = cloneAstNode(expr);
      const declStmt = j.variableDeclaration("const", [j.variableDeclarator(valueId, exprClone)]);
      const isFn = j.binaryExpression(
        "===",
        j.unaryExpression("typeof", valueId),
        j.literal("function"),
      );
      // Cast to any to avoid TS error when the value type is narrowed to never
      // Wrap in parentheses: (__scValue as any)(props)
      const asAny = j.tsAsExpression(valueId, j.tsAnyKeyword());
      (asAny as any).extra = { parenthesized: true };
      const callValue = j.callExpression(asAny, [j.identifier("props")]);
      const valueExpr = j.conditionalExpression(isFn, callValue, valueId);
      return j.callExpression(
        j.arrowFunctionExpression([], j.blockStatement([declStmt, j.returnStatement(valueExpr)])),
        [],
      );
    };

    if (pseudos?.length || media) {
      const baseExpr = buildRuntimeValueExpr(e as ExpressionKind);
      const { prefix, suffix } = extractStaticParts(d.value);
      const valueExprRaw =
        prefix || suffix ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix) : baseExpr;
      const propsParam = j.identifier("props");
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        const wrapValue = (expr: ExpressionKind): ExpressionKind => {
          const needsString =
            out.prop === "boxShadow" ||
            out.prop === "backgroundColor" ||
            out.prop.toLowerCase().endsWith("color");
          if (!needsString) {
            return expr;
          }
          return j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: "", cooked: "" }, true),
            ],
            [expr],
          );
        };
        const valueExpr = wrapValue(valueExprRaw);
        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}FromProps`;
        if (!styleFnDecls.has(fnKey)) {
          const p = j.property(
            "init",
            makeCssPropKey(j, out.prop),
            buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
          ) as any;
          const body = j.objectExpression([p]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([propsParam], body));
        }
        if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
          styleFnFromProps.push({ fnKey, jsxProp: "__props" });
        }
      }
      return true;
    }

    // For static expressions (not ArrowFunction/FunctionExpression),
    // use the expression directly without the IIFE wrapper.
    // The IIFE with __scValue is only needed for props-dependent expressions.
    const isStaticExpr = e.type !== "ArrowFunctionExpression" && e.type !== "FunctionExpression";
    const baseExpr = isStaticExpr
      ? cloneAstNode(e as ExpressionKind)
      : buildRuntimeValueExpr(e as ExpressionKind);
    const { prefix, suffix } = extractStaticParts(d.value);
    const valueExpr =
      prefix || suffix ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix) : baseExpr;
    decl.needsWrapperComponent = true;
    for (const out of cssDeclarationToStylexDeclarations(d)) {
      if (!out.prop) {
        continue;
      }
      inlineStyleProps.push({ prop: out.prop, expr: valueExpr });
    }
    return true;
  }

  return true;
}
