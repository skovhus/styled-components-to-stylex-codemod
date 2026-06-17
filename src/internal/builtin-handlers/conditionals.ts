/**
 * Conditional expression handlers for the built-in handler system.
 * Core concepts: ternary splitting, CSS block conditionals, and nested variant extraction.
 */
import type {
  CallResolveContext,
  CallResolveResult,
  CallResolveResultWithExpr,
  ImportSpec,
} from "../../adapter.js";
import {
  type ArrowFnParamBindings,
  type CallExpressionNode,
  cloneAstNode,
  getArrowFnParamBindings,
  extractRootAndPath,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  getSinglePropFromMemberExpr,
  isArrowFunctionExpression,
  isCallExpressionNode,
  isConditionalExpressionNode,
  isEmptyCssBranch,
  literalToStaticValue,
  literalToString,
  resolveIdentifierToPropName,
  resolveStaticExpressionValue,
} from "../utilities/jscodeshift-utils.js";
import { parseExpr } from "../transform-parse-expr.js";
import { isMemberExpression } from "../lower-rules/utils.js";
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
  if (node.css.property === "transition") {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const info = getArrowFnThemeParamInfo(expr);
  const paramName = info?.kind === "propsParam" ? info.propsName : null;
  const propsParamName = paramName ?? undefined;
  const themeBindingName = info?.kind === "themeBinding" ? info.themeName : undefined;

  // For destructured params like ({ inline, column }) => ..., resolve bindings
  // so we can map bare Identifiers in the test to prop names.
  const paramBindings: ArrowFnParamBindings | null =
    !paramName && !info ? getArrowFnParamBindings(expr) : null;

  // Tracks whether any branch in the conditional resolved to preserveRuntimeCall.
  // When set, the whole conditional can be emitted as a runtime call expression
  // (e.g., checked ? ColorConverter.cssWithAlpha(theme.color.x, 0.8) : "transparent").
  // Uses an object wrapper so TypeScript's control flow analysis tracks mutations from closures.
  type RuntimeCallInfo = {
    resolveCallContext: CallResolveContext;
    resolveCallResult: CallResolveResult;
    cssValueText?: string;
  };
  type RuntimeCallBranch = "true" | "false" | "both";
  const runtimeCallState: { info: RuntimeCallInfo | null } = { info: null };
  const buildRuntimeCallResult = (): HandlerResult | null =>
    runtimeCallState.info
      ? {
          type: "runtimeCallOnly",
          resolveCallContext: runtimeCallState.info.resolveCallContext,
          resolveCallResult: runtimeCallState.info.resolveCallResult,
          ...(runtimeCallState.info.cssValueText
            ? { cssValueText: runtimeCallState.info.cssValueText }
            : {}),
        }
      : null;
  const markAsRuntimeCall = (call: CallExpressionNode): void => {
    runtimeCallState.info = {
      resolveCallContext: {
        callSiteFilePath: ctx.filePath,
        calleeImportedName: "<local>",
        calleeSource: { kind: "specifier", value: ctx.filePath },
        args: [],
        ...(call.loc?.start
          ? { loc: { line: call.loc.start.line, column: call.loc.start.column } }
          : {}),
      },
      resolveCallResult: { preserveRuntimeCall: true },
    };
  };
  const markFirstRuntimeCallInBranch = (branch: unknown): void => {
    const pending = [branch];
    const seen = new Set<unknown>();

    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || typeof current !== "object" || seen.has(current)) {
        continue;
      }
      seen.add(current);

      if (isCallExpressionNode(current)) {
        markAsRuntimeCall(current);
        return;
      }

      const node = current as {
        type?: string;
        left?: unknown;
        right?: unknown;
        expressions?: unknown[];
        expression?: unknown;
        test?: unknown;
        consequent?: unknown;
        alternate?: unknown;
      };
      if (node.type === "BinaryExpression" || node.type === "LogicalExpression") {
        pending.push(node.left, node.right);
      } else if (node.type === "TemplateLiteral") {
        pending.push(...(node.expressions ?? []));
      } else if (node.type === "ConditionalExpression") {
        pending.push(node.test, node.consequent, node.alternate);
      } else if (node.expression) {
        pending.push(node.expression);
      }
    }
  };

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
      if (!node || typeof node !== "object" || !isMemberExpression(node as { type?: string })) {
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
    if (!node || typeof node !== "object" || !isMemberExpression(node as { type?: string })) {
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

  type BranchUsage = "props" | "create";
  type BranchDynamicArgUsage = NonNullable<CallResolveResultWithExpr["dynamicArgUsage"]>;
  type ResolvedCallBranch = {
    expr: string;
    imports: ImportSpec[];
    usage?: BranchUsage;
    dynamicArgUsage?: BranchDynamicArgUsage;
  };
  type BranchResolveMode = "default" | "optional";
  type Branch = {
    usage: BranchUsage;
    expr: string;
    imports: ImportSpec[];
    cssValueText?: string;
    dynamicArgUsage?: BranchDynamicArgUsage;
  } | null;

  // Determine expected usage from context:
  // - Has CSS property -> "create" (CSS value)
  // - No CSS property -> "props" (StyleX reference)
  const expectedUsage: BranchUsage = node.css.property ? "create" : "props";

  const branchToExpr = (b: unknown, mode: BranchResolveMode = "default"): Branch => {
    const resolveValue =
      mode === "optional" ? (ctx.resolveValueOptional ?? ctx.resolveValue) : ctx.resolveValue;
    const resolverCtx: InternalHandlerContext =
      mode === "optional"
        ? {
            ...ctx,
            resolveValue,
            resolveCall: ctx.resolveCallOptional ?? ctx.resolveCall,
          }
        : ctx;
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
        ...(typeof v === "string" ? { cssValueText: v } : {}),
      };
    }
    if (!b || typeof b !== "object") {
      return null;
    }

    if ((b as { type?: string }).type === "BinaryExpression") {
      const binary = b as { operator?: string; left?: unknown; right?: unknown };
      if (isCssCalcOperator(binary.operator)) {
        const left = branchToExpr(binary.left, mode);
        const right = branchToExpr(binary.right, mode);
        if (
          left &&
          right &&
          left.usage === expectedUsage &&
          right.usage === expectedUsage &&
          (left.imports.length > 0 || right.imports.length > 0) &&
          isCssCalcSafeOperand(left) &&
          isCssCalcSafeOperand(right)
        ) {
          if (left.dynamicArgUsage || right.dynamicArgUsage) {
            markFirstRuntimeCallInBranch(left.dynamicArgUsage ? binary.left : binary.right);
            return null;
          }
          return {
            usage: expectedUsage,
            expr: buildCssCalcExprSource(left, binary.operator!, right),
            imports: [...left.imports, ...right.imports],
          };
        }
      }
    }

    // Check if a call expression has any arguments that are theme member accesses
    // (e.g., props.theme.isDark or theme.color.bgBase).
    const callHasThemeArg = (call: CallExpressionNode): boolean =>
      (call.arguments ?? []).some((arg: unknown) => {
        if (
          !arg ||
          typeof arg !== "object" ||
          (arg as { type?: string }).type !== "MemberExpression"
        ) {
          return false;
        }
        if (propsParamName) {
          const parts = getMemberPathFromIdentifier(
            arg as Parameters<typeof getMemberPathFromIdentifier>[0],
            propsParamName,
          );
          return parts !== null && parts[0] === "theme" && parts.length > 1;
        }
        if (themeBindingName) {
          const parts = getMemberPathFromIdentifier(
            arg as Parameters<typeof getMemberPathFromIdentifier>[0],
            themeBindingName,
          );
          return parts !== null && parts.length > 0;
        }
        return false;
      });

    // Helper to resolve call expressions (simple or curried) via adapter.
    // Preserves the full CallResolveResult including `kind` for proper CSS value vs StyleX ref detection.
    // Also tracks preserveRuntimeCall results so the caller can emit runtimeCallOnly.
    // For local (non-imported) functions with theme args, automatically marks as runtime call.
    const resolveCallExpr = (
      call: CallExpressionNode,
      cssProperty: string | undefined,
    ): ResolvedCallBranch | null => {
      const res = resolveImportedHelperCall(
        call,
        resolverCtx,
        propsParamName,
        cssProperty,
        themeBindingName,
      );
      if (res.kind === "resolved") {
        if ("expr" in res.result) {
          if ("preserveRuntimeCall" in res.result && res.result.preserveRuntimeCall) {
            runtimeCallState.info = {
              resolveCallContext: res.resolveCallContext,
              resolveCallResult: res.resolveCallResult,
              cssValueText: res.result.expr,
            };
          }
          return res.result;
        }
        if ("preserveRuntimeCall" in res.result && res.result.preserveRuntimeCall) {
          runtimeCallState.info = {
            resolveCallContext: res.resolveCallContext,
            resolveCallResult: res.resolveCallResult,
          };
          return null;
        }
      }
      // Try curried pattern: helper(...)(propsParam)
      if (isCallExpressionNode(call.callee)) {
        const inner = call.callee;
        const outerArgs = call.arguments ?? [];
        if (
          outerArgs.length === 1 &&
          isCurrentCurriedHelperContextArg(outerArgs[0], propsParamName, themeBindingName)
        ) {
          const innerRes = resolveImportedHelperCall(
            inner,
            resolverCtx,
            propsParamName,
            cssProperty,
            themeBindingName,
          );
          if (innerRes.kind === "resolved") {
            if ("expr" in innerRes.result) {
              if ("preserveRuntimeCall" in innerRes.result && innerRes.result.preserveRuntimeCall) {
                runtimeCallState.info = {
                  resolveCallContext: innerRes.resolveCallContext,
                  resolveCallResult: innerRes.resolveCallResult,
                  cssValueText: innerRes.result.expr,
                };
              }
              return innerRes.result;
            }
            if ("preserveRuntimeCall" in innerRes.result && innerRes.result.preserveRuntimeCall) {
              runtimeCallState.info = {
                resolveCallContext: innerRes.resolveCallContext,
                resolveCallResult: innerRes.resolveCallResult,
              };
              return null;
            }
          }
        }
      }
      // Local (non-imported) or unresolvable call with theme args:
      // preserve the call at runtime so the expression stays intact.
      if (callHasThemeArg(call)) {
        markAsRuntimeCall(call);
      }
      return null;
    };

    // Handle template literals with theme or call interpolations
    // e.g., `inset 0 0 0 1px ${props.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06)`
    // e.g., `linear-gradient(to bottom, ${color("bgSub")(props)} 70%, rgba(0, 0, 0, 0) 100%)`
    // Template literals always need CSS values, so always pass cssProperty
    let templateHasDynamicArgUsage = false;
    const templateResult = resolveTemplateLiteralExpressions(b, (expr) => {
      // First try theme member expression
      const themeInfo = resolveThemeFromMemberExpr(expr);
      if (themeInfo) {
        const res = resolveValue({
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
        if (callRes?.dynamicArgUsage) {
          templateHasDynamicArgUsage = true;
          markAsRuntimeCall(expr);
        }
        return callRes ? { expr: callRes.expr, imports: callRes.imports } : null;
      }
      return null;
    });
    if (templateResult) {
      if (templateHasDynamicArgUsage && runtimeCallState.info) {
        runtimeCallState.info.cssValueText = templateResult.expr;
      }
      return {
        usage: "create",
        ...templateResult,
        cssValueText: templateResult.expr,
        ...(templateHasDynamicArgUsage ? { dynamicArgUsage: "call" } : {}),
      };
    }

    if (isCallExpressionNode(b)) {
      // helper(...) or helper(...)(props)
      // Pass cssProperty to let the adapter decide based on context
      const resolved = resolveCallExpr(b, node.css.property);
      if (resolved) {
        // Use adapter's explicit `kind` if provided, otherwise infer from cssProperty context
        const isCssValue = isAdapterResultCssValue(resolved, node.css.property);
        const usage: BranchUsage = isCssValue ? "create" : "props";
        return {
          usage,
          expr: resolved.expr,
          imports: resolved.imports,
          cssValueText: resolved.expr,
          ...(resolved.dynamicArgUsage ? { dynamicArgUsage: resolved.dynamicArgUsage } : {}),
        };
      }
      return null;
    }

    // Handle direct MemberExpression theme access (reuse the helper)
    const themeInfo = resolveThemeFromMemberExpr(b);
    if (themeInfo) {
      const res = resolveValue({
        kind: "theme",
        path: themeInfo.path,
        filePath: ctx.filePath,
        loc: getNodeLocStart(b) ?? undefined,
      });
      if (!res) {
        return null;
      }
      return { usage: expectedUsage, expr: res.expr, imports: res.imports, cssValueText: res.expr };
    }

    const importedInfo = extractRootAndPath(b);
    if (importedInfo) {
      const imp = ctx.resolveImport(importedInfo.rootName, importedInfo.rootNode);
      if (imp) {
        const res = resolveValue({
          kind: "importedValue",
          importedName: imp.importedName,
          source: imp.source,
          path: importedInfo.path.length > 0 ? importedInfo.path.join(".") : undefined,
          filePath: ctx.filePath,
          loc: getNodeLocStart(b) ?? undefined,
        });
        if (res) {
          return {
            usage: expectedUsage,
            expr: res.expr,
            imports: res.imports,
            cssValueText: res.expr,
          };
        }
      }
    }
    return null;
  };

  const getBranch = (value: unknown): Branch => {
    return branchToExpr(value);
  };

  const getBranchOptional = (value: unknown): Branch => {
    return branchToExpr(value, "optional");
  };

  const isEmptyCssInterpolationBranch = (value: unknown): boolean => isEmptyCssBranch(value);

  const resolveThemeBooleanStyleValue = (
    branch: unknown,
  ): { value: unknown; imports: ImportSpec[]; cssValueText?: string } | null => {
    if (isEmptyCssBranch(branch)) {
      return null;
    }
    const raw = literalToStaticValue(branch);
    if (raw !== null && typeof raw !== "boolean") {
      return {
        value: raw,
        imports: [],
        ...(typeof raw === "string" ? { cssValueText: raw } : {}),
      };
    }

    const themeInfo = resolveThemeFromMemberExpr(branch);
    if (themeInfo) {
      const resolveTheme = ctx.resolveValueOptional ?? ctx.resolveValue;
      const res = resolveTheme({
        kind: "theme",
        path: themeInfo.path,
        filePath: ctx.filePath,
        loc: getNodeLocStart(branch) ?? undefined,
      });
      if (!res) {
        return null;
      }
      const astNode = parseExpr(ctx.api, res.expr);
      return astNode ? { value: astNode, imports: res.imports, cssValueText: res.expr } : null;
    }

    const resolved = getBranchOptional(branch);
    if (!resolved || resolved.usage !== "create") {
      return null;
    }
    if (resolved.dynamicArgUsage) {
      if (isCallExpressionNode(branch)) {
        markAsRuntimeCall(branch);
      }
      return null;
    }

    const astNode = parseExpr(ctx.api, resolved.expr);
    return astNode
      ? {
          value: astNode,
          imports: resolved.imports,
          cssValueText: resolved.cssValueText ?? resolved.expr,
        }
      : null;
  };

  const themeBoolInfo = checkThemeBooleanTest(body.test);
  if (themeBoolInfo && node.css.property) {
    const { consequent, alternate } = body;
    // Determine true/false branches based on negation
    const trueBranch = themeBoolInfo.isNegated ? alternate : consequent;
    const falseBranch = themeBoolInfo.isNegated ? consequent : alternate;

    let runtimeCallBranch: RuntimeCallBranch | null = null;
    const noteRuntimeCallBranch = (branch: RuntimeCallBranch, before: RuntimeCallInfo | null) => {
      if (runtimeCallState.info === before) {
        return;
      }
      runtimeCallBranch = runtimeCallBranch && runtimeCallBranch !== branch ? "both" : branch;
    };

    const beforeTrueResolve = runtimeCallState.info;
    const trueResolved = resolveThemeBooleanStyleValue(trueBranch);
    noteRuntimeCallBranch("true", beforeTrueResolve);
    const beforeFalseResolve = runtimeCallState.info;
    const falseResolved = resolveThemeBooleanStyleValue(falseBranch);
    noteRuntimeCallBranch("false", beforeFalseResolve);
    const trueValue = trueResolved?.value ?? null;
    const falseValue = falseResolved?.value ?? null;
    const trueImports = trueResolved?.imports ?? [];
    const falseImports = falseResolved?.imports ?? [];
    const trueCssValueText = trueResolved?.cssValueText;
    const falseCssValueText = falseResolved?.cssValueText;

    if (trueValue !== null && falseValue !== null) {
      const runtimeCallInfo = runtimeCallState.info;
      return {
        type: "splitThemeBooleanVariants",
        cssProp: node.css.property,
        themeProp: themeBoolInfo.themeProp,
        trueValue,
        falseValue,
        trueImports,
        falseImports,
        ...(trueCssValueText ? { trueCssValueText } : {}),
        ...(falseCssValueText ? { falseCssValueText } : {}),
        ...(runtimeCallInfo?.resolveCallResult
          ? { runtimeResolveCallResult: runtimeCallInfo.resolveCallResult }
          : {}),
        ...(runtimeCallInfo?.cssValueText
          ? { runtimeCssValueText: runtimeCallInfo.cssValueText }
          : {}),
      };
    }

    if (
      (trueValue === null) !== (falseValue === null) &&
      isEmptyCssInterpolationBranch(trueValue === null ? trueBranch : falseBranch)
    ) {
      return null;
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
      if (inlineStyleFallback.type === "splitThemeBooleanWithInlineStyleFallback") {
        const resolvedRuntimeBranch = inlineStyleFallback.resolvedBranchIsTrue ? "true" : "false";
        if (runtimeCallBranch === resolvedRuntimeBranch || runtimeCallBranch === "both") {
          return null;
        }
      }
      return inlineStyleFallback;
    }
    // Can't resolve branches as static values - fall through to other handlers
    // which may bail with a warning
  }

  // Convert `prop ? value : undefined/null/false/""` into a positive-only
  // `splitVariantsResolved*` result (one variant bucket gated on `prop`).
  // Returns null when both branches resolve, or when the alternate isn't an
  // empty CSS sentinel — the caller continues with two-side handling or falls
  // back to a dynamic style function.
  //
  // We intentionally do NOT handle the inverse `prop ? undefined : value`
  // here: `splitVariantsResolved*` treats variants whose `when` starts with
  // `!` as the unconditional default (applied directly to `styleObj`), so
  // emitting a single negated variant would silently drop the `!prop` gate
  // and apply the value unconditionally. Inverse forms continue to be lowered
  // by the dynamic style-function fallback, which is correct (just less
  // optimal).
  const buildOneSidedVariantResult = (args: {
    cons: Branch;
    alt: Branch;
    alternate: unknown;
    truthyWhen: string;
  }): HandlerResult | null => {
    const { cons, alt, alternate, truthyWhen } = args;
    if (!cons || alt || !isEmptyCssBranch(alternate)) {
      return null;
    }
    const variants = [
      { nameHint: "truthy" as const, when: truthyWhen, expr: cons.expr, imports: cons.imports },
    ];
    return cons.usage === "props"
      ? { type: "splitVariantsResolvedStyles", variants }
      : { type: "splitVariantsResolvedValue", variants };
  };

  // Helper: resolve a 4-branch compound ternary once both the outer prop and inner prop
  // have been identified. Returns null if leaf branches can't all be resolved as "create".
  const tryBuildDualBranchResult = (outerProp: string, innerProp: string): HandlerResult | null => {
    const otit = getBranch((consequent as any).consequent);
    const otif = getBranch((consequent as any).alternate);
    const ofit = getBranch((alternate as any).consequent);
    const ofif = getBranch((alternate as any).alternate);
    if (
      !otit ||
      !otif ||
      !ofit ||
      !ofif ||
      otit.usage !== "create" ||
      otif.usage !== "create" ||
      ofit.usage !== "create" ||
      ofif.usage !== "create"
    ) {
      return null;
    }
    return {
      type: "dualBranchCompoundVariantsResolvedValue",
      outerProp,
      innerProp,
      outerTruthyInnerTruthy: { expr: otit.expr, imports: otit.imports },
      outerTruthyInnerFalsy: { expr: otif.expr, imports: otif.imports },
      outerFalsyInnerTruthy: { expr: ofit.expr, imports: ofit.imports },
      outerFalsyInnerFalsy: { expr: ofif.expr, imports: ofif.imports },
    };
  };

  // Helper to extract condition info from a binary expression test.
  // Supports both `props.foo === "x"` (MemberExpression) and destructured `foo === "x"` (Identifier).
  // Also resolves enum member expressions (e.g., `ProgressType.success` → "success").
  type CondInfo = { propName: string; rhsValue: string; rhsRaw: unknown; cond: string } | null;
  const extractConditionInfo = (test: any): CondInfo => {
    if (test.type !== "BinaryExpression" || (test.operator !== "===" && test.operator !== "!==")) {
      return null;
    }
    const rhsRaw = resolveStaticExpressionValue(test.right, ctx.enumValueMap);
    if (rhsRaw === null) {
      return null;
    }
    // 1) MemberExpression: props.foo === "x"
    if (paramName && test.left.type === "MemberExpression") {
      const leftPath = getMemberPathFromIdentifier(test.left, paramName);
      const firstLeftPath = leftPath?.[0];
      if (leftPath && leftPath.length === 1 && firstLeftPath) {
        const rhsValue = JSON.stringify(rhsRaw);
        return {
          propName: firstLeftPath,
          rhsValue,
          rhsRaw,
          cond: `${firstLeftPath} ${test.operator} ${rhsValue}`,
        };
      }
    }
    // 2) Identifier with destructured bindings: ({ center }) => center === true
    if (paramBindings?.kind === "destructured" && test.left.type === "Identifier") {
      const propName = resolveIdentifierToPropName(test.left, paramBindings);
      if (propName) {
        const rhsValue = JSON.stringify(rhsRaw);
        return { propName, rhsValue, rhsRaw, cond: `${propName} ${test.operator} ${rhsValue}` };
      }
    }
    return null;
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

    // Check for 4-branch compound ternary: outerProp ? (innerProp ? A : B) : (innerProp ? C : D)
    // where both consequent and alternate are conditionals testing the same inner prop
    if (
      !cons &&
      !alt &&
      consequent.type === "ConditionalExpression" &&
      alternate.type === "ConditionalExpression" &&
      paramName
    ) {
      const consInnerTest = (consequent as any).test;
      const altInnerTest = (alternate as any).test;
      const consInnerPath =
        consInnerTest?.type === "MemberExpression"
          ? getMemberPathFromIdentifier(consInnerTest, paramName)
          : null;
      const altInnerPath =
        altInnerTest?.type === "MemberExpression"
          ? getMemberPathFromIdentifier(altInnerTest, paramName)
          : null;
      const consInnerProp = consInnerPath?.[0];
      const altInnerProp = altInnerPath?.[0];

      if (
        consInnerPath?.length === 1 &&
        altInnerPath?.length === 1 &&
        consInnerProp &&
        consInnerProp === altInnerProp &&
        consInnerProp !== outerProp
      ) {
        const result = tryBuildDualBranchResult(outerProp, consInnerProp);
        if (result) {
          return result;
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

    // Positive-only variant for `prop ? value : undefined/null/false/""` —
    // styled-components treats falsy interpolations as "omit this declaration",
    // so model it as a single-side variant bucket rather than emitting a
    // dynamic style function (which would clash with pseudo overrides on the
    // same property elsewhere in the rule).
    const oneSided = buildOneSidedVariantResult({
      cons,
      alt,
      alternate,
      truthyWhen: outerProp,
    });
    if (oneSided) {
      return oneSided;
    }

    if (!cons || !alt) {
      return buildRuntimeCallResult();
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
    const whens = destructuredBooleanWhens(destructuredProp, getArrowFnParamBindings(expr));
    if (whens) {
      const cons = getBranch(consequent);
      const alt = getBranch(alternate);
      if (cons && alt) {
        const allUsages = new Set([cons.usage, alt.usage]);
        if (allUsages.size === 1) {
          const usage = cons.usage;
          const variants = [
            {
              nameHint: "truthy",
              when: whens.truthy,
              expr: cons.expr,
              imports: cons.imports,
            },
            {
              nameHint: "falsy",
              when: whens.falsy,
              expr: alt.expr,
              imports: alt.imports,
            },
          ];
          return usage === "props"
            ? { type: "splitVariantsResolvedStyles", variants }
            : { type: "splitVariantsResolvedValue", variants };
        }
      }
      const oneSided = buildOneSidedVariantResult({
        cons,
        alt,
        alternate,
        truthyWhen: whens.truthy,
      });
      if (oneSided) {
        return oneSided;
      }
      if (!cons || !alt) {
        return buildRuntimeCallResult();
      }
    }
  }

  // 1c) Destructured params + bare Identifier test: ({ inline }) => inline ? "inline-flex" : "flex"
  // When the arrow function has destructured params (not theme), a bare Identifier in the test
  // refers to a destructured prop. Resolve it and handle like MemberExpression test.
  if (
    paramBindings?.kind === "destructured" &&
    test.type === "Identifier" &&
    typeof test.name === "string"
  ) {
    const resolvedProp = resolveIdentifierToPropName(test, paramBindings);
    const resolvedWhens = resolvedProp
      ? destructuredBooleanWhens(resolvedProp, paramBindings)
      : null;
    if (resolvedProp && resolvedWhens) {
      const cons = getBranch(consequent);
      const alt = getBranch(alternate);
      if (cons && alt) {
        const allUsages = new Set([cons.usage, alt.usage]);
        if (allUsages.size === 1) {
          const usage = cons.usage;
          const variants = [
            {
              nameHint: "truthy",
              when: resolvedWhens.truthy,
              expr: cons.expr,
              imports: cons.imports,
            },
            { nameHint: "falsy", when: resolvedWhens.falsy, expr: alt.expr, imports: alt.imports },
          ];
          return usage === "props"
            ? { type: "splitVariantsResolvedStyles", variants }
            : { type: "splitVariantsResolvedValue", variants };
        }
      }

      // 4-branch compound ternary with destructured params:
      //   ({ column, reverse }) => column ? (reverse ? A : B) : (reverse ? C : D)
      if (
        !cons &&
        !alt &&
        consequent.type === "ConditionalExpression" &&
        alternate.type === "ConditionalExpression"
      ) {
        const innerPropCons = resolveIdentifierToPropName((consequent as any).test, paramBindings);
        const innerPropAlt = resolveIdentifierToPropName((alternate as any).test, paramBindings);
        if (innerPropCons && innerPropCons === innerPropAlt && innerPropCons !== resolvedProp) {
          const result = tryBuildDualBranchResult(resolvedProp, innerPropCons);
          if (result) {
            return result;
          }
        }
      }

      const oneSided = buildOneSidedVariantResult({
        cons,
        alt,
        alternate,
        truthyWhen: resolvedWhens.truthy,
      });
      if (oneSided) {
        return oneSided;
      }
      if (!cons || !alt) {
        return buildRuntimeCallResult();
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

  return buildRuntimeCallResult();
}

function isCssCalcOperator(operator: string | undefined): operator is "+" | "-" | "*" | "/" {
  return operator === "+" || operator === "-" || operator === "*" || operator === "/";
}

function isCssCalcSafeOperand(branch: { expr: string; imports: ImportSpec[] }): boolean {
  return branch.imports.length > 0 || isNumericExpressionSource(branch.expr);
}

function isNumericExpressionSource(expr: string): boolean {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(expr);
}

function buildCssCalcExprSource(
  left: { expr: string; imports: ImportSpec[] },
  operator: string,
  right: { expr: string; imports: ImportSpec[] },
): string {
  return `\`calc(${cssCalcOperandSource(left)} ${operator} ${cssCalcOperandSource(right)})\``;
}

function cssCalcOperandSource(branch: { expr: string; imports: ImportSpec[] }): string {
  return branch.imports.length > 0 ? `\${${branch.expr}}` : branch.expr;
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
  const bindings = !paramName ? getArrowFnParamBindings(expr) : null;
  if (!paramName && bindings?.kind !== "destructured") {
    return null;
  }

  // Support patterns like:
  //   ${(props) => props.$upsideDown && "transform: rotate(180deg);"}
  //   ${(props) => props.$upsideDown && `box-shadow: ${props.theme.color.x};`}
  //   ${({ wrap }) => wrap && "flex-wrap: wrap;"}
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
  // Resolve test to a prop name: props.$x → $x, or bare Identifier → prop name via bindings
  const testProp = paramName
    ? getSinglePropFromMemberExpr(left, paramName)
    : bindings?.kind === "destructured"
      ? resolveIdentifierToPropName(left, bindings)
      : null;
  if (!testProp) {
    return null;
  }
  const whens = destructuredBooleanWhens(testProp, bindings);
  if (!whens) {
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
      variants: [{ nameHint: "truthy", when: whens.truthy, style }],
    };
  }

  // Try template literal with theme expressions (only for simple param form)
  if (!paramName) {
    return null;
  }
  return resolveThemeTemplateToCssVariant(right, paramName, ctx, {
    nameHint: "truthy",
    when: whens.truthy,
  });
}

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
 * Shared pipeline: resolve a template literal with theme expressions into a
 * splitVariants result. Used by both the `&&` handler and the ternary handler.
 *
 * Steps: resolve template → strip backticks → parse CSS declarations → build variant.
 */
function resolveThemeTemplateToCssVariant(
  templateNode: unknown,
  paramName: string,
  ctx: InternalHandlerContext,
  variant: { nameHint: string; when: string },
): HandlerResult | null {
  const templateResult = resolveTemplateLiteralWithTheme(templateNode, paramName, ctx);
  if (!templateResult) {
    return null;
  }
  const templateText = templateResult.expr.slice(1, -1); // Remove backticks
  const parsed = parseCssDeclarationBlockWithTemplateExpr(templateText, ctx.api);
  if (!parsed) {
    return null;
  }
  return {
    type: "splitVariants",
    variants: [
      {
        nameHint: variant.nameHint,
        when: variant.when,
        style: parsed.styleObj,
        imports: templateResult.imports,
      },
    ],
  };
}

/**
 * Extract a single-segment prop path from a test expression (e.g. `props.$x` → `$x`).
 * Returns the prop name, or null if the test is not a simple single-level member expression.
 */
/**
 * Handle a ternary where one branch is a template literal with theme expressions
 * and the other is empty (undefined/null/false/""). Resolves the template literal
 * using the same approach as tryResolveConditionalCssBlock's && handler.
 */
function tryResolveTemplateLiteralTernaryWithEmptyBranch(
  body: { test: unknown; consequent: unknown; alternate: unknown },
  paramName: string,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const { consequent, alternate } = body;
  const consType = (consequent as { type?: string })?.type;
  const altType = (alternate as { type?: string })?.type;
  const consIsTemplate = consType === "TemplateLiteral";
  const altIsTemplate = altType === "TemplateLiteral";
  const consIsEmpty = isEmptyCssBranch(consequent);
  const altIsEmpty = isEmptyCssBranch(alternate);

  if (!(consIsTemplate && altIsEmpty) && !(consIsEmpty && altIsTemplate)) {
    return null;
  }

  const testProp = getSinglePropFromMemberExpr(body.test, paramName);
  if (!testProp) {
    return null;
  }

  const templateBranch = consIsTemplate ? consequent : alternate;
  // When the truthy branch is the template, use the test prop directly.
  // When the falsy branch is the template, negate the condition.
  const when = consIsTemplate ? testProp : `!${testProp}`;
  const nameHint = consIsTemplate ? "truthy" : "falsy";

  return resolveThemeTemplateToCssVariant(templateBranch, paramName, ctx, {
    nameHint,
    when,
  });
}

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

function isCurrentCurriedHelperContextArg(
  arg: unknown,
  propsParamName: string | undefined,
  themeBindingName: string | undefined,
): boolean {
  if (!arg || typeof arg !== "object") {
    return false;
  }
  const node = arg as {
    type?: string;
    name?: string;
    properties?: unknown[];
  };
  if (node.type === "Identifier") {
    return node.name === propsParamName || node.name === themeBindingName;
  }
  if (node.type !== "ObjectExpression" || node.properties?.length !== 1) {
    return false;
  }
  const property = node.properties[0] as {
    type?: string;
    computed?: boolean;
    key?: { type?: string; name?: string };
    value?: unknown;
  };
  if (
    (property.type !== "Property" && property.type !== "ObjectProperty") ||
    property.computed ||
    property.key?.type !== "Identifier" ||
    property.key.name !== "theme"
  ) {
    return false;
  }
  const value = property.value as { type?: string; name?: string } | null | undefined;
  if (value?.type === "Identifier" && value.name === themeBindingName) {
    return true;
  }
  if (propsParamName) {
    const valuePath = getMemberPathFromIdentifier(
      property.value as Parameters<typeof getMemberPathFromIdentifier>[0],
      propsParamName,
    );
    return valuePath?.length === 1 && valuePath[0] === "theme";
  }
  return false;
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
  themeBoolInfo: { themeProp: string };
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

  // Transform the unresolvable branch: replace props.theme.* / <param>.theme.* with theme.*
  const transformed = replaceThemeRefsWithHookVar(unresolvableBranch, paramName, info);
  if (!transformed) {
    return null;
  }

  // Verify the transformation replaced all param/theme binding references.
  // Dangling references (e.g. non-theme prop accesses) would produce undefined variables at runtime.
  if (!isFullyTransformedThemeExpr(transformed, paramName, info)) {
    return null;
  }

  return {
    type: "splitThemeBooleanWithInlineStyleFallback",
    cssProp,
    themeProp: themeBoolInfo.themeProp,
    resolvedValue: resolvedBranchIsTrue ? trueValue : falseValue,
    resolvedImports: resolvedBranchIsTrue ? trueImports : falseImports,
    resolvedBranchIsTrue,
    inlineExpr: transformed,
  };
}

/**
 * Validates that a transformed expression has no dangling references to
 * the original arrow function parameter or theme binding name.
 * After `replaceThemeRefsWithHookVar`, all `<paramName>.theme.*` should
 * have been rewritten to `theme.*`. If the param name still appears,
 * the expression accesses non-theme props and can't be safely used
 * with `useTheme()` alone.
 */
function isFullyTransformedThemeExpr(
  transformed: unknown,
  paramName: string | null,
  info: ThemeParamInfo | null,
): boolean {
  const ids = new Set<string>();
  collectFreeIdentifiers(transformed, ids);
  if (paramName && ids.has(paramName)) {
    return false;
  }
  if (info?.kind === "themeBinding") {
    if (info.themeName !== "theme" && ids.has(info.themeName)) {
      return false;
    }
    // Reject expressions that reference destructured sibling bindings
    // (e.g., `enabled` from `({ theme, enabled }) => ...`) since only
    // `theme` is available via useTheme() in the generated wrapper.
    if (info.siblingBindings.some((b) => ids.has(b))) {
      return false;
    }
  }
  return true;
}

/**
 * Collects free variable identifiers from an AST node, excluding
 * non-computed property names in member expressions (e.g., in
 * `theme.color.bgSub`, only `theme` is a free variable; `color`
 * and `bgSub` are property accesses, not variable references).
 */
function collectFreeIdentifiers(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectFreeIdentifiers(child, out);
    }
    return;
  }
  const typed = node as Record<string, unknown>;
  const nodeType = typed.type as string | undefined;

  // For member expressions, only recurse into the object (left side).
  // Skip the property name unless it's computed (bracket notation).
  if (nodeType === "MemberExpression" || nodeType === "OptionalMemberExpression") {
    collectFreeIdentifiers(typed.object, out);
    if (typed.computed) {
      collectFreeIdentifiers(typed.property, out);
    }
    return;
  }

  if (nodeType === "Identifier" && typeof typed.name === "string") {
    out.add(typed.name);
  }

  for (const key of Object.keys(typed)) {
    if (key === "loc" || key === "comments" || key === "type") {
      continue;
    }
    const child = typed[key];
    if (child && typeof child === "object") {
      collectFreeIdentifiers(child, out);
    }
  }
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
    if (info?.kind === "propsParam" && paramName && isMemberExpression(n)) {
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

/**
 * Builds truthy/falsy `when` condition strings for a destructured boolean-ish prop,
 * accounting for destructuring defaults. A default applies only when the prop is
 * `undefined`, so a statically-truthy default means the truthy branch must also
 * apply when the prop is unset (`prop === undefined || prop`).
 *
 * Returns null when the prop has a default whose truthiness cannot be determined
 * statically — callers should fall back to other handlers instead of emitting a
 * condition that ignores the default.
 */
function destructuredBooleanWhens(
  propName: string,
  bindings: ArrowFnParamBindings | null,
): { truthy: string; falsy: string } | null {
  if (bindings?.kind !== "destructured" || !bindings.defaults?.has(propName)) {
    return { truthy: propName, falsy: `!${propName}` };
  }
  const defaultValue = literalToStaticValue(bindings.defaults.get(propName));
  if (defaultValue === null) {
    return null;
  }
  if (defaultValue) {
    const truthy = `${propName} === undefined || ${propName}`;
    return { truthy, falsy: `!(${truthy})` };
  }
  return { truthy: propName, falsy: `!${propName}` };
}
