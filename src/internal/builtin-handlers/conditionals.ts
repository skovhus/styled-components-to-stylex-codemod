/**
 * Conditional expression handlers for the built-in handler system.
 * Core concepts: ternary splitting, CSS block conditionals, and nested variant extraction.
 */
import type { ImportSpec } from "../../adapter.js";
import {
  type CallExpressionNode,
  cloneAstNode,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isArrowFunctionExpression,
  isCallExpressionNode,
  isConditionalExpressionNode,
  literalToStaticValue,
  literalToString,
} from "../utilities/jscodeshift-utils.js";
import { parseExpr } from "../transform-parse-expr.js";
import {
  parseCssDeclarationBlock,
  parseCssDeclarationBlockWithTemplateExpr,
} from "./css-parsing.js";
import {
  extractIndexedThemeLookupInfo,
  getArrowFnThemeParamInfo,
  isAdapterResultCssValue,
  resolveImportedHelperCall,
  resolveTemplateLiteralExpressions,
  resolveTemplateLiteralWithTheme,
} from "./resolver-utils.js";
import type {
  ConditionalExpressionBody,
  DynamicNode,
  ExpressionKind,
  HandlerResult,
  InternalHandlerContext,
  ThemeParamInfo,
} from "./types.js";

// --- Exports (conditional handler functions) ---

