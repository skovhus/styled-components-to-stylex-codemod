import type { API } from "jscodeshift";
import type {
  CallResolveContext,
  CallResolveResult,
  ImportSource,
  ImportSpec,
  ResolveValueContext,
  ResolveValueResult,
} from "../adapter.js";
import {
  getArrowFnSingleParamName,
  getMemberPathFromIdentifier,
  isArrowFunctionExpression,
} from "./jscodeshift-utils.js";
import { cssDeclarationToStylexDeclarations } from "./css-prop-mapping.js";

export type DynamicNode = {
  slotId: number;
  expr: unknown;
  css: DynamicNodeCssContext;
  component: DynamicNodeComponentContext;
  usage: DynamicNodeUsageContext;
  loc?: DynamicNodeLoc;
};

export type HandlerResult =
  | {
      /**
       * The node was resolved to a JS expression string that can be directly inlined into
       * generated output (typically for a single CSS property value).
       *
       * Example: `props.theme.color.bgBase` -> `themeVars.bgBase`
       *
       * The caller is responsible for:
       * - parsing `expr` into an AST
       * - adding `imports`
       */
      type: "resolvedValue";
      expr: string;
      imports: ImportSpec[];
    }
  | {
      /**
       * The node was resolved to a StyleX style object expression suitable for passing to
       * `stylex.props(...)` (NOT to be used as a single CSS property value).
       *
       * Example: `themedBorder("labelMuted")(props)` -> `borders.labelMuted`
       */
      type: "resolvedStyles";
      expr: string;
      imports: ImportSpec[];
    }
  | {
      /**
       * Emit a wrapper inline style from a raw CSS string snippet.
       *
       * This is intentionally narrow and primarily used for keeping runtime parity
       * when the codemod cannot safely lower to StyleX (e.g. complex dynamic blocks).
       */
      type: "emitInlineStyle";
      style: string;
    }
  | {
      /**
       * Preserve the dynamic value by emitting a wrapper inline style:
       *   style={{ ..., prop: expr(props) }}
       *
       * This is used for cases where we can't (or don't want to) lower into StyleX
       * buckets, but can safely keep parity with styled-components at runtime.
       */
      type: "emitInlineStyleValueFromProps";
    }
  | {
      /**
       * Emit a StyleX style function keyed off a single JSX prop.
       *
       * The caller uses this to generate a helper like:
       *   const styles = stylex.create({
       *     boxShadowFromProp: (shadow) => ({ boxShadow: shadow })
       *   })
       *
       * And apply it conditionally in the wrapper:
       *   shadow != null && styles.boxShadowFromProp(shadow)
       */
      type: "emitStyleFunction";
      nameHint: string;
      params: string;
      body: string;
      call: string;
      /**
       * Optional value transform to apply to the param before assigning to the style prop.
       * This allows supporting patterns like:
       *   box-shadow: ${(props) => shadow(props.shadow)};
       * by emitting a style function that computes: `shadow(value)`.
       */
      valueTransform?: { kind: "call"; calleeIdent: string };
      /**
       * Wrap the computed value in a template literal (e.g. `${expr}`) to satisfy
       * StyleX lint rules that require string literals.
       */
      wrapValueInTemplateLiteral?: boolean;
    }
  | {
      /**
       * Split a dynamic interpolation into one or more variant buckets.
       *
       * Each variant contains a static StyleX-style object. The caller is responsible for
       * wiring these into `stylex.create(...)` keys and applying them under the `when` condition.
       */
      type: "splitVariants";
      variants: Array<{
        nameHint: string;
        when: string;
        style: Record<string, unknown>;
      }>;
    }
  | {
      /**
       * Like `splitVariants`, but each branch produces a JS expression string
       * (which may come from adapter theme resolution) rather than a static literal.
       */
      type: "splitVariantsResolvedValue";
      variants: Array<{
        nameHint: string;
        when: string;
        expr: string;
        imports: ImportSpec[];
      }>;
    }
  | {
      /**
       * Like `splitVariantsResolvedValue`, but each branch yields a StyleX style object expression
       * intended for `stylex.props(...)` arguments.
       */
      type: "splitVariantsResolvedStyles";
      variants: Array<{
        nameHint: string;
        when: string;
        expr: string;
        imports: ImportSpec[];
      }>;
    }
  | {
      /**
       * Split a multi-prop nested ternary like `outer ? A : inner ? B : C` where
       * outer and inner test different boolean props.
       *
       * Example: `disabled ? bgBase : checked ? bgSub : bgBase`
       *
       * The caller emits variant buckets for each branch and wires them into a
       * compound ternary at usage time:
       *   `disabled ? styles.xDisabled : checked ? styles.xCheckedTrue : styles.xCheckedFalse`
       */
      type: "splitMultiPropVariantsResolvedValue";
      outerProp: string;
      outerTruthyBranch: { expr: string; imports: ImportSpec[] };
      innerProp: string;
      innerTruthyBranch: { expr: string; imports: ImportSpec[] };
      innerFalsyBranch: { expr: string; imports: ImportSpec[] };
    }
  | {
      /**
       * Signal that this handler does not know how to transform the node.
       *
       * The caller typically falls back to other strategies (or drops the declaration)
       * and may surface `reason` as a warning.
       */
      type: "keepOriginal";
      reason: string;
    };

