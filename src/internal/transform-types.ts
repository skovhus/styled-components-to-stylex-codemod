/**
 * Shared type definitions for the transform pipeline.
 * Core concepts: step results, styled declarations, and options.
 */
import type { ASTNode, Comment, JSCodeshift, Options } from "jscodeshift";
import type {
  Adapter,
  ResolveBaseComponentResult,
  ResolveBaseComponentStaticValue,
} from "../adapter.js";
import type { CssRuleIR } from "./css-ir.js";
import type { WarningLog } from "./logger.js";
import type { TransformContext } from "./transform-context.js";

/**
 * Result of the transform including any log entries
 */
export interface TransformResult {
  code: string | null;
  warnings: WarningLog[];
  /** Content for the sidecar .stylex.ts file (defineMarker declarations). Undefined when no markers needed. */
  sidecarContent?: string;
  /** Bridge components emitted for unconverted consumer selectors. */
  bridgeResults?: BridgeComponentResult[];
}

/** Describes a bridge className emitted for a component targeted by unconverted consumer selectors. */
export interface BridgeComponentResult {
  componentName: string;
  /** The export name (e.g. "default" for default exports, or the named export identifier). */
  exportName?: string;
  className: string;
  globalSelectorVarName: string;
}

/**
 * Result of a transform pipeline step.
 */
export type StepReturnReason = "skip" | "bail";

export type StepResult =
  | { kind: "continue" }
  | { kind: "return"; result: TransformResult; reason: StepReturnReason };

/**
 * Sentinel value indicating the pipeline should continue to the next step.
 */
export const CONTINUE: StepResult = { kind: "continue" };

/**
 * Creates a step result that stops the pipeline with a final TransformResult.
 */
export function returnResult(result: TransformResult, reason: StepReturnReason): StepResult {
  return { kind: "return", result, reason };
}

/**
 * Signature for a single transform pipeline step.
 */
export type TransformStep = (ctx: TransformContext) => StepResult;

/**
 * Options for the transform
 */
export interface TransformOptions extends Options {
  /**
   * Adapter for customizing the transform.
   * Controls value resolution and resolver-provided imports.
   */
  adapter: Adapter;

  /**
   * Cross-file selector information from the prepass.
   * When present, enables cross-file component selector handling.
   */
  crossFileInfo?: CrossFileInfo;
}

/**
 * Cross-file selector info passed from the prepass to the per-file transform.
 * Kept minimal: only what the transform needs to know about this specific file.
 */
export interface CrossFileInfo {
  /** Cross-file selector usages where this file is the consumer */
  selectorUsages: CrossFileSelectorUsage[];
  /** Component names in this file that need a global selector bridge className (consumer not transformed) */
  bridgeComponentNames?: Set<string>;
  /** Global map: files that define styled-components → set of local names. Used for cascade conflict detection. */
  styledDefFiles?: Map<string, Set<string>>;
}

export interface CrossFileSelectorUsage {
  /** Local name in the consumer file (e.g. "CollapseArrowIcon") */
  localName: string;
  /** Raw import specifier (e.g. "./lib/collapse-arrow-icon") */
  importSource: string;
  /** Imported binding name ("default" for default imports, otherwise named) */
  importedName: string;
  /** Absolute path of the target module */
  resolvedPath: string;
  /** Original component name for bridge GlobalSelector (e.g., "Foo" for "FooGlobalSelector") */
  bridgeComponentName?: string;
  /** Local name of the actual component in the consumer file (for JSX matching) */
  bridgeComponentLocalName?: string;
}

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

/**
 * Represents a dimension for variant-based styling (e.g., "color", "size").
 * Used to generate separate `stylex.create` calls per dimension, enabling:
 *   - Object lookup: `colorVariants[color]`
 *   - Type extraction: `keyof typeof colorVariants`
 */
