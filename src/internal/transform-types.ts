import type { Options } from "jscodeshift";
import type { Adapter } from "../adapter.js";
import type { CssRuleIR } from "./css-ir.js";

/**
 * Warning emitted during transformation for unsupported features
 */
export interface TransformWarning {
  type: "unsupported-feature" | "dynamic-node";
  feature: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * Result of the transform including any warnings
 */
export interface TransformResult {
  code: string | null;
  warnings: TransformWarning[];
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
  styleFnFromProps?: Array<{ fnKey: string; jsxProp: string }>;
  shouldForwardProp?: { dropProps: string[]; dropPrefix?: string };
  withConfig?: { displayName?: string; componentId?: string };
  attrsInfo?: {
    staticAttrs: Record<string, any>;
    conditionalAttrs: Array<{
      jsxProp: string;
      attrName: string;
      value: any;
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
  preResolvedFnDecls?: Record<string, any>;
  inlineStyleProps?: Array<{ prop: string; expr: any }>;
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
  leadingComments?: any[];
};