export type InternalHandlerContext = {
  api: API;
  filePath: string;
  resolveValue: (context: ResolveValueContext) => ResolveValueResult | null;
  resolveCall: (context: CallResolveContext) => CallResolveResult | null;
  resolveImport: (localName: string) => {
    importedName: string;
    source: ImportSource;
  } | null;
  warn: (warning: HandlerWarning) => void;
};

type ThemeParamInfo =
  | { kind: "propsParam"; propsName: string }
  | { kind: "themeBinding"; themeName: string };

function getArrowFnThemeParamInfo(fn: any): ThemeParamInfo | null {
  if (!fn || fn.params?.length !== 1) {
    return null;
  }
  const p = fn.params[0];
  if (p?.type === "Identifier" && typeof p.name === "string") {
    return { kind: "propsParam", propsName: p.name };
  }
  if (p?.type !== "ObjectPattern" || !Array.isArray(p.properties)) {
    return null;
  }
  for (const prop of p.properties) {
    if (!prop || (prop.type !== "Property" && prop.type !== "ObjectProperty")) {
      continue;
    }
    const key = prop.key;
    if (!key || key.type !== "Identifier" || key.name !== "theme") {
      continue;
    }
    const value = prop.value;
    if (value?.type === "Identifier" && typeof value.name === "string") {
      return { kind: "themeBinding", themeName: value.name };
    }
    if (
      value?.type === "AssignmentPattern" &&
      value.left?.type === "Identifier" &&
      typeof value.left.name === "string"
    ) {
      return { kind: "themeBinding", themeName: value.left.name };
    }
  }
  return null;
}

type CssNodeKind = "declaration" | "selector" | "atRule" | "keyframes";

type DynamicNodeCssContext = {
  kind: CssNodeKind;
  selector: string;
  atRuleStack: string[];
  property?: string;
  valueRaw?: string;
};

type DynamicNodeComponentContext = {
  localName: string;
  base: "intrinsic" | "component";
  tagOrIdent: string;
  withConfig?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
};

type DynamicNodeUsageContext = {
  jsxUsages: number;
  hasPropsSpread: boolean;
};

type DynamicNodeLoc = {
  line?: number;
  column?: number;
};

type HandlerWarning = {
  feature: string;
  message: string;
  loc?: DynamicNodeLoc;
};

function tryResolveThemeAccess(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const info = getArrowFnThemeParamInfo(expr);
  if (!info) {
    return null;
  }
  const body = expr.body;
  if (body.type !== "MemberExpression") {
    return null;
  }
  const path = (() => {
    if (info.kind === "propsParam") {
      const parts = getMemberPathFromIdentifier(body, info.propsName);
      if (!parts || parts[0] !== "theme") {
        return null;
      }
      return parts.slice(1).join(".");
    }
    const parts = getMemberPathFromIdentifier(body, info.themeName);
    if (!parts) {
      return null;
    }
    return parts.join(".");
  })();
  if (!path) {
    return null;
  }

  const res = ctx.resolveValue({ kind: "theme", path, filePath: ctx.filePath });
  if (!res) {
    return null;
  }
  return { type: "resolvedValue", expr: res.expr, imports: res.imports };
}

