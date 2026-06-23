/**
 * Shared type definitions for the transform pipeline.
 * Core concepts: step results, styled declarations, and options.
 */
import type { ASTNode, Comment, Expression, JSCodeshift, Options } from "jscodeshift";
import type {
  Adapter,
  ResolveBaseComponentResult,
  ResolveBaseComponentStaticValue,
} from "../adapter.js";
import type { CssRuleIR } from "./css-ir.js";
import type { WarningLog } from "./logger.js";
import type { TypeScriptPrepassMetadata } from "./prepass/typescript-analysis.js";
import type { TransformContext } from "./transform-context.js";

/** A sidecar .stylex.ts file containing defineMarker() declarations. */
export interface SidecarFile {
  content: string;
  /** Absolute file path for writing. Undefined = default local sidecar next to the source file. */
  filePath?: string;
}

export interface LocalStylexVarRef {
  cssName: string;
  groupName: string;
  keyName: string;
  defaultValue: string | number | null;
  sourceOrder: number;
  sidecarFileName: string;
}

export interface LocalStylexVarsSidecarFile {
  content: string;
  importPath: string;
}

/**
 * Result of the transform including any log entries
 */
export interface TransformResult {
  code: string | null;
  warnings: WarningLog[];
  /** Sidecar .stylex.ts files (defineMarker declarations). Multiple entries when a file has
   *  both cross-file markers (adapter.markerFile) and internal markers (local sidecar). */
  sidecarFiles?: SidecarFile[];
  /** Bridge components emitted for unconverted consumer selectors. */
  bridgeResults?: BridgeComponentResult[];
  /** Transient prop renames for exported components, keyed by export name. */
  transientPropRenames?: TransientPropRenameResult[];
  /** Local styled component names that were actually converted in this file. */
  transformedComponentNames?: string[];
  localStylexVarsSidecarFile?: LocalStylexVarsSidecarFile;
}

/** Describes a transient prop rename on an exported component for consumer patching. */
export interface TransientPropRenameResult {
  exportName: string;
  renames: Record<string, string>;
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
type StepReturnReason = "skip" | "bail";

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

  /**
   * When true, individual declarations that hit an unsupported pattern are left
   * as-is while the rest of the file is transformed. When false (default), any
   * per-decl bail escalates to a whole-file bail.
   */
  allowPartialMigration?: boolean;

  /**
   * Module resolver used by cross-file transform checks (`resolve(fromFile, specifier)`).
   * Set by runTransform.
   */
  resolveModule?: (fromFile: string, specifier: string) => string | undefined;

