/**
 * Adapter - Single user entry point for customizing the codemod.
 */

import { assertValidAdapter } from "./internal/public-api-validation.js";

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
       * Imported name when the callee is a named import (including aliases).
       * Example: `import { transitionSpeed as ts } ...; ts("x")` -> "transitionSpeed"
       */
      calleeImportedName: string;
      /**
       * Import source for this call: either an absolute file path (relative imports)
       * or the module specifier (package imports).
       */
      calleeSource: { kind: "absolutePath"; value: string } | { kind: "specifier"; value: string };
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
   * These are rendered and merged into the file by the codemod.
   */
  imports: ImportSpec[];
  /**
   * If true, the transformer should drop the corresponding `--name: ...` definition
   * from the emitted style object (useful when replacing with StyleX vars).
   */
  dropDefinition?: boolean;
};

export type ImportSource =
  | { kind: "absolutePath"; value: string }
  | { kind: "specifier"; value: string };

export type ImportSpec = { from: ImportSource; names: Array<{ imported: string; local?: string }> };

// ────────────────────────────────────────────────────────────────────────────
// External Styles Context
// ────────────────────────────────────────────────────────────────────────────

export interface ExternalStylesContext {
  /** Absolute path of the file being transformed */
  filePath: string;
  /** Local name of the styled component */
  componentName: string;
  /** The export name (may differ from componentName for renamed exports) */
  exportName: string;
  /** Whether it's a default export */
  isDefaultExport: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter Interface
// ────────────────────────────────────────────────────────────────────────────

export interface Adapter {
  /** Unified resolver for theme paths + CSS variables. Return null to leave unresolved. */
  resolveValue: (context: ResolveContext) => ResolveResult | null;

  /**
   * Called for exported styled components to determine if they should support
   * external className/style extension. Return true to generate wrapper with
   * className/style/rest merging. Default: false.
   */
  shouldSupportExternalStyles?: (context: ExternalStylesContext) => boolean;
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
 *         return {
 *           expr: `tokens.${ctx.path}`,
 *           imports: [
 *             { from: { kind: "specifier", value: "./tokens" }, names: [{ imported: "tokens" }] },
 *           ],
 *         };
 *       }
 *       return null;
 *     },
 *
 *     // Optional: Enable className/style/rest support for exported components
 *     shouldSupportExternalStyles(ctx) {
 *       // Example: Enable for all exported components in a shared components folder
 *       return ctx.filePath.includes("/shared/components/");
 *     },
 *   });
 */
export function defineAdapter(adapter: Adapter): Adapter {
  // Runtime guard for JS users (no TypeScript help at call sites).
  // Keep this lightweight and dependency-free.
  assertValidAdapter(adapter, "defineAdapter(adapter)");
  return adapter;
}