function tryResolveCallExpression(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const expr: any = node.expr as any;
  if (!expr || typeof expr !== "object" || expr.type !== "CallExpression") {
    return null;
  }

  const resolveSimpleHelperCall = (
    callExpr: any,
  ): CallResolveResult | "keepOriginal" | "unresolved" => {
    // Only support the simplest call shape: `identifier("stringLiteral")` where identifier is a
    // named import we can trace back to a concrete file. Anything else should bail.
    if (callExpr.callee?.type !== "Identifier" || typeof callExpr.callee.name !== "string") {
      return "keepOriginal";
    }
    const calleeIdent = callExpr.callee.name;
    const imp = ctx.resolveImport(calleeIdent);
    const calleeImportedName = imp?.importedName;
    const calleeSource = imp?.source;
    if (!calleeImportedName || !calleeSource) {
      return "keepOriginal";
    }

    const rawArgs = callExpr.arguments ?? [];
    if (rawArgs.length !== 1) {
      return "keepOriginal";
    }
    const a = rawArgs[0];
    const arg0 =
      a && typeof a === "object" && a.type === "StringLiteral"
        ? ({
            kind: "literal" as const,
            value: a.value as string,
          } satisfies CallResolveContext["args"][number])
        : a && typeof a === "object" && a.type === "Literal" && typeof (a as any).value === "string"
          ? ({
              kind: "literal" as const,
              value: (a as any).value as string,
            } satisfies CallResolveContext["args"][number])
          : null;
    if (!arg0) {
      return "keepOriginal";
    }
    const args: CallResolveContext["args"] = [arg0];

    const res = ctx.resolveCall({
      callSiteFilePath: ctx.filePath,
      calleeImportedName,
      calleeSource,
      args,
    });
    return res ? (res as any) : "unresolved";
  };

  const simple = resolveSimpleHelperCall(expr);
  if (simple !== "keepOriginal" && simple !== "unresolved") {
    return simple.usage === "props"
      ? { type: "resolvedStyles", expr: simple.expr, imports: simple.imports }
      : { type: "resolvedValue", expr: simple.expr, imports: simple.imports };
  }

  // Support helper calls that return a function which is immediately invoked with the props param:
  //   helper("key")(props)
  // We treat this as equivalent to `helper("key")` when the adapter returns usage:"props" or "create".
  //
  // This is intentionally narrow and only used when the adapter explicitly opts in with usage:"props".
  if (expr.callee?.type === "CallExpression") {
    const outerArgs = expr.arguments ?? [];
    if (outerArgs.length === 1) {
      const innerCall = expr.callee;
      const innerRes = resolveSimpleHelperCall(innerCall);
      if (innerRes !== "keepOriginal" && innerRes !== "unresolved") {
        if (innerRes.usage === "create") {
          return {
            type: "keepOriginal",
            reason: [
              'Curried helper call resolved to usage "create".',
              'Use usage "props" when the helper returns a StyleX style object (for stylex.props).',
              'usage "create" is only valid for single CSS property values (non-curried calls).',
            ].join(" "),
          };
        }
        return { type: "resolvedStyles", expr: innerRes.expr, imports: innerRes.imports };
      }
    }
  }

  if (simple === "unresolved") {
    // This is a supported helper-call shape but the adapter chose not to resolve it.
    // Treat as unsupported so the caller can bail and surface a warning.
    const calleeIdent = expr.callee?.name;
    const imp = typeof calleeIdent === "string" ? ctx.resolveImport(calleeIdent) : null;
    const importedName = imp?.importedName ?? calleeIdent ?? "unknown";
    return {
      type: "keepOriginal",
      reason: `Unresolved helper call ${importedName}(...) (adapter resolveCall returned null)`,
    };
  }

  // If we got here, it’s a call expression we don’t understand.
  return {
    type: "keepOriginal",
    reason: 'Unsupported call expression (expected helper("literal") or helper("literal")(...))',
  };
}

