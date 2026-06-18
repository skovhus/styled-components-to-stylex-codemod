/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import type { ImportSpec } from "../../adapter.js";
import type { CallValueTransform } from "../builtin-handlers/types.js";
import type { CssDeclarationIR } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import type { StyledDecl } from "../transform-types.js";
import {
  extractRootAndPath,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
} from "../utilities/jscodeshift-utils.js";
import { camelToKebabCase } from "../utilities/string-utils.js";
import { isStylexImportSource } from "../utilities/stylex-import-source.js";
import type { DeclProcessingState } from "./decl-setup.js";
import type { ExpressionKind } from "./decl-types.js";
import { makeCssPropKey } from "./shared.js";
import {
  ensureShouldForwardPropDrop,
  literalToStaticValue,
  markDeclNeedsUseThemeHook,
} from "./types.js";
import { isMemberExpression } from "./utils.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import type { JSCodeshift } from "jscodeshift";

type ArrowFunctionParams = Parameters<JSCodeshift["arrowFunctionExpression"]>[0];

/**
 * Returns true if any part of a member/identifier chain references `theme`
 * (e.g. `props.theme.color[x]` or a destructured `theme.color[x]`). Used to
 * distinguish indexed theme lookups from prop-rooted member accesses.
 */
export function memberExpressionTouchesTheme(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as { type?: string; name?: string; object?: unknown; property?: unknown };
  if (n.type === "Identifier") {
    return n.name === "theme";
  }
  if (isMemberExpression(n)) {
    return memberExpressionTouchesTheme(n.property) || memberExpressionTouchesTheme(n.object);
  }
  return false;
}

export function isPseudoElementSelector(pseudoElement: string | null): boolean {
  return (
    pseudoElement === "::before" || pseudoElement === "::after" || pseudoElement === "::placeholder"
  );
}

/**
 * Whether a base style value for a property would be folded into a pseudo-gated
 * dynamic style function's `default` (mirrors the fold logic in getPropValue):
 * plain primitives and AST-node values fold; existing pseudo/media condition
 * buckets (plain objects without a `type` discriminator) do not.
 */
export function staticBaseValueWouldFold(existingStatic: unknown): boolean {
  if (existingStatic === undefined || existingStatic === null) {
    return false;
  }
  if (typeof existingStatic === "object") {
    return "type" in (existingStatic as Record<string, unknown>);
  }
  return true;
}

export function extractGuardedDynamicBranch(
  j: JSCodeshift,
  expr: unknown,
): { test: ExpressionKind; value: ExpressionKind } | null {
  if (
    !expr ||
    typeof expr !== "object" ||
    (expr as { type?: string }).type !== "ConditionalExpression"
  ) {
    return null;
  }
  const conditional = expr as {
    test?: ExpressionKind;
    consequent?: ExpressionKind;
    alternate?: ExpressionKind;
  };
  if (!conditional.test || !conditional.consequent || !conditional.alternate) {
    return null;
  }
  const consequentEmpty = isEmptyRuntimeStyleBranch(conditional.consequent);
  const alternateEmpty = isEmptyRuntimeStyleBranch(conditional.alternate);
  if (consequentEmpty === alternateEmpty) {
    return null;
  }
  return {
    test: consequentEmpty ? j.unaryExpression("!", conditional.test, true) : conditional.test,
    value: consequentEmpty ? conditional.alternate : conditional.consequent,
  };
}

function isEmptyRuntimeStyleBranch(expr: unknown): boolean {
  const value = literalToStaticValue(expr);
  return value === "" || value === null || value === false || value === undefined;
}

export function isHelperCallGuard(conditionWhen: string): boolean {
  return conditionWhen.includes("(");
}

export function shouldUseScalarDynamicArgs(
  stylexProp: string,
  rawCssValue: string | undefined,
): boolean {
  if (rawCssValue?.includes("var(")) {
    return false;
  }
  if (stylexProp === "transition" || stylexProp.startsWith("--")) {
    return false;
  }
  return true;
}

