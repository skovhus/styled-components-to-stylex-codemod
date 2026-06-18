/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import type { CssDeclarationIR } from "../css-ir.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";
import {
  cloneAstNode,
  collectIdentifiers,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
} from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { cssPropertyToIdentifier } from "./shared.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import type { JSCodeshift } from "jscodeshift";
import type { InterpolatedDeclarationContext } from "./interpolated-declaration-context.js";

/**
 * Searches the function body for a local variable with the given name whose
 * initializer references `fnParamName`. Returns a cloned expression with
 * `fnParamName` replaced by `jsxProp`, or null if no such variable is found.
 *
 * Returns null when the derived expression references other helper-local variables
 * that would not be in scope at the call site.
 */
function resolveDerivedLocalVariable(
  j: JSCodeshift,
  fnBody: unknown,
  fnParamName: string,
  localName: string,
  jsxProp: string,
): ExpressionKind | null {
  const stmts = (fnBody as { body: unknown[] }).body;

  // Collect all local variable names declared in the function body
  const helperLocals = new Set<string>();
  for (const stmt of stmts) {
    const s = stmt as { type?: string; declarations?: unknown[] };
    if (s.type !== "VariableDeclaration" || !s.declarations) {
      continue;
    }
    for (const decl_ of s.declarations) {
      const vd = decl_ as { id?: { type?: string; name?: string } };
      if (vd.id?.type === "Identifier" && vd.id.name) {
        helperLocals.add(vd.id.name);
      }
    }
  }

  for (const stmt of stmts) {
    const s = stmt as { type?: string; declarations?: unknown[] };
    if (s.type !== "VariableDeclaration" || !s.declarations) {
      continue;
    }
    for (const decl_ of s.declarations) {
      const vd = decl_ as { id?: { type?: string; name?: string }; init?: unknown };
      if (vd.id?.type !== "Identifier" || vd.id.name !== localName || !vd.init) {
        continue;
      }
      // Check if the initializer references fnParamName
      const initIds = new Set<string>();
      collectIdentifiers(vd.init, initIds);
      if (!initIds.has(fnParamName)) {
        continue;
      }
      // Bail if the initializer also references other helper-local variables
      // that would not be in scope at the call site
      for (const id of initIds) {
        if (id !== fnParamName && helperLocals.has(id)) {
          return null;
        }
      }
      // Build the callArg by replacing fnParamName with jsxProp in the initializer
      const clonedInit = cloneAstNode(vd.init) as ExpressionKind;
      const replaceParam = (node: unknown): unknown => {
        if (!node || typeof node !== "object") {
          return node;
        }
        if (Array.isArray(node)) {
          return node.map(replaceParam);
        }
        const rec = node as Record<string, unknown>;
        if (rec.type === "Identifier" && rec.name === fnParamName) {
          return j.identifier(jsxProp);
        }
        for (const key of Object.keys(rec)) {
          if (key === "loc" || key === "comments") {
            continue;
          }
          const child = rec[key];
          if (child && typeof child === "object") {
            rec[key] = replaceParam(child);
          }
        }
        return rec;
      };
      return replaceParam(clonedInit) as ExpressionKind;
    }
  }
  return null;
}

/**
 * Handles local helper function calls in template interpolations.
 * Pattern: ${(props) => localFn(props.size)} where localFn is defined in the same file
 * and returns a CSS string like "width: ${size}px; height: ${size}px;".
 *
 * Extracts each CSS property from the helper's return value and creates
 * dynamic style functions for them.
 */
