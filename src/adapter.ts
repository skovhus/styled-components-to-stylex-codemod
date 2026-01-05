/**
 * Adapter - Single user entry point for customizing the codemod.
 */

import type { API } from "jscodeshift";

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