export function tryResolveConditionalValue(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const info = getArrowFnThemeParamInfo(expr);
  const paramName = info?.kind === "propsParam" ? info.propsName : null;

  // Use getFunctionBodyExpr to handle both expression-body and block-body arrow functions.
  // Block bodies with a single return statement (possibly with comments) are supported.
  const body = getFunctionBodyExpr(expr) as ConditionalExpressionBody | null;
  if (!body || body.type !== "ConditionalExpression") {
    return null;
  }

  // Check for theme boolean conditional patterns (e.g., theme.isDark, theme.isHighContrast)
  // Supports: props.theme.<prop>, theme.<prop> (destructured), !props.theme.<prop>
  // Returns the property name and negation status if found
  const checkThemeBooleanTest = (
    test: unknown,
  ): { isNegated: boolean; themeProp: string } | null => {
    const check = (node: unknown): string | null => {
      if (
        !node ||
        typeof node !== "object" ||
        (node as { type?: string }).type !== "MemberExpression"
      ) {
        return null;
      }
      // Check props.theme.<prop> pattern
      if (info?.kind === "propsParam" && paramName) {
        const parts = getMemberPathFromIdentifier(
          node as Parameters<typeof getMemberPathFromIdentifier>[0],
          paramName,
        );
        const themeProp = parts?.[1];
        if (parts && parts[0] === "theme" && parts.length === 2 && themeProp) {
          return themeProp; // Return the property name (e.g., "isDark", "isHighContrast")
        }
      }
      // Check destructured theme.<prop> pattern: ({ theme }) => theme.<prop>
      if (info?.kind === "themeBinding") {
        const parts = getMemberPathFromIdentifier(
          node as Parameters<typeof getMemberPathFromIdentifier>[0],
          info.themeName,
        );
        const themeProp = parts?.[0];
        if (parts && parts.length === 1 && themeProp) {
          return themeProp; // Return the property name
        }
      }
      return null;
    };
    const t = test as { type?: string; operator?: string; argument?: unknown };
    const directProp = check(test);
    if (directProp) {
      return { isNegated: false, themeProp: directProp };
    }
    if (t.type === "UnaryExpression" && t.operator === "!") {
      const negatedProp = check(t.argument);
      if (negatedProp) {
        return { isNegated: true, themeProp: negatedProp };
      }
    }
    return null;
  };

  // Helper to resolve a MemberExpression as a theme path
  const resolveThemeFromMemberExpr = (node: unknown): { path: string } | null => {
    if (
      !node ||
      typeof node !== "object" ||
      (node as { type?: string }).type !== "MemberExpression"
    ) {
      return null;
    }
    if (info?.kind === "propsParam" && paramName) {
      const parts = getMemberPathFromIdentifier(
        node as Parameters<typeof getMemberPathFromIdentifier>[0],
        paramName,
      );
      if (!parts || parts[0] !== "theme") {
        return null;
      }
      return { path: parts.slice(1).join(".") };
    }
    if (info?.kind === "themeBinding") {
      const parts = getMemberPathFromIdentifier(
        node as Parameters<typeof getMemberPathFromIdentifier>[0],
        info.themeName,
      );
      if (!parts) {
        return null;
      }
      return { path: parts.join(".") };
    }
    return null;
  };

  // Helper to resolve a theme member expression branch to an AST node with imports
  const resolveThemeBranchValue = (
    branch: unknown,
  ): { astNode: ExpressionKind; imports: ImportSpec[] } | null => {
    const themeInfo = resolveThemeFromMemberExpr(branch);
    if (!themeInfo) {
      return null;
    }
    const res = ctx.resolveValue({
      kind: "theme",
      path: themeInfo.path,
      filePath: ctx.filePath,
      loc: getNodeLocStart(branch) ?? undefined,
    });
    if (!res) {
      return null;
    }
    const astNode = parseExpr(ctx.api, res.expr);
    if (!astNode) {
      return null;
    }
    return { astNode, imports: res.imports };
  };

  const themeBoolInfo = checkThemeBooleanTest(body.test);
  if (themeBoolInfo && node.css.property) {
    const { consequent, alternate } = body;
    // Determine true/false branches based on negation
    const trueBranch = themeBoolInfo.isNegated ? alternate : consequent;
    const falseBranch = themeBoolInfo.isNegated ? consequent : alternate;

    // Resolve both branches as static values (excluding booleans, which aren't valid CSS values)
    const trueRaw = literalToStaticValue(trueBranch);
    const falseRaw = literalToStaticValue(falseBranch);
    let trueValue: unknown = trueRaw !== null && typeof trueRaw !== "boolean" ? trueRaw : null;
    let falseValue: unknown = falseRaw !== null && typeof falseRaw !== "boolean" ? falseRaw : null;
    const trueImports: ImportSpec[] = [];
    const falseImports: ImportSpec[] = [];

    // Fallback: resolve theme member expressions (e.g., props.theme.color.labelBase)
    if (trueValue === null) {
      const resolved = resolveThemeBranchValue(trueBranch);
      if (resolved) {
        trueValue = resolved.astNode;
        trueImports.push(...resolved.imports);
      }
    }
    if (falseValue === null) {
      const resolved = resolveThemeBranchValue(falseBranch);
      if (resolved) {
        falseValue = resolved.astNode;
        falseImports.push(...resolved.imports);
      }
    }

    if (trueValue !== null && falseValue !== null) {
      return {
        type: "splitThemeBooleanVariants",
        cssProp: node.css.property,
        themeProp: themeBoolInfo.themeProp,
        trueValue,
        falseValue,
        trueImports,
        falseImports,
      };
    }

    // Fallback: one branch resolved but the other is an unresolvable call expression.
    // Use the resolved branch as the base StyleX value and emit the unresolvable
    // branch as a conditional inline style guarded by the theme boolean.
    const inlineStyleFallback = tryBuildThemeBooleanInlineStyleFallback({
      trueValue,
      falseValue,
      trueImports,
      falseImports,
      trueBranch,
      falseBranch,
      themeBoolInfo,
      cssProp: node.css.property,
      paramName,
      info,
    });
    if (inlineStyleFallback) {
      return inlineStyleFallback;
    }
    // Can't resolve branches as static values - fall through to other handlers
    // which may bail with a warning
  }

  type BranchUsage = "props" | "create";
  type Branch = { usage: BranchUsage; expr: string; imports: ImportSpec[] } | null;

  // Determine expected usage from context:
  // - Has CSS property -> "create" (CSS value)
  // - No CSS property -> "props" (StyleX reference)
  const expectedUsage: BranchUsage = node.css.property ? "create" : "props";

  const branchToExpr = (b: unknown): Branch => {
    const v = literalToStaticValue(b);
    if (v !== null) {
      // Booleans are not valid CSS values; styled-components treats falsy
      // interpolations as "omit this declaration", so bail instead of emitting
      // invalid CSS like `cursor: false`.
      if (typeof v === "boolean") {
        return null;
      }
      return {
        usage: "create",
        expr: typeof v === "string" ? JSON.stringify(v) : String(v),
        imports: [],
      };
    }
    if (!b || typeof b !== "object") {
      return null;
    }

    // Helper to resolve call expressions (simple or curried) via adapter.
    // Preserves the full CallResolveResult including `kind` for proper CSS value vs StyleX ref detection.
    const resolveCallExpr = (
      call: CallExpressionNode,
      cssProperty: string | undefined,
    ): { expr: string; imports: ImportSpec[]; usage?: "create" | "props" } | null => {
      const res = resolveImportedHelperCall(call, ctx, undefined, cssProperty);
      if (res.kind === "resolved") {
        return res.result;
      }
      // Try curried pattern: helper(...)(propsParam)
      if (isCallExpressionNode(call.callee)) {
        const inner = call.callee;
        const outerArgs = call.arguments ?? [];
        if (outerArgs.length === 1 && outerArgs[0] && typeof outerArgs[0] === "object") {
          const innerRes = resolveImportedHelperCall(inner, ctx, undefined, cssProperty);
          if (innerRes.kind === "resolved") {
            return innerRes.result;
          }
        }
      }
      return null;
    };

    // Handle template literals with theme or call interpolations
    // e.g., `inset 0 0 0 1px ${props.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06)`
    // e.g., `linear-gradient(to bottom, ${color("bgSub")(props)} 70%, rgba(0, 0, 0, 0) 100%)`
    // Template literals always need CSS values, so always pass cssProperty
    const templateResult = resolveTemplateLiteralExpressions(b, (expr) => {
      // First try theme member expression
      const themeInfo = resolveThemeFromMemberExpr(expr);
      if (themeInfo) {
        const res = ctx.resolveValue({
          kind: "theme",
          path: themeInfo.path,
          filePath: ctx.filePath,
          loc: getNodeLocStart(expr) ?? undefined,
        });
        return res ?? null;
      }
      // Then try call expression (simple or curried)
      // Template literals need CSS values, so pass cssProperty
      if (isCallExpressionNode(expr)) {
        const callRes = resolveCallExpr(expr, node.css.property);
        return callRes ? { expr: callRes.expr, imports: callRes.imports } : null;
      }
      return null;
    });
    if (templateResult) {
      return { usage: "create", ...templateResult };
    }

    if (isCallExpressionNode(b)) {
      // helper(...) or helper(...)(props)
      // Pass cssProperty to let the adapter decide based on context
      const resolved = resolveCallExpr(b, node.css.property);
      if (resolved) {
        // Use adapter's explicit `kind` if provided, otherwise infer from cssProperty context
        const isCssValue = isAdapterResultCssValue(resolved, node.css.property);
        const usage: BranchUsage = isCssValue ? "create" : "props";
        return { usage, expr: resolved.expr, imports: resolved.imports };
      }
      return null;
    }

    // Handle direct MemberExpression theme access (reuse the helper)
    const themeInfo = resolveThemeFromMemberExpr(b);
    if (!themeInfo) {
      return null;
    }
    const res = ctx.resolveValue({
      kind: "theme",
      path: themeInfo.path,
      filePath: ctx.filePath,
      loc: getNodeLocStart(b) ?? undefined,
    });
    if (!res) {
      return null;
    }
    return { usage: expectedUsage, expr: res.expr, imports: res.imports };
  };

  const getBranch = (value: unknown): Branch => {
    return branchToExpr(value);
  };

  // Helper to extract condition info from a binary expression test
  type CondInfo = { propName: string; rhsValue: string; rhsRaw: unknown; cond: string } | null;
  const extractConditionInfo = (test: any): CondInfo => {
    if (
      !paramName ||
      test.type !== "BinaryExpression" ||
      (test.operator !== "===" && test.operator !== "!==") ||
      test.left.type !== "MemberExpression"
    ) {
      return null;
    }
    const leftPath = getMemberPathFromIdentifier(test.left, paramName);
    const firstLeftPath = leftPath?.[0];
    if (!leftPath || leftPath.length !== 1 || !firstLeftPath) {
      return null;
    }
    const propName = firstLeftPath;
    const rhsRaw = literalToStaticValue(test.right as any);
    if (rhsRaw === null) {
      return null;
    }
    const rhsValue = JSON.stringify(rhsRaw);
    const cond = `${propName} ${test.operator} ${rhsValue}`;
    return { propName, rhsValue, rhsRaw, cond };
  };

  // Recursively extract variants from nested ternaries
  // e.g., prop === "a" ? valA : prop === "b" ? valB : defaultVal
  type Variant = {
    nameHint: string;
    when: string;
    usage: BranchUsage;
    expr: string;
    imports: ImportSpec[];
  };
  const extractNestedTernaryVariants = (
    condExpr: any,
    expectedPropName?: string,
  ): { variants: Variant[]; defaultBranch: NonNullable<Branch> } | null => {
    if (condExpr.type !== "ConditionalExpression") {
      // Base case: not a conditional, this is the default value
      const branch = getBranch(condExpr);
      if (!branch) {
        return null;
      }
      return { variants: [], defaultBranch: branch };
    }

    const { test, consequent, alternate } = condExpr;
    const condInfo = extractConditionInfo(test);
    if (!condInfo) {
      return null;
    }

    // Ensure all conditions test the same property
    if (expectedPropName && condInfo.propName !== expectedPropName) {
      return null;
    }

    const consExpr = getBranch(consequent);
    if (!consExpr) {
      return null;
    }

    // Extract the RHS value for nameHint (e.g., "large" from variant === "large")
    const rhsNameHint =
      typeof condInfo.rhsRaw === "string" ? condInfo.rhsRaw : String(condInfo.rhsRaw);

    // Recursively process the alternate branch
    const nested = extractNestedTernaryVariants(alternate, condInfo.propName);
    if (!nested) {
      return null;
    }

    // Add this condition's variant
    const thisVariant: Variant = {
      nameHint: rhsNameHint,
      when: condInfo.cond,
      usage: consExpr.usage,
      expr: consExpr.expr,
      imports: consExpr.imports,
    };

    return {
      variants: [thisVariant, ...nested.variants],
      defaultBranch: nested.defaultBranch,
    };
  };

  // Helper: Extract indexed theme lookup from a computed member expression like:
  //   props.theme.color[props.textColor]
  // Returns the theme object path (e.g., "color") and the index prop name if valid.
  // Uses shared helper but adds expectedIndexProp validation.
  const tryExtractIndexedThemeLookup = (
    branch: unknown,
    expectedIndexProp: string,
  ): { themeObjectPath: string; indexPropName: string } | null => {
    if (!paramName) {
      return null;
    }
    const result = extractIndexedThemeLookupInfo(branch, paramName);
    if (!result || result.indexPropName !== expectedIndexProp) {
      return null;
    }
    return result;
  };

  // Helper: Extract static theme value from a non-computed member expression like:
  //   props.theme.color.labelTitle
  const tryExtractStaticThemeValue = (
    branch: unknown,
  ): { expr: string; imports: ImportSpec[] } | null => {
    const n = branch as { type?: string; computed?: boolean };
    if (!n || n.type !== "MemberExpression" || n.computed === true || !paramName) {
      return null;
    }
    const path = getMemberPathFromIdentifier(n as any, paramName);
    if (!path || path[0] !== "theme" || path.length < 2) {
      return null;
    }
    const themePath = path.slice(1).join(".");
    const resolved = ctx.resolveValue({
      kind: "theme",
      path: themePath,
      filePath: ctx.filePath,
      loc: getNodeLocStart(n) ?? undefined,
    });
    return resolved ? { expr: resolved.expr, imports: resolved.imports } : null;
  };

  const { test, consequent, alternate } = body as {
    test: any;
    consequent: any;
    alternate: any;
  };

  // 1) props.foo ? a : b (simple boolean test)
  const testPath =
    paramName && test.type === "MemberExpression"
      ? getMemberPathFromIdentifier(test, paramName)
      : null;
  const outerProp = testPath?.[0];
  if (testPath && testPath.length === 1 && outerProp) {
    const cons = getBranch(consequent);
    const alt = getBranch(alternate);

    // Check for multi-prop nested ternary: outerProp ? A : innerProp ? B : C
    // where alternate is a conditional testing a different boolean prop
    if (cons && !alt && alternate.type === "ConditionalExpression" && paramName) {
      const innerTest = (alternate as any).test;
      const innerTestPath =
        innerTest?.type === "MemberExpression"
          ? getMemberPathFromIdentifier(innerTest, paramName)
          : null;
      const innerProp = innerTestPath?.[0];
      // Only handle when inner tests a different single-level prop
      if (innerTestPath && innerTestPath.length === 1 && innerProp && innerProp !== outerProp) {
        const innerCons = getBranch((alternate as any).consequent);
        const innerAlt = getBranch((alternate as any).alternate);
        if (innerCons && innerAlt) {
          // All branches must use "create" usage (not "props")
          if (
            cons.usage === "create" &&
            innerCons.usage === "create" &&
            innerAlt.usage === "create"
          ) {
            return {
              type: "splitMultiPropVariantsResolvedValue",
              outerProp,
              outerTruthyBranch: { expr: cons.expr, imports: cons.imports },
              innerProp,
              innerTruthyBranch: { expr: innerCons.expr, imports: innerCons.imports },
              innerFalsyBranch: { expr: innerAlt.expr, imports: innerAlt.imports },
            };
          }
        }
      }
    }

    // Check for conditional indexed theme lookup:
    //   props.textColor ? props.theme.color[props.textColor] : props.theme.color.labelTitle
    // Where the test prop is also used as the index into a theme object.
    if (!cons) {
      const indexedResult = tryExtractIndexedThemeLookup(consequent, outerProp);
      if (indexedResult) {
        // Resolve the theme object (e.g., "color" -> "themeVars")
        const themeObjResolved = ctx.resolveValue({
          kind: "theme",
          path: indexedResult.themeObjectPath,
          filePath: ctx.filePath,
          loc: getNodeLocStart(consequent) ?? undefined,
        });
        if (themeObjResolved) {
          // Extract static fallback from alternate branch
          const fallbackResult = tryExtractStaticThemeValue(alternate);
          if (fallbackResult) {
            return {
              type: "emitConditionalIndexedThemeFunction",
              propName: outerProp,
              propType: null, // Type will be inferred from component props in lower-rules.ts
              themeObjectExpr: themeObjResolved.expr,
              themeObjectImports: themeObjResolved.imports,
              fallbackExpr: fallbackResult.expr,
              fallbackImports: fallbackResult.imports,
            };
          }
        }
      }
    }

    if (!cons || !alt) {
      return null;
    }
    const allUsages = new Set([cons.usage, alt.usage]);
    if (allUsages.size !== 1) {
      return null;
    }
    const usage = cons.usage;
    const variants = [
      { nameHint: "truthy", when: outerProp, expr: cons.expr, imports: cons.imports },
      { nameHint: "falsy", when: `!${outerProp}`, expr: alt.expr, imports: alt.imports },
    ];
    return usage === "props"
      ? { type: "splitVariantsResolvedStyles", variants }
      : { type: "splitVariantsResolvedValue", variants };
  }

  // 1b) Destructured theme + bare Identifier test: ({ enabled, theme }) => enabled ? theme.x : theme.y
  // When the param is an ObjectPattern with `theme`, a bare Identifier test refers to another
  // destructured prop. Handle this like the MemberExpression test above.
  // Guard: the identifier must actually be in the ObjectPattern (not a closure variable).
  if (
    info?.kind === "themeBinding" &&
    test.type === "Identifier" &&
    typeof test.name === "string" &&
    isDestructuredFromParam(expr, test.name)
  ) {
    const destructuredProp = test.name;
    const cons = getBranch(consequent);
    const alt = getBranch(alternate);
    if (cons && alt) {
      const allUsages = new Set([cons.usage, alt.usage]);
      if (allUsages.size === 1) {
        const usage = cons.usage;
        const variants = [
          {
            nameHint: "truthy",
            when: destructuredProp,
            expr: cons.expr,
            imports: cons.imports,
          },
          {
            nameHint: "falsy",
            when: `!${destructuredProp}`,
            expr: alt.expr,
            imports: alt.imports,
          },
        ];
        return usage === "props"
          ? { type: "splitVariantsResolvedStyles", variants }
          : { type: "splitVariantsResolvedValue", variants };
      }
    }
  }

  // 2) Handle nested ternaries: prop === "a" ? valA : prop === "b" ? valB : defaultVal
  // This also handles the simple case: prop === "a" ? valA : defaultVal
  const condInfo = extractConditionInfo(test);
  if (condInfo) {
    const consExpr = getBranch(consequent);
    if (!consExpr) {
      return null;
    }

    // If the consequent is styles and the alternate is a literal that effectively means "nothing",
    // we can model this as a single variant in stylex.props.
    const altLiteral = literalToString(alternate);
    const altIsEmptyish =
      altLiteral !== null && (altLiteral.trim() === "" || altLiteral === "none");
    if (consExpr.usage === "props" && altIsEmptyish) {
      return {
        type: "splitVariantsResolvedStyles",
        variants: [
          {
            nameHint:
              typeof condInfo.rhsRaw === "string" ? condInfo.rhsRaw : String(condInfo.rhsRaw),
            when: condInfo.cond,
            expr: consExpr.expr,
            imports: consExpr.imports,
          },
        ],
      };
    }

    // Check if alternate is a nested ternary testing the same property
    const nested = extractNestedTernaryVariants(alternate, condInfo.propName);
    if (nested) {
      const rhsNameHint =
        typeof condInfo.rhsRaw === "string" ? condInfo.rhsRaw : String(condInfo.rhsRaw);

      const thisVariant: Variant = {
        nameHint: rhsNameHint,
        when: condInfo.cond,
        usage: consExpr.usage,
        expr: consExpr.expr,
        imports: consExpr.imports,
      };

      const allVariants = [thisVariant, ...nested.variants];

      // Build the default condition: negation of all positive conditions
      const allConditions = allVariants.map((v) => v.when).join(" || ");

      // For now, only support nested-ternary variant extraction for value results.
      // (Styles results would need an explicit "no style" default semantics.)
      const usageSet = new Set<BranchUsage>([
        nested.defaultBranch.usage,
        ...allVariants.map((v) => v.usage),
      ]);
      if (usageSet.size !== 1 || usageSet.has("props")) {
        return null;
      }
      return {
        type: "splitVariantsResolvedValue",
        variants: [
          {
            nameHint: "default",
            when: `!(${allConditions})`,
            expr: nested.defaultBranch.expr,
            imports: nested.defaultBranch.imports,
          },
          ...allVariants.map((v) => ({
            nameHint: v.nameHint,
            when: v.when,
            expr: v.expr,
            imports: v.imports,
          })),
        ],
      };
    }
  }

  return null;
}

