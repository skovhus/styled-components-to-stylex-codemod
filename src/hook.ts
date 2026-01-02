/**
 * Hook - Single user entry point for customizing the codemod.
 *
 * The Hook interface unifies value resolution (how theme paths become StyleX code)
 * and dynamic expression handling (how interpolations are transformed).
 */

import type { API } from "jscodeshift";
import {
  getArrowFnSingleParamName,
  getMemberPathFromIdentifier,
  isArrowFunctionExpression,
} from "./utils.js";

// ────────────────────────────────────────────────────────────────────────────
// Value Resolution
// ────────────────────────────────────────────────────────────────────────────

export interface ValueContext {
  /** The original value path, e.g., "colors.primary" or "spacing.md" */
  path: string;
  /** The default/fallback value if available */
  defaultValue?: string;
  /** The type of value being transformed */
  valueType: "theme" | "helper" | "interpolation";
}

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
  /** Resolve a theme/token path to StyleX-compatible value */
  resolveValue: (context: ValueContext) => string;
  warn: (warning: HandlerWarning) => void;
};

export type HandlerResult =
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

export type DynamicHandler = {
  name: string;
  handle: (node: DynamicNode, ctx: HandlerContext) => HandlerResult | null;
};

export type HandlerResolution =
  | { kind: "resolved"; handlerName: string; result: HandlerResult }
  | { kind: "unhandled" };

// ────────────────────────────────────────────────────────────────────────────
// Hook Interface
// ────────────────────────────────────────────────────────────────────────────

export interface Hook {
  /**
   * Transform a value reference to StyleX-compatible code.
   * Called for theme accesses like `props.theme.colors.primary`.
   *
   * @param context - The context about the value being transformed
   * @returns StyleX-compatible value (string literal, variable reference, or expression)
   */
  resolveValue?: (context: ValueContext) => string;

  /**
   * Extra imports to inject into transformed files.
   * Example: ["import { themeVars } from './tokens.stylex';"]
   */
  imports?: string[];

  /**
   * Extra module-level declarations to inject.
   * Example: ["const themeVars = stylex.defineVars({...});"]
   */
  declarations?: string[];

  /**
   * Custom handlers for dynamic expressions.
   * These run BEFORE built-in handlers. Return null to pass to next handler.
   * Most users won't need this - the built-in handlers cover common patterns.
   */
  handlers?: DynamicHandler[];
}

// ────────────────────────────────────────────────────────────────────────────
// Backwards Compatibility (deprecated, will be removed)
// ────────────────────────────────────────────────────────────────────────────

/** @deprecated Use Hook instead */
export interface Adapter {
  transformValue(context: ValueContext): string;
  getImports(): string[];
  getDeclarations(): string[];
}

/** @deprecated Use Hook instead */
export type AdapterContext = ValueContext;

/** @deprecated Use DynamicHandler instead */
export type DynamicNodePlugin = DynamicHandler;

/** @deprecated Use HandlerContext instead */
export type PluginContext = HandlerContext;

/** @deprecated Use HandlerResult instead */
export type PluginResult = HandlerResult;

/** @deprecated Use HandlerWarning instead */
export type PluginWarning = HandlerWarning;

// ────────────────────────────────────────────────────────────────────────────
// Default Value Resolver
// ────────────────────────────────────────────────────────────────────────────

/**
 * Default resolver: Uses CSS custom properties with fallbacks.
 * Generates: `'var(--colors-primary, #BF4F74)'`
 */
export function defaultResolveValue({ path, defaultValue }: ValueContext): string {
  const varName = path.replace(/\./g, "-");
  if (defaultValue) {
    return `'var(--${varName}, ${defaultValue})'`;
  }
  return `'var(--${varName})'`;
}

// ────────────────────────────────────────────────────────────────────────────
// Built-in Hooks (presets)
// ────────────────────────────────────────────────────────────────────────────

