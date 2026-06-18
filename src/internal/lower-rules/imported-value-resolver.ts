/**
 * Imported-value resolver extracted from handleInterpolatedDeclaration in
 * rule-interpolated-declaration.ts.
 *
 * Produces `resolveImportedValueExpr`, the recursive resolver that turns
 * interpolated expressions referencing imported helpers/constants into static
 * StyleX values (folding calc arithmetic, ternaries and binary expressions).
 * Built by a factory so it keeps sharing the mutable `flags.bail` holder and the
 * captured declaration state exactly as it did when inlined.
 */
import type { ImportSpec, ResolveValueContext } from "../../adapter.js";
import type { ExpressionKind } from "./decl-types.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import { isStylexImportSource } from "../utilities/stylex-import-source.js";
import { extractRootAndPath, getNodeLocStart } from "../utilities/jscodeshift-utils.js";
import { literalToStaticValue } from "./types.js";
import { isCssCalcOperator } from "../builtin-handlers/conditional-css-calc.js";
import {
  buildCssCalcTemplateExpression,
  buildNegatedCssTokenTemplate,
  hasAdjacentTemplateUnit,
} from "./interpolated-calc.js";
import {
  getSingleSlotStaticParts,
  isEntireInterpolatedValueSingleSlot,
} from "./numeric-css-props.js";
import { hasRuntimeImport } from "./interpolated-decl-helpers.js";
import type {
  InterpolatedDeclarationContext,
  ResolveImportedValueExpr,
  ImportedValueResolution,
} from "./interpolated-declaration-context.js";

type ImportedValueResolverContext = Pick<InterpolatedDeclarationContext, "ctx" | "rule" | "d"> & {
  flags: { bail: boolean };
};

