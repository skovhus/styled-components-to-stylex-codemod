/**
 * Adapter - Single user entry point for customizing the codemod.
 */

import type { API } from "jscodeshift";
import {
  getArrowFnSingleParamName,
  getMemberPathFromIdentifier,
  isArrowFunctionExpression,
} from "./utils.js";
import { cssDeclarationToStylexDeclarations } from "./ir.js";

// ────────────────────────────────────────────────────────────────────────────
// Value Resolution
// ────────────────────────────────────────────────────────────────────────────

export type ResolveContext =
  | { kind: "theme"; path: string }
  | {
      kind: "cssVariable";
      name: string;
      fallback?: string;
      definedValue?: string;
    };

export type ResolveResult = {
  /**
   * JS expression string to inline into generated output.
   * Example: `vars.spacingSm` or `calcVars.baseSize`
   */
  expr: string;
  /**
   * Import statements required by `expr`.
   * Example: [`import { vars } from "./tokens.stylex";`]
   */
  imports: string[];
  /**
   * If true, the transformer should drop the corresponding `--name: ...` definition
   * from the emitted style object (useful when replacing with StyleX vars).
   */
  dropDefinition?: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// Dynamic Node Types
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Handler Types
// ────────────────────────────────────────────────────────────────────────────

export type HandlerWarning = {
  feature: string;
  message: string;
  loc?: DynamicNodeLoc;
};

export type HandlerContext = {
  api: API;
  filePath: string;
  /** Resolve theme paths / CSS variables into a JS expression + imports */
  resolveValue: (context: ResolveContext) => ResolveResult | null;
  warn: (warning: HandlerWarning) => void;
};

export type HandlerResult =
  | { type: "resolvedValue"; expr: string; imports: string[] }
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
  | { type: "keepOriginal"; reason: string };

export type DynamicHandler = {
  name: string;
  handle: (node: DynamicNode, ctx: HandlerContext) => HandlerResult | null;
};

export type HandlerResolution =
  | { kind: "resolved"; handlerName: string; result: HandlerResult }
  | { kind: "unhandled" };

// ────────────────────────────────────────────────────────────────────────────
// Adapter Interface
// ────────────────────────────────────────────────────────────────────────────

export interface Adapter {
  /** Unified resolver for theme paths + CSS variables. Return null to leave unresolved. */
  resolveValue: (context: ResolveContext) => ResolveResult | null;

  /**
   * Custom handlers for dynamic expressions.
   * These run BEFORE built-in handlers. Return null to pass to next handler.
   * Most users won't need this - the built-in handlers cover common patterns.
   */
  handlers?: DynamicHandler[];
}

export type NormalizedAdapter = {
  resolveValue: (context: ResolveContext) => ResolveResult | null;
  handlers: DynamicHandler[];
};

// ────────────────────────────────────────────────────────────────────────────
// Built-in Handlers
// ────────────────────────────────────────────────────────────────────────────

export const themeAccessHandler: DynamicHandler = {
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

    const res = ctx.resolveValue({ kind: "theme", path });
    if (!res) return null;
    return { type: "resolvedValue", expr: res.expr, imports: res.imports };
  },
};

export const conditionalValueHandler: DynamicHandler = {
  name: "conditional-value",
  handle(node) {
    if (!node.css.property) return null;
    const expr = node.expr;
    if (!isArrowFunctionExpression(expr)) return null;
    const paramName = getArrowFnSingleParamName(expr);
    if (!paramName) return null;

    if (expr.body.type !== "ConditionalExpression") return null;
    const { test, consequent, alternate } = expr.body;

    const cons = literalToStaticValue(consequent);
    const alt = literalToStaticValue(alternate);
    if (cons === null || alt === null) return null;

    // 1) props.foo ? a : b
    const testPath =
      test.type === "MemberExpression" ? getMemberPathFromIdentifier(test, paramName) : null;
    if (testPath && testPath.length === 1) {
      const whenExpr = testPath[0]!;
      return {
        type: "splitVariants",
        variants: [
          {
            nameHint: "truthy",
            when: whenExpr,
            style: styleFromSingleDeclaration(node.css.property, cons),
          },
          {
            nameHint: "falsy",
            when: `!${whenExpr}`,
            style: styleFromSingleDeclaration(node.css.property, alt),
          },
        ],
      };
    }

    // 2) props.foo === "bar" ? a : b
    if (
      test.type === "BinaryExpression" &&
      (test.operator === "===" || test.operator === "!==") &&
      test.left.type === "MemberExpression"
    ) {
      const leftPath = getMemberPathFromIdentifier(test.left, paramName);
      if (!leftPath || leftPath.length !== 1) return null;
      const propName = leftPath[0]!;
      const right = literalToStaticValue(test.right as any);
      if (right === null) return null;
      const rhs = JSON.stringify(right);
      const cond = `${propName} ${test.operator} ${rhs}`;

      // Use the existing transformer behavior: the `!…` variant is merged into base styles,
      // and the positive variant becomes a conditional style key.
      return {
        type: "splitVariants",
        variants: [
          {
            nameHint: "default",
            when: `!(${cond})`,
            style: styleFromSingleDeclaration(node.css.property, alt),
          },
          {
            nameHint: "match",
            when: cond,
            style: styleFromSingleDeclaration(node.css.property, cons),
          },
        ],
      };
    }

    return {
      type: "splitVariants",
      variants: [
        {
          nameHint: "truthy",
          when: testPath?.[0] ?? "",
          style: styleFromSingleDeclaration(node.css.property, cons),
        },
        {
          nameHint: "falsy",
          when: testPath?.[0] ? `!${testPath[0]}` : "",
          style: styleFromSingleDeclaration(node.css.property, alt),
        },
      ],
    };
  },
};

