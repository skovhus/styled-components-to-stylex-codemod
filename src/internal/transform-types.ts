import type { ASTNode, Comment, JSCodeshift, Options } from "jscodeshift";
import type { Adapter } from "../adapter.js";
import type { CssRuleIR } from "./css-ir.js";
import type { WarningLog } from "./logger.js";

/**
 * Result of the transform including any log entries
 */
export interface TransformResult {
  code: string | null;
  warnings: WarningLog[];
}

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

  localName: string;
  base: { kind: "intrinsic"; tagName: string } | { kind: "component"; ident: string };
  styleKey: string;
  extendsStyleKey?: string;
  variantStyleKeys?: Record<string, string>; // conditionProp -> styleKey
  needsWrapperComponent?: boolean;
  /**
   * Whether this component should support external className/style extension.
   * True if: (1) extended by another styled component, or (2) exported and adapter opts-in.
   */
  supportsExternalStyles?: boolean;
  /**
   * True when the styled component identifier is used as a value (not only rendered in JSX),
   * e.g. passed as a prop: `<VirtualList outerElementType={StyledDiv} />`.
   *
   * In these cases, the component can be consumed by another component that may pass `className`
   * and/or `style` even if there are no direct JSX callsites with those attributes in this file.
   */
  usedAsValue?: boolean;
  styleFnFromProps?: Array<{ fnKey: string; jsxProp: string }>;
  shouldForwardProp?: { dropProps: string[]; dropPrefix?: string };
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
  preResolvedFnDecls?: Record<string, unknown>;
  inlineStyleProps?: Array<{ prop: string; expr: ExpressionKind }>;
  /**
   * Additional `stylex.props(...)` arguments derived from resolved helper calls that
   * produce StyleX style objects (adapter resolveCall(...) -> { kind: "styles", ... }).
   *
   * These are emitted as extra args (optionally guarded by `when`) rather than being placed
   * inside `stylex.create(...)`.
   */
  extraStylexPropsArgs?: Array<{ when?: string; expr: ExpressionKind }>;
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