export function tryHandleLocalHelperCall(args: {
  ctx: InterpolatedDeclarationContext["ctx"];
  d: CssDeclarationIR;
  expr: unknown;
}): boolean {
  const { ctx, d, expr } = args;
  const { state, decl, styleFnDecls, styleFnFromProps } = ctx;
  const { j, root } = state;
  const avoidNames = new Set(state.importMap.keys());

  // Only handle standalone interpolations (no property name)
  if (d.property) {
    return false;
  }

  // Must be an arrow function
  const e = expr as { type?: string; params?: unknown[]; body?: unknown } | undefined;
  if (!e || (e.type !== "ArrowFunctionExpression" && e.type !== "FunctionExpression")) {
    return false;
  }
  const paramName = getArrowFnSingleParamName(e as Parameters<typeof getArrowFnSingleParamName>[0]);
  if (!paramName) {
    return false;
  }

  const body = getFunctionBodyExpr(e);
  if (!body || typeof body !== "object") {
    return false;
  }
  const bodyNode = body as {
    type?: string;
    callee?: { type?: string; name?: string };
    arguments?: unknown[];
  };
  if (bodyNode.type !== "CallExpression") {
    return false;
  }
  // Only support simple identifier callees (localFn)
  if (bodyNode.callee?.type !== "Identifier" || !bodyNode.callee.name) {
    return false;
  }
  const calleeName = bodyNode.callee.name;

  // Check it's NOT an imported function (those are handled by resolveCall)
  const importInfo = state.resolveImportInScope(calleeName, bodyNode.callee);
  if (importInfo) {
    return false;
  }

  // Must have a single argument that's a prop access: props.size
  const callArgs = bodyNode.arguments ?? [];
  if (callArgs.length !== 1) {
    return false;
  }
  const arg0 = callArgs[0] as { type?: string } | undefined;
  if (!arg0 || arg0.type !== "MemberExpression") {
    return false;
  }
  const propPath = getMemberPathFromIdentifier(
    arg0 as Parameters<typeof getMemberPathFromIdentifier>[0],
    paramName,
  );
  if (!propPath || propPath.length !== 1 || !propPath[0]) {
    return false;
  }
  const jsxProp = propPath[0];

  // Find the local function definition
  const fnDecls = root.find(j.FunctionDeclaration, { id: { name: calleeName } });
  if (fnDecls.size() === 0) {
    return false;
  }
  const fnNode = fnDecls.get().node;
  const fnParams = fnNode.params ?? [];
  if (fnParams.length !== 1) {
    return false;
  }
  const fnParamNode = fnParams[0] as { type?: string; name?: string };
  if (fnParamNode.type !== "Identifier" || !fnParamNode.name) {
    return false;
  }
  const fnParamName = fnParamNode.name;

  // Extract the return value
  const fnBody = fnNode.body as { body?: unknown[] } | undefined;
  if (!fnBody?.body) {
    return false;
  }
  const retStmt = fnBody.body.find(
    (s: unknown) => (s as { type?: string })?.type === "ReturnStatement",
  ) as { argument?: unknown } | undefined;
  if (!retStmt?.argument) {
    return false;
  }

  // The return value should be a template literal containing CSS declarations
  const retExpr = retStmt.argument as {
    type?: string;
    quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
    expressions?: unknown[];
  };
  if (retExpr.type !== "TemplateLiteral" || !retExpr.quasis || !retExpr.expressions) {
    return false;
  }

  // Build a CSS string with indexed placeholders to track which expression maps to which property
  let cssString = "";
  for (let i = 0; i < retExpr.quasis.length; i++) {
    cssString += retExpr.quasis[i]?.value?.cooked ?? retExpr.quasis[i]?.value?.raw ?? "";
    if (i < retExpr.expressions.length) {
      cssString += `__LOCAL_PARAM_${i}__`;
    }
  }

  // Parse the CSS string to extract properties (replace placeholders with dummy values)
  const parsedCss = parseCssDeclarationBlock(cssString.replace(/__LOCAL_PARAM_\d+__/g, "0"));
  if (!parsedCss || Object.keys(parsedCss).length === 0) {
    // The local helper function returns CSS that cannot be parsed into individual declarations.
    // This happens with child selectors (& > div), at-rules, or other complex CSS constructs.
    state.bailUnsupported(
      decl,
      `Local helper function returns CSS that cannot be decomposed into individual properties`,
    );
    return true;
  }

  // Build a per-property unit map by matching expression indices to CSS properties.
  // Parse the CSS string with placeholders intact to see which property contains each expression.
  const parsedWithPlaceholders = parseCssDeclarationBlock(
    cssString.replace(/__LOCAL_PARAM_(\d+)__/g, "PLACEHOLDER_$1"),
  );
  const propToUnit = new Map<string, string>();
  // Track CSS properties that directly reference the function parameter (with or without a unit)
  const directParamProps = new Set<string>();
  // Track derived call arguments per CSS property when the expression is a local variable
  // derived from the function parameter (e.g., `const px = sizeMap[size]` → callArg = sizeMap[size])
  const propToCallArg = new Map<string, ExpressionKind>();
  if (parsedWithPlaceholders) {
    for (const [cssProp, value] of Object.entries(parsedWithPlaceholders)) {
      const m = typeof value === "string" ? value.match(/PLACEHOLDER_(\d+)/) : null;
      if (!m) {
        continue;
      }
      const exprIdx = Number(m[1]);
      const nextQuasi =
        retExpr.quasis[exprIdx + 1]?.value?.cooked ?? retExpr.quasis[exprIdx + 1]?.value?.raw ?? "";
      const unitMatch = nextQuasi.match(/^(px|em|rem|%|vh|vw|ms|s)\b/);
      const exprNode = retExpr.expressions[exprIdx] as { type?: string; name?: string } | undefined;
      if (exprNode?.type === "Identifier" && exprNode.name === fnParamName) {
        directParamProps.add(cssProp);
        if (unitMatch) {
          propToUnit.set(cssProp, unitMatch[1]!);
        }
      } else if (exprNode?.type === "Identifier" && exprNode.name) {
        // Check if this identifier is a local variable derived from fnParamName
        const callArg = resolveDerivedLocalVariable(j, fnBody, fnParamName, exprNode.name, jsxProp);
        if (callArg) {
          propToCallArg.set(cssProp, callArg);
          // For px unit with derived expression, StyleX auto-adds px for numeric values,
          // so we don't need a unit suffix — just pass the number directly.
          // For non-px units, append the unit suffix.
          if (unitMatch && unitMatch[1] !== "px") {
            propToUnit.set(cssProp, unitMatch[1]!);
          }
        }
      }
    }
  }

  // Get the type annotation from the local function parameter
  const fnParamTypeAnnotation = (fnParams[0] as { typeAnnotation?: { typeAnnotation?: unknown } })
    ?.typeAnnotation?.typeAnnotation;

  // Verify that every CSS property can be traced back to the function parameter.
  // If any expression can't be resolved (neither direct param reference, unit-suffixed param,
  // nor a local variable derived from the param), bail rather than silently producing wrong code.
  for (const cssProp of Object.keys(parsedCss)) {
    if (!directParamProps.has(cssProp) && !propToCallArg.has(cssProp)) {
      // Check if the CSS value contains a placeholder at all
      const rawVal = parsedWithPlaceholders
        ? (parsedWithPlaceholders as Record<string, unknown>)[cssProp]
        : null;
      if (typeof rawVal === "string" && rawVal.includes("PLACEHOLDER_")) {
        // The local helper function computes CSS property values with logic that can't be
        // statically traced back to the function parameter (e.g., conditional assignments,
        // chained lookups). Bail rather than silently dropping these styles.
        state.bailUnsupported(
          decl,
          `Local helper function computes CSS values that cannot be statically traced to the component prop`,
        );
        return true;
      }
    }
  }

  // Create style functions for each extracted CSS property
  for (const cssProp of Object.keys(parsedCss)) {
    const fnKey = styleKeyWithSuffix(decl.styleKey, cssProp);
    const derivedCallArg = propToCallArg.get(cssProp);
    if (!styleFnDecls.has(fnKey)) {
      const paramName_ = cssPropertyToIdentifier(cssProp, avoidNames);
      const param = j.identifier(derivedCallArg ? paramName_ : jsxProp);
      if (derivedCallArg) {
        // Derived from a lookup expression (e.g., `sizeMap[size]`). The style function
        // receives the lookup result, which is typically numeric for CSS property values.
        // Use `number | string` to handle both numeric and token-based lookup tables.
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsUnionType([j.tsNumberKeyword(), j.tsStringKeyword()]),
        );
      } else if (fnParamTypeAnnotation) {
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          cloneAstNode(fnParamTypeAnnotation) as Parameters<typeof j.tsTypeAnnotation>[0],
        );
      }
      const propUnit = propToUnit.get(cssProp) ?? "";
      const valueParamName = derivedCallArg ? paramName_ : jsxProp;
      const valueExpr = propUnit
        ? j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: propUnit, cooked: propUnit }, true),
            ],
            [j.identifier(valueParamName)],
          )
        : j.identifier(valueParamName);
      const propKey = j.identifier(cssProp);
      const prop = j.property("init", propKey, valueExpr);
      // Use shorthand when key and value are the same identifier (e.g., { width } instead of { width: width })
      if (!propUnit && valueExpr.type === "Identifier" && valueExpr.name === cssProp) {
        (prop as { shorthand?: boolean }).shorthand = true;
      }
      const bodyExprNode = j.objectExpression([prop]);
      styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExprNode));
    }
    if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
      styleFnFromProps.push({
        fnKey,
        jsxProp,
        ...(derivedCallArg ? { callArg: derivedCallArg } : {}),
      });
    }
  }

  ensureShouldForwardPropDrop(decl, jsxProp);
  decl.needsWrapperComponent = true;

  // Track the consumed local helper for later removal in post-processing.
  // The function declaration can't be removed here because the template expression
  // still references it; it's cleaned up after the styled declaration is removed.
  if (!decl.consumedLocalHelpers) {
    decl.consumedLocalHelpers = [];
  }
  decl.consumedLocalHelpers.push(calleeName);

  return true;
}
