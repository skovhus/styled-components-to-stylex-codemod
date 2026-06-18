/**
 * Handler for ternary-based CSS block conditionals, including nested ternary
 * chains (`variant === "micro" ? … : variant === "small" ? … : …`) and
 * template-literal ternaries. Extracts split variants for each branch.
 */
import {
  getArrowFnParamBindings,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getSinglePropFromMemberExpr,
  isArrowFunctionExpression,
  isConditionalExpressionNode,
  literalToString,
  resolveIdentifierToPropName,
  resolveStaticExpressionValue,
} from "../utilities/jscodeshift-utils.js";
import { parseCssDeclarationBlock } from "./css-parsing.js";
import type {
  ConditionalExpressionBody,
  DynamicNode,
  HandlerResult,
  InternalHandlerContext,
} from "./types.js";
import { parseCssTemplateLiteralWithTernary } from "./conditional-ast-helpers.js";
import { tryResolveTemplateLiteralTernaryWithEmptyBranch } from "./conditional-theme-template.js";

export function tryResolveConditionalCssBlockTernary(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  const bindings = !paramName ? getArrowFnParamBindings(expr) : null;
  if (!paramName && bindings?.kind !== "destructured") {
    return null;
  }
  // Support both expression bodies and block bodies with a single return statement
  const body = getFunctionBodyExpr(expr);
  if (!isConditionalExpressionNode(body)) {
    return null;
  }

  // Helper to parse a condition test and extract propName + when condition
  type ConditionInfo =
    | { kind: "boolean"; propName: string; isNegated: boolean }
    | {
        kind: "comparison";
        propName: string;
        operator: "===" | "!==";
        rhsValue: string;
        rhsRaw: unknown;
      };

  const parseConditionTest = (test: unknown): ConditionInfo | null => {
    if (!test || typeof test !== "object") {
      return null;
    }
    const t = test as {
      type?: string;
      operator?: string;
      argument?: unknown;
      left?: unknown;
      right?: unknown;
    };

    if (paramName) {
      const firstProp = getSinglePropFromMemberExpr(t, paramName);
      if (firstProp) {
        return { kind: "boolean", propName: firstProp, isNegated: false };
      }
    }

    // Bare Identifier with destructured bindings: ({ center }) => center ? ...
    if (bindings?.kind === "destructured" && t.type === "Identifier") {
      const propName = resolveIdentifierToPropName(t, bindings);
      if (propName) {
        return { kind: "boolean", propName, isNegated: false };
      }
    }

    // Negated prop access: !props.$open or !destructuredProp
    if (t.type === "UnaryExpression" && t.operator === "!") {
      const arg = t.argument as { type?: string } | undefined;
      if (paramName) {
        const firstProp = getSinglePropFromMemberExpr(arg, paramName);
        if (firstProp) {
          return { kind: "boolean", propName: firstProp, isNegated: true };
        }
      }
      if (bindings?.kind === "destructured" && arg?.type === "Identifier") {
        const propName = resolveIdentifierToPropName(arg, bindings);
        if (propName) {
          return { kind: "boolean", propName, isNegated: true };
        }
      }
      return null;
    }

    // Comparison: props.variant === "micro" or destructuredVar === "micro"
    // Also resolves enum member expressions (e.g., MyEnum.value → "value").
    if (t.type === "BinaryExpression" && (t.operator === "===" || t.operator === "!==")) {
      const rhsRaw = resolveStaticExpressionValue(t.right, ctx.enumValueMap);
      if (rhsRaw === null) {
        return null;
      }
      const left = t.left as { type?: string } | undefined;
      // MemberExpression: props.variant === "micro"
      if (paramName && left?.type === "MemberExpression") {
        const testPath = getMemberPathFromIdentifier(left as any, paramName);
        const firstProp = testPath?.[0];
        if (testPath && testPath.length === 1 && firstProp) {
          return {
            kind: "comparison",
            propName: firstProp,
            operator: t.operator as "===" | "!==",
            rhsValue: JSON.stringify(rhsRaw),
            rhsRaw,
          };
        }
      }
      // Identifier with destructured bindings: center === true
      if (bindings?.kind === "destructured" && left?.type === "Identifier") {
        const propName = resolveIdentifierToPropName(left, bindings);
        if (propName) {
          return {
            kind: "comparison",
            propName,
            operator: t.operator as "===" | "!==",
            rhsValue: JSON.stringify(rhsRaw),
            rhsRaw,
          };
        }
      }
      return null;
    }

    return null;
  };

  // Helper to build `when` string from condition info
  const buildWhenCondition = (cond: ConditionInfo, isTruthyBranch: boolean): string => {
    if (cond.kind === "boolean") {
      // For boolean tests:
      // - truthy branch: propName (or !propName if negated test)
      // - falsy branch: !propName (or propName if negated test)
      if (isTruthyBranch) {
        return cond.isNegated ? `!${cond.propName}` : cond.propName;
      } else {
        return cond.isNegated ? cond.propName : `!${cond.propName}`;
      }
    }
    // For comparison tests:
    // - truthy branch: propName === value (or propName !== value)
    // - falsy branch: the negation
    if (isTruthyBranch) {
      return `${cond.propName} ${cond.operator} ${cond.rhsValue}`;
    } else {
      const inverseOp = cond.operator === "===" ? "!==" : "===";
      return `${cond.propName} ${inverseOp} ${cond.rhsValue}`;
    }
  };

  // Helper to build nameHint from condition info
  const buildNameHint = (cond: ConditionInfo, isTruthyBranch: boolean): string => {
    if (cond.kind === "boolean") {
      return isTruthyBranch ? "truthy" : "falsy";
    }
    // For comparison tests, use the RHS value as hint (e.g., "micro", "small")
    if (isTruthyBranch) {
      return typeof cond.rhsRaw === "string" ? cond.rhsRaw : String(cond.rhsRaw);
    }
    return "default";
  };

  type VariantWithStyle = { nameHint: string; when: string; style: Record<string, unknown> };

  // Recursively extract variants from nested ternaries
  // e.g., variant === "micro" ? "..." : variant === "small" ? "..." : "..."
  const extractVariantsFromTernary = (
    condExpr: unknown,
    expectedPropName?: string,
  ): { variants: VariantWithStyle[]; defaultStyle: Record<string, unknown> | null } | null => {
    if (!condExpr || typeof condExpr !== "object") {
      return null;
    }
    const ce = condExpr as ConditionalExpressionBody;

    // Base case: not a conditional, this is the default value (a CSS string)
    if (ce.type !== "ConditionalExpression") {
      const cssText = literalToString(condExpr);
      if (cssText !== null) {
        const style = cssText.trim() ? parseCssDeclarationBlock(cssText) : null;
        return { variants: [], defaultStyle: style };
      }

      // Try template literal with prop-based ternary: `background: ${props.$x ? "a" : "b"}`
      const parsed = parseCssTemplateLiteralWithTernary(condExpr);
      if (parsed) {
        // Use parseConditionTest to validate and extract prop info from inner ternary
        const innerCondInfo = parseConditionTest(parsed.innerTest);
        if (!innerCondInfo) {
          return null;
        }

        // Build CSS text for each branch and parse into styles
        const truthyCss = `${parsed.prefix}${parsed.truthyValue}${parsed.suffix}`;
        const falsyCss = `${parsed.prefix}${parsed.falsyValue}${parsed.suffix}`;
        const truthyStyle = truthyCss.trim() ? parseCssDeclarationBlock(truthyCss) : null;
        const falsyStyle = falsyCss.trim() ? parseCssDeclarationBlock(falsyCss) : null;

        // Use existing helpers for consistency
        const innerVariants: VariantWithStyle[] = [];
        if (truthyStyle) {
          innerVariants.push({
            nameHint: buildNameHint(innerCondInfo, true),
            when: buildWhenCondition(innerCondInfo, true),
            style: truthyStyle,
          });
        }
        if (falsyStyle) {
          innerVariants.push({
            nameHint: buildNameHint(innerCondInfo, false),
            when: buildWhenCondition(innerCondInfo, false),
            style: falsyStyle,
          });
        }
        // All cases are covered by the inner ternary, so no defaultStyle
        return { variants: innerVariants, defaultStyle: null };
      }

      return null;
    }

    const condInfo = parseConditionTest(ce.test);
    if (!condInfo) {
      return null;
    }

    // Ensure all conditions in the chain test the same property
    if (expectedPropName && condInfo.propName !== expectedPropName) {
      return null;
    }

    const consText = literalToString(ce.consequent);
    let consStyle: Record<string, unknown> | null = null;
    let innerConsVariants: VariantWithStyle[] = [];

    if (consText !== null) {
      consStyle = consText.trim() ? parseCssDeclarationBlock(consText) : null;
    } else {
      // Handle TemplateLiteral consequent with inner ternary (multi-property CSS string).
      // e.g., `display: flex; align-items: ${align === "center" ? "center" : "flex-end"};`
      const parsed = parseCssTemplateLiteralWithTernary(ce.consequent);
      if (!parsed) {
        return null;
      }
      const innerCondInfo = parseConditionTest(parsed.innerTest);
      if (!innerCondInfo) {
        return null;
      }
      const truthyCss = `${parsed.prefix}${parsed.truthyValue}${parsed.suffix}`;
      const falsyCss = `${parsed.prefix}${parsed.falsyValue}${parsed.suffix}`;
      const truthyStyle = truthyCss.trim() ? parseCssDeclarationBlock(truthyCss) : null;
      const falsyStyle = falsyCss.trim() ? parseCssDeclarationBlock(falsyCss) : null;

      // Split into shared properties (same in both branches) and
      // differing properties (conditional on inner ternary)
      const sharedStyle: Record<string, unknown> = {};
      if (truthyStyle && falsyStyle) {
        for (const [prop, val] of Object.entries(truthyStyle)) {
          if (prop in falsyStyle && falsyStyle[prop] === val) {
            sharedStyle[prop] = val;
          }
        }
      }
      consStyle = Object.keys(sharedStyle).length > 0 ? sharedStyle : truthyStyle;

      // Create inner variants for differing properties
      if (truthyStyle && falsyStyle) {
        const outerWhen = buildWhenCondition(condInfo, true);
        for (const [prop, val] of Object.entries(truthyStyle)) {
          if (!(prop in sharedStyle)) {
            innerConsVariants.push({
              nameHint: buildNameHint(innerCondInfo, true),
              when: `${outerWhen} && ${buildWhenCondition(innerCondInfo, true)}`,
              style: { [prop]: val },
            });
          }
        }
        for (const [prop, val] of Object.entries(falsyStyle)) {
          if (!(prop in sharedStyle)) {
            innerConsVariants.push({
              nameHint: buildNameHint(innerCondInfo, false),
              when: `${outerWhen} && ${buildWhenCondition(innerCondInfo, false)}`,
              style: { [prop]: val },
            });
          }
        }
      }
    }

    // Recursively process the alternate branch
    const nested = extractVariantsFromTernary(ce.alternate, condInfo.propName);
    if (!nested) {
      return null;
    }

    const variants: VariantWithStyle[] = [];

    // Add the consequent as a variant (shared properties)
    if (consStyle) {
      variants.push({
        nameHint: buildNameHint(condInfo, true),
        when: buildWhenCondition(condInfo, true),
        style: consStyle,
      });
    }

    // Add inner variants from template literal ternary (differing properties)
    variants.push(...innerConsVariants);

    // Add nested variants, combining with outer condition's falsy branch
    const outerFalsyCondition = buildWhenCondition(condInfo, false);
    for (const nestedVariant of nested.variants) {
      variants.push({
        ...nestedVariant,
        when: `${outerFalsyCondition} && ${nestedVariant.when}`,
      });
    }

    return { variants, defaultStyle: nested.defaultStyle };
  };

  // Extract variants from the ternary expression
  const result = extractVariantsFromTernary(body);
  if (!result) {
    // Fallback: handle ternary where one branch is a template literal with theme expressions
    // and the other is empty (undefined/null/""/false). This is semantically equivalent to
    // the LogicalExpression && form handled by tryResolveConditionalCssBlock.
    // Only available when we have a single param name (not destructured params).
    if (paramName) {
      return tryResolveTemplateLiteralTernaryWithEmptyBranch(body, paramName, ctx);
    }
    return null;
  }

  const { variants, defaultStyle } = result;

  // For single-level ternaries with a non-empty default (alternate), add it as a variant
  // This handles cases like: props.$dim ? "opacity: 0.5;" : "opacity: 1;"
  if (defaultStyle && Object.keys(defaultStyle).length > 0) {
    // Need to determine the condition for the default branch
    if (variants.length > 0) {
      // Build the "else" condition by negating all positive conditions
      const allConditions = variants.map((v) => v.when).join(" || ");
      let defaultWhen = `!(${allConditions})`;

      // Normalize double negation: !(!prop) -> prop
      // This happens when the original test was negated: !props.$x ? A : B
      // Without this, both variants would start with "!" and fall through the
      // lower-rules processing logic, silently dropping the styles.
      const firstVariant = variants[0];
      if (variants.length === 1 && firstVariant) {
        const singleWhen = firstVariant.when;
        // Check for simple negated prop (e.g., "!$open") without operators
        if (singleWhen.startsWith("!") && !singleWhen.includes(" ")) {
          defaultWhen = singleWhen.slice(1); // "!$open" -> "$open"
        }
      }

      variants.push({
        nameHint: "default",
        when: defaultWhen,
        style: defaultStyle,
      });
    } else {
      // Handle case where truthy branch is empty: props.$x ? "" : "css"
      // The default style applies when the condition is false.
      // Parse the condition from the body to determine the falsy condition.
      const condInfo = parseConditionTest(body.test);
      if (condInfo) {
        const falsyWhen = buildWhenCondition(condInfo, false);
        variants.push({
          nameHint: "default",
          when: falsyWhen,
          style: defaultStyle,
        });
      }
    }
  }

  if (variants.length === 0) {
    return null;
  }

  return { type: "splitVariants", variants };
}
