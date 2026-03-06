/**
 * Adapter entry point for customizing the codemod.
 * Core concepts: value resolution hooks and adapter validation.
 */

import { assertValidAdapterInput } from "./internal/public-api-validation.js";

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
   * Member path segments on the callee (e.g., for `ColorConverter.cssWithAlpha()`, `["cssWithAlpha"]`).
   * Only present when the callee is a member expression. The root object's import info
   * is in `calleeImportedName`/`calleeSource`.
   */
  calleeMemberPath?: string[];
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

export type CallResolveResultWithExpr = {
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
   * When the resolved expression is combined with a dynamic argument (e.g., from a prop),
   * this field controls how they are joined:
   * - `"call"` (default): `resolvedExpr(arg)` — treat as a function call
   * - `"memberAccess"`: `resolvedExpr[arg]` — treat as a computed member access
   *
   * Only relevant when the original code uses a pattern like `${(props) => helper(props.x)}`
   * and the adapter returns a resolved expression for the helper.
   */
  dynamicArgUsage?: "call" | "memberAccess";

  /**
   * Optional raw CSS text for helpers that return CSS declaration blocks.
   *
   * When provided alongside `usage: "props"`, the codemod can expand the CSS
   * declarations for pseudo-selector wrapping. Without this, the codemod treats
   * the resolved expression as opaque and cannot wrap individual properties
   * inside pseudo selectors like `:hover`.
   *
   * Example: `"white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"`
   */
  cssText?: string;

  /**
   * When true, keeps the original helper call as a runtime style-function override
   * in addition to the resolved static value.
   *
   * This is useful for incremental migrations where you still want to run an
   * existing runtime helper (for example `ColorConverter.cssWithAlpha(...)`) while
   * also emitting a static StyleX fallback.
   *
   * Behavior notes:
   * - In `CallResolveResultWithExpr`, `expr`/`imports` are used as a static fallback in
   *   `stylex.create(...)`.
   * - In `CallResolveRuntimeOnlyResult`, no static fallback is emitted.
   * - The runtime override is only emitted for arrow-function helper call interpolations.
   * - Theme access in the original call is rewritten to use the wrapper `useTheme()` value.
   */
  preserveRuntimeCall?: boolean;
};

export type CallResolveRuntimeOnlyResult = {
  /**
   * Keep the original helper call as a runtime style-function override, without
   * requiring a static fallback expression.
   *
   * This mode is only supported for helper calls used as CSS values (not StyleX
   * style-object references).
   */
  preserveRuntimeCall: true;
  /**
   * Optional usage hint. Runtime-only results are treated as CSS-value usage.
   */
  usage?: "create";
};

export type CallResolveResult = CallResolveResultWithExpr | CallResolveRuntimeOnlyResult;

// Note: we intentionally do NOT expose “unified” ResolveContext/ResolveResult types anymore.
// Consumers should use the specific contexts/results:
// - ResolveValueContext / ResolveValueResult (theme + cssVariable)
// - CallResolveContext / CallResolveResult (call)

export type ImportSource =
  | { kind: "absolutePath"; value: string }
  | { kind: "specifier"; value: string };

export type ImportSpec = { from: ImportSource; names: Array<{ imported: string; local?: string }> };

// ────────────────────────────────────────────────────────────────────────────
// Base Component Resolution
// ────────────────────────────────────────────────────────────────────────────

export type ResolveBaseComponentStaticValue = string | number | boolean;

export interface ResolveBaseComponentContext {
  /**
   * Import source for the wrapped base component.
   * - package import: "@linear/orbiter/components/Flex"
   * - relative import: resolved absolute path
   */
  importSource: string;
  /**
   * Imported binding name for the wrapped base component.
   * Example: `import { Flex as OrbiterFlex } ...` -> importedName: "Flex"
   */
  importedName: string;
  /**
   * Static props from `.attrs({...})` and/or JSX call sites.
   * Includes only literal values that can be resolved at codemod time.
   */
  staticProps: Record<string, ResolveBaseComponentStaticValue>;
  /**
   * Absolute path of the file currently being transformed.
   * Useful for resolver logic that branches by caller file.
   */
  filePath: string;
}

export interface ResolveBaseComponentMixinRef {
  /** Import source for the mixin namespace/object (module specifier or absolute path) */
  importSource: string;
  /** Imported binding name for the mixin namespace/object (e.g., "mixins") */
  importName: string;
  /** Property key on the imported namespace/object (e.g., "flex") */
  styleKey: string;
}