export function tryResolveConditionalCssBlock(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }

  // Support patterns like:
  //   ${(props) => props.$upsideDown && "transform: rotate(180deg);"}
  //   ${(props) => props.$upsideDown && `box-shadow: ${props.theme.color.x};`}
  // Also supports arrow functions with a block body containing only a return statement:
  //   ${(props) => { return props.$upsideDown && "transform: rotate(180deg);"; }}
  const body = getFunctionBodyExpr(expr) as {
    type?: string;
    operator?: string;
    left?: unknown;
    right?: unknown;
  } | null;
  if (!body || body.type !== "LogicalExpression" || body.operator !== "&&") {
    return null;
  }
  const { left, right } = body;
  const testPath =
    (left as { type?: string })?.type === "MemberExpression"
      ? getMemberPathFromIdentifier(
          left as Parameters<typeof getMemberPathFromIdentifier>[0],
          paramName,
        )
      : null;
  const testProp = testPath?.[0];
  if (!testPath || testPath.length !== 1 || !testProp) {
    return null;
  }

  // Try static string/template literal first
  const cssText = literalToString(right);
  if (cssText !== null && cssText !== undefined) {
    const style = parseCssDeclarationBlock(cssText);
    if (!style) {
      return null;
    }
    return {
      type: "splitVariants",
      variants: [{ nameHint: "truthy", when: testProp, style }],
    };
  }

  // Try template literal with theme expressions
  const templateResult = resolveTemplateLiteralWithTheme(right, paramName, ctx);
  if (templateResult) {
    // Extract CSS text from the resolved template to get property names
    // The template looks like: `property: value ${resolved};`
    // We need to parse it to build the style object
    const templateText = templateResult.expr.slice(1, -1); // Remove backticks
    const parsed = parseCssDeclarationBlockWithTemplateExpr(templateText, ctx.api);
    if (!parsed) {
      return null;
    }
    return {
      type: "splitVariants",
      variants: [
        {
          nameHint: "truthy",
          when: testProp,
          style: parsed.styleObj,
          imports: templateResult.imports,
        },
      ],
    };
  }

  return null;
}

