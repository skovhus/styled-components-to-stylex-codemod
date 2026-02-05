/**
 * Type definitions for the built-in dynamic interpolation handler system.
 * Core concepts: dynamic node context, handler results, and resolution contracts.
 */
import type { API, JSCodeshift } from "jscodeshift";
import type {
  CallResolveContext,
  CallResolveResult,
  ImportSource,
  ImportSpec,
  ResolveValueContext,
  ResolveValueResult,
} from "../../adapter.js";
import type { WarningType } from "../logger.js";

export type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export type DynamicNode = {
  slotId: number;
  expr: unknown;
  css: DynamicNodeCssContext;
  component: DynamicNodeComponentContext;
  usage: DynamicNodeUsageContext;
  loc?: DynamicNodeLoc;
};

export type HandlerResult =
  | {
      /**
       * The node was resolved to a JS expression string that can be directly inlined into
       * generated output (typically for a single CSS property value).
       *
       * Example: `props.theme.color.bgBase` -> `themeVars.bgBase`
       *
       * The caller is responsible for:
       * - parsing `expr` into an AST
       * - adding `imports`
       */
      type: "resolvedValue";
      expr: string;
      imports: ImportSpec[];
      resolveCallContext?: CallResolveContext;
      resolveCallResult?: CallResolveResult;
    }
  | {
      /**
       * The node was resolved to a StyleX style object expression suitable for passing to
       * `stylex.props(...)` (NOT to be used as a single CSS property value).
       *
       * Example: `themedBorder("labelMuted")(props)` -> `borders.labelMuted`
       */
      type: "resolvedStyles";
      expr: string;
      imports: ImportSpec[];
      resolveCallContext?: CallResolveContext;
      resolveCallResult?: CallResolveResult;
    }
  | {
      /**
       * Emit a wrapper inline style from a raw CSS string snippet.
       *
       * This is intentionally narrow and primarily used for keeping runtime parity
       * when the codemod cannot safely lower to StyleX (e.g. complex dynamic blocks).
       */
      type: "emitInlineStyle";
      style: string;
    }
  | {
      /**
       * Preserve the dynamic value by emitting a wrapper inline style:
       *   style={{ ..., prop: expr(props) }}
       *
       * This is used for cases where we can't (or don't want to) lower into StyleX
       * buckets, but can safely keep parity with styled-components at runtime.
       */
      type: "emitInlineStyleValueFromProps";
    }
  | {
      /**
       * Emit a StyleX style function that takes an object of transient props.
       * This preserves complex template literals while keeping styles in StyleX.
       */
      type: "emitStyleFunctionFromPropsObject";
      props: string[];
    }
  | {
      /**
       * Emit a StyleX style function keyed off a single JSX prop.
       *
       * The caller uses this to generate a helper like:
       *   const styles = stylex.create({
       *     boxShadowFromProp: (shadow) => ({ boxShadow: shadow })
       *   })
       *
       * And apply it conditionally in the wrapper:
       *   shadow != null && styles.boxShadowFromProp(shadow)
       */
      type: "emitStyleFunction";
      nameHint: string;
      params: string;
      body: string;
      call: string;
      /**
       * Optional value transform to apply to the param before assigning to the style prop.
       * This allows supporting patterns like:
       *   box-shadow: ${(props) => shadow(props.shadow)};
       * by emitting a style function that computes: `shadow(value)`.
       */
      valueTransform?: { kind: "call"; calleeIdent: string };
      /**
       * Wrap the computed value in a template literal (e.g. `${expr}`) to satisfy
       * StyleX lint rules that require string literals.
       */
      wrapValueInTemplateLiteral?: boolean;
    }
  | {
      /**
       * Like `emitStyleFunction`, but also emit a static base style with the default value.
       *
       * This supports destructuring defaults like `({ padding = "16px" }) => padding`.
       *
       * The caller uses this to generate:
       *   const styles = stylex.create({
       *     card: { padding: "16px" },  // static base with default
       *     cardPadding: (padding) => ({ padding })  // dynamic override
       *   })
       *
       * And apply it:
       *   stylex.props(styles.card, padding != null && styles.cardPadding(padding))
       */
      type: "emitStyleFunctionWithDefault";
      nameHint: string;
      params: string;
      body: string;
      call: string;
      defaultValue: unknown;
      valueTransform?: { kind: "call"; calleeIdent: string };
      wrapValueInTemplateLiteral?: boolean;
    }
  | {
      /**
       * Split a dynamic interpolation into one or more variant buckets.
       *
       * Each variant contains a static StyleX-style object. The caller is responsible for
       * wiring these into `stylex.create(...)` keys and applying them under the `when` condition.
       */
      type: "splitVariants";
      variants: Array<{
        nameHint: string;
        when: string;
        style: Record<string, unknown>;
        imports?: ImportSpec[];
      }>;
    }
  | {
      /**
       * Like `splitVariants`, but each branch produces a JS expression string
       * (which may come from adapter theme resolution) rather than a static literal.
       */
      type: "splitVariantsResolvedValue";
      variants: Array<{
        nameHint: string;
        when: string;
        expr: string;
        imports: ImportSpec[];
      }>;
    }
  | {
      /**
       * Like `splitVariantsResolvedValue`, but each branch yields a StyleX style object expression
       * intended for `stylex.props(...)` arguments.
       */
      type: "splitVariantsResolvedStyles";
      variants: Array<{
        nameHint: string;
        when: string;
        expr: string;
        imports: ImportSpec[];
      }>;
    }
  | {
      /**
       * Split a multi-prop nested ternary like `outer ? A : inner ? B : C` where
       * outer and inner test different boolean props.
       *
       * Example: `disabled ? bgBase : checked ? bgSub : bgBase`
       *
       * The caller emits variant buckets for each branch and wires them into a
       * compound ternary at usage time:
       *   `disabled ? styles.xDisabled : checked ? styles.xCheckedTrue : styles.xCheckedFalse`
       */
      type: "splitMultiPropVariantsResolvedValue";
      outerProp: string;
      outerTruthyBranch: { expr: string; imports: ImportSpec[] };
      innerProp: string;
      innerTruthyBranch: { expr: string; imports: ImportSpec[] };
      innerFalsyBranch: { expr: string; imports: ImportSpec[] };
    }
  | {
      /**
       * Signal that this handler does not know how to transform the node.
       *
       * The caller typically falls back to other strategies (or drops the declaration)
       * and may surface `reason` as a warning.
       */
      type: "keepOriginal";
      reason: WarningType;
      context?: Record<string, unknown>;
    }
  | {
      /**
       * Emit a conditional StyleX style function where a prop is used both as
       * the truthy condition and as an index into a resolved theme object.
       *
       * Pattern: `props.textColor ? props.theme.color[props.textColor] : props.theme.color.labelTitle`
       *
       * Output: `(textColor: Colors | undefined) => ({ color: textColor ? themeVars[textColor] : themeVars.labelTitle })`
       */
      type: "emitConditionalIndexedThemeFunction";
      /** The prop name used in both the condition and as the index (e.g., "textColor") */
      propName: string;
      /** The prop's TypeScript type annotation (e.g., "Colors"), or null if unknown */
      propType: string | null;
      /** Resolved theme object expression (e.g., "themeVars") */
      themeObjectExpr: string;
      /** Imports required for themeObjectExpr */
      themeObjectImports: ImportSpec[];
      /** Resolved fallback expression (e.g., "themeVars.labelTitle") */
      fallbackExpr: string;
      /** Imports required for fallbackExpr */
      fallbackImports: ImportSpec[];
    }
  | {
      /**
       * Emit a StyleX style function that uses an indexed theme lookup with the prop itself as fallback.
       *
       * Pattern: `props.theme.color[props.backgroundColor] || props.backgroundColor`
       *
       * Output: `(backgroundColor: Color) => ({ backgroundColor: $colors[backgroundColor] || backgroundColor })`
       */
      type: "emitIndexedThemeFunctionWithPropFallback";
      /** The prop name used as the index (e.g., "backgroundColor") */
      propName: string;
      /** Resolved theme object expression (e.g., "$colors") */
      themeObjectExpr: string;
      /** Imports required for themeObjectExpr */
      themeObjectImports: ImportSpec[];
      /** The original operator from the input ("||" or "??") */
      operator: "||" | "??";
    }
  | {
      /**
       * Emit split styles for theme boolean conditionals.
       *
       * Pattern: `props.theme.<boolProp> ? trueValue : falseValue`
       *
       * Example with theme.isDark:
       * - boxIsDarkTrue: { mixBlendMode: "lighten" }
       * - boxIsDarkFalse: { mixBlendMode: "darken" }
       *
       * And the wrapper uses `theme.isDark ? styles.boxIsDarkTrue : styles.boxIsDarkFalse`
       *
       * Works with any boolean theme property (isDark, isHighContrast, isCompact, etc.)
       */
      type: "splitThemeBooleanVariants";
      /** The CSS property name (e.g., "mixBlendMode") */
      cssProp: string;
      /** The theme property name being tested (e.g., "isDark", "isHighContrast") */
      themeProp: string;
      /** The resolved value when theme property is true */
      trueValue: unknown;
      /** The resolved value when theme property is false */
      falseValue: unknown;
      /** Imports required for true branch value */
      trueImports: ImportSpec[];
      /** Imports required for false branch value */
      falseImports: ImportSpec[];
    };