/** Default hook: CSS custom properties with fallbacks */
export const defaultHook: Hook = {
  resolveValue: defaultResolveValue,
};

/** Hook that references StyleX vars from a tokens module */
export const defineVarsHook: Hook = {
  resolveValue({ path }) {
    const varName = path
      .split(".")
      .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
    return `themeVars.${varName}`;
  },
  imports: ["import { themeVars } from './tokens.stylex';"],
};

/** Hook that inlines literal values */
export const inlineValuesHook: Hook = {
  resolveValue({ defaultValue }) {
    return defaultValue ? `'${defaultValue}'` : "''";
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Backwards Compatibility Adapters (deprecated)
// ────────────────────────────────────────────────────────────────────────────

/** @deprecated Use defaultHook instead */
export const defaultAdapter: Adapter = {
  transformValue: defaultResolveValue,
  getImports: () => [],
  getDeclarations: () => [],
};

/** @deprecated Use defineVarsHook instead */
export const defineVarsAdapter: Adapter = {
  transformValue({ path }) {
    const varName = path
      .split(".")
      .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
    return `themeVars.${varName}`;
  },
  getImports: () => ["import { themeVars } from './tokens.stylex';"],
  getDeclarations: () => [],
};

/** @deprecated Use inlineValuesHook instead */
export const inlineValuesAdapter: Adapter = {
  transformValue({ defaultValue }) {
    return defaultValue ? `'${defaultValue}'` : "''";
  },
  getImports: () => [],
  getDeclarations: () => [],
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

    return {
      type: "resolvedValue",
      value: ctx.resolveValue({ path, valueType: "theme" }),
    };
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
      body: `{ ${cssProp}: value }`,
      call: propName,
    };
  },
};

export function builtinHandlers(): DynamicHandler[] {
  return [themeAccessHandler, conditionalValueHandler, propAccessHandler];
}

/** @deprecated Use builtinHandlers instead */
export const builtinPlugins = builtinHandlers;

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

/** @deprecated Use runHandlers instead */
export const runDynamicNodePlugins = runHandlers;

// ────────────────────────────────────────────────────────────────────────────
// Hook Normalization
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a hook to ensure all fields are populated with defaults.
 */
export function normalizeHook(hook: Hook | undefined): Required<Hook> {
  return {
    resolveValue: hook?.resolveValue ?? defaultResolveValue,
    imports: hook?.imports ?? [],
    declarations: hook?.declarations ?? [],
    handlers: hook?.handlers ?? [],
  };
}

/**
 * Convert a legacy Adapter to the new Hook interface.
 */
export function adapterToHook(adapter: Adapter): Hook {
  return {
    resolveValue: (ctx) => adapter.transformValue(ctx),
    imports: adapter.getImports(),
    declarations: adapter.getDeclarations(),
  };
}

/**
 * Check if an object looks like a legacy Adapter.
 */
export function isAdapter(x: unknown): x is Adapter {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.transformValue === "function" &&
    typeof a.getImports === "function" &&
    typeof a.getDeclarations === "function"
  );
}

/**
 * Check if an object looks like a Hook.
 */
export function isHook(x: unknown): x is Hook {
  if (!x || typeof x !== "object") return false;
  const h = x as Record<string, unknown>;
  // A hook has at least one of these optional fields
  return (
    typeof h.resolveValue === "function" ||
    Array.isArray(h.imports) ||
    Array.isArray(h.declarations) ||
    Array.isArray(h.handlers)
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helper for User Authoring
// ────────────────────────────────────────────────────────────────────────────

/**
 * Helper for nicer user authoring + type inference.
 *
 * Usage:
 *   export default defineHook({
 *     resolveValue({ path }) {
 *       return `tokens.${path}`;
 *     },
 *     imports: ["import { tokens } from './tokens';"],
 *   });
 */
export function defineHook(hook: Hook): Hook {
  return hook;
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

function sanitizeIdentifier(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}