export function tryResolveConditionalCssBlockTernary(node: DynamicNode): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
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

    // Simple prop access: props.$dim
    if (t.type === "MemberExpression") {
      const testPath = getMemberPathFromIdentifier(t as any, paramName);
      const firstProp = testPath?.[0];
      if (!testPath || testPath.length !== 1 || !firstProp) {
        return null;
      }
      return { kind: "boolean", propName: firstProp, isNegated: false };
    }

    // Negated prop access: !props.$open
    if (t.type === "UnaryExpression" && t.operator === "!") {
      const arg = t.argument as { type?: string } | undefined;
      if (arg?.type === "MemberExpression") {
        const testPath = getMemberPathFromIdentifier(arg as any, paramName);
        const firstProp = testPath?.[0];
        if (!testPath || testPath.length !== 1 || !firstProp) {
          return null;
        }
        return { kind: "boolean", propName: firstProp, isNegated: true };
      }
      return null;
    }

    // Comparison: props.variant === "micro" or props.variant !== "micro"
    if (t.type === "BinaryExpression" && (t.operator === "===" || t.operator === "!==")) {
      const left = t.left as { type?: string } | undefined;
      if (left?.type !== "MemberExpression") {
        return null;
      }
      const testPath = getMemberPathFromIdentifier(left as any, paramName);
      const firstProp = testPath?.[0];
      if (!testPath || testPath.length !== 1 || !firstProp) {
        return null;
      }
      const rhsRaw = literalToStaticValue(t.right);
      if (rhsRaw === null) {
        return null;
      }
      return {
        kind: "comparison",
        propName: firstProp,
        operator: t.operator as "===" | "!==",
        rhsValue: JSON.stringify(rhsRaw),
        rhsRaw,
      };
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
    if (consText === null) {
      return null;
    }
    const consStyle = consText.trim() ? parseCssDeclarationBlock(consText) : null;

    // Recursively process the alternate branch
    const nested = extractVariantsFromTernary(ce.alternate, condInfo.propName);
    if (!nested) {
      return null;
    }

    const variants: VariantWithStyle[] = [];

    // Add the consequent as a variant
    if (consStyle) {
      variants.push({
        nameHint: buildNameHint(condInfo, true),
        when: buildWhenCondition(condInfo, true),
        style: consStyle,
      });
    }

    // Add nested variants, combining with outer condition's falsy branch
    // All nested variants are in the else branch, so they need the outer falsy guard.
    // This is always correct, even for enum chains where conditions are mutually exclusive.
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

/**
 * Handle indexed theme lookup with prop fallback:
 *   props.theme.color[props.backgroundColor] || props.backgroundColor
 *
 * Output: (backgroundColor: Color) => ({ backgroundColor: $colors[backgroundColor] ?? backgroundColor })
 */
export function tryResolveIndexedThemeWithPropFallback(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }

  const body = expr.body as {
    type?: string;
    operator?: string;
    left?: unknown;
    right?: unknown;
  } | null;

  // Must be a LogicalExpression with || or ??
  if (
    !body ||
    body.type !== "LogicalExpression" ||
    (body.operator !== "||" && body.operator !== "??")
  ) {
    return null;
  }

  // Right side must be a simple prop access: props.propName
  const rightPath = getMemberPathFromIdentifier(body.right as any, paramName);
  const fallbackPropName = rightPath?.[0];
  if (!rightPath || rightPath.length !== 1 || !fallbackPropName) {
    return null;
  }

  // Left side must be an indexed theme lookup: props.theme.color[props.propName]
  const indexedResult = extractIndexedThemeLookupInfo(body.left, paramName);
  if (!indexedResult) {
    return null;
  }

  // The index prop and fallback prop must be the same
  if (indexedResult.indexPropName !== fallbackPropName) {
    return null;
  }

  // Resolve the theme object (e.g., "color" -> "$colors")
  const themeObjResolved = ctx.resolveValue({
    kind: "theme",
    path: indexedResult.themeObjectPath,
    filePath: ctx.filePath,
    loc: getNodeLocStart(body.left) ?? undefined,
  });
  if (!themeObjResolved) {
    return null;
  }

  return {
    type: "emitIndexedThemeFunctionWithPropFallback",
    propName: indexedResult.indexPropName,
    themeObjectExpr: themeObjResolved.expr,
    themeObjectImports: themeObjResolved.imports,
    operator: body.operator as "||" | "??",
  };
}