export type VariantDimension = {
  /** The prop name this dimension is based on (e.g., "color", "size") */
  propName: string;
  /** Name for the generated stylex.create object (e.g., "colorVariants") */
  variantObjectName: string;
  /** Maps variant values to their style objects (e.g., { primary: {...}, secondary: {...} }) */
  variants: Record<string, Record<string, unknown>>;
  /** Which variant value is the default (for nullish coalescing in usage) */
  defaultValue?: string;
  /**
   * For namespace dimensions: the boolean prop that controls which namespace to use.
   * When set, this dimension is part of a ternary pattern: `boolProp ? disabledDim[prop] : enabledDim[prop]`
   */
  namespaceBooleanProp?: string;
  /** Whether this is the "disabled" namespace (true) or "enabled" namespace (false/undefined) */
  isDisabledNamespace?: boolean;
  /** Whether the prop is optional (has ? in its type annotation) - used for emitting destructuring defaults */
  isOptional?: boolean;
  /** Minimum source order from the original variant entries that were grouped into this dimension.
   * Used to preserve CSS cascade order when interleaving with other variant/styleFn entries. */
  sourceOrder?: number;
  /**
   * When true, the emitter wraps the computed index with `as keyof typeof variantsObj`.
   * Set for dimensions from base-component resolution where the prop type is inferred as `any`
   * (no explicit styled-component props type), since TypeScript rejects `obj[anyProp]`.
   */
  needsKeyofCast?: boolean;
};

/** A single boolean-gated style entry from base-component singleton prop folding. */
export type StaticBooleanVariant = {
  propName: string;
  styleKey: string;
  styles: Record<string, unknown>;
};

