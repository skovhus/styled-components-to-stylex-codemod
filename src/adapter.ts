/**
 * Adapter entry point for customizing the codemod.
 * Core concepts: value resolution hooks and adapter validation.
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
  filePath: string;
  /**
   * Source location (line/column) of the expression being resolved.
   * Useful for error reporting.
   */
  loc?: { line: number; column: number };
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
  filePath: string;
  /**
   * Source location (line/column) of the expression being resolved.
   * Useful for error reporting.
   */
  loc?: { line: number; column: number };
};

type ImportedValueResolveContext = {
  kind: "importedValue";
  /**
   * Imported name of the binding used in the interpolation.
   * Example: `import { zIndex as z } from "./lib"` -> importedName: "zIndex"
   */
  importedName: string;
  /**
   * Import source for the binding.
   */
  source: ImportSource;
  /**
   * Member path from the imported binding (if any).
   * Example: `zIndex.popover` -> "popover"
   */
  path?: string;
  /**
   * Absolute path of the file currently being transformed.
   * Useful for adapter logic that wants to branch by caller file.
   */
  filePath: string;
  /**
   * Source location (line/column) of the expression being resolved.
   * Useful for error reporting.
   */
  loc?: { line: number; column: number };
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
   * Call arguments.
   * - literals are surfaced precisely
   * - theme member access can be surfaced as `{ kind: "theme", path }`
   * - everything else is `unknown`
   */
  args: Array<
    | { kind: "literal"; value: string | number | boolean | null }
    | { kind: "theme"; path: string }
    | { kind: "unknown" }
  >;
  /**
   * Source location (line/column) of the call expression being resolved.
   * Useful for error reporting.
   */
  loc?: { line: number; column: number };
  /**
   * CSS property being set (when available).
   * Useful for adapters to return different results for directional properties.
   * Example: "border-left", "border", "color"
   */
  cssProperty?: string;
};

/**
 * Context for `adapter.resolveValue(...)` (theme + css variables + imported values).
 *
 * Helper calls are handled separately via `adapter.resolveCall(...)`.
 */
export type ResolveValueContext =
  | ThemeResolveContext
  | CssVariableResolveContext
  | ImportedValueResolveContext;

/**
 * Result for `adapter.resolveValue(...)` (theme + css variables + imported values).
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
  /**
   * Disambiguates how the resolved expression is used:
   * - "props": a StyleX style object suitable for passing to `stylex.props(...)`.
   *   Use this when resolving imported styled component mixins to their StyleX equivalent.
   * - undefined (default): a value that can be used inside `stylex.create(...)`.
   *
   * Note: Only meaningful for `{ kind: "importedValue" }`.
   */
  usage?: "props";
};

export type CallResolveResult = {
  /**
   * JS expression string to inline into generated output.
   *
   * The codemod determines how to use this expression based on context:
   * - If called with a CSS property (e.g., `border: ${helper()}`) → used as a CSS value
   * - If called without a CSS property (e.g., `${helper()}`) → used as a StyleX style object
   *
   * Use `ctx.cssProperty` to check the context and return the appropriate expression.
   *
   * Example (CSS value): `\`1px solid \${$colors.labelMuted}\``
   * Example (StyleX reference): `helpers.truncate`
   */
  expr: string;
  /**
   * Import statements required by `expr`.
   * These are rendered and merged into the file by the codemod.
   */
  imports: ImportSpec[];
  /**
   * Disambiguates how the resolved expression is used:
   * - `"create"`: Use as a CSS value in `stylex.create()` property values
   * - `"props"`: Use as a StyleX styles reference in `stylex.props()`
   *
   * When not specified, the codemod infers from context:
   * - If `cssProperty` exists → treated as `"create"`
   * - If `cssProperty` doesn't exist → treated as `"props"`
   *
   * Use this field when the default inference is incorrect, such as when a helper
   * returns a StyleX styles object even when used with a CSS property like `border:`.
   */
  usage?: "create" | "props";
  /**
   * Optional raw StyleX style object for contexts that need inlining
   * (e.g., nested selectors where `stylex.props(...)` cannot be used).
   *
   * When provided, the codemod may prefer this object over `expr`
   * to preserve selector context safely.
   */
  style?: StylexStyleObject;
};

export interface StylexStyleObject {
  [key: string]: StylexStyleValue;
}
export type StylexStyleValue = string | number | boolean | null | StylexStyleObject;

// Note: we intentionally do NOT expose “unified” ResolveContext/ResolveResult types anymore.
// Consumers should use the specific contexts/results:
// - ResolveValueContext / ResolveValueResult (theme + cssVariable)
// - CallResolveContext / CallResolveResult (call)

export type ImportSource =
  | { kind: "absolutePath"; value: string }
  | { kind: "specifier"; value: string };

export type ImportSpec = { from: ImportSource; names: Array<{ imported: string; local?: string }> };

// ────────────────────────────────────────────────────────────────────────────
// Selector Interpolation Resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Context for `adapter.resolveSelector(...)`.
 *
 * This handles patterns like `${screenSize.phone} { ... }` where an imported
 * value is used as a CSS selector (typically a media query helper).
 */