// --- Non-exported helpers ---

/**
 * Check whether a given identifier name is actually destructured from the
 * arrow function's ObjectPattern parameter.  This prevents treating closure
 * variables (captured from outer scope) as component props.
 *
 * Example: `({ enabled, theme }) => enabled ? …` → `enabled` IS destructured.
 * Example: `({ theme }) => closureVar ? …` → `closureVar` is NOT destructured.
 */
function isDestructuredFromParam(arrowFn: unknown, name: string): boolean {
  const fn = arrowFn as { params?: Array<{ type?: string; properties?: unknown[] }> };
  const param = fn.params?.[0];
  if (!param || param.type !== "ObjectPattern" || !Array.isArray(param.properties)) {
    return false;
  }
  return param.properties.some((prop) => {
    const p = prop as { type?: string; key?: { type?: string; name?: string } };
    if (p.type !== "Property" && p.type !== "ObjectProperty") {
      return false;
    }
    return p.key?.type === "Identifier" && p.key.name === name;
  });
}

/**
 * Parses a template literal that contains a simple prop-based ternary expression.
 * Supports patterns like: `background: ${props.$primary ? "red" : "blue"}`
 *
 * Returns the static parts (prefix/suffix), the inner conditional's test node,
 * and the truthy/falsy values, or null if not a supported pattern.
 */