export function createImportedValueResolver(c: ImportedValueResolverContext) {
  const { ctx, rule, d, flags } = c;
  const { state, decl, componentInfo, handlerContext } = ctx;
  const {
    j,
    filePath,
    warnings,
    parseExpr,
    resolveValue,
    staticIdentifierValues,
    resolveImportInScope,
  } = state;
  const getRootIdentifierInfo = extractRootAndPath;

  const resolveCallExpr = (expr: any): { resolved: any; imports?: any[] } | null => {
    if (expr?.type !== "CallExpression") {
      return null;
    }
    const res = resolveDynamicNode(
      {
        slotId: 0,
        expr,
        css: {
          kind: "declaration",
          selector: rule.selector,
          atRuleStack: rule.atRuleStack,
          ...(d.property ? { property: d.property } : {}),
          valueRaw: d.valueRaw,
        },
        component: componentInfo,
        usage: { jsxUsages: 0, hasPropsSpread: false },
      },
      {
        ...handlerContext,
        resolveImport: (localName: string, identNode?: unknown) =>
          resolveImportInScope(localName, identNode),
      },
    );
    if (res && res.type === "resolvedValue") {
      const exprAst = parseExpr(res.expr);
      if (exprAst) {
        return { resolved: exprAst, imports: res.imports };
      }
    }
    return null;
  };
  const allowCssCalcForImportedArithmetic = isEntireInterpolatedValueSingleSlot(d, decl);
  const resolveImportedValueExpr: ResolveImportedValueExpr = (
    expr,
    options = allowCssCalcForImportedArithmetic,
  ) => {
    const allowCssCalc = typeof options === "boolean" ? options : (options.allowCssCalc ?? false);
    const cssCalcUnit = typeof options === "boolean" ? undefined : options.cssCalcUnit;
    const forceNegate = typeof options === "boolean" ? false : options.negate === true;
    const resolveChildExpression = (child: any): ImportedValueResolution =>
      resolveImportedValueExpr(child, false);
    const isBailResolution = (result: ImportedValueResolution): result is { bail: true } =>
      Boolean(result && "bail" in result);
    const resolvedOrOriginal = (
      result: ImportedValueResolution,
      original: ExpressionKind,
    ): ExpressionKind => (result && !isBailResolution(result) ? result.resolved : original);
    const skipStaticWrap = (...results: ImportedValueResolution[]): boolean =>
      results.some((result) => result && !isBailResolution(result) && result.skipStaticWrap);
    const mergeImports = (...results: ImportedValueResolution[]): ImportSpec[] =>
      results.flatMap((result) =>
        result && !isBailResolution(result) ? (result.imports ?? []) : [],
      );
    const bailResolvedUnitExpression = (exprArg: any): { bail: true } => {
      warnings.push({
        severity: "warning",
        type: "Unsupported interpolation: call expression",
        loc: getNodeLocStart(exprArg) ?? decl.loc,
      });
      flags.bail = true;
      return { bail: true };
    };
    const singleSlotStaticParts = getSingleSlotStaticParts(d, decl);
    const canFoldUnitSuffix =
      !!singleSlotStaticParts &&
      singleSlotStaticParts.prefix === "" &&
      singleSlotStaticParts.suffix !== "" &&
      /^-?(?:[a-zA-Z%]+)$/.test(singleSlotStaticParts.suffix);
    const resolveUnitBranch = (
      result: ImportedValueResolution,
      original: ExpressionKind,
    ): ExpressionKind | null => {
      if (result && !isBailResolution(result)) {
        return result.resolved;
      }
      const staticValue = literalToStaticValue(original);
      if (typeof staticValue === "number" && singleSlotStaticParts) {
        return j.literal(`${staticValue}${singleSlotStaticParts.suffix}`) as ExpressionKind;
      }
      return null;
    };

    if (expr?.type === "BinaryExpression") {
      const leftResult = resolveChildExpression(expr.left);
      const rightResult = resolveChildExpression(expr.right);
      if (!leftResult && !rightResult) {
        return null;
      }
      if (isBailResolution(leftResult)) {
        return leftResult;
      }
      if (isBailResolution(rightResult)) {
        return rightResult;
      }
      const resolvedLeft = resolvedOrOriginal(leftResult, expr.left);
      const resolvedRight = resolvedOrOriginal(rightResult, expr.right);
      const imports = mergeImports(leftResult, rightResult);
      if (allowCssCalc && isCssCalcOperator(expr.operator)) {
        const staticParts = singleSlotStaticParts ?? { prefix: "", suffix: "" };
        const calcUnit = cssCalcUnit ?? staticParts.suffix;
        const hasNegativePrefix =
          !cssCalcUnit &&
          staticParts.prefix === "-" &&
          /^-?(?:[a-zA-Z%]+)$/.test(staticParts.suffix) &&
          (expr.operator === "+" || expr.operator === "-");
        if (staticParts.prefix && !hasNegativePrefix && !cssCalcUnit) {
          warnings.push({
            severity: "warning",
            type: "Unsupported interpolation: call expression",
            loc: getNodeLocStart(expr) ?? decl.loc,
          });
          flags.bail = true;
          return { bail: true };
        }
        const calcExpr = buildCssCalcTemplateExpression({
          j,
          operator: expr.operator,
          unit: expr.operator === "+" || expr.operator === "-" ? calcUnit : "",
          negate: forceNegate || hasNegativePrefix,
          staticIdentifierValues,
          left: { node: resolvedLeft, allowExpression: Boolean(leftResult) },
          right: { node: resolvedRight, allowExpression: Boolean(rightResult) },
        });
        if (calcExpr) {
          return {
            resolved: calcExpr,
            imports,
            skipStaticWrap: calcUnit !== "",
          };
        }
        if (calcUnit && imports.length > 0) {
          return bailResolvedUnitExpression(expr);
        }
      }
      return {
        resolved: j.binaryExpression(expr.operator, resolvedLeft, resolvedRight),
        imports,
      };
    }
    if (expr?.type === "UnaryExpression") {
      const argumentResult = resolveChildExpression(expr.argument);
      if (!argumentResult) {
        return null;
      }
      if (isBailResolution(argumentResult)) {
        return argumentResult;
      }
      if (canFoldUnitSuffix) {
        if (expr.operator !== "-") {
          return bailResolvedUnitExpression(expr);
        }
        return {
          resolved: j.templateLiteral(
            [
              j.templateElement({ raw: "calc(-1 * ", cooked: "calc(-1 * " }, false),
              j.templateElement({ raw: ")", cooked: ")" }, true),
            ],
            [argumentResult.resolved],
          ) as ExpressionKind,
          imports: argumentResult.imports,
          skipStaticWrap: true,
        };
      }
      return {
        resolved: j.unaryExpression(expr.operator, argumentResult.resolved, expr.prefix),
        imports: argumentResult.imports,
        skipStaticWrap: argumentResult.skipStaticWrap,
      };
    }
    if (expr?.type === "ConditionalExpression") {
      const testResult = resolveChildExpression(expr.test);
      const consequentResult = resolveImportedValueExpr(expr.consequent, canFoldUnitSuffix);
      const alternateResult = resolveImportedValueExpr(expr.alternate, canFoldUnitSuffix);
      if (!testResult && !consequentResult && !alternateResult) {
        return null;
      }
      if (isBailResolution(testResult)) {
        return testResult;
      }
      if (isBailResolution(consequentResult)) {
        return consequentResult;
      }
      if (isBailResolution(alternateResult)) {
        return alternateResult;
      }
      if (testResult) {
        return bailResolvedUnitExpression(expr.test);
      }
      if (canFoldUnitSuffix) {
        const consequent = resolveUnitBranch(consequentResult, expr.consequent);
        const alternate = resolveUnitBranch(alternateResult, expr.alternate);
        if (!consequent || !alternate) {
          return bailResolvedUnitExpression(expr);
        }
        return {
          resolved: j.conditionalExpression(
            resolvedOrOriginal(testResult, expr.test),
            consequent,
            alternate,
          ),
          imports: mergeImports(testResult, consequentResult, alternateResult),
          skipStaticWrap: true,
        };
      }
      return {
        resolved: j.conditionalExpression(
          resolvedOrOriginal(testResult, expr.test),
          resolvedOrOriginal(consequentResult, expr.consequent),
          resolvedOrOriginal(alternateResult, expr.alternate),
        ),
        imports: mergeImports(testResult, consequentResult, alternateResult),
        skipStaticWrap:
          canFoldUnitSuffix || skipStaticWrap(testResult, consequentResult, alternateResult),
      };
    }
    if (expr?.type === "LogicalExpression") {
      const leftResult = resolveChildExpression(expr.left);
      const rightResult = resolveImportedValueExpr(expr.right, canFoldUnitSuffix);
      if (!leftResult && !rightResult) {
        return null;
      }
      if (isBailResolution(leftResult)) {
        return leftResult;
      }
      if (isBailResolution(rightResult)) {
        return rightResult;
      }
      if (canFoldUnitSuffix) {
        const left = resolveUnitBranch(leftResult, expr.left);
        const right = resolveUnitBranch(rightResult, expr.right);
        if (!left || !right) {
          return bailResolvedUnitExpression(expr);
        }
        return {
          resolved: j.logicalExpression(expr.operator, left, right),
          imports: mergeImports(leftResult, rightResult),
          skipStaticWrap: true,
        };
      }
      return {
        resolved: j.logicalExpression(
          expr.operator,
          resolvedOrOriginal(leftResult, expr.left),
          resolvedOrOriginal(rightResult, expr.right),
        ),
        imports: mergeImports(leftResult, rightResult),
        skipStaticWrap: canFoldUnitSuffix || skipStaticWrap(leftResult, rightResult),
      };
    }
    if (expr?.type === "TemplateLiteral") {
      let didResolve = false;
      const imports: any[] = [];
      const expressions: any[] = [];
      const expressionResults: ImportedValueResolution[] = [];
      const templateExpressions = expr.expressions ?? [];
      for (let index = 0; index < templateExpressions.length; index++) {
        const templateExpr = templateExpressions[index];
        const expressionResult = resolveChildExpression(templateExpr);
        expressionResults.push(expressionResult);
        if (isBailResolution(expressionResult)) {
          return expressionResult;
        }
        if (expressionResult) {
          if (hasAdjacentTemplateUnit(expr.quasis ?? [], index)) {
            return bailResolvedUnitExpression(templateExpr);
          }
          didResolve = true;
          imports.push(...(expressionResult.imports ?? []));
          expressions.push(expressionResult.resolved);
        } else {
          expressions.push(templateExpr);
        }
      }
      if (!didResolve) {
        return null;
      }
      return {
        resolved: j.templateLiteral(expr.quasis, expressions),
        imports,
        skipStaticWrap: skipStaticWrap(...expressionResults),
      };
    }
    if (expr?.type === "CallExpression") {
      const calleeInfo = extractRootAndPath(expr.callee);
      const imp = calleeInfo
        ? resolveImportInScope(calleeInfo.rootName, calleeInfo.rootNode)
        : null;
      if (!imp) {
        return null;
      }
      const resolvedCall = resolveCallExpr(expr);
      if (resolvedCall) {
        if (!cssCalcUnit) {
          return resolvedCall;
        }
        // A bare unitless literal (e.g. a helper resolving to `8`/`"8"`) does
        // not carry the authored unit. Fold the unit into the literal so it is
        // preserved (e.g. `${space()}px` -> "8px") rather than emitting a
        // unitless value or `calc(-1 * 8)`. Any leading negation is applied by
        // the static-prefix handling downstream, so emit the positive value.
        const literalValue = literalToStaticValue(resolvedCall.resolved);
        const numericLiteral =
          typeof literalValue === "number"
            ? literalValue
            : typeof literalValue === "string" &&
                literalValue.trim() !== "" &&
                Number.isFinite(Number(literalValue))
              ? Number(literalValue)
              : null;
        if (numericLiteral !== null) {
          return {
            resolved: j.literal(`${numericLiteral}${cssCalcUnit}`) as ExpressionKind,
            imports: resolvedCall.imports,
            skipStaticWrap: true,
          };
        }
        if (forceNegate) {
          return {
            resolved: buildNegatedCssTokenTemplate(j, resolvedCall.resolved),
            imports: resolvedCall.imports,
            skipStaticWrap: true,
          };
        }
        return { ...resolvedCall, skipStaticWrap: true };
      }
      warnings.push({
        severity: "warning",
        type: "Adapter resolveCall returned undefined for helper call",
        loc: getNodeLocStart(expr) ?? decl.loc,
        context: {
          localName: decl.localName,
          importedName: imp.importedName,
          source: imp.source.value,
        },
      });
      flags.bail = true;
      return { bail: true };
    }
    const info = getRootIdentifierInfo(expr);
    if (!info) {
      return null;
    }
    const imp = resolveImportInScope(info.rootName, info.rootNode);
    if (!imp) {
      return null;
    }
    const resolveValueContext: ResolveValueContext = {
      kind: "importedValue",
      importedName: imp.importedName,
      source: imp.source,
      ...(info.path.length ? { path: info.path.join(".") } : {}),
      filePath,
      loc: getNodeLocStart(expr) ?? undefined,
    };
    const resolveValueResult = resolveValue(resolveValueContext);
    if (!resolveValueResult) {
      // Adapter returned undefined for an identified imported value - bail.
      // A bare identifier from a relative, non-`.stylex` module is a plain
      // owned constant: the StyleX compiler can't resolve it inside
      // `stylex.create()`, and inlining it would silently destroy the shared
      // source of truth. Bail with actionable guidance to relocate it into a
      // `.stylex` defineConsts/defineVars group (member access / package
      // imports keep the generic message — defineConsts may not apply).
      const isPlainOwnedConstant =
        info.path.length === 0 &&
        imp.source.kind === "absolutePath" &&
        !isStylexImportSource(imp.source.value);
      warnings.push({
        severity: "error",
        type: isPlainOwnedConstant
          ? "Imported constant cannot be referenced inside stylex.create() — move it into a `.stylex` defineConsts/defineVars group (or map it via adapter.resolveValue)"
          : "Adapter resolveValue returned undefined for imported value",
        loc: getNodeLocStart(expr) ?? decl.loc,
        context: {
          localName: decl.localName,
          importedName: imp.importedName,
          source: imp.source.value,
          path: info.path.length ? info.path.join(".") : undefined,
        },
      });
      flags.bail = true;
      return { bail: true };
    }
    if (!isStylexImportSource(imp.source.value) && hasRuntimeImport(resolveValueResult.imports)) {
      warnings.push({
        severity: "warning",
        type: "Unsupported interpolation: call expression",
        loc: getNodeLocStart(expr) ?? decl.loc,
        context: {
          localName: decl.localName,
          importedName: imp.importedName,
          source: imp.source.value,
          path: info.path.length ? info.path.join(".") : undefined,
        },
      });
      flags.bail = true;
      return { bail: true };
    }
    const exprAst = parseExpr(resolveValueResult.expr);
    if (!exprAst) {
      warnings.push({
        severity: "error",
        type: "Adapter resolveValue returned an unparseable value expression",
        loc: getNodeLocStart(expr),
        context: {
          localName: decl.localName,
          resolveValueResult,
          resolveValueContext,
        },
      });
      return null;
    }
    return { resolved: exprAst, imports: resolveValueResult.imports };
  };

  return { resolveCallExpr, resolveImportedValueExpr };
}
