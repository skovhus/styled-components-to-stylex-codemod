/**
 * Adapter - Single user entry point for customizing the codemod.
 */

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
    }
  | {
      kind: "call";
      /**
       * Absolute path of the file currently being transformed.
       * Useful for adapter logic that wants to branch by caller file.
       */
      callSiteFilePath: string;
      /**
       * Callee identifier used at the call site (includes alias).
       * Example: `ts("x")` -> "ts"
       */
      calleeLocalName: string;
      /**
       * Imported name when the callee is a named import (including aliases).
       * Example: `import { transitionSpeed as ts } ...; ts("x")` -> "transitionSpeed"
       */
      calleeImportedName?: string;
      /**
       * Best-effort resolved absolute path for the module that provides the imported symbol.
       * Only set for resolvable relative imports.
       */
      calleeFromFilePath?: string;
      /**
       * Call arguments (only literals are surfaced precisely; everything else is `unknown`).
       */
      args: Array<
        { kind: "literal"; value: string | number | boolean | null } | { kind: "unknown" }
      >;
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
// Adapter Interface
// ────────────────────────────────────────────────────────────────────────────

export interface Adapter {
  /** Unified resolver for theme paths + CSS variables. Return null to leave unresolved. */
  resolveValue: (context: ResolveContext) => ResolveResult | null;
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