function parseCssTemplateLiteralWithTernary(node: unknown): {
  prefix: string;
  suffix: string;
  innerTest: unknown;
  truthyValue: string;
  falsyValue: string;
} | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const n = node as {
    type?: string;
    expressions?: unknown[];
    quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
  };

  // Must be a TemplateLiteral with exactly 1 expression
  if (n.type !== "TemplateLiteral") {
    return null;
  }
  if (!n.expressions || n.expressions.length !== 1) {
    return null;
  }
  if (!n.quasis || n.quasis.length !== 2) {
    return null;
  }

  // Extract the static parts (quasis)
  const prefix = n.quasis[0]?.value?.cooked ?? n.quasis[0]?.value?.raw ?? "";
  const suffix = n.quasis[1]?.value?.cooked ?? n.quasis[1]?.value?.raw ?? "";

  // The expression must be a ConditionalExpression
  const expr = n.expressions[0] as ConditionalExpressionBody;
  if (!expr || expr.type !== "ConditionalExpression") {
    return null;
  }

  // Extract truthy and falsy values - they must be string literals
  const truthyValue = literalToString(expr.consequent);
  const falsyValue = literalToString(expr.alternate);
  if (truthyValue === null || falsyValue === null) {
    return null;
  }

  return { prefix, suffix, innerTest: expr.test, truthyValue, falsyValue };
}