function tryResolveConditionalValue(
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

  if (expr.body.type !== "ConditionalExpression") {
    return null;
  }

  type BranchUsage = "props" | "create";
  type Branch = { usage: BranchUsage; expr: string; imports: ImportSpec[] } | null;

  let invalidCurriedValue: string | null = null;
  const branchToExpr = (b: unknown): Branch => {
    const v = literalToStaticValue(b);
    if (v !== null) {
      return {
        usage: "create",
        expr: typeof v === "string" ? JSON.stringify(v) : String(v),
        imports: [],
      };
    }
    if (!b || typeof b !== "object") {
      return null;
    }
    if ((b as { type?: string }).type === "CallExpression") {
      const call = b as {
        type: "CallExpression";
        callee?: { type?: string; name?: string };
        arguments?: unknown[];
      };

      const resolveSimpleCall = (c: any): CallResolveResult | null => {
        const calleeIdent =
          c.callee && c.callee.type === "Identifier" ? (c.callee.name ?? null) : null;
        const arg0 = (() => {
          const a = c.arguments?.[0] as { type?: string; value?: unknown } | undefined;
          if (!a) {
            return null;
          }
          if (a.type === "StringLiteral") {
            return { kind: "literal" as const, value: a.value as string };
          }
          if (a.type === "Literal" && typeof a.value === "string") {
            return { kind: "literal" as const, value: a.value };
          }
          return null;
        })();
        if (!calleeIdent || !arg0 || (c.arguments?.length ?? 0) !== 1) {
          return null;
        }
        const imp = ctx.resolveImport(calleeIdent);
        if (!imp?.importedName || !imp.source) {
          return null;
        }
        const res = ctx.resolveCall({
          callSiteFilePath: ctx.filePath,
          calleeImportedName: imp.importedName,
          calleeSource: imp.source,
          args: [arg0],
        });
        return res as any;
      };

      // helper("key")
      const simple = resolveSimpleCall(call as any);
      if (simple) {
        return { usage: simple.usage, expr: simple.expr, imports: simple.imports };
      }

      // helper("key")(propsParam)
      if (call.callee && (call.callee as any).type === "CallExpression") {
        const inner = call.callee as any;
        const outerArgs = call.arguments ?? [];
        if (outerArgs.length === 1 && outerArgs[0] && typeof outerArgs[0] === "object") {
          const innerRes = resolveSimpleCall(inner);
          if (innerRes) {
            if (innerRes.usage === "create") {
              invalidCurriedValue = [
                'Curried helper call resolved to usage "create".',
                'Use usage "props" when the helper returns a StyleX style object (for stylex.props).',
                'usage "create" is only valid for single CSS property values (non-curried calls).',
              ].join(" ");
              return null;
            }
            return { usage: "props", expr: innerRes.expr, imports: innerRes.imports };
          }
        }
      }

      return null;
    }
    if ((b as any).type !== "MemberExpression") {
      return null;
    }
    const path = (() => {
      if (info?.kind === "propsParam" && paramName) {
        const parts = getMemberPathFromIdentifier(b as any, paramName);
        if (!parts || parts[0] !== "theme") {
          return null;
        }
        return parts.slice(1).join(".");
      }
      if (info?.kind === "themeBinding") {
        const parts = getMemberPathFromIdentifier(b as any, info.themeName);
        if (!parts) {
          return null;
        }
        return parts.join(".");
      }
      return null;
    })();
    if (!path) {
      return null;
    }
    const res = ctx.resolveValue({ kind: "theme", path, filePath: ctx.filePath });
    if (!res) {
      return null;
    }
    return { usage: "create", expr: res.expr, imports: res.imports };
  };

  const getBranch = (value: unknown): Branch | "invalid" => {
    const branch = branchToExpr(value);
    if (invalidCurriedValue) {
      return "invalid";
    }
    return branch;
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
    if (!leftPath || leftPath.length !== 1) {
      return null;
    }
    const propName = leftPath[0]!;
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
      if (branch === "invalid") {
        return null;
      }
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
    if (consExpr === "invalid") {
      return null;
    }
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

  const { test, consequent, alternate } = expr.body;

  // 1) props.foo ? a : b (simple boolean test)
  const testPath =
    paramName && test.type === "MemberExpression"
      ? getMemberPathFromIdentifier(test, paramName)
      : null;
  if (testPath && testPath.length === 1) {
    const cons = getBranch(consequent);
    if (cons === "invalid") {
      return { type: "keepOriginal", reason: invalidCurriedValue! };
    }
    const alt = getBranch(alternate);
    if (alt === "invalid") {
      return { type: "keepOriginal", reason: invalidCurriedValue! };
    }
    const outerProp = testPath[0]!;

    // Check for multi-prop nested ternary: outerProp ? A : innerProp ? B : C
    // where alternate is a conditional testing a different boolean prop
    if (cons && !alt && alternate.type === "ConditionalExpression") {
      const innerTest = (alternate as any).test;
      const innerTestPath =
        innerTest?.type === "MemberExpression"
          ? getMemberPathFromIdentifier(innerTest, paramName!)
          : null;
      // Only handle when inner tests a different single-level prop
      if (innerTestPath && innerTestPath.length === 1 && innerTestPath[0] !== outerProp) {
        const innerCons = getBranch((alternate as any).consequent);
        const innerAlt = getBranch((alternate as any).alternate);
        if (innerCons && innerCons !== "invalid" && innerAlt && innerAlt !== "invalid") {
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
              innerProp: innerTestPath[0]!,
              innerTruthyBranch: { expr: innerCons.expr, imports: innerCons.imports },
              innerFalsyBranch: { expr: innerAlt.expr, imports: innerAlt.imports },
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

  // 2) Handle nested ternaries: prop === "a" ? valA : prop === "b" ? valB : defaultVal
  // This also handles the simple case: prop === "a" ? valA : defaultVal
  const condInfo = extractConditionInfo(test);
  if (condInfo) {
    const consExpr = getBranch(consequent);
    if (consExpr === "invalid") {
      return { type: "keepOriginal", reason: invalidCurriedValue! };
    }
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
      // (Styles results would need an explicit “no style” default semantics.)
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

function tryResolveConditionalCssBlock(node: DynamicNode): HandlerResult | null {
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
  if (expr.body.type === "LogicalExpression" && expr.body.operator === "&&") {
    const { left, right } = expr.body;
    const testPath =
      left.type === "MemberExpression" ? getMemberPathFromIdentifier(left, paramName) : null;
    if (!testPath || testPath.length !== 1) {
      return null;
    }

    const cssText = literalToString(right);
    if (cssText === null || cssText === undefined) {
      return null;
    }

    const style = parseCssDeclarationBlock(cssText);
    if (!style) {
      return null;
    }

    return {
      type: "splitVariants",
      variants: [{ nameHint: "truthy", when: testPath[0]!, style }],
    };
  }

  return null;
}

function tryResolveConditionalCssBlockTernary(node: DynamicNode): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }
  if (expr.body.type !== "ConditionalExpression") {
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
      if (!testPath || testPath.length !== 1) {
        return null;
      }
      return { kind: "boolean", propName: testPath[0]!, isNegated: false };
    }

    // Negated prop access: !props.$open
    if (t.type === "UnaryExpression" && t.operator === "!") {
      const arg = t.argument as { type?: string } | undefined;
      if (arg?.type === "MemberExpression") {
        const testPath = getMemberPathFromIdentifier(arg as any, paramName);
        if (!testPath || testPath.length !== 1) {
          return null;
        }
        return { kind: "boolean", propName: testPath[0]!, isNegated: true };
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
      if (!testPath || testPath.length !== 1) {
        return null;
      }
      const rhsRaw = literalToStaticValue(t.right);
      if (rhsRaw === null) {
        return null;
      }
      return {
        kind: "comparison",
        propName: testPath[0]!,
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
    const ce = condExpr as {
      type?: string;
      test?: unknown;
      consequent?: unknown;
      alternate?: unknown;
    };

    // Base case: not a conditional, this is the default value (a CSS string)
    if (ce.type !== "ConditionalExpression") {
      const cssText = literalToString(condExpr);
      if (cssText === null) {
        return null;
      }
      const style = cssText.trim() ? parseCssDeclarationBlock(cssText) : null;
      return { variants: [], defaultStyle: style };
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

    // Add nested variants
    variants.push(...nested.variants);

    return { variants, defaultStyle: nested.defaultStyle };
  };

  // Extract variants from the ternary expression
  const result = extractVariantsFromTernary(expr.body);
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

      // Normalize double negation: !(!prop) → prop
      // This happens when the original test was negated: !props.$x ? A : B
      // Without this, both variants would start with "!" and fall through the
      // lower-rules processing logic, silently dropping the styles.
      if (variants.length === 1) {
        const singleWhen = variants[0]!.when;
        // Check for simple negated prop (e.g., "!$open") without operators
        if (singleWhen.startsWith("!") && !singleWhen.includes(" ")) {
          defaultWhen = singleWhen.slice(1); // "!$open" → "$open"
        }
      }

      variants.push({
        nameHint: "default",
        when: defaultWhen,
        style: defaultStyle,
      });
    }
  }

  if (variants.length === 0) {
    return null;
  }

  return { type: "splitVariants", variants };
}

function tryResolveArrowFnCallWithSinglePropArg(node: DynamicNode): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr as any;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }
  const body = expr.body as any;
  if (!body || body.type !== "CallExpression") {
    return null;
  }
  // Only support: helper(props.foo)
  if (body.callee?.type !== "Identifier" || typeof body.callee.name !== "string") {
    return null;
  }
  const calleeIdent = body.callee.name as string;
  const args = body.arguments ?? [];
  if (args.length !== 1) {
    return null;
  }
  const arg0 = args[0] as any;
  if (!arg0 || arg0.type !== "MemberExpression") {
    return null;
  }
  const path = getMemberPathFromIdentifier(arg0, paramName);
  if (!path || path.length !== 1) {
    return null;
  }
  const propName = path[0]!;

  return {
    type: "emitStyleFunction",
    nameHint: `${sanitizeIdentifier(node.css.property)}FromProp`,
    params: "value: any",
    body: `{ ${Object.keys(styleFromSingleDeclaration(node.css.property, "value"))[0]}: value }`,
    call: propName,
    valueTransform: { kind: "call", calleeIdent },
    ...(node.css.property === "box-shadow" || node.css.property === "boxShadow"
      ? { wrapValueInTemplateLiteral: true }
      : {}),
  };
}

function tryResolveInlineStyleValueForConditionalExpression(
  node: DynamicNode,
): HandlerResult | null {
  // Conservative fallback for value expressions we can't safely resolve into StyleX
  // buckets/functions, but can preserve via a wrapper inline style.
  if (!node.css.property) {
    return null;
  }
  const expr: any = node.expr as any;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  if (expr.body?.type !== "ConditionalExpression") {
    return null;
  }
  // IMPORTANT: do not attempt to preserve `props.theme.* ? ... : ...` via inline styles.
  // StyleX output does not have `props.theme` at runtime (styled-components injects theme via context),
  // so this would produce incorrect output unless a project-specific hook (e.g. useTheme()) is wired in.
  //
  // Treat these as unsupported so the caller can bail and surface a warning.
  {
    const paramName = getArrowFnSingleParamName(expr);
    const test = expr.body.test as any;
    const testPath =
      paramName && test?.type === "MemberExpression"
        ? getMemberPathFromIdentifier(test, paramName)
        : null;
    if (testPath && testPath[0] === "theme") {
      return {
        type: "keepOriginal",
        reason:
          "Theme-dependent conditional values require a project-specific theme source (e.g. useTheme()); cannot safely preserve.",
      };
    }
  }
  // Signal to the caller that we can preserve this declaration as an inline style
  // by calling the function with `props`.
  return { type: "emitInlineStyleValueFromProps" };
}

function tryResolveInlineStyleValueForNestedPropAccess(node: DynamicNode): HandlerResult | null {
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
  if (expr.body.type !== "MemberExpression") {
    return null;
  }
  const path = getMemberPathFromIdentifier(expr.body, paramName);
  if (!path || path.length <= 1) {
    return null;
  }
  // IMPORTANT: do not attempt to preserve `props.theme.*` via inline styles.
  // StyleX output does not have `props.theme` at runtime (styled-components injects theme via context),
  // so this would produce incorrect output unless a project-specific hook (e.g. useTheme()) is wired in.
  if (path[0] === "theme") {
    return {
      type: "keepOriginal",
      reason:
        "Theme-dependent values require a project-specific theme source (e.g. useTheme()); cannot safely preserve.",
    };
  }
  return { type: "emitInlineStyleValueFromProps" };
}

function tryResolvePropAccess(node: DynamicNode): HandlerResult | null {
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
  if (expr.body.type !== "MemberExpression") {
    return null;
  }

  const path = getMemberPathFromIdentifier(expr.body, paramName);
  if (!path || path.length !== 1) {
    return null;
  }

  const propName = path[0]!;
  const cssProp = node.css.property;
  const nameHint = `${sanitizeIdentifier(cssProp)}FromProp`;

  return {
    type: "emitStyleFunction",
    nameHint,
    params: "value: string",
    body: `{ ${Object.keys(styleFromSingleDeclaration(cssProp, "value"))[0]}: value }`,
    call: propName,
  };
}

/**
 * Internal dynamic resolution pipeline.
 * Order matters: more-specific transforms first, then fall back to prop-access emission.
 */
export function resolveDynamicNode(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  return (
    tryResolveThemeAccess(node, ctx) ??
    tryResolveCallExpression(node, ctx) ??
    tryResolveConditionalValue(node, ctx) ??
    tryResolveConditionalCssBlockTernary(node) ??
    tryResolveConditionalCssBlock(node) ??
    tryResolveArrowFnCallWithSinglePropArg(node) ??
    tryResolveInlineStyleValueForNestedPropAccess(node) ??
    tryResolvePropAccess(node) ??
    tryResolveInlineStyleValueForConditionalExpression(node)
  );
}

function literalToStaticValue(node: unknown): string | number | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const type = (node as { type?: string }).type;
  if (type === "StringLiteral") {
    return (node as { value: string }).value;
  }
  // Some parsers (or mixed ASTs) use estree-style `Literal`.
  if (type === "Literal") {
    const v = (node as { value?: unknown }).value;
    if (typeof v === "string" || typeof v === "number") {
      return v;
    }
  }
  if (type === "NumericLiteral") {
    return (node as { value: number }).value;
  }
  return null;
}

function literalToString(node: unknown): string | null {
  const v = literalToStaticValue(node);
  return typeof v === "string" ? v : null;
}

function sanitizeIdentifier(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}

function styleFromSingleDeclaration(
  property: string,
  value: string | number,
): Record<string, unknown> {
  const valueRaw = typeof value === "number" ? String(value) : value;
  const decl = {
    property,
    value: { kind: "static" as const, value: valueRaw },
    important: false,
    valueRaw,
  };
  const style: Record<string, unknown> = {};
  for (const out of cssDeclarationToStylexDeclarations(decl)) {
    // Keep numbers as numbers if the source literal was numeric (e.g. opacity: 1)
    style[out.prop] = typeof value === "number" ? value : coerceStaticCss(out.value);
  }
  return style;
}

function parseCssDeclarationBlock(cssText: string): Record<string, unknown> | null {
  // Very small parser for blocks like `transform: rotate(180deg); color: red;`
  // This is intentionally conservative: only supports static values.
  const chunks = cssText
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return null;
  }

  const style: Record<string, unknown> = {};
  for (const chunk of chunks) {
    const m = chunk.match(/^([^:]+):([\s\S]+)$/);
    if (!m) {
      return null;
    }
    const property = m[1]!.trim();
    const valueRaw = m[2]!.trim();
    const decl = {
      property,
      value: { kind: "static" as const, value: valueRaw },
      important: false,
      valueRaw,
    };
    for (const out of cssDeclarationToStylexDeclarations(decl)) {
      style[out.prop] = coerceStaticCss(out.value);
    }
  }
  return style;
}

function coerceStaticCss(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const v = value as { kind?: string; value?: unknown };
  if (v.kind === "static" && typeof v.value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(v.value)) {
      return Number(v.value);
    }
    return v.value;
  }
  return value;
}