export const conditionalCssBlockHandler: DynamicHandler = {
  name: "conditional-css-block",
  handle(node) {
    const expr = node.expr;
    if (!isArrowFunctionExpression(expr)) return null;
    const paramName = getArrowFnSingleParamName(expr);
    if (!paramName) return null;

    // Support patterns like:
    //   ${(props) => props.$upsideDown && "transform: rotate(180deg);"}
    if (expr.body.type === "LogicalExpression" && expr.body.operator === "&&") {
      const { left, right } = expr.body;
      const testPath =
        left.type === "MemberExpression" ? getMemberPathFromIdentifier(left, paramName) : null;
      if (!testPath || testPath.length !== 1) return null;

      const cssText = literalToString(right);
      if (cssText === null || cssText === undefined) return null;

      const style = parseCssDeclarationBlock(cssText);
      if (!style) return null;

      return {
        type: "splitVariants",
        variants: [{ nameHint: "truthy", when: testPath[0]!, style }],
      };
    }

    return null;
  },
};

export const propAccessHandler: DynamicHandler = {
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
      body: `{ ${Object.keys(styleFromSingleDeclaration(cssProp, "value"))[0]}: value }`,
      call: propName,
    };
  },
};

export function builtinHandlers(): DynamicHandler[] {
  return [
    themeAccessHandler,
    conditionalValueHandler,
    conditionalCssBlockHandler,
    propAccessHandler,
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Runtime
// ────────────────────────────────────────────────────────────────────────────

export function runHandlers(
  handlers: DynamicHandler[] | undefined,
  node: DynamicNode,
  ctx: HandlerContext,
): HandlerResolution {
  if (!handlers || handlers.length === 0) return { kind: "unhandled" };
  for (const handler of handlers) {
    const result = handler.handle(node, ctx);
    if (result) return { kind: "resolved", handlerName: handler.name, result };
  }
  return { kind: "unhandled" };
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter Normalization
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalize an adapter to ensure all fields are populated with defaults.
 */
export function normalizeAdapter(adapter: Adapter): NormalizedAdapter {
  if (!adapter || typeof adapter.resolveValue !== "function") {
    throw new Error("Adapter must provide resolveValue(ctx) => { expr, imports } | null");
  }
  return {
    resolveValue: adapter.resolveValue,
    handlers: adapter.handlers ?? [],
  };
}

/**
 * Check if an object looks like an Adapter.
 */
export function isAdapter(x: unknown): x is Adapter {
  if (!x || typeof x !== "object") return false;
  const h = x as Record<string, unknown>;
  // `resolveValue` is required for a valid Adapter.
  return typeof h.resolveValue === "function";
}

// ────────────────────────────────────────────────────────────────────────────
// Helper for User Authoring
// ────────────────────────────────────────────────────────────────────────────

/**
 * Helper for nicer user authoring + type inference.
 *
 * Usage:
 *   export default defineAdapter({
 *     resolveValue(ctx) {
 *       if (ctx.kind === "theme") {
 *         return { expr: `tokens.${ctx.path}`, imports: ["import { tokens } from './tokens';"] };
 *       }
 *       return null;
 *     },
 *   });
 */
export function defineAdapter(adapter: Adapter): Adapter {
  return adapter;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ────────────────────────────────────────────────────────────────────────────

function literalToStaticValue(node: unknown): string | number | null {
  if (!node || typeof node !== "object") return null;
  const type = (node as { type?: string }).type;
  if (type === "StringLiteral") return (node as { value: string }).value;
  if (type === "NumericLiteral") return (node as { value: number }).value;
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
  if (chunks.length === 0) return null;

  const style: Record<string, unknown> = {};
  for (const chunk of chunks) {
    const m = chunk.match(/^([^:]+):([\s\S]+)$/);
    if (!m) return null;
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
  if (!value || typeof value !== "object") return value;
  const v = value as { kind?: string; value?: unknown };
  if (v.kind === "static" && typeof v.value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(v.value)) return Number(v.value);
    return v.value;
  }
  return value;
}