/**
 * When a theme boolean conditional (e.g., `props.theme.isDark ? A : B`) has one
 * resolvable branch and the other is an unresolvable call expression, emit the
 * resolved branch as the base StyleX style and the unresolvable branch as a
 * conditional inline style.
 *
 * This replaces `props.theme.*` / `<paramName>.theme.*` references in the
 * unresolvable branch with `theme.*` (using the `useTheme()` hook variable).
 */
function tryBuildThemeBooleanInlineStyleFallback(args: {
  trueValue: unknown;
  falseValue: unknown;
  trueImports: ImportSpec[];
  falseImports: ImportSpec[];
  trueBranch: unknown;
  falseBranch: unknown;
  themeBoolInfo: { isNegated: boolean; themeProp: string };
  cssProp: string;
  paramName: string | null;
  info: ThemeParamInfo | null;
}): HandlerResult | null {
  const {
    trueValue,
    falseValue,
    trueImports,
    falseImports,
    trueBranch,
    falseBranch,
    themeBoolInfo,
    cssProp,
    paramName,
    info,
  } = args;

  // Exactly one branch must be resolved
  if ((trueValue === null) === (falseValue === null)) {
    return null;
  }

  const resolvedBranchIsTrue = trueValue !== null;
  const unresolvableBranch = resolvedBranchIsTrue ? falseBranch : trueBranch;

  // The unresolvable branch must contain a call expression (theme helper call)
  if (!hasCallExpression(unresolvableBranch)) {
    return null;
  }

  // Transform the unresolvable branch: replace props.theme.* / <param>.theme.* with theme.*
  const transformed = replaceThemeRefsWithHookVar(unresolvableBranch, paramName, info);
  if (!transformed) {
    return null;
  }

  return {
    type: "splitThemeBooleanWithInlineStyleFallback",
    cssProp,
    themeProp: themeBoolInfo.themeProp,
    isNegated: themeBoolInfo.isNegated,
    resolvedValue: resolvedBranchIsTrue ? trueValue : falseValue,
    resolvedImports: resolvedBranchIsTrue ? trueImports : falseImports,
    resolvedBranchIsTrue,
    inlineExpr: transformed,
  };
}