export function addUndefinedToParamType(j: JSCodeshift, param: unknown): void {
  const typedParam = param as { typeAnnotation?: { typeAnnotation?: unknown } };
  const current = typedParam.typeAnnotation?.typeAnnotation;
  if (!current || typeof current !== "object") {
    return;
  }
  if (
    (current as { type?: string }).type === "TSUnionType" &&
    ((current as { types?: Array<{ type?: string }> }).types ?? []).some(
      (typeNode) => typeNode.type === "TSUndefinedKeyword",
    )
  ) {
    return;
  }
  typedParam.typeAnnotation = j.tsTypeAnnotation(
    j.tsUnionType([current as ReturnType<typeof j.tsStringKeyword>, j.tsUndefinedKeyword()]),
  );
}

type StyleObjectProperty = ReturnType<JSCodeshift["property"]>;

export function buildDynamicStyleFunctionProperties(args: {
  j: JSCodeshift;
  fnKey: string;
  prop: string;
  valueExpr: ExpressionKind;
  important: boolean;
  pseudos?: string[] | null;
  media?: string | null;
}): StyleObjectProperty[] {
  const { j, fnKey, prop, valueExpr, important, pseudos, media } = args;
  if (!important) {
    return [
      j.property(
        "init",
        makeCssPropKey(j, prop),
        buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
      ),
    ];
  }

  const cssVariableName = `--${camelToKebabCase(fnKey)}`;
  const importantValueExpr = j.literal(`var(${cssVariableName}) !important`);
  return [
    j.property("init", makeCssPropKey(j, cssVariableName), valueExpr),
    j.property(
      "init",
      makeCssPropKey(j, prop),
      buildPseudoMediaPropValue({ j, valueExpr: importantValueExpr, pseudos, media }),
    ),
  ];
}

export function buildResolvedValueTransformCallArg(args: {
  j: JSCodeshift;
  jsxProp: string;
  valueTransform: CallValueTransform | undefined;
  parseExpr: (expr: string) => unknown;
  addResolverImports: (imports: Iterable<unknown> | undefined | null) => void;
}): ExpressionKind | null {
  const { j, jsxProp, valueTransform, parseExpr, addResolverImports } = args;
  if (!valueTransform?.resolvedExpr) {
    return null;
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(jsxProp)) {
    return null;
  }
  const resolvedCallee = parseExpr(valueTransform.resolvedExpr) as ExpressionKind | null;
  if (!resolvedCallee) {
    return null;
  }
  const resolvedRoot = extractRootAndPath(resolvedCallee)?.rootName;
  if (resolvedRoot === jsxProp) {
    return null;
  }
  addResolverImports(valueTransform.resolvedImports);
  const propArg = j.identifier(jsxProp);
  return valueTransform.resolvedUsage === "memberAccess"
    ? (j.memberExpression(resolvedCallee, propArg, true) as ExpressionKind)
    : (j.callExpression(resolvedCallee, [propArg]) as ExpressionKind);
}

/**
 * Handles declarations with multiple interpolation slots where all slots are
 * ternary expressions branching on the same prop.
 *
 * Pattern: `transform: translateY(-50%) translateX(${p => p.$expanded ? "0" : "-8px"}) scale(${p => p.$expanded ? 1 : 0.9})`
 *
 * Produces two static variant styles by evaluating each branch direction:
 *   popover: { transform: "translateY(-50%) translateX(-8px) scale(0.9)" }
 *   popoverExpanded: { transform: "translateY(-50%) translateX(0) scale(1)" }
 */
