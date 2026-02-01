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
 * - `null` → no external interface support (neither className nor `as`)
 * - `{ className: true }` → enable className support AND polymorphic `as` prop
 * - `{ className: false, as: true }` → enable only polymorphic `as` prop (no className merging)
 * - `{ className: false, as: false }` → equivalent to `null`
 *
 * Note: External `style` props are NOT supported. StyleX manages styles internally,
 * and allowing external style props would bypass the type-safe styling system.
 * Dynamic styles should be handled via StyleX's inline style props mechanism instead.
 *
 * Note: When `className: true`, the `as` prop is always enabled because the className
 * merging implementation requires polymorphic rendering support.
 */
export type ExternalInterfaceResult =
  | { className: true }
  | { className: false; as: boolean }
  | null;

// ────────────────────────────────────────────────────────────────────────────
// Style Merger Configuration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a custom style merger function that combines stylex.props()
 * results with external className props.
 *
 * When configured, generates cleaner output:
 *   `{...stylexProps(styles.foo, className)}`
 * instead of the verbose pattern:
 *   `{...sx} className={[sx.className, className].filter(Boolean).join(" ")}`
 *
 * Note: External `style` props are NOT supported. Dynamic styles should be handled
 * via StyleX's inline style props mechanism instead.
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
   * Return:
   * - `{ usage: "props", expr, imports }` when the call resolves to a StyleX style object
   *   (usable as an argument to `stylex.props(...)`).
   * - `{ usage: "create", expr, imports }` when the call resolves to a single CSS value
   *   (usable inside `stylex.create(...)` declarations).
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
   * - `null` → no external interface (neither className nor `as`)
   * - `{ className: true }` → accept className prop AND polymorphic `as` prop
   * - `{ className: false, as: true }` → accept only polymorphic `as` prop
   * - `{ className: false, as: false }` → equivalent to `null`
   *
   * Note: External `style` props are NOT supported. Dynamic styles should be
   * handled via StyleX's inline style props mechanism instead.
   */
  externalInterface: (context: ExternalInterfaceContext) => ExternalInterfaceResult;

  /**
   * Custom merger function for className combining.
   * When provided, generates cleaner output using this function instead of
   * the verbose className merging pattern.
   * Set to `null` to use the verbose pattern (default).
   *
   * Expected merger function signature:
   * ```typescript
   * function merger(
   *   styles: StyleXStyles | StyleXStyles[],
   *   className?: string
   * ): { className?: string; style?: React.CSSProperties }
   * ```
   *
   * Note: External `style` props are NOT supported. Dynamic styles should be
   * handled via StyleX's inline style props mechanism instead.
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
 *       // Return:
 *       // - { usage: "props", expr, imports } for StyleX styles (usable in stylex.props)
 *       // - { usage: "create", expr, imports } for a single value (usable in stylex.create)
 *       // - undefined to bail/skip the file
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
 *       // Example: Enable className (and `as`) for shared components folder
 *       if (ctx.filePath.includes("/shared/components/")) {
 *         return { className: true };
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