/** Check if an expression tree contains any call expressions. */
function hasCallExpression(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as { type?: string };
  if (n.type === "CallExpression") {
    return true;
  }
  for (const key of Object.keys(n)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    const child = (n as Record<string, unknown>)[key];
    if (child && typeof child === "object" && hasCallExpression(child)) {
      return true;
    }
  }
  return false;
}

/**
 * Deep-clones an expression and replaces `<paramName>.theme.*` or `theme.*`
 * (for destructured theme binding) with `theme.*` references suitable for
 * use with the `useTheme()` hook variable.
 *
 * Returns null if the expression contains references that cannot be safely
 * transformed (e.g., non-theme param usage).
 */
function replaceThemeRefsWithHookVar(
  expr: unknown,
  paramName: string | null,
  info: ThemeParamInfo | null,
): unknown {
  if (!expr || typeof expr !== "object") {
    return expr;
  }
  const cloned = cloneAstNode(expr);

  const replace = (node: unknown): unknown => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(replace);
    }
    const n = node as Record<string, unknown>;

    // For propsParam pattern: replace <paramName>.theme.X with theme.X
    if (
      info?.kind === "propsParam" &&
      paramName &&
      (n.type === "MemberExpression" || n.type === "OptionalMemberExpression")
    ) {
      const obj = n.object as Record<string, unknown> | undefined;
      const prop = n.property as Record<string, unknown> | undefined;
      // Match: <paramName>.theme
      if (
        obj?.type === "Identifier" &&
        obj.name === paramName &&
        prop?.type === "Identifier" &&
        prop.name === "theme" &&
        n.computed === false
      ) {
        // Replace entire <paramName>.theme with just "theme" identifier
        return { type: "Identifier", name: "theme" };
      }
    }

    // For themeBinding pattern: the theme identifier is already directly accessible
    // Just ensure the binding name maps to "theme"
    if (info?.kind === "themeBinding" && n.type === "Identifier" && n.name === info.themeName) {
      return { type: "Identifier", name: "theme" };
    }

    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        n[key] = replace(child);
      }
    }
    return n;
  };

  return replace(cloned);
}