export type InternalHandlerContext = {
  api: API;
  filePath: string;
  resolveValue: (context: ResolveValueContext) => ResolveValueResult | undefined;
  resolveCall: (context: CallResolveContext) => CallResolveResult | undefined;
  resolveImport: (
    localName: string,
    identNode?: unknown,
  ) => {
    importedName: string;
    source: ImportSource;
  } | null;
  /** Check if an import exists for localName, ignoring shadowing. Used to detect shadowed imports. */
  hasImportIgnoringShadowing?: (localName: string) => boolean;
};

export type ThemeParamInfo =
  | { kind: "propsParam"; propsName: string }
  | { kind: "themeBinding"; themeName: string };

/**
 * Narrow type for extracted function body when checking for conditional expressions.
 * Used with `getFunctionBodyExpr` results when we need to access ConditionalExpression properties.
 */
export type ConditionalExpressionBody = {
  type?: string;
  test?: unknown;
  consequent?: unknown;
  alternate?: unknown;
};

type CssNodeKind = "declaration" | "selector" | "atRule" | "keyframes";

export type DynamicNodeCssContext = {
  kind: CssNodeKind;
  selector: string;
  atRuleStack: string[];
  property?: string;
  valueRaw?: string;
};

export type DynamicNodeComponentContext = {
  localName: string;
  base: "intrinsic" | "component";
  tagOrIdent: string;
  withConfig?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
};

export type DynamicNodeUsageContext = {
  jsxUsages: number;
  hasPropsSpread: boolean;
};

export type DynamicNodeLoc = {
  line?: number;
  column?: number;
};

export type ResolveImportedHelperCallResult =
  | {
      kind: "resolved";
      result: CallResolveResult;
      resolveCallContext: CallResolveContext;
      resolveCallResult: CallResolveResult;
    }
  | { kind: "unresolved"; resolveCallContext: CallResolveContext; resolveCallResult: undefined }
  | { kind: "keepOriginal" };
