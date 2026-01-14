import type { API } from "jscodeshift";
import type { ImportSource, ImportSpec, ResolveContext, ResolveResult } from "../adapter.js";
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
  | { type: "resolvedValue"; expr: string; imports: ImportSpec[] }
  | { type: "emitInlineStyle"; style: string }
  | {
      type: "emitStyleFunction";
      nameHint: string;
      params: string;
      body: string;
      call: string;
    }
  | {
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
  | { type: "keepOriginal"; reason: string };

export type InternalHandlerContext = {
  api: API;
  filePath: string;
  resolveValue: (context: ResolveContext) => ResolveResult | null;
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

  const res = ctx.resolveValue({ kind: "theme", path });
  if (!res) {
    return null;
  }
  return { type: "resolvedValue", expr: res.expr, imports: res.imports };
}

function tryResolveCallExpression(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  type CallResolveContext = Extract<ResolveContext, { kind: "call" }>;
  const expr: any = node.expr as any;
  if (!expr || typeof expr !== "object" || expr.type !== "CallExpression") {
    return null;
  }
  // Only support the simplest call shape: `identifier("stringLiteral")` where identifier is a
  // named import we can trace back to a concrete file. Anything else should bail.
  if (expr.callee?.type !== "Identifier" || typeof expr.callee.name !== "string") {
    return {
      type: "keepOriginal",
      reason: "Unsupported call expression callee (expected identifier)",
    };
  }
  const calleeIdent = expr.callee.name;
  const imp = ctx.resolveImport(calleeIdent);
  const calleeImportedName = imp?.importedName;
  const calleeSource = imp?.source;
  if (!calleeImportedName || !calleeSource) {
    return {
      type: "keepOriginal",
      reason: "Could not resolve import source for helper call",
    };
  }

  const rawArgs = expr.arguments ?? [];
  if (rawArgs.length !== 1) {
    return {
      type: "keepOriginal",
      reason: `Unsupported helper call argument count for ${calleeImportedName} (expected 1)`,
    };
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
    return {
      type: "keepOriginal",
      reason: `Unsupported helper call argument for ${calleeImportedName} (expected string literal)`,
    };
  }
  const args: CallResolveContext["args"] = [arg0];

  const res = ctx.resolveValue({
    kind: "call",
    callSiteFilePath: ctx.filePath,
    calleeImportedName,
    calleeSource,
    args,
  });
  if (!res) {
    return {
      type: "keepOriginal",
      reason: `Unresolved helper call ${calleeImportedName}(...) (adapter did not resolve)`,
    };
  }
  return { type: "resolvedValue", expr: res.expr, imports: res.imports };
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

  type Branch = { expr: string; imports: ImportSpec[] } | null;
  const branchToExpr = (b: unknown): Branch => {
    const v = literalToStaticValue(b);
    if (v !== null) {
      return {
        expr: typeof v === "string" ? JSON.stringify(v) : String(v),
        imports: [],
      };
    }
    if (!b || typeof b !== "object") {
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
    const res = ctx.resolveValue({ kind: "theme", path });
    if (!res) {
      return null;
    }
    return { expr: res.expr, imports: res.imports };
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
  type Variant = { nameHint: string; when: string; expr: string; imports: ImportSpec[] };
  const extractNestedTernaryVariants = (
    condExpr: any,
    expectedPropName?: string,
  ): { variants: Variant[]; defaultBranch: NonNullable<Branch> } | null => {
    if (condExpr.type !== "ConditionalExpression") {
      // Base case: not a conditional, this is the default value
      const branch = branchToExpr(condExpr);
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

    const consExpr = branchToExpr(consequent);
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
    const cons = branchToExpr(consequent);
    const alt = branchToExpr(alternate);
    if (!cons || !alt) {
      return null;
    }
    const whenExpr = testPath[0]!;
    return {
      type: "splitVariantsResolvedValue",
      variants: [
        {
          nameHint: "truthy",
          when: whenExpr,
          expr: cons.expr,
          imports: cons.imports,
        },
        {
          nameHint: "falsy",
          when: `!${whenExpr}`,
          expr: alt.expr,
          imports: alt.imports,
        },
      ],
    };
  }

  // 2) Handle nested ternaries: prop === "a" ? valA : prop === "b" ? valB : defaultVal
  // This also handles the simple case: prop === "a" ? valA : defaultVal
  const condInfo = extractConditionInfo(test);
  if (condInfo) {
    const consExpr = branchToExpr(consequent);
    if (!consExpr) {
      return null;
    }

    // Check if alternate is a nested ternary testing the same property
    const nested = extractNestedTernaryVariants(alternate, condInfo.propName);
    if (nested) {
      const rhsNameHint =
        typeof condInfo.rhsRaw === "string" ? condInfo.rhsRaw : String(condInfo.rhsRaw);

      const thisVariant: Variant = {
        nameHint: rhsNameHint,
        when: condInfo.cond,
        expr: consExpr.expr,
        imports: consExpr.imports,
      };

      const allVariants = [thisVariant, ...nested.variants];

      // Build the default condition: negation of all positive conditions
      const allConditions = allVariants.map((v) => v.when).join(" || ");

      return {
        type: "splitVariantsResolvedValue",
        variants: [
          {
            nameHint: "default",
            when: `!(${allConditions})`,
            expr: nested.defaultBranch.expr,
            imports: nested.defaultBranch.imports,
          },
          ...allVariants,
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
    tryResolveConditionalCssBlock(node) ??
    tryResolvePropAccess(node)
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