export function tryHandleMultiSlotTernary(ctx: DeclProcessingState, d: CssDeclarationIR): boolean {
  const { decl, styleObj } = ctx;
  const parts = d.value.kind === "interpolated" ? d.value.parts : [];
  const slotParts = parts.filter(
    (p: { kind: string }): p is { kind: "slot"; slotId: number } => p.kind === "slot",
  );

  if (slotParts.length < 2) {
    return false;
  }

  // Extract and validate all slot expressions: each must be an arrow/function
  // with a ConditionalExpression body testing the same prop.
  let commonPropName: string | null = null;
  const branchValues: Array<{ consequent: string; alternate: string }> = [];

  for (const slot of slotParts) {
    const expr = decl.templateExpressions[slot.slotId] as
      | {
          type?: string;
          body?: unknown;
        }
      | undefined;
    if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
      return false;
    }
    const paramName = getArrowFnSingleParamName(
      expr as Parameters<typeof getArrowFnSingleParamName>[0],
    );
    if (!paramName) {
      return false;
    }
    const body = getFunctionBodyExpr(expr) as {
      type?: string;
      test?: unknown;
      consequent?: unknown;
      alternate?: unknown;
    } | null;
    if (!body || body.type !== "ConditionalExpression") {
      return false;
    }

    // Extract the tested prop name (e.g., "$expanded" from "props.$expanded")
    const testPath =
      body.test && typeof body.test === "object"
        ? getMemberPathFromIdentifier(
            body.test as Parameters<typeof getMemberPathFromIdentifier>[0],
            paramName,
          )
        : null;
    if (!testPath || testPath.length !== 1 || !testPath[0]) {
      return false;
    }
    const propName = testPath[0];

    if (commonPropName === null) {
      commonPropName = propName;
    } else if (commonPropName !== propName) {
      return false; // Different conditions — can't merge
    }

    // Both branches must be static literals
    const consVal = literalToStaticValue(body.consequent);
    const altVal = literalToStaticValue(body.alternate);
    if (consVal === null || altVal === null) {
      return false;
    }
    branchValues.push({
      consequent: String(consVal),
      alternate: String(altVal),
    });
  }

  if (!commonPropName) {
    return false;
  }

  // Build the full value string for each branch direction by combining
  // static parts with the evaluated branch values.
  const buildFullValue = (direction: "consequent" | "alternate"): string => {
    let result = "";
    let slotIndex = 0;
    for (const part of parts) {
      if (part.kind === "static") {
        result += (part as { value: string }).value;
      } else if (part.kind === "slot") {
        const branch = branchValues[slotIndex];
        result += branch ? branch[direction] : "";
        slotIndex++;
      }
    }
    return result;
  };

  const importantSuffix = d.important ? " !important" : "";
  const consFullValue = buildFullValue("consequent") + importantSuffix;
  const altFullValue = buildFullValue("alternate") + importantSuffix;

  // Apply CSS property mapping (e.g., transform stays as transform)
  for (const out of cssDeclarationToStylexDeclarations(d)) {
    // Default (false/alternate branch) goes to base styles
    styleObj[out.prop] = altFullValue;
    // True (consequent) branch goes to a variant
    ctx.applyVariant(
      { when: commonPropName, propName: commonPropName },
      { [out.prop]: consFullValue },
    );
  }

  // Drop the transient prop from forwarding
  if (commonPropName.startsWith("$")) {
    ensureShouldForwardPropDrop(decl, commonPropName);
  }
  decl.needsWrapperComponent = true;

  return true;
}

export function hasRuntimeImport(imports: readonly ImportSpec[] | undefined): boolean {
  return (imports ?? []).some((imp) => !isStylexImportSource(imp.from.value));
}

/**
 * If any variant `when` condition references the styled-components theme object,
 * mark the declaration as needing the `useTheme()` hook so the emitted wrapper
 * has `const theme = useTheme()` in scope.
 */
export function markThemeHookForVariants(
  decl: StyledDecl,
  variants: ReadonlyArray<{ when: string }> | undefined,
): void {
  if (!variants) {
    return;
  }
  const needsTheme = variants.some(
    (v) =>
      v.when === "theme" ||
      v.when.startsWith("theme.") ||
      v.when === "!theme" ||
      v.when.startsWith("!theme."),
  );
  if (needsTheme) {
    markDeclNeedsUseThemeHook(decl);
  }
}

/**
 * Returns a merged parameter list combining the params from an existing arrow
 * function (if any) with new params, deduplicated by identifier name.
 * Type annotations are preserved from whichever source provided them first.
 * Used by the variant-merge path so that adding more dynamic CSS properties
 * to an already-declared style function preserves all required params.
 */
export function unionStyleFnParams(
  existingFn: unknown,
  newParams: ArrowFunctionParams,
): ArrowFunctionParams {
  type ParamNode = { type?: string; name?: string };
  const existingParams = ((existingFn as { params?: readonly ParamNode[] } | undefined)?.params ??
    []) as ParamNode[];
  const merged: ParamNode[] = [];
  const seen = new Set<string>();
  const pushIfNew = (param: ParamNode): void => {
    const name = param.name;
    if (typeof name !== "string" || seen.has(name)) {
      return;
    }
    seen.add(name);
    merged.push(param);
  };
  for (const p of existingParams) {
    pushIfNew(p);
  }
  for (const p of newParams as ParamNode[]) {
    pushIfNew(p);
  }
  if (merged.length === 0) {
    return newParams;
  }
  return merged as ArrowFunctionParams;
}
