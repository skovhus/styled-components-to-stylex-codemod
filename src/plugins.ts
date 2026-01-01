import type { API } from "jscodeshift";
import type { Adapter } from "./adapter.js";
import {
  getArrowFnSingleParamName,
  getMemberPathFromIdentifier,
  isArrowFunctionExpression,
} from "./utils.js";

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

export type PluginWarning = {
  feature: string;
  message: string;
  loc?: DynamicNodeLoc;
};

export type PluginContext = {
  api: API;
  filePath: string;
  adapter: Adapter;
  warn: (warning: PluginWarning) => void;
};

export type PluginResult =
  | { type: "resolvedValue"; value: string }
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
      variants: Array<{ nameHint: string; when: string; style: Record<string, unknown> }>;
    }
  | { type: "keepOriginal"; reason: string };

export type DynamicNodePlugin = {
  name: string;
  handle: (node: DynamicNode, ctx: PluginContext) => PluginResult | null;
};

export type PluginResolution =
  | { kind: "resolved"; pluginName: string; result: PluginResult }
  | { kind: "unhandled" };

export function runDynamicNodePlugins(
  plugins: DynamicNodePlugin[] | undefined,
  node: DynamicNode,
  ctx: PluginContext,
): PluginResolution {
  if (!plugins || plugins.length === 0) return { kind: "unhandled" };
  for (const plugin of plugins) {
    const result = plugin.handle(node, ctx);
    if (result) return { kind: "resolved", pluginName: plugin.name, result };
  }
  return { kind: "unhandled" };
}

// ----------------------------
// Built-in plugins (initial)
// ----------------------------

export const themeAccessPlugin: DynamicNodePlugin = {
  name: "theme-access",
  handle(node, ctx) {
    const expr = node.expr;
    if (!isArrowFunctionExpression(expr)) return null;
    const paramName = getArrowFnSingleParamName(expr);
    if (!paramName) return null;
    const body = expr.body;
    if (body.type !== "MemberExpression") return null;
    const parts = getMemberPathFromIdentifier(body, paramName);
    if (!parts || parts[0] !== "theme") return null;
    const path = parts.slice(1).join(".");
    if (!path) return null;

    return {
      type: "resolvedValue",
      value: ctx.adapter.transformValue({ path, valueType: "theme" }),
    };
  },
};

export const conditionalValuePlugin: DynamicNodePlugin = {
  name: "conditional-value",
  handle(node) {
    if (!node.css.property) return null;
    const expr = node.expr;
    if (!isArrowFunctionExpression(expr)) return null;
    const paramName = getArrowFnSingleParamName(expr);
    if (!paramName) return null;

    if (expr.body.type !== "ConditionalExpression") return null;
    const { test, consequent, alternate } = expr.body;

    const testPath =
      test.type === "MemberExpression" ? getMemberPathFromIdentifier(test, paramName) : null;
    if (!testPath || testPath.length !== 1) return null;

    const whenExpr = testPath[0]!;
    const cons = literalToStaticValue(consequent);
    const alt = literalToStaticValue(alternate);
    if (cons === null || alt === null) return null;

    return {
      type: "splitVariants",
      variants: [
        { nameHint: "truthy", when: whenExpr, style: { [node.css.property]: cons } },
        { nameHint: "falsy", when: `!${whenExpr}`, style: { [node.css.property]: alt } },
      ],
    };
  },
};

export const propAccessPlugin: DynamicNodePlugin = {
  name: "prop-access",
  handle(node) {
    if (!node.css.property) return null;
    const expr = node.expr;
    if (!isArrowFunctionExpression(expr)) return null;
    const paramName = getArrowFnSingleParamName(expr);
    if (!paramName) return null;
    if (expr.body.type !== "MemberExpression") return null;

    const path = getMemberPathFromIdentifier(expr.body, paramName);
    if (!path || path.length !== 1) return null;

    const propName = path[0]!;
    const cssProp = node.css.property;
    const nameHint = `${sanitizeIdentifier(cssProp)}FromProp`;

    return {
      type: "emitStyleFunction",
      nameHint,
      params: "value: string",
      body: `{ ${cssProp}: value }`,
      call: propName,
    };
  },
};

export function builtinPlugins(): DynamicNodePlugin[] {
  return [themeAccessPlugin, conditionalValuePlugin, propAccessPlugin];
}

function literalToStaticValue(node: unknown): string | number | null {
  if (!node || typeof node !== "object") return null;
  const type = (node as { type?: string }).type;
  if (type === "StringLiteral") return (node as { value: string }).value;
  if (type === "NumericLiteral") return (node as { value: number }).value;
  return null;
}

function sanitizeIdentifier(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}
