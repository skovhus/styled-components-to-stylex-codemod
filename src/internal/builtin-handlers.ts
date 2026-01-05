import type { API } from "jscodeshift";
import type { ImportSource, ImportSpec, ResolveContext, ResolveResult } from "../adapter.js";
import {
  getArrowFnSingleParamName,
  getMemberPathFromIdentifier,
  isArrowFunctionExpression,
} from "./jscodeshift-utils.js";
import { cssDeclarationToStylexDeclarations } from "./css-prop-mapping.js";

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

export type CssNodeKind = "declaration" | "selector" | "atRule" | "keyframes";

export type DynamicNodeCssContext = {
  kind: CssNodeKind;
  selector: string;
  atRuleStack: string[];
  property?: string;
  valueRaw?: string;
};

export type DynamicNodeComponentContext = {
  localName: string;
  base: "intrinsic" | "component";
  tagOrIdent: string;
  withConfig?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
};

export type DynamicNodeUsageContext = {
  jsxUsages: number;
  hasPropsSpread: boolean;
};

export type DynamicNodeLoc = {
  line?: number;
  column?: number;
};

export type DynamicNode = {
  slotId: number;
  expr: unknown;
  css: DynamicNodeCssContext;
  component: DynamicNodeComponentContext;
  usage: DynamicNodeUsageContext;
  loc?: DynamicNodeLoc;
};

export type HandlerWarning = {
  feature: string;
  message: string;
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
  const { test, consequent, alternate } = expr.body;

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

  const cons = branchToExpr(consequent);
  const alt = branchToExpr(alternate);
  if (!cons || !alt) {
    return null;
  }

  // 1) props.foo ? a : b
  const testPath =
    paramName && test.type === "MemberExpression"
      ? getMemberPathFromIdentifier(test, paramName)
      : null;
  if (testPath && testPath.length === 1) {
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

  // 2) props.foo === "bar" ? a : b
  if (
    paramName &&
    test.type === "BinaryExpression" &&
    (test.operator === "===" || test.operator === "!==") &&
    test.left.type === "MemberExpression"
  ) {
    const leftPath = getMemberPathFromIdentifier(test.left, paramName);
    if (!leftPath || leftPath.length !== 1) {
      return null;
    }
    const propName = leftPath[0]!;
    const right = literalToStaticValue(test.right as any);
    if (right === null) {
      return null;
    }
    const rhs = JSON.stringify(right);
    const cond = `${propName} ${test.operator} ${rhs}`;

    return {
      type: "splitVariantsResolvedValue",
      variants: [
        {
          nameHint: "default",
          when: `!(${cond})`,
          expr: alt.expr,
          imports: alt.imports,
        },
        {
          nameHint: "match",
          when: cond,
          expr: cons.expr,
          imports: cons.imports,
        },
      ],
    };
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