export type StyledDecl = {
  /**
   * Index of the parent top-level statement (VariableDeclaration) within Program.body at
   * collection time. Used to approximate original ordering for emit-time insertion.
   */
  declIndex?: number;

  /**
   * Best-effort anchor for placing emitted `stylex.create` close to the original styled decl.
   * Represents the name of the *preceding* top-level declaration (var or function) when present.
   */
  insertAfterName?: string;
  /**
   * Best-effort source location for the start of the template literal.
   */
  loc?: { line: number; column: number };

  localName: string;
  base: { kind: "intrinsic"; tagName: string } | { kind: "component"; ident: string };
  styleKey: string;
  extendsStyleKey?: string;
  variantStyleKeys?: Record<string, string>; // conditionProp -> styleKey
  /** Source order indices for variant style keys, used to interleave with styleFnFromProps during emission. */
  variantSourceOrder?: Record<string, number>;
  /**
   * Variant dimensions for StyleX variants recipe pattern.
   * When present, generates separate `stylex.create` calls per dimension
   * and uses object lookup (`variants[prop]`) instead of conditionals.
   */
  variantDimensions?: VariantDimension[];
  /**
   * Compound variants for multi-prop nested ternaries like:
   *   outerProp ? A : innerProp ? B : C
   *
   * Each entry contains variant style keys for all three branches and
   * instructs the emit phase to generate a compound ternary expression.
   */
  compoundVariants?: Array<
    | {
        kind: "3branch";
        outerProp: string;
        outerTruthyKey: string;
        innerProp: string;
        innerTruthyKey: string;
        innerFalsyKey: string;
      }
    | {
        kind: "4branch";
        outerProp: string;
        innerProp: string;
        outerTruthyInnerTruthyKey: string;
        outerTruthyInnerFalsyKey: string;
        outerFalsyInnerTruthyKey: string;
        outerFalsyInnerFalsyKey: string;
      }
  >;
  needsWrapperComponent?: boolean;
  /** When true, the base `styles.{styleKey}` reference is omitted from `stylex.props()` because
   *  the styleKey is a dynamic function (not a static style object). */
  skipBaseStyleRef?: boolean;
  /**
   * Pseudo-alias selectors from `&:${expr}` patterns resolved via
   * `adapter.resolveSelector()` with `kind: "pseudoAlias"`.
   *
   * Each entry creates N extra style objects (one per pseudo value),
   * wrapped in a `styleSelectorExpr` function call for runtime selection.
   */
  pseudoAliasSelectors?: Array<{
    /** Style keys for each pseudo variant, in order matching the adapter's `values` array. */
    styleKeys: string[];
    /** Parsed AST node of the runtime selector function. */
    styleSelectorExpr: unknown;
    /** Pseudo-class names (without leading colon), in order matching `styleKeys`. */
    pseudoNames: string[];
    /** When present, the pseudo-alias call is guarded by a boolean prop condition. */
    guard?: { when: string };
  }>;
  /**
   * When set, the wrapper needs to call `useTheme()` from styled-components
   * to access runtime theme boolean values (e.g., theme.isDark, theme.isHighContrast).
   *
   * Supports multiple theme boolean properties in the same component.
   * Each entry generates a conditional style arg in the wrapper.
   *
   * Style keys use camelCase theme suffixes (e.g., boxDark/boxLight for isDark).
   * See `buildThemeStyleKeys` for naming conventions.
   */
  needsUseThemeHook?: Array<{
    /** The theme property name (e.g., "isDark", "isHighContrast") — used for style key naming */
    themeProp: string;
    /**
     * AST node for the full condition expression (e.g., `theme.mode === "dark"`).
     * If absent, defaults to `theme.<themeProp>` (backward compat with simple boolean).
     */
    conditionExpr?: unknown;
    /** Style key for when condition is true. null → emit `undefined` (empty branch). */
    trueStyleKey: string | null;
    /** Style key for when condition is false. null → emit `undefined` (empty branch). */
    falseStyleKey: string | null;
  }>;
  /**
   * Whether this component should support external className/style extension.
   * True if: (1) extended by another styled component, or (2) exported and adapter opts-in.
   */
  supportsExternalStyles?: boolean;
  /**
   * Whether this component should support an `as` prop at its public boundary.
   * True when exported and the adapter opts-in.
   */
  supportsAsProp?: boolean;
  /**
   * Whether this component should include `ref` in its public type.
   * True when the adapter opts-in or ref usage is detected (prepass or in-file).
   */
  supportsRefProp?: boolean;
  /**
   * Metadata for declarations whose imported base component was resolved via
   * `adapter.resolveBaseComponent(...)` and inlined to an intrinsic element.
   */
  inlinedBaseComponent?: {
    importSource: string;
    importedName: string;
    baseResult: ResolveBaseComponentResult;
    baseStaticProps: Record<string, ResolveBaseComponentStaticValue>;
    /**
     * Static per-callsite variant dimensions generated from resolver results.
     * When true, non-wrapper JSX rewriting can emit direct variant lookups.
     */
    hasInlineJsxVariants?: boolean;
  };
  /**
   * True when the styled component identifier is used as a value (not only rendered in JSX),
   * e.g. passed as a prop: `<VirtualList outerElementType={StyledDiv} />`.
   *
   * In these cases, the component can be consumed by another component that may pass `className`
   * and/or `style` even if there are no direct JSX callsites with those attributes in this file.
   */
  usedAsValue?: boolean;
  styleFnFromProps?: Array<{
    fnKey: string;
    jsxProp: string;
    condition?: "truthy" | "always";
    conditionWhen?: string;
    callArg?: ExpressionKind;
    /** Source order index for CSS cascade ordering against variant entries. */
    sourceOrder?: number;
  }>;
  shouldForwardProp?: {
    dropProps: string[];
    dropPrefix?: string;
  };
  /**
   * True when `withConfig({ shouldForwardProp })` is present but uses an unsupported pattern
   * that we cannot safely transform. When set, the transform should bail to avoid semantic changes.
   */
  hasUnparseableShouldForwardProp?: boolean;
  /**
   * True when `shouldForwardProp` came from `styled.*.withConfig({ shouldForwardProp })`.
   * When false/undefined, `shouldForwardProp` may have been inferred internally (e.g. enum if-chain
   * or theme-indexed lookup) just to prevent forwarding styling props to the DOM.
   */
  shouldForwardPropFromWithConfig?: boolean;
  /**
   * Optional TS props type captured from input declarations like:
   *   styled.button<ButtonProps>`...`
   *   styled(Component)<CardProps>`...`
   *
   * Stored as a TS type node (best-effort) so wrapper emission can reuse it.
   */
  propsType?: ASTNode;

  withConfig?: { componentId?: string };
  attrsInfo?: {
    staticAttrs: Record<string, unknown>;
    /** Source kind for `.attrs(...)` argument. Used by base-component resolution bails. */
    sourceKind?: "object" | "function" | "unknown";
    /**
     * True when `.attrs(...)` contains values that are not static literals or
     * recognized attrs patterns. Used to avoid unsafe base-component inlining.
     */
    hasUnsupportedValues?: boolean;
    /** Component identifier from `as: ComponentRef` in `.attrs()`, overrides the rendered tag. */
    attrsAsTag?: string;
    /**
     * Attrs that provide a default when a prop is nullish (undefined / null).
     * Pattern: `attr: props.attr ?? <literal>`
     *
     * These should be emitted *before* `{...props}` spreads so passed props can override.
     */
    defaultAttrs?: Array<{
      jsxProp: string;
      attrName: string;
      value: unknown;
    }>;
    conditionalAttrs: Array<{
      jsxProp: string;
      attrName: string;
      value: unknown;
    }>;
    /**
     * Attrs that default to true when their associated prop is NOT passed (undefined).
     * Pattern: `"attr": props.X !== true` → attr is true when X is undefined, false when X is true.
     */
    invertedBoolAttrs?: Array<{
      jsxProp: string;
      attrName: string;
    }>;
    /** Static CSS properties extracted from `style: { ... }` in attrs. */
    attrsStaticStyles?: Record<string, unknown>;
    /**
     * Dynamic CSS properties from `style: { prop: cond ? value : undefined }` in attrs.
     * Each entry stores the CSS property, the JSX prop that controls it, and the
     * call arg expression (the ternary's consequent) as an AST node.
     */
    attrsDynamicStyles?: Array<{
      cssProp: string;
      jsxProp: string;
      callArgExpr: unknown;
    }>;
  };
  attrWrapper?: {
    kind: "input" | "link";
    // Base style key is `styleKey`; other keys are optional.
    checkboxKey?: string;
    radioKey?: string;
    readonlyKey?: string;
    externalKey?: string;
    httpsKey?: string;
    pdfKey?: string;
  };
  rules: CssRuleIR[];
  templateExpressions: unknown[];
  rawCss?: string;
  preResolvedStyle?: Record<string, unknown>;
  isCssHelper?: boolean;
  preserveCssHelperDeclaration?: boolean;
  isExported?: boolean;
  preResolvedFnDecls?: Record<string, unknown>;
  inlineStyleProps?: Array<{ prop: string; expr: ExpressionKind; jsxProp?: string }>;
  /**
   * Static conditional style entries from base-component resolution for boolean props
   * where only some call sites pass the prop. Instead of a separate `stylex.create`
   * lookup object (VariantDimension), these are injected into `resolvedStyleObjects`
   * as entries in the main `styles` object, guarded by a boolean condition
   * (via `variantStyleKeys`). Processed in `analyzeBeforeEmitStep`.
   */
  staticBooleanVariants?: StaticBooleanVariant[];
  /**
   * Additional style keys (from css`` helper blocks) that should be applied
   * alongside this component's base style.
   */
  extraStyleKeys?: string[];
  /**
   * Extra style keys that should be applied after the base style key.
   * Used for pseudo-only mixins where base styles should remain primary.
   */
  extraStyleKeysAfterBase?: string[];
  /**
   * Additional `stylex.props(...)` arguments derived from resolved helper calls that
   * produce StyleX style objects (adapter resolveCall(...) -> { usage: "props", ... }).
   *
   * These are emitted as extra args (optionally guarded by `when`) rather than being placed
   * inside `stylex.create(...)`.
   */
  extraStylexPropsArgs?: Array<{
    when?: string;
    expr: ExpressionKind;
    afterBase?: boolean;
    /** When true, this entry should be placed after variant conditional styles to preserve CSS cascade order. */
    afterVariants?: boolean;
  }>;

  /**
   * Tracks the interleaved order of extra mixins. Each entry indicates which array
   * to take the next item from: 'styleKey' for extraStyleKeys, 'propsArg' for extraStylexPropsArgs.
   * Used to preserve correct style precedence when combining local and imported mixins.
   */
  mixinOrder?: Array<"styleKey" | "propsArg">;
  enumVariant?: {
    propName: string;
    baseKey: string;
    cases: Array<{
      kind: "eq" | "neq";
      whenValue: string;
      styleKey: string;
      value: string;
    }>;
  };
  // Leading comments (JSDoc, line comments) from the original styled component declaration
  leadingComments?: Comment[];
  /** Deterministic bridge CSS class name for unconverted consumer selectors */
  bridgeClassName?: string;
  /** Local helper functions that were inlined into style functions and should be removed */
  consumedLocalHelpers?: string[];
};
