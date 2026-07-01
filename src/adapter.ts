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
  /**
   * CSS property being set (when available).
   * Useful for adapters to return directional results for shorthand properties.
   * Example: "padding", "margin", "border"
   */
  cssProperty?: string;
  /**
   * When true, this resolution is for an indexed (bracket) lookup like
   * `props.theme.color[props.$bg]`. The adapter can use this to return a
   * CSS-property-aware prebuilt mixin map (`usage: "props"`) instead of a
   * raw token object used in `stylex.create()`.
   */
  indexedLookup?: boolean;
};

type CssVariableResolveContext = {
  kind: "cssVariable";
  name: string;
  fallback?: string;
  definedValue?: string;
  /**
   * CSS property being set (when available).
   * Useful for adapters that need to resolve CSS-variable-backed tokens to
   * assignable literals for properties typed as literal unions (e.g. "cursor").
   */
  cssProperty?: string;
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
  /**
   * CSS property being set (when available).
   * Useful for adapters to return directional results for shorthand properties.
   * Example: "padding", "margin", "border"
   */
  cssProperty?: string;
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
   * - theme object/member access can be surfaced as `{ kind: "theme", path }`
   *   (`path === ""` means the whole theme object)
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
 * Context for `adapter.resolveThemeCall(...)`.
 *
 * This handles patterns like `props.theme.highlightVariant(props.theme.color.bgBorderSolid)`
 * where a method on the theme object is called with theme-dependent arguments.
 */
export type ThemeCallResolveContext = {
  /** Absolute path of the file being transformed. */
  callSiteFilePath: string;
  /** The method name on the theme object (e.g., "highlightVariant"). */
  methodName: string;
  /** Call arguments (same format as CallResolveContext.args). */
  args: CallResolveContext["args"];
  /** Source location of the call. */
  loc?: { line: number; column: number };
  /** CSS property being set (when available). */
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
 * Result for `adapter.resolveValue(...)` when returning directional expansion
 * instead of a single value. Use this for shorthand CSS properties (e.g., `padding`)
 * whose theme token resolves to a multi-value string (e.g., `"6px 12px"`).
 *
 * Instead of assigning the opaque token to the shorthand (which StyleX would expand
 * incorrectly to all longhands), the adapter returns pre-split directional entries.
 */
export type ResolveValueDirectionalResult = {
  /** Directional expansion entries — use instead of shorthand property */
  directional: Array<{
    /** camelCase CSS property (e.g., "paddingBlock", "paddingInline") */
    prop: string;
    /** JS expression string to inline into generated output */
    expr: string;
    /** Import statements required by `expr` */
    imports: ImportSpec[];
  }>;
};

/**
 * Type guard: checks whether a resolve result is a directional expansion.
 */
export function isDirectionalResult(
  r: ResolveValueResult | ResolveValueDirectionalResult,
): r is ResolveValueDirectionalResult {
  return "directional" in r;
}

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
   *   Use this when resolving imported styled component mixins to their StyleX equivalent,
   *   or for indexed theme lookups that resolve to prebuilt per-property mixin maps.
   * - undefined (default): a value that can be used inside `stylex.create(...)`.
   *
   * Meaningful for `{ kind: "importedValue" }` and `{ kind: "theme" }` with `indexedLookup`.
   */
  usage?: "props";
  /**
   * Optional raw CSS text for imported values that resolve to StyleX style objects.
   *
   * When provided alongside `usage: "props"`, the codemod can expand the CSS
   * declarations under nested selectors such as `:focus-visible`. Without this,
   * imported StyleX object values are treated as opaque and are only safe at the
   * base selector.
   */
  cssText?: string;
  /**
   * When `usage` is `"props"` and the resolved expression should be indexed with a
   * dynamic prop value (e.g., `$colorMixins.backgroundColor[propValue]`):
   * - `"memberAccess"`: the codemod applies `expr[propValue]` computed member access
   *
   * Only meaningful when `usage` is `"props"` and the resolution context is an indexed
   * theme lookup (`indexedLookup: true`).
   */
  dynamicArgUsage?: "memberAccess";
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

  /**
   * Additional className expressions to merge into the component's className attribute.
   *
   * Used for CSS modules or other class-based styles that StyleX cannot express
   * (child selectors like `& > *`, ancestor selectors like `html:not(.class) &`, etc.).
   *
   * Each entry provides an expression string (e.g., `cssModuleStyles.myClass`)
   * and its required imports.
   *
   * When present, the codemod merges these expressions into the rendered element's
   * className alongside any existing static className from `.attrs()` or bridge classes.
   */
  extraClassNames?: ExprWithImports[];
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

/**
 * Resolved result containing only className expressions (no StyleX style object).
 * Used for CSS modules or other class-based styles that StyleX cannot express.
 */
export type CallResolveClassNamesResult = {
  /**
   * className expressions to merge into the component's className attribute.
   */
  extraClassNames: ExprWithImports[];
};

export type CallResolveResult =
  | CallResolveResultWithExpr
  | CallResolveRuntimeOnlyResult
  | CallResolveClassNamesResult;

// Note: we intentionally do NOT expose “unified” ResolveContext/ResolveResult types anymore.
// Consumers should use the specific contexts/results:
// - ResolveValueContext / ResolveValueResult (theme + cssVariable)
// - CallResolveContext / CallResolveResult (call)

export type ImportSource =
  | { kind: "absolutePath"; value: string }
  | { kind: "specifier"; value: string };

export type ImportSpec = {
  from: ImportSource;
  names: Array<{ imported: string; local?: string }>;
};

/** An expression string with its required imports, used for className emission. */
export type ExprWithImports = { expr: string; imports: ImportSpec[] };

// ────────────────────────────────────────────────────────────────────────────
// Base Component Resolution
// ────────────────────────────────────────────────────────────────────────────

export type ResolveBaseComponentStaticValue = string | number | boolean;

export interface ResolveBaseComponentContext {
  /**
   * Import source for the wrapped base component.
   * - package import: "@acme/design-system/components/Flex"
   * - relative import: resolved absolute path
   */
  importSource: string;
  /**
   * Imported binding name for the wrapped base component.
   * Example: `import { Flex as DesignSystemFlex } ...` -> importedName: "Flex"
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
 * value is used as a CSS selector (typically a media query helper), and
 * `@media (min-width: ${breakpoint}px)` where an imported value is used inside
 * a media query.
 */
type BaseSelectorResolveContext = {
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

export type SelectorResolveContext =
  | (BaseSelectorResolveContext & {
      kind: "selectorInterpolation";
    })
  | (BaseSelectorResolveContext & {
      kind: "mediaQueryInterpolation";
      /**
       * Context for an interpolation inside an at-rule such as
       * `@media (min-width: ${breakpoint}px)`.
       */
      mediaQuery: {
        /**
         * Full at-rule text with interpolation slots preserved as
         * `__SC_EXPR_N__` placeholders.
         * Example: `@media (min-width: __SC_EXPR_0__px)`.
         */
        atRule: string;
        /** Placeholder slot id for this interpolation. */
        slotId: number;
        /** Static at-rule text before the interpolation placeholder. */
        before: string;
        /** Static at-rule text after the interpolation placeholder. */
        after: string;
        /**
         * Parsed media feature for common range features like
         * `(min-width: ${value}px)` and `(max-width: ${value}px)`.
         */
        feature?: {
          modifier?: "min" | "max";
          name: string;
          unit?: string;
        };
      };
    });

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
export type ExternalInterfaceResult = {
  styles: boolean;
  as: boolean;
  ref: boolean;
  /** Whether cross-file consumers pass className prop (undefined → derive from `styles`) */
  className?: boolean;
  /** Whether cross-file consumers pass style prop (undefined → derive from `styles`) */
  style?: boolean;
  /** Whether cross-file consumers pass element-specific props (onClick, aria-*, etc.) */
  elementProps?: boolean;
  /** Whether cross-file consumers use JSX spread ({...props}) */
  spreadProps?: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// Marker File Configuration
// ────────────────────────────────────────────────────────────────────────────

export interface MarkerFileContext {
  /** Absolute path of the file being transformed */
  filePath: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Wrapped Component Interface
// ────────────────────────────────────────────────────────────────────────────

/**
 * Context for `adapter.wrappedComponentInterface(...)`.
 *
 * Called for each `styled(Component)` declaration where `Component` is
 * imported from another module. Lets the adapter declare that the wrapped
 * component already accepts a StyleX `sx` prop so the codemod can emit
 * `sx={style}` instead of `{...stylex.props(style)}`.
 */
export interface WrappedComponentInterfaceContext {
  /**
   * Local binding name used in the file currently being transformed.
   * Example: `import { Button as UiButton } ...` -> localName: "UiButton"
   * For static member components, this is the full member path from the local binding,
   * e.g. `Select.Option`.
   */
  localName: string;
  /**
   * Import source for the wrapped base component.
   * - package import: e.g. `"@company/ui"`
   * - relative import: resolved absolute path
   */
  importSource: string;
  /**
   * Imported binding name for the wrapped base component.
   * Example: `import { Button as UiButton } ...` -> importedName: "Button"
   * For static member components, this remains the root imported binding.
   */
  importedName: string;
  /**
   * Static member path after the root local binding.
   * Example: `styled(Select.Option)` -> `["Option"]`.
   */
  memberPath?: string[];
  /**
   * Absolute path of the file currently being transformed.
   */
  filePath: string;
}

/**
 * Result for `adapter.wrappedComponentInterface(...)`.
 *
 * - `acceptsSx: true` — the wrapped component accepts an `sx` prop. The codemod
 *   emits `sx={style}` instead of `{...stylex.props(style)}` and skips
 *   className/style merging in the wrapper (the wrapped component owns that).
 */
export interface WrappedComponentInterfaceResult {
  acceptsSx: boolean;
  /**
   * Which element receives the wrapped component's `sx` prop.
   *
   * Most components apply `sx` to their root. Some controls expose `sx` for an
   * inner element while `className`/`style` still target the outer root. Mark
   * those as `"inner"` so the codemod can reject root-only wrapper styles
   * instead of moving layout styles onto the wrong element.
   */
  sxTarget?: "root" | "inner";
  /**
   * StyleX property names that must stay on the wrapped component root when
   * `sxTarget` is `"inner"`.
   */
  rootOnlyProperties?: string[];
  /**
   * StyleX property names that the wrapped component's `sx` prop explicitly rejects.
   *
   * Some components accept `sx`, but narrow it with `StyleXStylesWithout<...>` to
   * reserve properties that the component owns internally. The transform can still
   * use `sx` if it rewrites generated styles away from those excluded properties.
   */
  sxExcludedProperties?: string[];
  /**
   * StyleX property names that the wrapped component's `sx` prop accepts.
   *
   * Use this for components whose `sx` prop is intentionally narrower than a full
   * `StyleXStyles` surface. When present, generated wrapper styles must use only
   * these properties, or the codemod bails instead of sending unsupported reset
   * styles through a weak/incorrect channel.
   */
  sxAllowedProperties?: string[];
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
   * - `{ directional: [...] }` for shorthand properties (e.g., `padding`) whose token
   *   resolves to a multi-value string. Each entry specifies a longhand property and expression.
   * - Optionally return `{ dropDefinition: true }` for css variables to remove the local `--x: ...` definition.
   * - `undefined` to bail/skip the file (for cssVariable: keeps the original
   *   custom property declaration or `var(...)` unchanged)
   */
  resolveValue: (
    context: ResolveValueContext,
  ) => ResolveValueResult | ResolveValueDirectionalResult | undefined;

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
   * Resolver for interpolations used in selector position and media query
   * placeholders.
   *
   * This handles patterns like `${screenSize.phone} { ... }` where an imported
   * value is used as a CSS selector (typically a media query helper),
   * `@media (min-width: ${breakpoint}px)` where an imported value is used inside
   * a media query, and
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
   * Optional resolver for theme method calls like `props.theme.highlightVariant(...)`.
   *
   * Called when the codemod encounters a call expression on the theme object that
   * cannot be resolved via simple theme property access.
   *
   * Return:
   * - `{ preserveRuntimeCall: true }` to preserve the call at runtime
   * - `{ expr, imports }` to resolve to a static StyleX value
   * - `undefined` to bail (theme method call is not supported)
   */
  resolveThemeCall?: (context: ThemeCallResolveContext) => CallResolveResult | undefined;

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

  /**
   * Use physical CSS properties (`paddingTop`/`paddingRight`/`paddingBottom`/`paddingLeft`)
   * when expanding 2-value CSS shorthands like `padding: 4px 8px`.
   *
   * Set this explicitly. Use `true` to preserve CSS shorthand semantics and avoid
   * StyleX property-specificity conflicts during migration. Use `false` only if
   * your codebase intentionally wants logical properties (`paddingBlock`/`paddingInline`)
   * for 2-value shorthand output.
   */
  usePhysicalProperties: boolean;

  /**
   * Optional override for sx-aware wrapped component detection.
   *
   * When `useSxProp: true`, the codemod auto-detects whether an imported
   * component accepts a StyleX `sx` prop by reading its definition file and
   * walking its declared prop type (intersections, type aliases, interfaces
   * in the same file). When detected, `styled(Component)` emits
   * `<Component sx={styles.x} />` instead of
   * `<Component {...stylex.props(styles.x)} />`.
   *
   * Use this hook to override auto-detection for cases it cannot see — for
   * example unresolvable package imports or components whose sx support is
   * added by a HOC at runtime.
   *
   * Return:
   * - `{ acceptsSx: true }` to force the `sx={...}` path
   *   (optionally with `sxAllowedProperties` / `sxExcludedProperties`)
   * - `{ acceptsSx: false }` to force the `{...stylex.props(...)}` path
   * - `undefined` to fall through to auto-detection (default)
   *
   * Only consulted for `styled(ImportedComponent)` declarations.
   */
  wrappedComponentInterface?: (
    context: WrappedComponentInterfaceContext,
  ) => WrappedComponentInterfaceResult | undefined;

  /**
   * Optional function to customize where marker sidecar files (`stylex.defineMarker()`)
   * are written. By default, markers are placed in a `.stylex.ts` file next to the source.
   *
   * When provided, the function receives the source file path and returns an `ImportSource`
   * that determines both the import path in the transformed file and the file path where
   * markers are written. Return `undefined` to fall back to the default behavior (local
   * sidecar file next to the source).
   *
   * Only consulted when a file has cross-file marker relations. Files that only
   * reference markers internally (e.g., sibling selectors within the same file)
   * always use a local sidecar file regardless of this setting.
   *
   * Example:
   * ```typescript
   * markerFile(ctx) {
   *   return { kind: "absolutePath", value: "/path/to/shared/markers.stylex.ts" };
   * }
   * ```
   */
  markerFile?: (context: MarkerFileContext) => ImportSource | undefined;
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

  resolveThemeCall?: Adapter["resolveThemeCall"];
  styleMerger: Adapter["styleMerger"];
  themeHook?: Adapter["themeHook"];
  useSxProp: Adapter["useSxProp"];
  usePhysicalProperties: Adapter["usePhysicalProperties"];
  wrappedComponentInterface?: Adapter["wrappedComponentInterface"];
  markerFile?: Adapter["markerFile"];
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
 *         // For shorthand properties with multi-value tokens, return directional entries
 *         if (ctx.cssProperty === "padding" && ctx.path === "input.padding") {
 *           return {
 *             directional: [
 *               { prop: "paddingBlock", expr: "$input.paddingBlock", imports: [{ from: { kind: "specifier", value: "./tokens" }, names: [{ imported: "$input" }] }] },
 *               { prop: "paddingInline", expr: "$input.paddingInline", imports: [{ from: { kind: "specifier", value: "./tokens" }, names: [{ imported: "$input" }] }] },
 *             ],
 *           };
 *         }
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
 *       // For @media placeholders, check ctx.kind === "mediaQueryInterpolation" and
 *       // use ctx.mediaQuery.feature to choose the correct defineConsts media key.
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
 *     // Choose how 2-value padding/margin shorthands are expanded.
 *     usePhysicalProperties: true,
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