export interface ResolveBaseComponentResult {
  /** Intrinsic element to render after inlining (e.g., "div", "section") */
  tagName: string;
  /** Props consumed by the resolver and stripped from DOM forwarding */
  consumedProps: string[];
  /** Base StyleX declarations merged into stylex.create() (camelCase, no shorthands) */
  sx?: Record<string, string>;
  /** External StyleX mixin references included in stylex.props(...) */
  mixins?: ResolveBaseComponentMixinRef[];
}

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
 *
 * Two kinds are supported:
 * - `"media"`: maps a selector interpolation to a media query computed key
 * - `"pseudoAlias"`: maps `&:${expr}` to N pseudo style objects (one per value),
 *   wrapped in a `styleSelectorExpr` function call for runtime selection.
 */
export type SelectorResolveResult =
  | {
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
    }
  | {
      kind: "pseudoAlias";
      /**
       * Pseudo-class names without leading colon.
       * Example: ["active", "hover"]
       */
      values: string[];
      /**
       * JS expression for runtime selection.
       * Emits `expr({ active: styles.keyActive, hover: styles.keyHover })`
       * with an object whose keys are the `values` entries.
       */
      styleSelectorExpr: string;
      /**
       * Import statements required by `styleSelectorExpr`.
       */
      imports: ImportSpec[];
    }
  | {
      kind: "pseudoExpand";
      /**
       * List of pseudo-classes to expand into a single merged style object.
       * Each pseudo can optionally be wrapped in a condition (e.g., a `defineConsts` media query).
       *
       * Example: `[{ pseudo: "active" }, { pseudo: "hover", condition: { expr: "$interaction.canHover", imports: [...] } }]`
       */
      expansions: Array<{
        /** Pseudo-class name without leading colon (e.g., "active", "hover") */
        pseudo: string;
        /** Optional condition wrapping this pseudo entry (e.g., a defineConsts key) */
        condition?: {
          /** JS expression string (e.g., "$interaction.canHover") */
          expr: string;
          /** Imports required by the condition expression */
          imports: ImportSpec[];
        };
      }>;
      /**
       * Shared imports for the overall expansion (not per-condition).
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
 * - `styles` — accept external className/style props
 * - `as` — accept polymorphic `as` prop
 * - `ref` — include `ref` in the component's public type
 *
 * Examples:
 * - `{ styles: true, as: false, ref: false }` → className/style support only
 * - `{ styles: true, as: true, ref: true }` → full external interface
 * - `{ styles: false, as: false, ref: false }` → no external interface support
 */
export type ExternalInterfaceResult = { styles: boolean; as: boolean; ref: boolean };

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

/**
 * Configuration for the theme hook used when wrapper emission needs runtime theme access
 * (e.g. theme boolean conditionals that cannot be fully lowered statically).
 *
 * Defaults to:
 * - functionName: "useTheme"
 * - importSource: { kind: "specifier", value: "styled-components" }
 */
export interface ThemeHookConfig {
  /**
   * Function name to call in emitted wrappers (e.g. "useTheme", "useDesignSystemTheme").
   */
  functionName: string;

  /**
   * Import source for the hook function.
   * Example: `{ kind: "specifier", value: "@company/theme" }`
   */
  importSource: ImportSource;
}

export const DEFAULT_THEME_HOOK: ThemeHookConfig = {
  functionName: "useTheme",
  importSource: { kind: "specifier", value: "styled-components" },
};

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
   * - `{ preserveRuntimeCall: true }` to keep only the original runtime helper call
   *   (no static fallback)
   * - Optional: add `preserveRuntimeCall: true` to also keep the original helper
   *   call at runtime as a wrapper style-function override
   * - `undefined` to bail/skip the file
   */
  resolveCall: (context: CallResolveContext) => CallResolveResult | undefined;

  /**
   * Resolver for interpolations used in selector position.
   *
   * This handles patterns like `${screenSize.phone} { ... }` where an imported
   * value is used as a CSS selector (typically a media query helper), and
   * `&:${highlight}` where an imported value picks a pseudo-class.
   *
   * Return:
   * - `{ kind: "media", expr, imports }` when the interpolation resolves to a media query
   * - `{ kind: "pseudoAlias", values, styleSelectorExpr?, imports? }` for pseudo-class expansion
   * - `undefined` to bail/skip the file
   */
  resolveSelector: (context: SelectorResolveContext) => SelectorResolveResult | undefined;

  /**
   * Optional resolver for inlining `styled(ImportedBase)` components.
   *
   * Return:
   * - `{ tagName, consumedProps, sx?, mixins? }` to inline the base component
   * - `undefined` to keep normal `styled(Component)` behavior
   */
  resolveBaseComponent?: (
    context: ResolveBaseComponentContext,
  ) => ResolveBaseComponentResult | undefined;

  /**
   * Called for exported styled components to determine their external interface.
   *
   * Return:
   * - `{ styles: false, as: false, ref: false }` → no external interface
   * - `{ styles: true, as: false, ref: false }` → accept className/style props only
   * - `{ styles: true, as: true, ref: true }` → full external interface
   * - `{ styles: false, as: true, ref: false }` → accept only polymorphic `as` prop
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
   *   className?: string | (string | undefined | false | null)[],
   *   style?: React.CSSProperties
   * ): { className?: string; style?: React.CSSProperties }
   * ```
   */
  styleMerger: StyleMergerConfig | null;

  /**
   * Optional theme hook import/call customization for wrapper code that needs runtime theme access.
   *
   * When omitted, defaults to:
   * `{ functionName: "useTheme", importSource: { kind: "specifier", value: "styled-components" } }`
   */
  themeHook?: ThemeHookConfig;

  /**
   * Emit `sx={...}` JSX attributes instead of `{...stylex.props(...)}` spreads
   * on intrinsic elements. Requires `@stylexjs/babel-plugin` ≥0.18 with the
   * `sxPropName` option (defaults to `"sx"`).
   *
   * When enabled, the codemod produces shorter output:
   *   `<div sx={styles.base} />`  instead of  `<div {...stylex.props(styles.base)} />`
   *
   * Only applies to simple cases without className/style merging.
   *
   */
  useSxProp: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter Input (user-facing, allows "auto" for externalInterface)
// ────────────────────────────────────────────────────────────────────────────

/**
 * User-facing adapter input type accepted by `defineAdapter()`.
 *
 * Same as `Adapter` except `externalInterface` may also be the string `"auto"`.
 * When `"auto"` is used, `runTransform()` automatically scans consumer code
 * (using `consumerPaths` / `files` globs) to detect which exported components
 * are re-styled or used with the `as` prop.
 */
export interface AdapterInput {
  resolveValue: Adapter["resolveValue"];
  resolveCall: Adapter["resolveCall"];
  resolveSelector: Adapter["resolveSelector"];
  resolveBaseComponent?: Adapter["resolveBaseComponent"];

  /**
   * Called for exported styled components to determine their external interface.
   *
   * - Pass a function for manual control.
   * - Pass `"auto"` to auto-detect usage from consumer code (requires `consumerPaths`
   *   in `runTransform()`).
   */
  externalInterface: "auto" | Adapter["externalInterface"];

  styleMerger: Adapter["styleMerger"];
  themeHook?: Adapter["themeHook"];
  useSxProp: Adapter["useSxProp"];
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
 *       // Resolve imported values used in selector position.
 *       // Return one of:
 *       // - { kind: "media", expr, imports } for media queries (e.g., breakpoints.phone)
 *       // - { kind: "pseudoAlias", values, styleSelectorExpr?, imports? } for pseudo-class expansion
 *       // - undefined to bail/skip the file
 *       void ctx;
 *     },
 *
 *     // Configure external interface for exported components
 *     externalInterface(ctx) {
 *       // Example: Enable styles, `as`, and `ref` for shared components folder
 *       if (ctx.filePath.includes("/shared/components/")) {
 *         return { styles: true, as: true, ref: true };
 *       }
 *       return { styles: false, as: false, ref: false };
 *     },
 *
 *     // Optional: provide a custom merger, or use `null` for the default verbose merge output
 *     styleMerger: null,
 *
 *     // Emit sx={} JSX attributes instead of {...stylex.props()} spreads (requires StyleX ≥0.18)
 *     useSxProp: false,
 *
 *     // Optional: customize runtime theme hook import/call used by emitted wrappers
 *     themeHook: {
 *       functionName: "useTheme",
 *       importSource: { kind: "specifier", value: "styled-components" },
 *     },
 *   });
 */
export function defineAdapter<T extends AdapterInput>(adapter: T): T {
  // Runtime guard for JS users (no TypeScript help at call sites).
  // Keep this lightweight and dependency-free.
  assertValidAdapterInput(adapter, "defineAdapter(adapter)");
  return adapter;
}
