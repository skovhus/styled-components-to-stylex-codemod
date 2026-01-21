/**
 * Adapter - Single user entry point for customizing the codemod.
 */

import { assertValidAdapter } from "./internal/public-api-validation.js";

// ────────────────────────────────────────────────────────────────────────────
// Value Resolution
// ────────────────────────────────────────────────────────────────────────────

type ThemeResolveContext = {
  kind: "theme";
  path: string;
  /**
   * Absolute path of the file currently being transformed.
   * Useful for adapter logic that wants to branch by caller file.
   */
  filePath?: string;
};

type CssVariableResolveContext = {
  kind: "cssVariable";
  name: string;
  fallback?: string;
  definedValue?: string;
  /**
   * Absolute path of the file currently being transformed.
   * Useful for adapter logic that wants to branch by caller file.
   */
  filePath?: string;
};

export type CallResolveContext = {
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
  args: Array<{ kind: "literal"; value: string | number | boolean | null } | { kind: "unknown" }>;
};

/**
 * Context for `adapter.resolveValue(...)` (theme + css variables).
 *
 * Helper calls are handled separately via `adapter.resolveCall(...)`.
 */
export type ResolveValueContext = ThemeResolveContext | CssVariableResolveContext;

/**
 * Result for `adapter.resolveValue(...)` (theme + css variables).
 */
export type ResolveValueResult = {
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
   *
   * Note: Only meaningful for `{ kind: "cssVariable" }`.
   */
  dropDefinition?: boolean;
};

export type CallResolveResult = {
  /**
   * Disambiguates how the resolved expression is used:
   * - "props": a StyleX style object suitable for passing to `stylex.props(...)`.
   * - "create": a value that can be used inside `stylex.create(...)` (e.g. tokens/vars).
   */
  usage: "props" | "create";
  /**
   * JS expression string to inline into generated output.
   * Example (value): `vars.spacingSm`
   * Example (styles): `borders.labelMuted`
   */
  expr: string;
  /**
   * Import statements required by `expr`.
   * These are rendered and merged into the file by the codemod.
   */
  imports: ImportSpec[];
};

// Note: we intentionally do NOT expose “unified” ResolveContext/ResolveResult types anymore.
// Consumers should use the specific contexts/results:
// - ResolveValueContext / ResolveValueResult (theme + cssVariable)
// - CallResolveContext / CallResolveResult (call)

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
// Style Merger Configuration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a custom style merger function that combines stylex.props()
 * results with external className/style props.
 *
 * When configured, generates cleaner output:
 *   `{...stylexProps(styles.foo, className, style)}`
 * instead of the verbose pattern:
 *   `{...sx} className={[sx.className, className].filter(Boolean).join(" ")} style={{...sx.style, ...style}}`
 */
export interface StyleMergerConfig {
  /**
   * Function name to use for merging (e.g., "stylexProps" or "mergeStylexProps").
   */
  functionName: string;

  /**
   * Import source for the merger function.
   * Example: `{ kind: "specifier", value: "@company/ui-utils" }`
   */
  importSource: ImportSource;
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter Interface
// ────────────────────────────────────────────────────────────────────────────

export interface Adapter {
  /**
   * Resolver for theme paths + CSS variables.
   *
   * Notes:
   * - Return `{ expr, imports }` for both theme + css variables.
   * - Optionally return `{ dropDefinition: true }` for css variables to remove the local `--x: ...` definition.
   * - Return `null` to leave a value unresolved.
   */
  resolveValue: (context: ResolveValueContext) => ResolveValueResult | null;

  /**
   * Resolver for helper calls found inside template interpolations.
   *
   * Return:
   * - `{ usage: "props", expr, imports }` when the call resolves to a StyleX style object
   *   (usable as an argument to `stylex.props(...)`).
   * - `{ usage: "create", expr, imports }` when the call resolves to a single CSS value
   *   (usable inside `stylex.create(...)` declarations).
   * - `null` to leave the call unresolved (the file may bail with a warning depending on context).
   */
  resolveCall: (context: CallResolveContext) => CallResolveResult | null;

  /**
   * Called for exported styled components to determine if they should support
   * external className/style extension. Return true to generate wrapper with
   * className/style/rest merging.
   */
  shouldSupportExternalStyling: (context: ExternalStylesContext) => boolean;

  /**
   * Custom merger function for className/style combining.
   * When provided, generates cleaner output using this function instead of
   * the verbose className/style merging pattern.
   * Set to `null` to use the verbose pattern (default).
   *
   * Expected merger function signature:
   * ```typescript
   * function merger(
   *   styles: StyleXStyles | StyleXStyles[],
   *   className?: string,
   *   style?: React.CSSProperties
   * ): { className?: string; style?: React.CSSProperties }
   * ```
   */
  styleMerger: StyleMergerConfig | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Helper for User Authoring
// ────────────────────────────────────────────────────────────────────────────

/**
 * Helper for nicer user authoring + type inference.
 *
 * `defineAdapter(...)` also performs runtime validation (helpful for JS consumers)
 * and will throw a descriptive error message if the adapter shape is invalid.
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
 *     resolveCall(ctx) {
 *       // Resolve helper calls inside template interpolations.
 *       // Return:
 *       // - { usage: "props", expr, imports } for StyleX styles (usable in stylex.props)
 *       // - { usage: "create", expr, imports } for a single value (usable in stylex.create)
 *       // - null to leave the call unresolved
 *       void ctx;
 *       return null;
 *     },
 *
 *     // Enable className/style/rest support for exported components
 *     shouldSupportExternalStyling(ctx) {
 *       // Example: Enable for all exported components in a shared components folder
 *       return ctx.filePath.includes("/shared/components/");
 *     },
 *
 *     // Optional: provide a custom merger, or use `null` for the default verbose merge output
 *     styleMerger: null,
 *   });
 */
export function defineAdapter(adapter: Adapter): Adapter {
  // Runtime guard for JS users (no TypeScript help at call sites).
  // Keep this lightweight and dependency-free.
  assertValidAdapter(adapter, "defineAdapter(adapter)");
  return adapter;
}
