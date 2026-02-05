/**
 * Shared type definitions for the transform pipeline.
 * Core concepts: step results, styled declarations, and options.
 */
import type { ASTNode, Comment, JSCodeshift, Options } from "jscodeshift";
import type { Adapter } from "../adapter.js";
import type { CssRuleIR } from "./css-ir.js";
import type { WarningLog } from "./logger.js";
import type { TransformContext } from "./transform-context.js";

/**
 * Result of the transform including any log entries
 */
export interface TransformResult {
  code: string | null;
  warnings: WarningLog[];
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
  compoundVariants?: Array<{
    outerProp: string;
    outerTruthyKey: string;
    innerProp: string;
    innerTruthyKey: string;
    innerFalsyKey: string;
  }>;
  needsWrapperComponent?: boolean;
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
  }>;
  shouldForwardProp?: { dropProps: string[]; dropPrefix?: string };
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
  };
  attrWrapper?: {
    kind: "input" | "link";
    // Base style key is `styleKey`; other keys are optional.
    checkboxKey?: string;
    radioKey?: string;
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
  extraStylexPropsArgs?: Array<{ when?: string; expr: ExpressionKind }>;
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
  siblingWrapper?: {
    adjacentKey: string;
    afterKey?: string;
    afterClass?: string;
    propAdjacent: string;
    propAfter?: string;
  };
  // Leading comments (JSDoc, line comments) from the original styled component declaration
  leadingComments?: Comment[];
};