export type SelectorResolveContext = {
  kind: "selectorInterpolation";
  /**
   * Imported name of the binding used in the interpolation.
   * Example: `import { screenSize } from "./lib"` -> importedName: "screenSize"
   */
  importedName: string;
  /**
   * Import source for the binding.
   */
  source: ImportSource;
  /**
   * Member path from the imported binding (if any).
   * Example: `screenSize.phone` -> "phone"
   */
  path?: string;
  /**
   * Absolute path of the file currently being transformed.
   */
  filePath: string;
  /**
   * Source location (line/column) of the selector interpolation being resolved.
   * Useful for error reporting.
   */
  loc?: { line: number; column: number };
};

/**
 * Result for `adapter.resolveSelector(...)`.
 */
export type SelectorResolveResult = {
  /**
   * The kind of selector resolved.
   * Currently only "media" is supported.
   */
  kind: "media";
  /**
   * JS expression to use as the computed property key.
   * Should reference a `defineConsts` value for media queries.
   * Example: "breakpoints.phone"
   */
  expr: string;
  /**
   * Import statements required by `expr`.
   * Example: [{ from: { kind: "specifier", value: "./breakpoints.stylex" }, names: [{ imported: "breakpoints" }] }]
   */
  imports: ImportSpec[];
};

// ────────────────────────────────────────────────────────────────────────────
// External Interface Context and Result
// ────────────────────────────────────────────────────────────────────────────

export interface ExternalInterfaceContext {
  /** Absolute path of the file being transformed */
  filePath: string;
  /** Local name of the styled component */
  componentName: string;
  /** The export name (may differ from componentName for renamed exports) */
  exportName: string;
  /** Whether it's a default export */
  isDefaultExport: boolean;
}

/**
 * Result type for `adapter.externalInterface(...)`.
 *
 * - `null` → no external interface support (neither styles nor `as`)
 * - `{ styles: true }` → enable className/style support AND polymorphic `as` prop
 * - `{ styles: false, as: true }` → enable only polymorphic `as` prop (no style merging)
 * - `{ styles: false, as: false }` → equivalent to `null`
 *
 * Note: When `styles: true`, the `as` prop is always enabled because the style
 * merging implementation requires polymorphic rendering support.
 */
export type ExternalInterfaceResult = { styles: true } | { styles: false; as: boolean } | null;

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
   * Resolver for theme paths + CSS variables + imported values.
   *
   * Return:
   * - `{ expr, imports }` for theme, css variables, and imported values.
   * - Optionally return `{ dropDefinition: true }` for css variables to remove the local `--x: ...` definition.
   * - `undefined` to bail/skip the file (for cssVariable: keeps the original `var(...)` unchanged)
   */
  resolveValue: (context: ResolveValueContext) => ResolveValueResult | undefined;

  /**
   * Resolver for helper calls found inside template interpolations.
   *
   * The codemod determines how to use the result based on context:
   * - If `ctx.cssProperty` exists (e.g., `border: ${helper()}`) → result is used as a CSS value
   * - If `ctx.cssProperty` is undefined (e.g., `${helper()}`) → result is used as a StyleX style object
   *
   * Use `ctx.cssProperty` to return the appropriate expression for the context.
   *
   * Return:
   * - `{ expr, imports }` with the resolved expression
   * - `undefined` to bail/skip the file
   */
  resolveCall: (context: CallResolveContext) => CallResolveResult | undefined;

  /**
   * Resolver for interpolations used in selector position.
   *
   * This handles patterns like `${screenSize.phone} { ... }` where an imported
   * value is used as a CSS selector (typically a media query helper).
   *
   * Return:
   * - `{ kind: "media", expr, imports }` when the interpolation resolves to a media query
   * - `undefined` to bail/skip the file
   */
  resolveSelector: (context: SelectorResolveContext) => SelectorResolveResult | undefined;

  /**
   * Called for exported styled components to determine their external interface.
   *
   * Return:
   * - `null` → no external interface (neither styles nor `as`)
   * - `{ styles: true }` → accept className/style props AND polymorphic `as` prop
   * - `{ styles: false, as: true }` → accept only polymorphic `as` prop
   * - `{ styles: false, as: false }` → equivalent to `null`
   */
  externalInterface: (context: ExternalInterfaceContext) => ExternalInterfaceResult;

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
 *       // Return undefined to bail/skip the file
 *     },
 *
 *     resolveCall(ctx) {
 *       // Resolve helper calls inside template interpolations.
 *       // Use ctx.cssProperty to determine context:
 *       // - If ctx.cssProperty exists → return a CSS value expression
 *       // - If ctx.cssProperty is undefined → return a StyleX style object reference
 *       // Return { expr, imports } or undefined to bail/skip the file
 *       void ctx;
 *     },
 *
 *     resolveSelector(ctx) {
 *       // Resolve imported values used in selector position (e.g., media query helpers).
 *       // Return:
 *       // - { kind: "media", expr, imports } for media queries (e.g., breakpoints.phone)
 *       // - undefined to bail/skip the file
 *       void ctx;
 *     },
 *
 *     // Configure external interface for exported components
 *     externalInterface(ctx) {
 *       // Example: Enable styles (and `as`) for shared components folder
 *       if (ctx.filePath.includes("/shared/components/")) {
 *         return { styles: true };
 *       }
 *       return null;
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