  /**
   * In-memory outputs for files already converted in this run. Used during dry-run
   * so same-run dependency checks see the same source a real run would write.
   */
  transformedFileSources?: ReadonlyMap<string, string>;
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
  /** Styled component prop usage inventory from the prepass, keyed by local component name. */
  propUsageByComponent?: Map<string, ComponentPropUsageInfo>;
  /** Global map: files that define styled-components → set of local names. Used for cascade conflict detection. */
  styledDefFiles?: Map<string, Set<string>>;
  /** Global map: files that export components already using StyleX → set of export names. */
  stylexComponentFiles?: Map<string, Set<string>>;
  /** Files successfully converted in the current transform run. Used to avoid bailing on same-run bases. */
  transformedFiles?: Set<string>;
  /** File → local styled component names successfully converted in the current transform run. */
  transformedComponents?: Map<string, Set<string>>;
  /** Opt-in TypeScript compiler metadata from the prepass. */
  typeScriptMetadata?: TypeScriptPrepassMetadata;
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

export type StaticPropValue = string | number | boolean;

export interface PropUsageValueInfo {
  values: StaticPropValue[];
  hasUnknown: boolean;
  usageCount: number;
  omittedCount: number;
}

export interface ComponentPropUsageInfo {
  componentName: string;
  usageCount: number;
  hasUnknownUsage: boolean;
  props: Record<string, PropUsageValueInfo>;
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
  /** Dynamic style function used when observed consumer values do not cover a runtime value. */
  fallbackFnKey?: string;
  /** Optional guard that must be true before applying this variant lookup. */
  conditionWhen?: string;
  /** Whether the prop is optional (has ? in its type annotation) - used for emitting destructuring defaults */
  isOptional?: boolean;
  /** Minimum source order from the original variant entries that were grouped into this dimension.
   * Used to preserve CSS cascade order when interleaving with other variant/styleFn entries. */
  sourceOrder?: number;
  /**
   * When true, the prop type is derived from the variant object (`keyof typeof variantsObj`)
   * instead of `any`, eliminating the need for runtime `as keyof typeof` casts.
   * Set for dimensions from base-component resolution where the variant values are known.
   */
  propTypeFromKeyof?: boolean;
  /** Force lookup casts without changing the public prop type. */
  forceKeyofLookupCast?: boolean;
  /**
   * When true, this dimension's prop is a boolean (not a string that happens to equal "true").
   * Used to emit `prop && variants.true` (truthy guard) instead of `variants[prop]` (lookup),
   * and to type the prop as `boolean` instead of `keyof typeof`.
   */
  isBooleanProp?: boolean;
};

/** A single boolean-gated style entry from base-component singleton prop folding. */
export type StaticBooleanVariant = {
  propName: string;
  styleKey: string;
  styles: Record<string, unknown>;
  /**
   * For non-boolean single-key variants, the literal variant key value.
   * When set, the emitter generates `prop === "value"` instead of a truthy check,
   * and the prop type becomes a string literal (e.g., `"column"`) instead of `boolean`.
   */
  variantKey?: string;
};

/**
 * Promoted style entry from a JSX call-site `style={{ ... }}` object.
 * When analyzable, inline style objects are promoted to proper `stylex.create` entries,
 * eliminating `mergedSx` overhead and wrapper functions.
 */
export type PromotedStyleEntry = {
  /** Style key for the promoted entry in resolvedStyleObjects */
  styleKey: string;
  /** The style value: plain object for static entries */
  styleValue: Record<string, unknown>;
  /** Whether to merge into the component's existing style entry instead of creating a new key */
  mergeIntoBase?: boolean;
};

/**
 * Combined styles for a unique consumed-prop combination at a direct JSX call site.
 * Merges per-prop style entries into one entry per unique prop set, reducing the
 * number of `stylex.props()` arguments and `stylex.create` entries.
 */
export type CallSiteCombinedStyle = {
  /** Consumed prop names for this combination */
  propNames: string[];
  /** Style key for the combined entry in the main styles object */
  styleKey: string;
  /** Merged CSS styles from all consumed props in this combination */
  styles: Record<string, unknown>;
};

export type LocalElementOverrideRelation = "child" | "descendant";

export type LocalElementOverrideCandidate = {
  /**
   * Style key for a same-file callsite-local element override candidate.
   * Added to concrete matching child JSX nodes only after static topology proof succeeds.
   */
  styleKey: string;
  /** The intrinsic tag targeted by the selector (e.g. `svg`, `button`). */
  tagName: string;
  /** Whether the original selector was a direct-child (`>`) or descendant (` `) selector. */
  relation: LocalElementOverrideRelation;
  /** Optional ancestor pseudo (e.g. `:hover` from `&:hover svg`). */
  ancestorPseudo: string | null;
  /** Optional child pseudo/normalized attribute pseudo (e.g. `:disabled`). */
  childPseudo: string | null;
  /**
   * Per-pseudo declaration buckets keyed by ancestor/child pseudo.
   * `null` is the unconditional bucket; non-null keys are finalized later into
   * either string-literal child pseudos or `stylex.when.ancestor()` entries.
   */
  pseudoBuckets: Map<string | null, Record<string, unknown>>;
  /**
   * Concrete target-id → emitted style key, populated after same-file JSX proof succeeds.
   * Target IDs use the format `styled:<LocalName>` or `intrinsic:<tagName>`.
   */
  styleKeysByTargetId?: Record<string, string>;
  /**
   * Styled local targets that were inlineable at initial proof time. Re-checked after later
   * wrapper-forcing passes to detect targets that become wrappers too late for safe rewriting.
   */
  initiallyInlineableStyledTargets?: string[];
  /** Whether the proof path had to cross a custom/local wrapper component to reach a match. */
  traversesWrapper?: boolean;
  /** Best-effort source location for bail warnings tied to this selector. */
  loc?: { line: number; column: number };
};

/**
 * Filters out declarations that couldn't be lowered in `lowerRulesStep`. Downstream
 * steps use this to skip emission/rewrite for decls that must remain in the source
 * as original styled-components code.
 */
export function getActiveStyledDecls(
  styledDecls: StyledDecl[] | undefined,
): StyledDecl[] | undefined {
  return styledDecls?.filter((d) => !d.skipTransform);
}

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
  /**
   * Style key for a same-file self-adjacent sibling override (`& + &`) that can be
   * applied at statically-provable JSX call sites.
   */
  adjacentSiblingStyleKey?: string;
  /** Best-effort source location for the `& + &` selector used for bail warnings. */
  adjacentSiblingLoc?: { line: number; column: number };
  /**
   * Same-file element-selector override candidates (`svg`, `> button`, `&:hover svg`, etc.)
   * that are only emitted when every JSX usage is statically provable.
   */
  localElementOverrides?: LocalElementOverrideCandidate[];
  /**
   * Proof-time metadata for styled targets reached by same-file local element overrides.
   * Used for a later re-check after wrapper-forcing passes settle.
   */
  localElementTargetProofs?: Array<{
    targetId: string;
    wasInlineableAtProofTime: boolean;
    loc?: { line: number; column: number };
  }>;
  extendsStyleKey?: string;
  variantStyleKeys?: Record<string, string>; // conditionProp -> styleKey
  /**
   * Condition root identifiers that are module-scope bindings (e.g. imported
   * runtime flags like `browser.isTouchDevice`), not component props. Wrapper
   * emission must not destructure these from props.
   */
  nonPropConditionRoots?: Set<string>;
  /** Props whose generated variant lookups need a keyof cast because their preserved type is broader. */
  variantLookupCastProps?: Set<string>;
  /** Source order indices for variant style keys, used to interleave with styleFnFromProps during emission. */
  variantSourceOrder?: Record<string, number>;
  /**
   * Variant dimensions for StyleX variants recipe pattern.
   * When present, generates separate `stylex.create` calls per dimension
   * and uses object lookup (`variants[prop]`) instead of conditionals.
   */
  variantDimensions?: VariantDimension[];
  /** Props consumed as CSS values by observed static variant dimensions. */
  styleValueVariantProps?: Set<string>;
  /** Condition props consumed only by observed expression variant guards. */
  observedExpressionConditionDropProps?: Set<string>;
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
        /** Actual when-key used in variantBuckets for the inner truthy branch. */
        innerTruthyWhen: string;
        /** Actual when-key used in variantBuckets for the inner falsy branch. */
        innerFalsyWhen: string;
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
  /**
   * True for synthetic decls created by direct JSX resolution (e.g. `<Flex>` without
   * `styled(Flex)`). These are always inlined, never wrapped.
   */
  isDirectJsxResolution?: boolean;
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
    /** Source order index for CSS cascade ordering against variant/styleFn entries. */
    sourceOrder?: number;
  }>;
  /**
   * Pseudo-expand selectors from `&:${expr}` patterns resolved via
   * `adapter.resolveSelector()` with `kind: "pseudoExpand"`.
   *
   * Each entry creates ONE merged style object with all pseudo expansions inline,
   * applied statically (no runtime wrapper function).
   */
  pseudoExpandSelectors?: Array<{
    /** Style key for the merged pseudo-expand style object */
    styleKey: string;
    /** When present, the style ref is guarded by a boolean prop condition. */
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
    /** Source order index for CSS cascade ordering against variant/styleFn entries. */
    sourceOrder?: number;
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
  /** Whether cross-file consumers pass className */
  consumerUsesClassName?: boolean;
  /** Whether cross-file consumers pass style */
  consumerUsesStyle?: boolean;
  /** Whether cross-file consumers pass element-specific props (onClick, aria-*, etc.) */
  consumerUsesElementProps?: boolean;
  /** Whether cross-file consumers use JSX spread ({...props}) */
  consumerUsesSpread?: boolean;
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
   * e.g. passed as an element type prop: `<List outerElementType={StyledDiv} />`.
   *
   * In these cases, the component can be consumed by another component that may pass `className`
   * and/or `style` even if there are no direct JSX callsites with those attributes in this file.
   */
  usedAsValue?: boolean;
  /**
   * Narrow component-value usage contract for element-type props. Detection is purely by prop
   * name (`innerElementType`/`outerElementType`) — see `ELEMENT_TYPE_PROP_NAMES` — so any host
   * component exposing such a prop opts into the style-only wrapper contract, not just a fixed
   * allow-list of library components.
   */
  valueUsageKind?: "elementTypeProp";
  /** Original component base before post-emit flattening mutates `base` to an intrinsic target. */
  originalBaseIdent?: string;
  /** True when same-file JSX usage passes className or style into this component. */
  receivesClassNameOrStyleInJsx?: boolean;
  /** True for intrinsic wrappers that must preserve runtime `as`/`forwardedAs` rendering. */
  isPolymorphicIntrinsicWrapper?: boolean;
  styleFnFromProps?: Array<{
    fnKey: string;
    jsxProp: string;
    condition?: "truthy" | "always";
    conditionWhen?: string;
    callArg?: ExpressionKind;
    /** Source order index for CSS cascade ordering against variant entries. */
    sourceOrder?: number;
    /**
     * When set, the style function uses a `props` object parameter and the call
     * site must wrap the argument in `{ [propsObjectKey]: callArg }`.
     */
    propsObjectKey?: string;
    /** Preserve scalar dynamic style args during finalization. */
    forceScalarArgs?: boolean;
    /**
     * Additional call arguments for multi-param style functions.
     * Used when base and pseudo indexed lookups for the same CSS property
     * are merged into a single style function.
     */
    extraCallArgs?: { jsxProp: string; callArg?: ExpressionKind }[];
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
  /** Prop names resolved by the opt-in TypeScript prepass for this component's public props. */
  typeScriptPropNames?: Set<string>;
  /** Prop names explicitly declared by the component's public prop type (excluding intrinsic helpers). */
  typeScriptExplicitPropNames?: Set<string>;
  /** Prop type text resolved by the TypeScript compiler prepass, keyed by public prop name. */
  typeScriptPropTypes?: Map<string, string>;
  /** Optional prop names resolved by the TypeScript compiler prepass. */
  typeScriptOptionalProps?: Set<string>;
  /** True when the opt-in TypeScript prepass found an index signature on the public props type. */
  typeScriptHasIndexSignature?: boolean;
  /** True when the opt-in TypeScript prepass found an `sx` prop on the public props type. */
  typeScriptSupportsSxProp?: boolean;

  /**
   * Maps original `$`-prefixed transient prop names to their stripped versions.
   * E.g., `$isOpen` → `isOpen`. Set on exported components to prevent
   * styled-components v6 from filtering transient props when the converted
   * plain function is wrapped by an unconverted `styled()` consumer.
   */
  transientPropRenames?: Map<string, string>;
  /**
   * Subset of transientPropRenames keys that exist in the base component's type.
   * Used to emit Omit+remap in the wrapper type only for props the base actually declares.
   */
  transientOmitFromBase?: Set<string>;
  /**
   * True when transientPropRenames was inherited from the base component
   * (the wrapper itself has no $-prefixed props in its styling data).
   * In this case, the base type already uses the renamed names, so
   * Omit+remap in the wrapper type is skipped.
   */
  transientPropRenamesInherited?: boolean;

  withConfig?: { componentId?: string };
  attrsInfo?: {
    /** Literal attrs plus safe reference expression attrs from `.attrs({...})`. */
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
    dynamicAttrs?: Array<{
      jsxProp: string;
      attrName: string;
      defaultValue?: unknown;
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
    /** Static style object expression extracted from `style: expr` in attrs. */
    attrsStaticStyleExpr?: ExpressionKind;
    /**
     * Dynamic CSS properties from `style: { prop: cond ? value : undefined }` in attrs.
     * Each entry stores the CSS property, the JSX prop that controls it, and the
     * call arg expression (the ternary's consequent) as an AST node.
     */
    attrsDynamicStyles?: Array<{
      cssProp: string;
      jsxProp: string;
      callArgExpr: unknown;
      condition?: "truthy" | "always";
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
  templateExpressions: Expression[];
  rawCss?: string;
  /** True when the source template contains a universal selector (`*`). */
  hasUniversalSelector?: boolean;
  preResolvedStyle?: Record<string, unknown>;
  isCssHelper?: boolean;
  preserveCssHelperDeclaration?: boolean;
  suppressCssHelperStyleEmission?: boolean;
  isExported?: boolean;
  preResolvedFnDecls?: Record<string, unknown>;
  inlineStyleProps?: Array<{
    prop: string;
    expr: ExpressionKind;
    jsxProp?: string;
    keyExpr?: ExpressionKind;
  }>;
  /**
   * Static normal-property values that cannot be emitted through stylex.create()
   * (for example unresolved raw CSS var(...) expressions). Wrapper components use
   * inlineStyleProps directly; inlined intrinsic elements use this to emit a shared
   * React.CSSProperties object and attach it as a JSX style attribute.
   */
  staticInlineStyleProps?: Array<{ prop: string; expr: ExpressionKind }>;
  staticInlineStyleConstName?: string;
  /**
   * Static conditional style entries from base-component resolution for boolean props
   * where only some call sites pass the prop. Instead of a separate `stylex.create`
   * lookup object (VariantDimension), these are injected into `resolvedStyleObjects`
   * as entries in the main `styles` object, guarded by a boolean condition
   * (via `variantStyleKeys`). Processed in `analyzeBeforeEmitStep`.
   */
  staticBooleanVariants?: StaticBooleanVariant[];
  /**
   * Combined per-call-site styles for direct JSX resolution.
   * When all consumed props at call sites produce single-key variants, their styles
   * are merged into one entry per unique prop combination. Each call site uses one
   * combined entry instead of N individual entries.
   */
  callSiteCombinedStyles?: CallSiteCombinedStyle[];
  /**
   * Promoted inline style props from JSX call-site `style={{ ... }}` objects.
   * When set, the style objects were promoted to `stylex.create` entries and
   * the JSX rewriter should apply them as style args (not merge via `mergedSx`).
   */
  promotedStyleProps?: PromotedStyleEntry[];
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
   * Extra className expressions from CSS modules to merge into the rendered element's className.
   * These are combined with any static className from `.attrs()` and bridge classes.
   */
  extraClassNames?: Array<{
    expr: ExpressionKind;
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
  // Preserved leading comments from the original styled component declaration.
  leadingComments?: Comment[];
  /** Deterministic bridge CSS class name for unconverted consumer selectors */
  bridgeClassName?: string;
  /** Local helper functions that were inlined into style functions and should be removed */
  consumedLocalHelpers?: string[];
  /** Resolver imports added while preparing this decl for conversion. */
  resolverImportKeys?: Set<string>;
  /**
   * When true, this declaration could not be transformed to StyleX and should be left
   * untouched in the output (original `styled\`...\`` template preserved, JSX usages
   * unchanged). Set by per-decl bails in lower-rules. Downstream emission, JSX
   * rewriting, and wrapper emission must skip declarations with this flag.
   */
  skipTransform?: boolean;
};
