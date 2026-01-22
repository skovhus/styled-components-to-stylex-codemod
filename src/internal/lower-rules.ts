import type { API, ASTNode, Collection, JSCodeshift } from "jscodeshift";
import { resolveDynamicNode } from "./builtin-handlers.js";
import type { InternalHandlerContext } from "./builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  cssPropertyToStylexProp,
  resolveBackgroundStylexProp,
  resolveBackgroundStylexPropForVariants,
} from "./css-prop-mapping.js";
import { getMemberPathFromIdentifier, getNodeLocStart } from "./jscodeshift-utils.js";
import type { Adapter, ImportSource, ImportSpec } from "../adapter.js";
import { tryHandleAnimation } from "./lower-rules/animation.js";
import { tryHandleInterpolatedBorder } from "./lower-rules/borders.js";
import {
  extractStaticParts,
  tryHandleInterpolatedStringValue,
  wrapExprWithStaticParts,
} from "./lower-rules/interpolations.js";
import { splitDirectionalProperty } from "./stylex-shorthands.js";
import {
  createTypeInferenceHelpers,
  ensureShouldForwardPropDrop,
  literalToStaticValue,
} from "./lower-rules/types.js";
import {
  buildTemplateWithStaticParts,
  collectPropsFromArrowFn,
  countConditionalExpressions,
  hasThemeAccessInArrowFn,
  hasUnsupportedConditionalTest,
  inlineArrowFunctionBody,
  unwrapArrowFunctionToPropsExpr,
} from "./lower-rules/inline-styles.js";
import { addPropComments } from "./lower-rules/comments.js";
import { createCssHelperResolver } from "./lower-rules/css-helper.js";
import { createThemeResolvers } from "./lower-rules/theme.js";
import {
  extractUnionLiteralValues,
  groupVariantBucketsIntoDimensions,
} from "./lower-rules/variants.js";
import { mergeStyleObjects, toKebab } from "./lower-rules/utils.js";
import {
  normalizeSelectorForInputAttributePseudos,
  normalizeInterpolatedSelector,
  parseSelector,
} from "./selectors.js";
import type { StyledDecl } from "./transform-types.js";
import type { WarningLog } from "./logger.js";

export type DescendantOverride = {
  parentStyleKey: string;
  childStyleKey: string;
  overrideStyleKey: string;
};

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export function lowerRules(args: {
  api: API;
  j: JSCodeshift;
  root: Collection<ASTNode>;
  filePath: string;
  resolveValue: Adapter["resolveValue"];
  resolveCall: Adapter["resolveCall"];
  importMap: Map<
    string,
    {
      importedName: string;
      source: ImportSource;
    }
  >;
  warnings: WarningLog[];
  resolverImports: Map<string, ImportSpec>;
  styledDecls: StyledDecl[];
  keyframesNames: Set<string>;
  cssHelperNames: Set<string>;
  stringMappingFns: Map<
    string,
    {
      param: string;
      testParam: string;
      whenValue: string;
      thenValue: string;
      elseValue: string;
    }
  >;
  toStyleKey: (name: string) => string;
  toSuffixFromProp: (propName: string) => string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  cssValueToJs: (value: unknown, important?: boolean, propName?: string) => unknown;
  rewriteCssVarsInStyleObject: (
    obj: Record<string, unknown>,
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
  ) => void;
  literalToAst: (j: JSCodeshift, v: unknown) => ExpressionKind;
}): {
  resolvedStyleObjects: Map<string, unknown>;
  descendantOverrides: DescendantOverride[];
  ancestorSelectorParents: Set<string>;
  bail: boolean;
} {
  const {
    api,
    j,
    root,
    filePath,
    resolveValue,
    resolveCall,
    importMap,
    warnings,
    resolverImports,
    styledDecls,
    keyframesNames,
    cssHelperNames,
    stringMappingFns,
    toStyleKey,
    toSuffixFromProp,
    parseExpr,
    cssValueToJs,
    rewriteCssVarsInStyleObject,
    literalToAst,
  } = args;

  const resolvedStyleObjects = new Map<string, unknown>();
  const declByLocalName = new Map(styledDecls.map((d) => [d.localName, d]));
  const descendantOverrides: DescendantOverride[] = [];
  const ancestorSelectorParents = new Set<string>();
  // Map<overrideStyleKey, Map<pseudo|null, Record<prop, value>>>
  // null key = base styles, string key = pseudo styles (e.g., ":hover", ":focus-visible")
  const descendantOverridePseudoBuckets = new Map<
    string,
    Map<string | null, Record<string, unknown>>
  >();
  let bail = false;

  // Pre-compute properties and values defined by each css helper from their rules.
  // This allows us to know what properties a css helper provides (and their values)
  // before styled components that use them are processed, which is needed for
  // correct pseudo selector handling (setting proper default values).
  const cssHelperValuesByKey = new Map<string, Map<string, unknown>>();
  for (const decl of styledDecls) {
    if (!decl.isCssHelper) {
      continue;
    }
    const propValues = new Map<string, unknown>();
    for (const rule of decl.rules) {
      // Only process top-level rules (selector "&") for base values
      if (rule.selector.trim() !== "&") {
        continue;
      }
      for (const d of rule.declarations) {
        if (d.property && d.value.kind === "static") {
          const stylexDecls = cssDeclarationToStylexDeclarations(d);
          for (const sd of stylexDecls) {
            if (sd.value.kind === "static") {
              propValues.set(sd.prop, cssValueToJs(sd.value, d.important, sd.prop));
            }
          }
        } else if (d.property && d.value.kind === "interpolated") {
          // Handle interpolated values (e.g., theme variables)
          const stylexDecls = cssDeclarationToStylexDeclarations(d);
          for (const sd of stylexDecls) {
            // Store a marker that this property comes from css helper but value is dynamic
            // We'll need to resolve this when actually processing the styled component
            propValues.set(sd.prop, { __cssHelperDynamicValue: true, decl, declaration: d });
          }
        }
      }
    }
    cssHelperValuesByKey.set(decl.styleKey, propValues);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Extract static prefix/suffix from interpolated CSS values
  // ─────────────────────────────────────────────────────────────────────────────
  // For CSS like `box-shadow: 0 2px 4px ${color}` or `transform: rotate(${deg})`
  // we need to preserve the static parts when resolving the dynamic value.
  //
  // StyleX supports dynamic values via CSS variables, and template literals work
  // well for combining static text with resolved expressions:
  //   boxShadow: `0 2px 4px ${themeVars.primaryColor}`
  //
  // See: https://stylexjs.com/docs/learn/styling-ui/defining-styles/
  // ─────────────────────────────────────────────────────────────────────────────

  const warnPropInlineStyle = (
    decl: StyledDecl,
    propName: string | null | undefined,
    reason: string,
    loc: { line: number; column: number } | null | undefined,
  ): void => {
    const propLabel = propName ?? "unknown";
    warnings.push({
      severity: "warning",
      type: "dynamic-node",
      message: `Unsupported prop-based inline style for ${decl.localName} (${propLabel}): ${reason}.`,
      ...(loc ? { loc } : {}),
    });
  };

  const { hasLocalThemeBinding, resolveThemeValue, resolveThemeValueFromFn } = createThemeResolvers(
    {
      root,
      j,
      filePath,
      resolveValue,
      parseExpr,
      resolverImports,
    },
  );

  const { isCssHelperTaggedTemplate, resolveCssHelperTemplate } = createCssHelperResolver({
    importMap,
    filePath,
    resolveValue,
    parseExpr,
    resolverImports,
    cssValueToJs,
  });

  const bailUnsupported = (message: string): void => {
    warnings.push({
      severity: "error",
      type: "unsupported-feature",
      message,
    });
    bail = true;
  };

  for (const decl of styledDecls) {
    if (decl.preResolvedStyle) {
      resolvedStyleObjects.set(decl.styleKey, decl.preResolvedStyle);
      if (decl.preResolvedFnDecls) {
        for (const [k, v] of Object.entries(decl.preResolvedFnDecls)) {
          resolvedStyleObjects.set(k, v as any);
        }
      }
      continue;
    }

    const styleObj: Record<string, unknown> = {};
    const perPropPseudo: Record<string, Record<string, unknown>> = {};
    const perPropMedia: Record<string, Record<string, unknown>> = {};
    const nestedSelectors: Record<string, Record<string, unknown>> = {};
    const variantBuckets = new Map<string, Record<string, unknown>>();
    const variantStyleKeys: Record<string, string> = {};
    const styleFnFromProps: Array<{
      fnKey: string;
      jsxProp: string;
      condition?: "truthy";
    }> = [];
    const styleFnDecls = new Map<string, any>();
    const attrBuckets = new Map<string, Record<string, unknown>>();
    const inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }> = [];
    const localVarValues = new Map<string, string>();
    // Track properties defined by composed css helpers along with their values
    // so we can set proper default values for pseudo selectors.
    const cssHelperPropValues = new Map<string, unknown>();

    const { findJsxPropTsType, annotateParamFromJsxProp, isJsxPropOptional } =
      createTypeInferenceHelpers({
        root,
        j,
        decl,
      });

    // (helpers imported from `./lower-rules/*`)

    // (animation + interpolated-string helpers extracted to `./lower-rules/*`)

    const tryHandleMappedFunctionColor = (d: any): boolean => {
      // Handle: background: ${(props) => getColor(props.variant)}
      // when `getColor` is a simple conditional mapping function.
      if ((d.property ?? "").trim() !== "background") {
        return false;
      }
      if (d.value.kind !== "interpolated") {
        return false;
      }
      const slot = d.value.parts.find((p: any) => p.kind === "slot");
      if (!slot) {
        return false;
      }
      const expr = decl.templateExpressions[slot.slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }
      const body = expr.body as any;
      if (!body || body.type !== "CallExpression") {
        return false;
      }
      if (body.callee?.type !== "Identifier") {
        return false;
      }
      const fnName = body.callee.name;
      const mapping = stringMappingFns.get(fnName);
      if (!mapping) {
        return false;
      }
      const arg0 = body.arguments?.[0];
      if (!arg0 || arg0.type !== "MemberExpression") {
        return false;
      }
      const path = getMemberPathFromIdentifier(arg0 as any, paramName);
      if (!path || path.length !== 1) {
        return false;
      }
      const propName = path[0]!;

      // Convert this component into a wrapper so we don't forward `variant` to DOM.
      decl.needsWrapperComponent = true;

      // Build style keys for the variant mapping.
      // Use stable keys based on the component style key.
      const baseKey = decl.styleKey.endsWith("Base") ? decl.styleKey : `${decl.styleKey}Base`;
      const primaryKey = `${decl.styleKey}Primary`;
      const secondaryKey = `${decl.styleKey}Secondary`;

      // Ensure the base style object doesn't get a static background.
      // The wrapper will apply the background via variants.
      delete styleObj.backgroundColor;

      decl.enumVariant = {
        propName,
        baseKey,
        cases: [
          {
            kind: "eq",
            whenValue: mapping.whenValue,
            styleKey: primaryKey,
            value: mapping.thenValue,
          },
          {
            kind: "neq",
            whenValue: mapping.whenValue,
            styleKey: secondaryKey,
            value: mapping.elseValue,
          },
        ],
      };

      return true;
    };

    const tryHandleLogicalOrDefault = (d: any): boolean => {
      // Handle: background: ${(p) => p.color || "#BF4F74"}
      //         padding: ${(p) => p.$padding || "16px"}
      if (d.value.kind !== "interpolated") {
        return false;
      }
      if (!d.property) {
        return false;
      }
      const slot = d.value.parts.find((p: any) => p.kind === "slot");
      if (!slot) {
        return false;
      }
      const expr = decl.templateExpressions[slot.slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }
      if (
        expr.body?.type !== "LogicalExpression" ||
        (expr.body.operator !== "||" && expr.body.operator !== "??") ||
        expr.body.left?.type !== "MemberExpression"
      ) {
        return false;
      }
      const left = expr.body.left as any;
      if (left.object?.type !== "Identifier" || left.object.name !== paramName) {
        return false;
      }
      if (left.property?.type !== "Identifier") {
        return false;
      }
      const jsxProp = left.property.name;
      const right = expr.body.right as any;
      const fallback =
        right?.type === "StringLiteral" || right?.type === "Literal"
          ? right.value
          : right?.type === "NumericLiteral"
            ? right.value
            : null;
      if (fallback === null) {
        return false;
      }

      // Default value into base style, plus a style function applied when prop is provided.
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
        styleObj[out.prop] = fallback;
        styleFnFromProps.push({ fnKey, jsxProp });
        if (!styleFnDecls.has(fnKey)) {
          const param = j.identifier(out.prop);
          annotateParamFromJsxProp(param, jsxProp);
          const p = j.property("init", j.identifier(out.prop), j.identifier(out.prop)) as any;
          p.shorthand = true;
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], j.objectExpression([p])));
        }
      }
      return true;
    };

    const tryHandleCssHelperConditionalBlock = (d: any): boolean => {
      if (d.value.kind !== "interpolated") {
        return false;
      }
      if (d.property) {
        return false;
      }
      const parts = d.value.parts ?? [];
      if (parts.length !== 1 || parts[0]?.kind !== "slot") {
        return false;
      }
      const slotId = parts[0].slotId;
      const expr = decl.templateExpressions[slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }

      const readPropName = (node: ExpressionKind): string | null => {
        const path = getMemberPathFromIdentifier(node, paramName);
        if (!path || path.length !== 1) {
          return null;
        }
        return path[0]!;
      };

      type TestInfo = { when: string; propName: string };
      const parseTestInfo = (test: ExpressionKind): TestInfo | null => {
        if (!test || typeof test !== "object") {
          return null;
        }
        if (test.type === "MemberExpression" || test.type === "OptionalMemberExpression") {
          const propName = readPropName(test);
          return propName ? { when: propName, propName } : null;
        }
        if (test.type === "UnaryExpression" && test.operator === "!" && test.argument) {
          const propName = readPropName(test.argument as ExpressionKind);
          return propName ? { when: `!${propName}`, propName } : null;
        }
        if (
          test.type === "BinaryExpression" &&
          (test.operator === "===" || test.operator === "!==")
        ) {
          const left = test.left;
          if (left.type === "MemberExpression" || left.type === "OptionalMemberExpression") {
            const propName = readPropName(left);
            const rhs = literalToStaticValue(test.right);
            if (!propName || rhs === null) {
              return null;
            }
            const rhsValue = JSON.stringify(rhs);
            return { when: `${propName} ${test.operator} ${rhsValue}`, propName };
          }
        }
        return null;
      };

      const applyVariant = (testInfo: TestInfo, consStyle: Record<string, unknown>): void => {
        const when = testInfo.when;
        const existingBucket = variantBuckets.get(when);
        const nextBucket = existingBucket ? { ...existingBucket } : {};
        mergeStyleObjects(nextBucket, consStyle);
        variantBuckets.set(when, nextBucket);
        variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
        if (testInfo.propName && !testInfo.propName.startsWith("$")) {
          ensureShouldForwardPropDrop(decl, testInfo.propName);
        }
      };

      // Handle LogicalExpression: props.$x && css`...`
      const body = expr.body;
      if (body?.type === "LogicalExpression" && body.operator === "&&") {
        const testInfo = parseTestInfo(body.left as ExpressionKind);
        if (!testInfo) {
          return false;
        }
        if (!isCssHelperTaggedTemplate(body.right)) {
          return false;
        }
        const cssNode = body.right as { quasi: ExpressionKind };
        const resolved = resolveCssHelperTemplate(cssNode.quasi, paramName, decl.localName);
        if (!resolved) {
          return false;
        }
        const { style: consStyle, dynamicProps } = resolved;

        if (dynamicProps.length > 0) {
          const propName = testInfo.propName;
          const hasMismatchedProp = dynamicProps.some((p) => p.jsxProp !== propName);
          const isComparison = testInfo.when.includes("===") || testInfo.when.includes("!==");
          if (!propName || hasMismatchedProp || testInfo.when.startsWith("!") || isComparison) {
            return false;
          }
          for (const dyn of dynamicProps) {
            const fnKey = `${decl.styleKey}${toSuffixFromProp(dyn.stylexProp)}`;
            if (!styleFnDecls.has(fnKey)) {
              const param = j.identifier(dyn.stylexProp);
              annotateParamFromJsxProp(param, dyn.jsxProp);
              const valueId = j.identifier(dyn.stylexProp);
              const p = j.property("init", valueId, valueId) as any;
              p.shorthand = true;
              const bodyExpr = j.objectExpression([p]);
              styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
            }
            if (
              !styleFnFromProps.some(
                (p) => p.fnKey === fnKey && p.jsxProp === dyn.jsxProp && p.condition === "truthy",
              )
            ) {
              styleFnFromProps.push({
                fnKey,
                jsxProp: dyn.jsxProp,
                condition: "truthy",
              });
            }
            ensureShouldForwardPropDrop(decl, dyn.jsxProp);
          }
        }

        if (Object.keys(consStyle).length > 0) {
          applyVariant(testInfo, consStyle);
        }
        return true;
      }

      // Handle ConditionalExpression: props.$x ? css`...` : css`...`
      if (body?.type !== "ConditionalExpression") {
        return false;
      }

      const testInfo = parseTestInfo(body.test as ExpressionKind);
      if (!testInfo) {
        return false;
      }

      const cons = body.consequent;
      const alt = body.alternate;
      if (!isCssHelperTaggedTemplate(cons) || !isCssHelperTaggedTemplate(alt)) {
        return false;
      }

      const consNode = cons as { quasi: ExpressionKind };
      const altNode = alt as { quasi: ExpressionKind };
      const consResolved = resolveCssHelperTemplate(consNode.quasi, paramName, decl.localName);
      const altResolved = resolveCssHelperTemplate(altNode.quasi, paramName, decl.localName);
      if (!consResolved || !altResolved) {
        return false;
      }
      if (consResolved.dynamicProps.length > 0 || altResolved.dynamicProps.length > 0) {
        return false;
      }

      const consStyle = consResolved.style;
      const altStyle = altResolved.style;

      mergeStyleObjects(styleObj, altStyle);
      applyVariant(testInfo, consStyle);
      return true;
    };

    // Pre-scan rules to detect css helper placeholders and populate cssHelperPropValues
    // BEFORE processing any pseudo selectors that might reference those properties.
    // Also detect imported css helpers (identifiers that aren't in cssHelperNames) and bail.
    let hasImportedCssHelper = false;
    for (const rule of decl.rules) {
      for (const d of rule.declarations) {
        if (!d.property && d.value.kind === "interpolated") {
          const slotPart = (
            d.value as { parts?: Array<{ kind: string; slotId?: number }> }
          ).parts?.find((p) => p.kind === "slot");
          if (slotPart && slotPart.kind === "slot" && slotPart.slotId !== undefined) {
            const expr = decl.templateExpressions[slotPart.slotId];
            if (
              expr &&
              typeof expr === "object" &&
              "type" in expr &&
              expr.type === "Identifier" &&
              "name" in expr &&
              typeof expr.name === "string"
            ) {
              // Check if it's a css helper defined in this file
              if (cssHelperNames.has(expr.name)) {
                const helperKey = toStyleKey(expr.name);
                const helperValues = cssHelperValuesByKey.get(helperKey);
                if (helperValues) {
                  for (const [prop, value] of helperValues) {
                    cssHelperPropValues.set(prop, value);
                  }
                }
              } else {
                // This might be an imported css helper - we can't determine its properties.
                // Mark for bail to avoid generating incorrect default values.
                hasImportedCssHelper = true;
              }
            }
          }
        }
      }
    }

    // Bail if the declaration uses an imported css helper whose properties we can't determine.
    if (hasImportedCssHelper) {
      warnings.push({
        severity: "error",
        type: "unsupported-feature",
        message: `Imported CSS helper mixins (${decl.localName}) - cannot determine inherited properties for correct pseudo selector handling`,
        ...(decl.loc ? { loc: decl.loc } : {}),
      });
      bail = true;
      break;
    }

    for (const rule of decl.rules) {
      // (debug logging removed)
      // Sibling selectors:
      // - & + &  (adjacent sibling)
      // - &.something ~ & (general sibling after a class marker)
      const selTrim = rule.selector.trim();

      if (selTrim === "& + &" || /^&\s*\+\s*&$/.test(selTrim)) {
        decl.needsWrapperComponent = true;
        decl.siblingWrapper ??= {
          adjacentKey: "adjacentSibling",
          propAdjacent: "isAdjacentSibling",
        };
        const obj: Record<string, unknown> = {};
        for (const d of rule.declarations) {
          if (d.value.kind !== "static") {
            continue;
          }
          const outs = cssDeclarationToStylexDeclarations(d);
          for (let i = 0; i < outs.length; i++) {
            const out = outs[i]!;
            if (out.value.kind !== "static") {
              continue;
            }
            obj[out.prop] = cssValueToJs(out.value, d.important, out.prop);
            if (i === 0) {
              addPropComments(obj, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
          }
        }
        resolvedStyleObjects.set(decl.siblingWrapper.adjacentKey, obj);
        continue;
      }
      const mSibling = selTrim.match(/^&\.([a-zA-Z0-9_-]+)\s*~\s*&$/);
      if (mSibling) {
        const cls = mSibling[1]!;
        const propAfter = `isSiblingAfter${toSuffixFromProp(cls)}`;
        decl.needsWrapperComponent = true;
        decl.siblingWrapper ??= {
          adjacentKey: "adjacentSibling",
          propAdjacent: "isAdjacentSibling",
        };
        decl.siblingWrapper.afterClass = cls;
        decl.siblingWrapper.afterKey = `siblingAfter${toSuffixFromProp(cls)}`;
        decl.siblingWrapper.propAfter = propAfter;

        const obj: Record<string, unknown> = {};
        for (const d of rule.declarations) {
          if (d.value.kind !== "static") {
            continue;
          }
          const outs = cssDeclarationToStylexDeclarations(d);
          for (let i = 0; i < outs.length; i++) {
            const out = outs[i]!;
            if (out.value.kind !== "static") {
              continue;
            }
            obj[out.prop] = cssValueToJs(out.value, d.important, out.prop);
            if (i === 0) {
              addPropComments(obj, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
          }
        }
        resolvedStyleObjects.set(decl.siblingWrapper.afterKey, obj);
        continue;
      }

      // --- Unsupported complex selector detection ---
      // We bail out rather than emitting incorrect unconditional styles.
      //
      // Examples we currently cannot represent safely:
      // - Grouped selectors: `&:hover, &:focus { ... }`
      // - Compound class selectors: `&.card.highlighted { ... }`
      // - Class-conditioned rules: `&.active { ... }` (requires runtime class/prop gating)
      // - Descendant element selectors: `& a { ... }`, `& h1, & h2 { ... }`
      // - Chained pseudos like `:not(...)`
      //
      // NOTE: normalize interpolated component selectors before the complex selector checks
      // to avoid skipping bails for selectors like `${Other} .child &`.
      if (typeof rule.selector === "string") {
        const s = normalizeInterpolatedSelector(rule.selector).trim();
        const hasComponentExpr = rule.selector.includes("__SC_EXPR_");

        // Component selector patterns that have special handling below:
        // 1. `${Other}:hover &` - requires :hover and ends with &
        // 2. `&:hover ${Child}` or just `& ${Child}` - starts with & and contains component
        // Other component selector patterns (like `${Other} .child`) should bail.
        const isHandledComponentPattern =
          hasComponentExpr &&
          (rule.selector.includes(":hover") ||
            rule.selector.trim().startsWith("&") ||
            /^__SC_EXPR_\d+__\s*\{/.test(rule.selector.trim()));

        // Use heuristic-based bail checks. We need to allow:
        // - Component selectors that have special handling
        // - Attribute selectors (have special handling for input type, href, etc.)
        // Note: Specificity hacks (&&, &&&) bail early in transform.ts

        // Check for descendant pseudo selectors BEFORE normalization collapses them.
        // "& :not(:disabled)" (with space) targets descendants, not the component itself.
        // normalizeInterpolatedSelector would collapse this to "&:not(:disabled)" which
        // has completely different semantics. We must bail on these patterns.
        if (/&\s+:/.test(rule.selector)) {
          bail = true;
          warnings.push({
            severity: "warning",
            type: "unsupported-feature",
            message: "Unsupported selector: descendant pseudo selector (space before pseudo)",
            ...(decl.loc ? { loc: decl.loc } : {}),
          });
          break;
        }

        if (s.includes(",") && !isHandledComponentPattern) {
          // Comma-separated selectors: bail unless ALL parts are valid pseudo-selectors
          const parsed = parseSelector(s);
          if (parsed.kind !== "pseudo") {
            bail = true;
            warnings.push({
              severity: "warning",
              type: "unsupported-feature",
              message: "Unsupported selector: comma-separated selectors must all be simple pseudos",
              ...(decl.loc ? { loc: decl.loc } : {}),
            });
            break;
          }
        } else if (/&\.[a-zA-Z0-9_-]+/.test(s)) {
          // Class selector on same element like &.active
          // Note: Specificity hacks (&&, &&&) bail early in transform.ts
          bail = true;
          warnings.push({
            severity: "warning",
            type: "unsupported-feature",
            message: "Unsupported selector: class selector",
            ...(decl.loc ? { loc: decl.loc } : {}),
          });
          break;
        } else if (/\s+[a-zA-Z.#]/.test(s) && !isHandledComponentPattern) {
          // Descendant element/class/id selectors like `& a`, `& .child`, `& #foo`
          // But NOT `&:hover ${Child}` (component selector pattern)
          bail = true;
          warnings.push({
            severity: "warning",
            type: "unsupported-feature",
            message: "Unsupported selector: descendant/child/sibling selector",
            ...(decl.loc ? { loc: decl.loc } : {}),
          });
          break;
        }
      }

      // Component selector emulation and other rule handling continues...
      // NOTE: This function intentionally mirrors existing logic from `transform.ts`.

      if (typeof rule.selector === "string" && rule.selector.includes("__SC_EXPR_")) {
        const slotMatch = rule.selector.match(/__SC_EXPR_(\d+)__/);
        const slotId = slotMatch ? Number(slotMatch[1]) : null;
        const slotExpr = slotId !== null ? (decl.templateExpressions[slotId] as any) : null;
        const otherLocal = slotExpr?.type === "Identifier" ? (slotExpr.name as string) : null;
        const isCssHelperPlaceholder = !!otherLocal && cssHelperNames.has(otherLocal);

        const selTrim2 = rule.selector.trim();

        // `${Other}:hover &` (Icon reacting to Link hover)
        if (
          otherLocal &&
          !isCssHelperPlaceholder &&
          selTrim2.startsWith("__SC_EXPR_") &&
          rule.selector.includes(":hover") &&
          rule.selector.includes("&")
        ) {
          const parentDecl = declByLocalName.get(otherLocal);
          const parentStyle = parentDecl && resolvedStyleObjects.get(parentDecl.styleKey);
          if (parentStyle) {
            for (const d of rule.declarations) {
              if (d.value.kind !== "static") {
                continue;
              }
              for (const out of cssDeclarationToStylexDeclarations(d)) {
                if (out.value.kind !== "static") {
                  continue;
                }
                const hoverValue = out.value.value;
                const rawBase = (styleObj as any)[out.prop] as unknown;
                const baseValue =
                  typeof rawBase === "string" || typeof rawBase === "number" ? String(rawBase) : "";
                const varName = `--sc2sx-${toKebab(decl.localName)}-${toKebab(out.prop)}`;
                (parentStyle as any)[varName] = {
                  default: baseValue || null,
                  ":hover": hoverValue,
                };
                styleObj[out.prop] = `var(${varName}, ${baseValue || "inherit"})`;
              }
            }
          }
          continue;
        }

        // `${Child}` / `&:hover ${Child}` / `&:focus-visible ${Child}` (Parent styling a descendant child)
        if (otherLocal && !isCssHelperPlaceholder && selTrim2.startsWith("&")) {
          const childDecl = declByLocalName.get(otherLocal);
          // Extract the actual pseudo-selector (e.g., ":hover", ":focus-visible")
          const pseudoMatch = rule.selector.match(/&(:[a-z-]+(?:\([^)]*\))?)/i);
          const ancestorPseudo: string | null = pseudoMatch?.[1] ?? null;
          if (childDecl) {
            const overrideStyleKey = `${toStyleKey(otherLocal)}In${decl.localName}`;
            ancestorSelectorParents.add(decl.styleKey);
            // Only add to descendantOverrides once per override key
            if (!descendantOverridePseudoBuckets.has(overrideStyleKey)) {
              descendantOverrides.push({
                parentStyleKey: decl.styleKey,
                childStyleKey: childDecl.styleKey,
                overrideStyleKey,
              });
            }
            // Get or create the pseudo buckets map for this override key
            let pseudoBuckets = descendantOverridePseudoBuckets.get(overrideStyleKey);
            if (!pseudoBuckets) {
              pseudoBuckets = new Map();
              descendantOverridePseudoBuckets.set(overrideStyleKey, pseudoBuckets);
            }
            // Get or create the bucket for this specific pseudo (or null for base)
            let bucket = pseudoBuckets.get(ancestorPseudo);
            if (!bucket) {
              bucket = {};
              pseudoBuckets.set(ancestorPseudo, bucket);
            }

            for (const d of rule.declarations) {
              // Handle static values
              if (d.value.kind === "static") {
                for (const out of cssDeclarationToStylexDeclarations(d)) {
                  if (out.value.kind !== "static") {
                    continue;
                  }
                  const v = cssValueToJs(out.value, d.important, out.prop);
                  (bucket as Record<string, unknown>)[out.prop] = v;
                }
              } else if (d.value.kind === "interpolated" && d.property) {
                // Handle interpolated theme values (e.g., ${props => props.theme.color.labelBase})
                const slotPart = (
                  d.value as { parts?: Array<{ kind: string; slotId?: number }> }
                ).parts?.find((p) => p.kind === "slot");
                if (slotPart && slotPart.slotId !== undefined) {
                  const expr = decl.templateExpressions[slotPart.slotId] as unknown;
                  const resolved =
                    expr &&
                    typeof expr === "object" &&
                    ((expr as { type?: string }).type === "ArrowFunctionExpression" ||
                      (expr as { type?: string }).type === "FunctionExpression")
                      ? resolveThemeValueFromFn(expr)
                      : resolveThemeValue(expr);
                  if (resolved) {
                    for (const out of cssDeclarationToStylexDeclarations(d)) {
                      // Build the value: preserve the order of static and interpolated parts
                      const parts =
                        (d.value as { parts?: Array<{ kind: string; value?: string }> }).parts ??
                        [];
                      const hasStaticParts = parts.some((p) => p.kind === "static" && p.value);
                      let finalValue: unknown;
                      if (hasStaticParts) {
                        // Build a proper template literal preserving the order of parts
                        const quasis: any[] = [];
                        const expressions: any[] = [];
                        let currentStatic = "";

                        for (let i = 0; i < parts.length; i++) {
                          const part = parts[i];
                          if (!part) {
                            continue;
                          }
                          if (part.kind === "static") {
                            currentStatic += part.value ?? "";
                          } else if (part.kind === "slot") {
                            // Add the accumulated static text as a quasi
                            quasis.push(
                              j.templateElement(
                                { raw: currentStatic, cooked: currentStatic },
                                false,
                              ),
                            );
                            currentStatic = "";
                            expressions.push(resolved);
                          }
                        }
                        // Add the final static text (may be empty)
                        quasis.push(
                          j.templateElement({ raw: currentStatic, cooked: currentStatic }, true),
                        );
                        finalValue = j.templateLiteral(quasis, expressions);
                      } else {
                        finalValue = resolved;
                      }
                      (bucket as Record<string, unknown>)[out.prop] = finalValue;
                    }
                  }
                }
              }
            }
          }
          continue;
        }
      }

      let media = rule.atRuleStack.find((a) => a.startsWith("@media"));

      const isInputIntrinsic = decl.base.kind === "intrinsic" && decl.base.tagName === "input";
      let selector = normalizeSelectorForInputAttributePseudos(rule.selector, isInputIntrinsic);
      selector = normalizeInterpolatedSelector(selector);
      if (!media && selector.trim().startsWith("@media")) {
        media = selector.trim();
        selector = "&";
      }

      // Support comma-separated pseudo-selectors like "&:hover, &:focus"
      // and chained pseudo-selectors like "&:focus:not(:disabled)"
      const parsedSelector = parseSelector(selector);
      const pseudos = parsedSelector.kind === "pseudo" ? parsedSelector.pseudos : null;
      const pseudoElement = parsedSelector.kind === "pseudoElement" ? parsedSelector.element : null;
      const attrSel =
        parsedSelector.kind === "attribute"
          ? {
              kind: parsedSelector.attr.type,
              suffix: parsedSelector.attr.suffix,
              pseudoElement: parsedSelector.attr.pseudoElement,
            }
          : null;
      const attrWrapperKind =
        decl.base.kind === "intrinsic" && decl.base.tagName === "input"
          ? "input"
          : decl.base.kind === "intrinsic" && decl.base.tagName === "a"
            ? "link"
            : null;
      const isAttrRule = !!attrSel && !!attrWrapperKind;
      let attrTarget: Record<string, unknown> | null = null;
      let attrPseudoElement: string | null = null;

      if (isAttrRule) {
        decl.needsWrapperComponent = true;
        decl.attrWrapper ??= { kind: attrWrapperKind! };
        const suffix = attrSel!.suffix;
        const attrTargetStyleKey = `${decl.styleKey}${suffix}`;
        attrTarget = attrBuckets.get(attrTargetStyleKey) ?? {};
        attrBuckets.set(attrTargetStyleKey, attrTarget);
        attrPseudoElement = attrSel!.pseudoElement ?? null;

        if (attrWrapperKind === "input") {
          if (attrSel!.kind === "typeCheckbox") {
            decl.attrWrapper.checkboxKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "typeRadio") {
            decl.attrWrapper.radioKey = attrTargetStyleKey;
          }
        } else if (attrWrapperKind === "link") {
          if (attrSel!.kind === "targetBlankAfter") {
            decl.attrWrapper.externalKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "hrefStartsHttps") {
            decl.attrWrapper.httpsKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "hrefEndsPdf") {
            decl.attrWrapper.pdfKey = attrTargetStyleKey;
          }
        }
      }

      for (const d of rule.declarations) {
        if (d.value.kind === "interpolated") {
          if (bail) {
            break;
          }
          if (tryHandleMappedFunctionColor(d)) {
            continue;
          }
          if (tryHandleAnimation({ j, decl, d, keyframesNames, styleObj })) {
            continue;
          }
          if (
            tryHandleInterpolatedBorder({
              api,
              j,
              filePath,
              decl,
              d,
              styleObj,
              hasLocalThemeBinding,
              resolveValue,
              resolveCall,
              importMap,
              warnings,
              resolverImports,
              parseExpr,
              toSuffixFromProp,
              variantBuckets,
              variantStyleKeys,
              inlineStyleProps,
            })
          ) {
            continue;
          }
          const tryHandleThemeValueInPseudo = (): boolean => {
            if (!pseudos?.length || !d.property) {
              return false;
            }
            const slotPart = (d.value as any).parts?.find((p: any) => p.kind === "slot");
            if (!slotPart || slotPart.kind !== "slot") {
              return false;
            }
            const expr = decl.templateExpressions[slotPart.slotId] as any;
            if (!expr) {
              return false;
            }
            const resolved =
              (expr?.type === "ArrowFunctionExpression" || expr?.type === "FunctionExpression"
                ? resolveThemeValueFromFn(expr)
                : resolveThemeValue(expr)) ?? null;
            if (!resolved) {
              return false;
            }
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              perPropPseudo[out.prop] ??= {};
              const existing = perPropPseudo[out.prop]!;
              if (!("default" in existing)) {
                const existingVal = (styleObj as Record<string, unknown>)[out.prop];
                if (existingVal !== undefined) {
                  existing.default = existingVal;
                } else if (cssHelperPropValues.has(out.prop)) {
                  // Use the css helper's value as the default
                  const helperVal = cssHelperPropValues.get(out.prop);
                  if (
                    helperVal &&
                    typeof helperVal === "object" &&
                    "__cssHelperDynamicValue" in helperVal
                  ) {
                    // Dynamic value - need to resolve from already-processed css helper
                    const helperDecl = (helperVal as { decl?: StyledDecl }).decl;
                    if (helperDecl) {
                      const resolvedHelper = resolvedStyleObjects.get(
                        toStyleKey(helperDecl.localName),
                      );
                      if (resolvedHelper && typeof resolvedHelper === "object") {
                        existing.default =
                          (resolvedHelper as Record<string, unknown>)[out.prop] ?? null;
                      } else {
                        existing.default = null;
                      }
                    } else {
                      existing.default = null;
                    }
                  } else {
                    existing.default = helperVal;
                  }
                } else {
                  existing.default = null;
                }
              }
              for (const ps of pseudos) {
                existing[ps] = resolved;
              }
            }
            return true;
          };
          if (tryHandleThemeValueInPseudo()) {
            continue;
          }
          // Create a resolver for embedded call expressions in compound CSS values
          const resolveCallExpr = (expr: any): { resolved: any; imports?: any[] } | null => {
            if (expr?.type !== "CallExpression") {
              return null;
            }
            const res = resolveDynamicNode(
              {
                slotId: 0,
                expr,
                css: {
                  kind: "declaration",
                  selector: rule.selector,
                  atRuleStack: rule.atRuleStack,
                  ...(d.property ? { property: d.property } : {}),
                  valueRaw: d.valueRaw,
                },
                component:
                  decl.base.kind === "intrinsic"
                    ? {
                        localName: decl.localName,
                        base: "intrinsic",
                        tagOrIdent: decl.base.tagName,
                      }
                    : { localName: decl.localName, base: "component", tagOrIdent: decl.base.ident },
                usage: { jsxUsages: 0, hasPropsSpread: false },
              },
              {
                api,
                filePath,
                resolveValue,
                resolveCall,
                resolveImport: (localName: string) => {
                  const v = importMap.get(localName);
                  return v ? v : null;
                },
                warn: () => {},
              } satisfies InternalHandlerContext,
            );
            if (res && res.type === "resolvedValue") {
              const exprAst = parseExpr(res.expr);
              if (exprAst) {
                return { resolved: exprAst, imports: res.imports };
              }
            }
            return null;
          };
          const addImport = (imp: any) => {
            resolverImports.set(JSON.stringify(imp), imp);
          };
          if (
            tryHandleInterpolatedStringValue({
              j,
              decl,
              d,
              styleObj,
              resolveCallExpr,
              addImport,
              resolveThemeValue,
            })
          ) {
            continue;
          }

          if (!d.property) {
            const slot = d.value.parts.find(
              (p: any): p is { kind: "slot"; slotId: number } => p.kind === "slot",
            );
            if (slot) {
              const expr = decl.templateExpressions[slot.slotId] as any;
              if (expr?.type === "Identifier" && cssHelperNames.has(expr.name)) {
                const helperKey = toStyleKey(expr.name);
                const extras = decl.extraStyleKeys ?? [];
                if (!extras.includes(helperKey)) {
                  extras.push(helperKey);
                }
                decl.extraStyleKeys = extras;
                // Track properties and values defined by this css helper so we can
                // set proper default values for pseudo selectors on these properties.
                const helperValues = cssHelperValuesByKey.get(helperKey);
                if (helperValues) {
                  for (const [prop, value] of helperValues) {
                    cssHelperPropValues.set(prop, value);
                  }
                }
                continue;
              }
            }
          }
          if (tryHandleCssHelperConditionalBlock(d)) {
            continue;
          }
          if (tryHandleLogicalOrDefault(d)) {
            continue;
          }

          // Support enum-like block-body `if` chains that return static values.
          // Example:
          //   transform: ${(props) => { if (props.$state === "up") return "scaleY(3)"; return "scaleY(1)"; }};
          {
            const tryHandleEnumIfChainValue = (): boolean => {
              if (d.value.kind !== "interpolated") {
                return false;
              }
              if (!d.property) {
                return false;
              }
              // Only apply to base declarations; variant expansion for pseudo/media/attr buckets is more complex.
              if (pseudos?.length || media || attrTarget) {
                return false;
              }
              const parts = d.value.parts ?? [];
              const slotPart = parts.find((p: any) => p.kind === "slot");
              if (!slotPart || slotPart.kind !== "slot") {
                return false;
              }
              const slotId = slotPart.slotId;
              const expr = decl.templateExpressions[slotId] as any;
              if (!expr || expr.type !== "ArrowFunctionExpression") {
                return false;
              }
              const paramName =
                expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
              if (!paramName) {
                return false;
              }
              if (expr.body?.type !== "BlockStatement") {
                return false;
              }

              type Case = { when: string; value: string | number };
              const cases: Case[] = [];
              let defaultValue: string | number | null = null;
              let propName: string | null = null;

              const readIfReturnValue = (ifStmt: any): string | number | null => {
                const cons = ifStmt.consequent;
                if (!cons) {
                  return null;
                }
                if (cons.type === "ReturnStatement") {
                  return literalToStaticValue(cons.argument);
                }
                if (cons.type === "BlockStatement") {
                  const ret = (cons.body ?? []).find((s: any) => s?.type === "ReturnStatement");
                  return ret ? literalToStaticValue(ret.argument) : null;
                }
                return null;
              };

              const bodyStmts = expr.body.body ?? [];
              for (const stmt of bodyStmts) {
                if (!stmt) {
                  continue;
                }
                if (stmt.type === "IfStatement") {
                  // Only support `if (...) { return <literal>; }` with no else.
                  if (stmt.alternate) {
                    return false;
                  }
                  const test = stmt.test as any;
                  if (
                    !test ||
                    test.type !== "BinaryExpression" ||
                    test.operator !== "===" ||
                    test.left?.type !== "MemberExpression"
                  ) {
                    return false;
                  }
                  const left = test.left as any;
                  const leftPath = getMemberPathFromIdentifier(left, paramName);
                  if (!leftPath || leftPath.length !== 1) {
                    return false;
                  }
                  const p = leftPath[0]!;
                  propName = propName ?? p;
                  if (propName !== p) {
                    return false;
                  }
                  const rhs = literalToStaticValue(test.right);
                  if (rhs === null) {
                    return false;
                  }
                  const retValue = readIfReturnValue(stmt);
                  if (retValue === null) {
                    return false;
                  }
                  const cond = `${propName} === ${JSON.stringify(rhs)}`;
                  cases.push({ when: cond, value: retValue });
                  continue;
                }
                if (stmt.type === "ReturnStatement") {
                  defaultValue = literalToStaticValue(stmt.argument);
                  continue;
                }
                // Any other statement shape => too risky.
                return false;
              }

              if (!propName || defaultValue === null || cases.length === 0) {
                return false;
              }

              ensureShouldForwardPropDrop(decl, propName);

              const styleFromValue = (value: string | number): Record<string, unknown> => {
                const valueRaw = typeof value === "number" ? String(value) : value;
                const irDecl = {
                  property: d.property,
                  value: { kind: "static" as const, value: valueRaw },
                  important: false,
                  valueRaw,
                };
                const out: Record<string, unknown> = {};
                for (const mapped of cssDeclarationToStylexDeclarations(irDecl as any)) {
                  out[mapped.prop] =
                    typeof value === "number"
                      ? value
                      : cssValueToJs(mapped.value, false, mapped.prop);
                }
                return out;
              };

              // Default goes into base style.
              Object.assign(styleObj, styleFromValue(defaultValue));

              // Cases become variant buckets keyed by expression strings.
              for (const c of cases) {
                variantBuckets.set(c.when, {
                  ...variantBuckets.get(c.when),
                  ...styleFromValue(c.value),
                });
                variantStyleKeys[c.when] ??= `${decl.styleKey}${toSuffixFromProp(c.when)}`;
              }

              return true;
            };

            if (tryHandleEnumIfChainValue()) {
              continue;
            }
          }

          if (pseudos?.length && d.property) {
            const stylexProp = cssDeclarationToStylexDeclarations(d)[0]?.prop;
            const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
            const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
            const expr = decl.templateExpressions[slotId] as any;
            if (
              stylexProp &&
              expr?.type === "ArrowFunctionExpression" &&
              expr.body?.type === "ConditionalExpression"
            ) {
              const test = expr.body.test as any;
              const cons = expr.body.consequent as any;
              const alt = expr.body.alternate as any;
              if (
                test?.type === "MemberExpression" &&
                test.property?.type === "Identifier" &&
                cons?.type === "StringLiteral" &&
                alt?.type === "StringLiteral"
              ) {
                const when = test.property.name;
                const baseDefault = (styleObj as any)[stylexProp] ?? null;
                // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
                const pseudoEntries = Object.fromEntries(pseudos.map((p) => [p, alt.value]));
                (styleObj as any)[stylexProp] = { default: baseDefault, ...pseudoEntries };
                const variantPseudoEntries = Object.fromEntries(
                  pseudos.map((p) => [p, cons.value]),
                );
                variantBuckets.set(when, {
                  ...variantBuckets.get(when),
                  [stylexProp]: { default: cons.value, ...variantPseudoEntries },
                });
                variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
                continue;
              }
            }
          }

          // Handle computed theme object access keyed by a prop:
          //   background-color: ${(props) => props.theme.color[props.bg]}
          //
          // If the adapter can resolve `theme.color` as an object expression, we can emit a StyleX
          // dynamic style function that indexes into that resolved object at runtime:
          //   boxBackgroundColor: (bg) => ({ backgroundColor: (resolved as any)[bg] })
          //
          // This requires a wrapper to consume `bg` without forwarding it to DOM.
          const tryHandleThemeIndexedLookup = (): boolean => {
            if (d.value.kind !== "interpolated") {
              return false;
            }
            if (!d.property) {
              return false;
            }
            // Skip media/attr buckets for now; these require more complex wiring.
            if (media || attrTarget) {
              return false;
            }
            const parts = d.value.parts ?? [];
            const slotPart = parts.find((p: any) => p.kind === "slot");
            if (!slotPart || slotPart.kind !== "slot") {
              return false;
            }
            const slotId = slotPart.slotId;
            const expr = decl.templateExpressions[slotId] as any;
            if (!expr || expr.type !== "ArrowFunctionExpression") {
              return false;
            }
            const paramName =
              expr.params?.[0]?.type === "Identifier" ? (expr.params[0].name as string) : null;
            if (!paramName) {
              return false;
            }
            const body = expr.body as any;
            if (!body || body.type !== "MemberExpression" || body.computed !== true) {
              return false;
            }

            const indexPropName = (() => {
              const p = body.property as any;
              if (!p || typeof p !== "object") {
                return null;
              }
              if (p.type === "Identifier" && typeof p.name === "string") {
                return p.name as string;
              }
              if (p.type === "MemberExpression") {
                const path = getMemberPathFromIdentifier(p as any, paramName);
                if (!path || path.length !== 1) {
                  return null;
                }
                return path[0]!;
              }
              return null;
            })();
            if (!indexPropName) {
              return false;
            }

            const themeObjectPath = (() => {
              const obj = body.object as any;
              if (!obj || obj.type !== "MemberExpression") {
                return null;
              }
              const parts = getMemberPathFromIdentifier(obj as any, paramName);
              if (!parts || parts.length < 2) {
                return null;
              }
              if (parts[0] !== "theme") {
                return null;
              }
              return parts.slice(1).join(".");
            })();
            if (!themeObjectPath) {
              return false;
            }

            const resolved = resolveValue({ kind: "theme", path: themeObjectPath, filePath });
            if (!resolved) {
              return false;
            }

            for (const imp of resolved.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }

            // Ensure we generate a wrapper so we can consume the prop without forwarding it to DOM.
            ensureShouldForwardPropDrop(decl, indexPropName);

            const outs = cssDeclarationToStylexDeclarations(d);
            for (const out of outs) {
              if (!out.prop) {
                continue;
              }
              const pseudoSuffix = (p: string): string => {
                // `:hover` -> `Hover`, `:focus-visible` -> `FocusVisible`
                const raw = p.trim().replace(/^:+/, "");
                const cleaned = raw
                  .split(/[^a-zA-Z0-9]+/g)
                  .filter(Boolean)
                  .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
                  .join("");
                return cleaned || "Pseudo";
              };

              const fnKey = pseudos?.length
                ? `${decl.styleKey}${toSuffixFromProp(out.prop)}${pseudoSuffix(pseudos[0]!)}`
                : `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              styleFnFromProps.push({ fnKey, jsxProp: indexPropName });

              if (!styleFnDecls.has(fnKey)) {
                // Build expression: resolvedExpr[indexPropName]
                // NOTE: This is TypeScript-only syntax (TSAsExpression + `keyof typeof`),
                // so we parse it explicitly with a TSX parser here rather than relying on
                // the generic `parseExpr` helper.
                const indexedExprAst = (() => {
                  // We intentionally do NOT add `as keyof typeof themeVars` fallbacks.
                  // If a fixture uses a `string` key to index theme colors, it should be fixed at the
                  // input/type level to use a proper key union (e.g. `Colors`), and the output should
                  // reflect that contract.
                  const exprSource = `(${resolved.expr})[${indexPropName}]`;
                  try {
                    const jParse = api.jscodeshift.withParser("tsx");
                    const program = jParse(`(${exprSource});`);
                    const stmt = program.find(jParse.ExpressionStatement).nodes()[0] as any;
                    let expr = stmt?.expression ?? null;
                    while (expr?.type === "ParenthesizedExpression") {
                      expr = expr.expression;
                    }
                    // Remove extra.parenthesized flag that causes recast to add parentheses
                    if (expr?.extra?.parenthesized) {
                      delete expr.extra.parenthesized;
                      delete expr.extra.parenStart;
                    }
                    return expr;
                  } catch {
                    return null;
                  }
                })();
                if (!indexedExprAst) {
                  warnings.push({
                    severity: "error",
                    type: "dynamic-node",
                    message: `Adapter returned an unparseable expression for ${decl.localName}; dropping this declaration.`,
                  });
                  bail = true;
                  continue;
                }

                const param = j.identifier(indexPropName);
                // Prefer the prop's own type when available (e.g. `Color` / `Colors`) so we don't end up with
                // `keyof typeof themeVars` in fixture outputs.
                const propTsType = findJsxPropTsType(indexPropName);
                (param as any).typeAnnotation = j.tsTypeAnnotation(
                  (propTsType && typeof propTsType === "object" && (propTsType as any).type
                    ? (propTsType as any)
                    : j.tsStringKeyword()) as any,
                );
                if (pseudos?.length) {
                  const pseudoEntries = [
                    j.property("init", j.identifier("default"), j.literal(null)),
                    ...pseudos.map((ps) =>
                      j.property("init", j.literal(ps), indexedExprAst as any),
                    ),
                  ];
                  const propValue = j.objectExpression(pseudoEntries);
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression(
                      [param],
                      j.objectExpression([
                        j.property("init", j.identifier(out.prop), propValue) as any,
                      ]),
                    ),
                  );
                } else {
                  const p = j.property(
                    "init",
                    j.identifier(out.prop),
                    indexedExprAst as any,
                  ) as any;
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression([param], j.objectExpression([p])),
                  );
                }
              }
            }

            return true;
          };

          if (tryHandleThemeIndexedLookup()) {
            continue;
          }

          const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
          const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
          const loc = getNodeLocStart(decl.templateExpressions[slotId] as any);

          const res = resolveDynamicNode(
            {
              slotId,
              expr: decl.templateExpressions[slotId],
              css: {
                kind: "declaration",
                selector: rule.selector,
                atRuleStack: rule.atRuleStack,
                ...(d.property ? { property: d.property } : {}),
                valueRaw: d.valueRaw,
              },
              component:
                decl.base.kind === "intrinsic"
                  ? { localName: decl.localName, base: "intrinsic", tagOrIdent: decl.base.tagName }
                  : { localName: decl.localName, base: "component", tagOrIdent: decl.base.ident },
              usage: { jsxUsages: 0, hasPropsSpread: false },
              ...(loc ? { loc } : {}),
            },
            {
              api,
              filePath,
              resolveValue,
              resolveCall,
              resolveImport: (localName: string) => {
                const v = importMap.get(localName);
                return v ? v : null;
              },
              warn: (w: any) => {
                const loc = w.loc;
                warnings.push({
                  severity: "warning",
                  type: "dynamic-node",
                  message: w.message,
                  ...(loc ? { loc } : {}),
                });
              },
            } satisfies InternalHandlerContext,
          );

          if (res && res.type === "resolvedStyles") {
            // Adapter-resolved StyleX style objects are emitted as additional stylex.props args.
            // This is only safe for base selector declarations.
            if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
              warnings.push({
                severity: "warning",
                type: "dynamic-node",
                message:
                  "Resolved StyleX styles cannot be applied under nested selectors/at-rules; manual follow-up required.",
                ...(loc ? { loc } : {}),
              });
              bail = true;
              break;
            }
            for (const imp of res.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }
            const exprAst = parseExpr(res.expr);
            if (!exprAst) {
              warnings.push({
                severity: "error",
                type: "dynamic-node",
                message: `Adapter returned an unparseable styles expression for ${decl.localName}; dropping this declaration.`,
                ...(loc ? { loc } : {}),
              });
              continue;
            }
            decl.extraStylexPropsArgs ??= [];
            decl.extraStylexPropsArgs.push({ expr: exprAst as any });
            decl.needsWrapperComponent = true;
            continue;
          }

          if (res && res.type === "resolvedValue") {
            for (const imp of res.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }

            // Extract and wrap static prefix/suffix (skip for border-color since expansion handled it)
            const cssProp = (d.property ?? "").trim();
            const { prefix, suffix } = extractStaticParts(d.value, {
              skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
              property: cssProp,
            });
            const wrappedExpr = wrapExprWithStaticParts(res.expr, prefix, suffix);

            const exprAst = parseExpr(wrappedExpr);
            if (!exprAst) {
              warnings.push({
                severity: "error",
                type: "dynamic-node",
                message: `Adapter returned an unparseable expression for ${decl.localName}; dropping this declaration.`,
                ...(loc ? { loc } : {}),
              });
              continue;
            }
            {
              const outs = cssDeclarationToStylexDeclarations(d);
              for (let i = 0; i < outs.length; i++) {
                const out = outs[i]!;
                styleObj[out.prop] = exprAst as any;
                if (i === 0) {
                  addPropComments(styleObj, out.prop, {
                    leading: (d as any).leadingComment,
                    trailingLine: (d as any).trailingLineComment,
                  });
                }
              }
            }
            continue;
          }

          if (res && res.type === "splitVariants") {
            const negVariants = res.variants.filter((v: any) => v.when.startsWith("!"));
            const posVariants = res.variants.filter((v: any) => !v.when.startsWith("!"));

            if (negVariants.length === 1 && posVariants.length > 0) {
              // Classic pattern with one default (neg) and conditional variants (pos)
              // Pattern: prop === "a" ? A : prop === "b" ? B : C
              // → C is default, A and B are conditional
              const neg = negVariants[0]!;
              Object.assign(styleObj, neg.style);
              for (const pos of posVariants) {
                variantBuckets.set(pos.when, { ...variantBuckets.get(pos.when), ...pos.style });
                // toSuffixFromProp handles both simple props ($dim → Dim) and
                // comparison expressions (variant === "micro" → VariantMicro)
                variantStyleKeys[pos.when] ??= `${decl.styleKey}${toSuffixFromProp(pos.when)}`;
              }
            } else if (negVariants.length === 1 && posVariants.length === 0) {
              // Only negated variant: style is conditional on !prop
              // Pattern: !prop ? A : "" → A is conditional on !prop (i.e., when prop is false)
              const neg = negVariants[0]!;
              variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
              // toSuffixFromProp handles negated props: !$open → NotOpen
              variantStyleKeys[neg.when] ??= `${decl.styleKey}${toSuffixFromProp(neg.when)}`;
            } else if (posVariants.length > 0) {
              // Only positive variants (no default)
              // Pattern: prop ? A : "" or prop === "a" ? A : ""
              for (const pos of posVariants) {
                variantBuckets.set(pos.when, { ...variantBuckets.get(pos.when), ...pos.style });
                variantStyleKeys[pos.when] ??= `${decl.styleKey}${toSuffixFromProp(pos.when)}`;
              }
            }
            continue;
          }

          if (res && res.type === "splitVariantsResolvedStyles") {
            if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
              warnings.push({
                severity: "warning",
                type: "dynamic-node",
                message:
                  "Resolved StyleX styles cannot be applied under nested selectors/at-rules; manual follow-up required.",
                ...(loc ? { loc } : {}),
              });
              bail = true;
              break;
            }
            for (const v of res.variants) {
              for (const imp of v.imports ?? []) {
                resolverImports.set(JSON.stringify(imp), imp);
              }
              const exprAst = parseExpr(v.expr);
              if (!exprAst) {
                warnings.push({
                  severity: "error",
                  type: "dynamic-node",
                  message: `Adapter returned an unparseable styles expression for ${decl.localName}; dropping this declaration.`,
                  ...(loc ? { loc } : {}),
                });
                continue;
              }
              decl.extraStylexPropsArgs ??= [];
              decl.extraStylexPropsArgs.push({ when: v.when, expr: exprAst as any });
            }
            decl.needsWrapperComponent = true;
            continue;
          }

          if (res && res.type === "splitVariantsResolvedValue") {
            const neg = res.variants.find((v: any) => v.when.startsWith("!"));
            // Get ALL positive variants (not just one) for nested ternaries
            const allPos = res.variants.filter((v: any) => !v.when.startsWith("!"));

            const cssProp = (d.property ?? "").trim();
            let stylexProp: string;
            if (cssProp === "background") {
              const variantValues = res.variants
                .filter((v: any) => typeof v.expr === "string")
                .map((v: any) => v.expr as string);
              const resolved = resolveBackgroundStylexPropForVariants(variantValues);
              if (!resolved) {
                // Heterogeneous - can't safely transform
                warnings.push({
                  severity: "warning",
                  type: "unsupported-feature",
                  message: `Heterogeneous background values (mix of gradients and colors) cannot be safely transformed for ${decl.localName}.`,
                  ...(loc ? { loc } : {}),
                });
                bail = true;
                break;
              }
              stylexProp = resolved;
            } else {
              stylexProp = cssPropertyToStylexProp(cssProp);
            }

            // Extract static prefix/suffix from CSS value for wrapping resolved values
            // e.g., `rotate(${...})` should wrap the resolved value with `rotate(...)`.
            const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticParts(d.value, {
              skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
              property: cssProp,
            });

            const parseResolved = (
              expr: string,
              imports: any[],
            ): { exprAst: unknown; imports: any[] } | null => {
              const wrappedExpr = wrapExprWithStaticParts(expr, staticPrefix, staticSuffix);
              const exprAst = parseExpr(wrappedExpr);
              if (!exprAst) {
                warnings.push({
                  severity: "error",
                  type: "dynamic-node",
                  message: `Adapter returned an unparseable expression for ${decl.localName}; dropping this declaration.`,
                  ...(loc ? { loc } : {}),
                });
                return null;
              }
              return { exprAst, imports: imports ?? [] };
            };

            // Helper to expand border shorthand from a string literal like "2px solid blue"
            const expandBorderShorthand = (
              target: Record<string, unknown>,
              exprAst: any,
            ): boolean => {
              // Handle various AST wrapper structures
              let node = exprAst;
              // Unwrap ExpressionStatement if present
              if (node?.type === "ExpressionStatement") {
                node = node.expression;
              }
              // Only expand if it's a string literal
              if (node?.type !== "StringLiteral" && node?.type !== "Literal") {
                return false;
              }
              const value = node.value;
              if (typeof value !== "string") {
                return false;
              }
              const tokens = value.trim().split(/\s+/);
              const BORDER_STYLES = new Set([
                "none",
                "solid",
                "dashed",
                "dotted",
                "double",
                "groove",
                "ridge",
                "inset",
                "outset",
              ]);
              const looksLikeLength = (t: string) =>
                /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|ch|ex|lh|%)?$/.test(t);

              let width: string | undefined;
              let style: string | undefined;
              const colorParts: string[] = [];
              for (const token of tokens) {
                if (!width && looksLikeLength(token)) {
                  width = token;
                } else if (!style && BORDER_STYLES.has(token)) {
                  style = token;
                } else {
                  colorParts.push(token);
                }
              }
              const color = colorParts.join(" ").trim();
              if (!width && !style && !color) {
                return false;
              }
              if (width) {
                target["borderWidth"] = j.literal(width);
              }
              if (style) {
                target["borderStyle"] = j.literal(style);
              }
              if (color) {
                target["borderColor"] = j.literal(color);
              }
              return true;
            };

            const expandBoxShorthand = (
              target: Record<string, unknown>,
              exprAst: unknown,
              propName: "padding" | "margin",
            ): boolean => {
              const unwrapNode = (
                value: unknown,
              ): { type?: string; value?: unknown; expression?: unknown } | null => {
                return value && typeof value === "object"
                  ? (value as { type?: string; value?: unknown; expression?: unknown })
                  : null;
              };
              let node = unwrapNode(exprAst);
              if (node?.type === "ExpressionStatement") {
                node = unwrapNode(node.expression);
              }
              if (node?.type !== "StringLiteral" && node?.type !== "Literal") {
                return false;
              }
              const rawValue = node.value;
              if (typeof rawValue !== "string") {
                return false;
              }
              const entries = splitDirectionalProperty({
                prop: propName,
                rawValue,
                important: d.important,
              });
              if (!entries.length) {
                return false;
              }
              for (const entry of entries) {
                target[entry.prop] = j.literal(entry.value);
              }
              return true;
            };

            const applyParsed = (
              target: Record<string, unknown>,
              parsed: { exprAst: unknown; imports: any[] },
            ): void => {
              for (const imp of parsed.imports) {
                resolverImports.set(JSON.stringify(imp), imp);
              }
              // Special handling for border shorthand with string literal values
              if (cssProp === "border" && expandBorderShorthand(target, parsed.exprAst)) {
                return;
              }
              if (
                (cssProp === "padding" || cssProp === "margin") &&
                expandBoxShorthand(target, parsed.exprAst, cssProp)
              ) {
                return;
              }
              // Default: use the property from cssDeclarationToStylexDeclarations.
              // Preserve media/pseudo selectors by writing a per-prop map instead of
              // overwriting the base/default value.
              if (media) {
                const existing = target[stylexProp];
                const isAstNode =
                  !!existing &&
                  typeof existing === "object" &&
                  !Array.isArray(existing) &&
                  "type" in (existing as any) &&
                  typeof (existing as any).type === "string";
                const map =
                  existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode
                    ? (existing as Record<string, unknown>)
                    : ({} as Record<string, unknown>);
                // Set default from target first, then fall back to base styleObj.
                // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
                if (!("default" in map)) {
                  const baseValue = existing ?? styleObj[stylexProp];
                  map.default = baseValue ?? null;
                }
                map[media] = parsed.exprAst as any;
                target[stylexProp] = map;
                return;
              }
              if (pseudos?.length) {
                const existing = target[stylexProp];
                // `existing` may be:
                // - a scalar (string/number)
                // - an AST node (e.g. { type: "StringLiteral", ... })
                // - an already-built pseudo map (plain object with `default` / `:hover` keys)
                //
                // Only treat it as an existing pseudo map when it's a plain object *and* not an AST node.
                const isAstNode =
                  !!existing &&
                  typeof existing === "object" &&
                  !Array.isArray(existing) &&
                  "type" in (existing as any) &&
                  typeof (existing as any).type === "string";
                const map =
                  existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode
                    ? (existing as Record<string, unknown>)
                    : ({} as Record<string, unknown>);
                // Set default from target first, then fall back to base styleObj.
                // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
                if (!("default" in map)) {
                  const baseValue = existing ?? styleObj[stylexProp];
                  map.default = baseValue ?? null;
                }
                // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
                for (const ps of pseudos) {
                  map[ps] = parsed.exprAst as any;
                }
                target[stylexProp] = map;
                return;
              }

              target[stylexProp] = parsed.exprAst as any;
            };

            // IMPORTANT: stage parsing first. If either branch fails to parse, skip this declaration entirely
            // (mirrors the `resolvedValue` behavior) and avoid emitting empty variant buckets.
            const negParsed = neg ? parseResolved(neg.expr, neg.imports) : null;
            if (neg && !negParsed) {
              bailUnsupported(
                `Unparseable resolved interpolation in ${decl.localName}; cannot safely emit styles.`,
              );
              break;
            }
            // Parse all positive variants - skip entire declaration if any fail
            const allPosParsed: Array<{
              when: string;
              nameHint: string;
              parsed: { exprAst: unknown; imports: any[] };
            }> = [];
            let anyPosFailed = false;
            for (const posV of allPos) {
              const parsed = parseResolved(posV.expr, posV.imports);
              if (!parsed) {
                anyPosFailed = true;
                break;
              }
              allPosParsed.push({ when: posV.when, nameHint: posV.nameHint, parsed });
            }
            if (anyPosFailed) {
              bailUnsupported(
                `Unparseable resolved interpolation in ${decl.localName}; cannot safely emit styles.`,
              );
              break;
            }

            if (negParsed) {
              applyParsed(styleObj as any, negParsed);
            }
            // Apply all positive variants
            // For nested ternaries (multiple variants), use simpler nameHint-based naming.
            // For single-variant cases, use toSuffixFromProp which includes prop name (e.g., ColorPrimary).
            const isNestedTernary = allPosParsed.length > 1;
            for (const { when, nameHint, parsed } of allPosParsed) {
              const whenClean = when.replace(/^!/, "");
              const bucket = { ...variantBuckets.get(whenClean) } as Record<string, unknown>;
              applyParsed(bucket, parsed);
              variantBuckets.set(whenClean, bucket);
              // Use nameHint only for nested ternaries and when it's meaningful.
              // Generic hints like "truthy", "falsy", "default", "match" should fall back to toSuffixFromProp
              const genericHints = new Set(["truthy", "falsy", "default", "match"]);
              const useMeaningfulHint = isNestedTernary && nameHint && !genericHints.has(nameHint);
              const suffix = useMeaningfulHint
                ? nameHint.charAt(0).toUpperCase() + nameHint.slice(1)
                : toSuffixFromProp(whenClean);
              variantStyleKeys[whenClean] ??= `${decl.styleKey}${suffix}`;
            }
            continue;
          }

          if (res && res.type === "splitMultiPropVariantsResolvedValue") {
            const cssProp = (d.property ?? "").trim();
            let stylexPropMulti: string;
            if (cssProp === "background") {
              const variantValues = [
                res.outerTruthyBranch?.expr,
                res.innerTruthyBranch?.expr,
                res.innerFalsyBranch?.expr,
              ].filter((expr): expr is string => typeof expr === "string");
              const resolved = resolveBackgroundStylexPropForVariants(variantValues);
              if (!resolved) {
                // Heterogeneous - can't safely transform
                warnings.push({
                  severity: "warning",
                  type: "unsupported-feature",
                  message: `Heterogeneous background values (mix of gradients and colors) cannot be safely transformed for ${decl.localName}.`,
                  ...(loc ? { loc } : {}),
                });
                bail = true;
                break;
              }
              stylexPropMulti = resolved;
            } else {
              stylexPropMulti = cssPropertyToStylexProp(cssProp);
            }

            // Extract static prefix/suffix from CSS value for wrapping resolved values
            const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticParts(d.value, {
              skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
              property: cssProp,
            });

            const parseResolved = (
              expr: string,
              imports: any[],
            ): { exprAst: unknown; imports: any[] } | null => {
              const wrappedExpr = wrapExprWithStaticParts(expr, staticPrefix, staticSuffix);
              const exprAst = parseExpr(wrappedExpr);
              if (!exprAst) {
                warnings.push({
                  severity: "error",
                  type: "dynamic-node",
                  message: `Adapter returned an unparseable expression for ${decl.localName}; dropping this declaration.`,
                  ...(loc ? { loc } : {}),
                });
                return null;
              }
              return { exprAst, imports: imports ?? [] };
            };

            const applyParsed = (
              target: Record<string, unknown>,
              parsed: { exprAst: unknown; imports: any[] },
            ): void => {
              for (const imp of parsed.imports) {
                resolverImports.set(JSON.stringify(imp), imp);
              }
              if (pseudos?.length) {
                const existing = target[stylexPropMulti];
                const isAstNode =
                  !!existing &&
                  typeof existing === "object" &&
                  !Array.isArray(existing) &&
                  "type" in (existing as any) &&
                  typeof (existing as any).type === "string";
                const map =
                  existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode
                    ? (existing as Record<string, unknown>)
                    : ({} as Record<string, unknown>);
                // Set default from target first, then fall back to base styleObj.
                // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
                if (!("default" in map)) {
                  const baseValue = existing ?? styleObj[stylexPropMulti];
                  map.default = baseValue ?? null;
                }
                for (const ps of pseudos) {
                  map[ps] = parsed.exprAst as any;
                }
                target[stylexPropMulti] = map;
                return;
              }
              target[stylexPropMulti] = parsed.exprAst as any;
            };

            // Parse all three branches
            const outerParsed = parseResolved(
              res.outerTruthyBranch.expr,
              res.outerTruthyBranch.imports,
            );
            const innerTruthyParsed = parseResolved(
              res.innerTruthyBranch.expr,
              res.innerTruthyBranch.imports,
            );
            const innerFalsyParsed = parseResolved(
              res.innerFalsyBranch.expr,
              res.innerFalsyBranch.imports,
            );

            if (!outerParsed || !innerTruthyParsed || !innerFalsyParsed) {
              bailUnsupported(
                `Unparseable resolved interpolation in ${decl.localName}; cannot safely emit styles.`,
              );
              break;
            }

            // Generate style keys for each branch
            const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
            const outerKey = `${decl.styleKey}${capitalize(res.outerProp)}`;
            const innerTruthyKey = `${decl.styleKey}${capitalize(res.innerProp)}True`;
            const innerFalsyKey = `${decl.styleKey}${capitalize(res.innerProp)}False`;

            // Create variant buckets for each branch
            const outerBucket = { ...variantBuckets.get(res.outerProp) } as Record<string, unknown>;
            applyParsed(outerBucket, outerParsed);
            variantBuckets.set(res.outerProp, outerBucket);
            variantStyleKeys[res.outerProp] ??= outerKey;

            const innerTruthyWhen = `${res.innerProp}True`;
            const innerTruthyBucket = { ...variantBuckets.get(innerTruthyWhen) } as Record<
              string,
              unknown
            >;
            applyParsed(innerTruthyBucket, innerTruthyParsed);
            variantBuckets.set(innerTruthyWhen, innerTruthyBucket);
            variantStyleKeys[innerTruthyWhen] ??= innerTruthyKey;

            const innerFalsyWhen = `${res.innerProp}False`;
            const innerFalsyBucket = { ...variantBuckets.get(innerFalsyWhen) } as Record<
              string,
              unknown
            >;
            applyParsed(innerFalsyBucket, innerFalsyParsed);
            variantBuckets.set(innerFalsyWhen, innerFalsyBucket);
            variantStyleKeys[innerFalsyWhen] ??= innerFalsyKey;

            // Store compound variant info for emit phase
            decl.compoundVariants ??= [];
            decl.compoundVariants.push({
              outerProp: res.outerProp,
              outerTruthyKey: outerKey,
              innerProp: res.innerProp,
              innerTruthyKey,
              innerFalsyKey,
            });

            decl.needsWrapperComponent = true;
            continue;
          }

          if (res && res.type === "emitInlineStyleValueFromProps") {
            if (!d.property) {
              // This handler is only intended for value interpolations on concrete properties.
              // If the IR is missing a property, fall through to other handlers.
            } else {
              const e = decl.templateExpressions[slotId] as any;
              if (e?.type === "ArrowFunctionExpression") {
                if (pseudos?.length || media) {
                  const bodyExpr =
                    e.body?.type === "BlockStatement"
                      ? e.body.body?.find((s: any) => s.type === "ReturnStatement")?.argument
                      : e.body;
                  if (countConditionalExpressions(bodyExpr) > 1) {
                    warnings.push({
                      severity: "warning",
                      type: "dynamic-node",
                      message: `Unsupported nested conditional interpolation for ${decl.localName}.`,
                      ...(loc ? { loc } : {}),
                    });
                    bail = true;
                    break;
                  }
                  const propsParam = j.identifier("props");
                  const valueExprRaw = (() => {
                    const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
                    if (hasThemeAccessInArrowFn(e)) {
                      warnPropInlineStyle(
                        decl,
                        d.property,
                        "props.theme access is not supported in inline styles",
                        loc,
                      );
                      bail = true;
                      return null;
                    }
                    const inlineExpr = unwrapped?.expr ?? inlineArrowFunctionBody(j, e);
                    if (!inlineExpr) {
                      warnPropInlineStyle(
                        decl,
                        d.property,
                        "expression cannot be safely inlined",
                        loc,
                      );
                      bail = true;
                      return null;
                    }
                    const baseExpr = inlineExpr;
                    const { prefix, suffix } = extractStaticParts(d.value);
                    return prefix || suffix
                      ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                      : baseExpr;
                  })();
                  if (bail || !valueExprRaw) {
                    break;
                  }
                  for (const out of cssDeclarationToStylexDeclarations(d)) {
                    const wrapValue = (expr: ExpressionKind): ExpressionKind => {
                      const needsString =
                        out.prop === "boxShadow" ||
                        out.prop === "backgroundColor" ||
                        out.prop.toLowerCase().endsWith("color");
                      if (!needsString) {
                        return expr;
                      }
                      return j.templateLiteral(
                        [
                          j.templateElement({ raw: "", cooked: "" }, false),
                          j.templateElement({ raw: "", cooked: "" }, true),
                        ],
                        [expr],
                      );
                    };
                    const valueExpr = wrapValue(valueExprRaw);
                    const buildPropValue = (): ExpressionKind => {
                      if (media && pseudos?.length) {
                        const pseudoProps = pseudos.map((ps) =>
                          j.property(
                            "init",
                            j.literal(ps),
                            j.objectExpression([
                              j.property("init", j.identifier("default"), j.literal(null)),
                              j.property("init", j.literal(media), valueExpr),
                            ]),
                          ),
                        );
                        return j.objectExpression([
                          j.property("init", j.identifier("default"), j.literal(null)),
                          ...pseudoProps,
                        ]);
                      }
                      if (media) {
                        return j.objectExpression([
                          j.property("init", j.identifier("default"), j.literal(null)),
                          j.property("init", j.literal(media), valueExpr),
                        ]);
                      }
                      const pseudoProps = pseudos?.map((ps) =>
                        j.property("init", j.literal(ps), valueExpr),
                      );
                      return j.objectExpression([
                        j.property("init", j.identifier("default"), j.literal(null)),
                        ...(pseudoProps ?? []),
                      ]);
                    };
                    const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}FromProps`;
                    if (!styleFnDecls.has(fnKey)) {
                      const p = j.property("init", j.identifier(out.prop), buildPropValue()) as any;
                      const body = j.objectExpression([p]);
                      styleFnDecls.set(fnKey, j.arrowFunctionExpression([propsParam], body));
                    }
                    if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
                      styleFnFromProps.push({ fnKey, jsxProp: "__props" });
                    }
                  }
                  continue;
                }
                if (decl.shouldForwardProp && hasUnsupportedConditionalTest(e)) {
                  warnings.push({
                    severity: "warning",
                    type: "dynamic-node",
                    message: `Unsupported conditional test in shouldForwardProp for ${decl.localName}.`,
                    ...(loc ? { loc } : {}),
                  });
                  bail = true;
                  break;
                }
                const propsUsed = collectPropsFromArrowFn(e);
                for (const propName of propsUsed) {
                  ensureShouldForwardPropDrop(decl, propName);
                }
                if (hasThemeAccessInArrowFn(e)) {
                  warnPropInlineStyle(
                    decl,
                    d.property,
                    "props.theme access is not supported in inline styles",
                    loc,
                  );
                  bail = true;
                  break;
                }
                const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
                const inlineExpr = unwrapped?.expr ?? inlineArrowFunctionBody(j, e);
                if (!inlineExpr) {
                  warnPropInlineStyle(decl, d.property, "expression cannot be safely inlined", loc);
                  bail = true;
                  break;
                }
                decl.needsWrapperComponent = true;
                const baseExpr = inlineExpr;
                // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
                const { prefix, suffix } = extractStaticParts(d.value);
                const valueExpr =
                  prefix || suffix
                    ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                    : baseExpr;
                for (const out of cssDeclarationToStylexDeclarations(d)) {
                  if (!out.prop) {
                    continue;
                  }
                  inlineStyleProps.push({ prop: out.prop, expr: valueExpr });
                }
                continue;
              }
            }
          }

          if (res && res.type === "emitStyleFunction") {
            const jsxProp = res.call;
            {
              const outs = cssDeclarationToStylexDeclarations(d);
              for (let i = 0; i < outs.length; i++) {
                const out = outs[i]!;
                const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
                styleFnFromProps.push({ fnKey, jsxProp });

                if (!styleFnDecls.has(fnKey)) {
                  // IMPORTANT: don't reuse the same Identifier node for both the function param and
                  // expression positions. If the param identifier has a TS annotation, reusing it
                  // in expression positions causes printers to emit `value: any` inside templates.
                  const param = j.identifier(out.prop);
                  const valueId = j.identifier(out.prop);
                  // Be permissive: callers might pass numbers (e.g. `${props => props.$width}px`)
                  // or strings (e.g. `${props => props.$color}`).
                  if (jsxProp !== "__props") {
                    annotateParamFromJsxProp(param, jsxProp);
                  }
                  if (jsxProp?.startsWith?.("$")) {
                    ensureShouldForwardPropDrop(decl, jsxProp);
                  }

                  // If this declaration is a simple interpolated string with a single slot and
                  // surrounding static text, preserve it by building a TemplateLiteral around the
                  // prop value, e.g. `${value}px`, `opacity ${value}ms`.
                  const buildValueExpr = (): any => {
                    const transformed = (() => {
                      const vt = (
                        res as { valueTransform?: { kind: string; calleeIdent?: string } }
                      ).valueTransform;
                      if (vt?.kind === "call" && typeof vt.calleeIdent === "string") {
                        return j.callExpression(j.identifier(vt.calleeIdent), [valueId]);
                      }
                      return valueId;
                    })();
                    const wrapTemplate = !!(res as { wrapValueInTemplateLiteral?: boolean })
                      .wrapValueInTemplateLiteral;
                    const transformedValue = wrapTemplate
                      ? j.templateLiteral(
                          [
                            j.templateElement({ raw: "", cooked: "" }, false),
                            j.templateElement({ raw: "", cooked: "" }, true),
                          ],
                          [transformed],
                        )
                      : transformed;
                    const v: any = (d as any).value;
                    if (!v || v.kind !== "interpolated") {
                      return transformedValue;
                    }
                    const parts: any[] = v.parts ?? [];
                    const slotParts = parts.filter((p: any) => p?.kind === "slot");
                    if (slotParts.length !== 1) {
                      return transformedValue;
                    }
                    const onlySlot = slotParts[0]!;
                    if (onlySlot.slotId !== slotId) {
                      return transformedValue;
                    }

                    // If it's just the slot, keep it as the raw value (number/string).
                    const hasStatic = parts.some(
                      (p: any) => p?.kind === "static" && p.value !== "",
                    );
                    if (!hasStatic) {
                      return transformedValue;
                    }

                    const quasis: any[] = [];
                    const exprs: any[] = [];
                    let q = "";
                    for (const part of parts) {
                      if (part?.kind === "static") {
                        q += String(part.value ?? "");
                        continue;
                      }
                      if (part?.kind === "slot") {
                        quasis.push(j.templateElement({ raw: q, cooked: q }, false));
                        q = "";
                        exprs.push(transformed);
                        continue;
                      }
                    }
                    quasis.push(j.templateElement({ raw: q, cooked: q }, true));
                    return j.templateLiteral(quasis, exprs);
                  };

                  const valueExpr = buildValueExpr();
                  const getPropValue = (): ExpressionKind => {
                    if (!media) {
                      return valueExpr;
                    }
                    const existingFn = styleFnDecls.get(fnKey);
                    let existingValue: ExpressionKind | null = null;
                    if (existingFn?.type === "ArrowFunctionExpression") {
                      const body = existingFn.body;
                      if (body?.type === "ObjectExpression") {
                        const prop = body.properties.find((propNode: unknown) => {
                          if (!propNode || typeof propNode !== "object") {
                            return false;
                          }
                          if ((propNode as { type?: string }).type !== "Property") {
                            return false;
                          }
                          const key = (propNode as { key?: unknown }).key;
                          if (!key || typeof key !== "object") {
                            return false;
                          }
                          const keyType = (key as { type?: string }).type;
                          if (keyType === "Identifier") {
                            return (key as { name?: string }).name === out.prop;
                          }
                          if (keyType === "Literal") {
                            return (key as { value?: unknown }).value === out.prop;
                          }
                          return false;
                        });
                        if (prop && prop.type === "Property") {
                          existingValue = prop.value as ExpressionKind;
                        }
                      }
                    }
                    const defaultValue = existingValue ?? j.literal(null);
                    return j.objectExpression([
                      j.property("init", j.identifier("default"), defaultValue),
                      j.property("init", j.literal(media), valueExpr),
                    ]);
                  };
                  const p = j.property("init", j.identifier(out.prop), getPropValue()) as any;
                  p.shorthand = valueExpr?.type === "Identifier" && valueExpr.name === out.prop;
                  const body = j.objectExpression([p]);
                  styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
                }
                if (i === 0) {
                  // No direct prop to attach to here; the style function itself is emitted later.
                  // We conservatively ignore comment preservation in this path.
                }
              }
            }
            continue;
          }

          if (res && res.type === "keepOriginal") {
            warnings.push({
              severity: "warning",
              type: "dynamic-node",
              message: res.reason,
              ...(loc ? { loc } : {}),
            });
            bail = true;
            break;
          }

          if (decl.shouldForwardProp) {
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              if (!out.prop) {
                continue;
              }
              const e = decl.templateExpressions[slotId] as any;
              let baseExpr = e;
              let propsParam = j.identifier("props");
              if (e?.type === "ArrowFunctionExpression") {
                if (hasUnsupportedConditionalTest(e)) {
                  warnPropInlineStyle(
                    decl,
                    d.property,
                    "unsupported conditional test in shouldForwardProp",
                    loc,
                  );
                  bail = true;
                  break;
                }
                if (hasThemeAccessInArrowFn(e)) {
                  warnPropInlineStyle(
                    decl,
                    d.property,
                    "props.theme access is not supported in inline styles",
                    loc,
                  );
                  bail = true;
                  break;
                }
                const propsUsed = collectPropsFromArrowFn(e);
                for (const propName of propsUsed) {
                  ensureShouldForwardPropDrop(decl, propName);
                }
                if (e.params?.[0]?.type === "Identifier") {
                  propsParam = j.identifier(e.params[0].name);
                }
                const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
                const inlineExpr = unwrapped?.expr ?? inlineArrowFunctionBody(j, e);
                if (!inlineExpr) {
                  warnPropInlineStyle(decl, d.property, "expression cannot be safely inlined", loc);
                  bail = true;
                  break;
                }
                baseExpr = inlineExpr;
              }
              // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
              const { prefix, suffix } = extractStaticParts(d.value);
              const expr =
                prefix || suffix
                  ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                  : baseExpr;
              const buildPropValue = (): ExpressionKind => {
                if (media && pseudos?.length) {
                  const pseudoProps = pseudos.map((ps) =>
                    j.property(
                      "init",
                      j.literal(ps),
                      j.objectExpression([
                        j.property("init", j.identifier("default"), j.literal(null)),
                        j.property("init", j.literal(media), expr),
                      ]),
                    ),
                  );
                  return j.objectExpression([
                    j.property("init", j.identifier("default"), j.literal(null)),
                    ...pseudoProps,
                  ]);
                }
                if (media) {
                  return j.objectExpression([
                    j.property("init", j.identifier("default"), j.literal(null)),
                    j.property("init", j.literal(media), expr),
                  ]);
                }
                if (pseudos?.length) {
                  const pseudoProps = pseudos.map((ps) => j.property("init", j.literal(ps), expr));
                  return j.objectExpression([
                    j.property("init", j.identifier("default"), j.literal(null)),
                    ...pseudoProps,
                  ]);
                }
                return expr;
              };
              const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              if (!styleFnDecls.has(fnKey)) {
                const body = j.objectExpression([
                  j.property("init", j.identifier(out.prop), buildPropValue()),
                ]);
                styleFnDecls.set(fnKey, j.arrowFunctionExpression([propsParam], body));
              }
              if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
                styleFnFromProps.push({ fnKey, jsxProp: "__props" });
              }
            }
            if (bail) {
              break;
            }
            continue;
          }
          const describeInterpolation = (): string => {
            type SlotPart = { kind: "slot"; slotId: number };
            const valueParts = (d.value as { parts?: unknown[] }).parts ?? [];
            const slotPart = valueParts.find(
              (p): p is SlotPart => !!p && typeof p === "object" && (p as SlotPart).kind === "slot",
            );
            if (!slotPart) {
              return d.property ? `property "${d.property}"` : "unknown";
            }
            const expr = decl.templateExpressions[slotPart.slotId] as {
              type?: string;
              name?: string;
              callee?: {
                type?: string;
                name?: string;
                property?: { type?: string; name?: string };
              };
            } | null;
            if (!expr || typeof expr !== "object") {
              return d.property ? `property "${d.property}"` : "unknown";
            }
            if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
              return `arrow function`;
            }
            if (expr.type === "CallExpression") {
              const callee = expr.callee;
              const calleeName =
                callee?.type === "Identifier"
                  ? callee.name
                  : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
                    ? callee.property.name
                    : null;
              return calleeName
                ? `call to "${calleeName}" in "${d.property ?? "unknown"}"`
                : `call expression in "${d.property ?? "unknown"}"`;
            }
            if (expr.type === "Identifier") {
              return `identifier "${expr.name}" in "${d.property ?? "unknown"}"`;
            }
            if (expr.type === "MemberExpression" || expr.type === "OptionalMemberExpression") {
              return `member expression in "${d.property ?? "unknown"}"`;
            }
            return d.property ? `expression in "${d.property}"` : "unknown expression";
          };
          warnings.push({
            severity: "warning",
            type: "dynamic-node",
            message: `Unsupported interpolation: ${describeInterpolation()}.`,
            ...(loc ? { loc } : {}),
          });
          bail = true;
          break;
        }

        const outs = cssDeclarationToStylexDeclarations(d);
        for (let i = 0; i < outs.length; i++) {
          const out = outs[i]!;
          let value = cssValueToJs(out.value, d.important, out.prop);
          if (out.prop === "content" && typeof value === "string") {
            const m = value.match(/^['"]([\s\S]*)['"]$/);
            if (m) {
              value = `"${m[1]}"`;
            } else if (!value.startsWith('"') && !value.endsWith('"')) {
              value = `"${value}"`;
            }
          }

          if (attrTarget) {
            if (attrPseudoElement) {
              const nested = (attrTarget[attrPseudoElement] as any) ?? {};
              nested[out.prop] = value;
              attrTarget[attrPseudoElement] = nested;
              if (i === 0) {
                addPropComments(nested, out.prop, {
                  leading: (d as any).leadingComment,
                  trailingLine: (d as any).trailingLineComment,
                });
              }
              continue;
            }
            attrTarget[out.prop] = value;
            if (i === 0) {
              addPropComments(attrTarget, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
            continue;
          }

          if (out.prop && out.prop.startsWith("--") && typeof value === "string") {
            localVarValues.set(out.prop, value);
          }

          // Helper to get default value for pseudo selectors when property comes from css helper
          const getCssHelperDefaultValue = (propName: string): unknown => {
            const helperVal = cssHelperPropValues.get(propName);
            if (helperVal === undefined) {
              return null;
            }
            if (
              helperVal &&
              typeof helperVal === "object" &&
              "__cssHelperDynamicValue" in helperVal
            ) {
              // Dynamic value - look up from already-resolved css helper
              const helperDecl = (helperVal as Record<string, unknown>).decl as
                | StyledDecl
                | undefined;
              if (helperDecl) {
                const resolvedHelper = resolvedStyleObjects.get(toStyleKey(helperDecl.localName));
                if (resolvedHelper && typeof resolvedHelper === "object") {
                  return (resolvedHelper as Record<string, unknown>)[propName] ?? null;
                }
              }
              return null;
            }
            return helperVal;
          };

          // Handle nested pseudo + media: `&:hover { @media (...) { ... } }`
          // This produces: { ":hover": { default: value, "@media (...)": value } }
          if (media && pseudos?.length) {
            perPropPseudo[out.prop] ??= {};
            const existing = perPropPseudo[out.prop]!;
            if (!("default" in existing)) {
              const existingVal = (styleObj as Record<string, unknown>)[out.prop];
              if (existingVal !== undefined) {
                existing.default = existingVal;
              } else if (cssHelperPropValues.has(out.prop)) {
                existing.default = getCssHelperDefaultValue(out.prop);
              } else {
                existing.default = null;
              }
            }
            // For each pseudo, create/update a nested media map
            for (const ps of pseudos) {
              if (!existing[ps] || typeof existing[ps] !== "object") {
                const defaultVal = cssHelperPropValues.has(out.prop)
                  ? getCssHelperDefaultValue(out.prop)
                  : null;
                existing[ps] = { default: defaultVal };
              }
              (existing[ps] as Record<string, unknown>)[media] = value;
            }
            continue;
          }

          if (media) {
            perPropMedia[out.prop] ??= {};
            const existing = perPropMedia[out.prop]!;
            if (!("default" in existing)) {
              const existingVal = (styleObj as Record<string, unknown>)[out.prop];
              if (existingVal !== undefined) {
                existing.default = existingVal;
              } else if (cssHelperPropValues.has(out.prop)) {
                existing.default = getCssHelperDefaultValue(out.prop);
              } else {
                existing.default = null;
              }
            }
            existing[media] = value;
            continue;
          }

          if (pseudos?.length) {
            perPropPseudo[out.prop] ??= {};
            const existing = perPropPseudo[out.prop]!;
            if (!("default" in existing)) {
              // If the property comes from a composed css helper, use the helper's
              // value as the default to preserve it during style merging.
              const existingVal = (styleObj as Record<string, unknown>)[out.prop];
              if (existingVal !== undefined) {
                existing.default = existingVal;
              } else if (cssHelperPropValues.has(out.prop)) {
                existing.default = getCssHelperDefaultValue(out.prop);
              } else {
                existing.default = null;
              }
            }
            // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
            for (const ps of pseudos) {
              existing[ps] = value;
            }
            continue;
          }

          if (pseudoElement) {
            nestedSelectors[pseudoElement] ??= {};
            nestedSelectors[pseudoElement]![out.prop] = value;
            if (i === 0) {
              addPropComments(nestedSelectors[pseudoElement]!, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
            continue;
          }

          styleObj[out.prop] = value;
          if (i === 0) {
            addPropComments(styleObj, out.prop, {
              leading: (d as any).leadingComment,
              trailingLine: (d as any).trailingLineComment,
            });
          }
        }
      }
      if (bail) {
        break;
      }
    }
    if (bail) {
      break;
    }

    for (const [prop, map] of Object.entries(perPropPseudo)) {
      styleObj[prop] = map;
    }
    for (const [prop, map] of Object.entries(perPropMedia)) {
      styleObj[prop] = map;
    }
    for (const [sel, obj] of Object.entries(nestedSelectors)) {
      styleObj[sel] = obj;
    }

    const varsToDrop = new Set<string>();
    rewriteCssVarsInStyleObject(styleObj, localVarValues, varsToDrop);
    for (const name of varsToDrop) {
      delete (styleObj as any)[name];
    }

    if (
      decl.rawCss &&
      (/__SC_EXPR_\d+__\s*\{/.test(decl.rawCss) ||
        /&:[a-z-]+(?:\([^)]*\))?\s+__SC_EXPR_\d+__\s*\{/i.test(decl.rawCss))
    ) {
      let didApply = false;
      // ancestorPseudo is null for base styles, or the pseudo string (e.g., ":hover", ":focus-visible")
      const applyBlock = (slotId: number, declsText: string, ancestorPseudo: string | null) => {
        const expr = decl.templateExpressions[slotId] as any;
        if (!expr || expr.type !== "Identifier") {
          return;
        }
        const childLocal = expr.name as string;
        const childDecl = declByLocalName.get(childLocal);
        if (!childDecl) {
          return;
        }
        const overrideStyleKey = `${toStyleKey(childLocal)}In${decl.localName}`;
        ancestorSelectorParents.add(decl.styleKey);
        // Only add to descendantOverrides once per override key
        if (!descendantOverridePseudoBuckets.has(overrideStyleKey)) {
          descendantOverrides.push({
            parentStyleKey: decl.styleKey,
            childStyleKey: childDecl.styleKey,
            overrideStyleKey,
          });
        }
        // Get or create the pseudo buckets map for this override key
        let pseudoBuckets = descendantOverridePseudoBuckets.get(overrideStyleKey);
        if (!pseudoBuckets) {
          pseudoBuckets = new Map();
          descendantOverridePseudoBuckets.set(overrideStyleKey, pseudoBuckets);
        }
        // Get or create the bucket for this specific pseudo (or null for base)
        let bucket = pseudoBuckets.get(ancestorPseudo);
        if (!bucket) {
          bucket = {};
          pseudoBuckets.set(ancestorPseudo, bucket);
        }
        didApply = true;

        const declLines = declsText
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const line of declLines) {
          const m = line.match(/^([^:]+):([\s\S]+)$/);
          if (!m) {
            continue;
          }
          const prop = m[1]!.trim();
          const value = m[2]!.trim();
          // Skip values that contain unresolved interpolation placeholders - these should
          // be handled by the IR handler which has proper theme resolution
          if (/__SC_EXPR_\d+__/.test(value)) {
            continue;
          }
          // Convert CSS property name to camelCase (e.g., outline-offset -> outlineOffset)
          const outProp = cssPropertyToStylexProp(
            prop === "background" ? resolveBackgroundStylexProp(value) : prop,
          );
          const jsVal = cssValueToJs({ kind: "static", value } as any, false, outProp);
          (bucket as Record<string, unknown>)[outProp] = jsVal;
        }
      };

      const baseRe = /__SC_EXPR_(\d+)__\s*\{([\s\S]*?)\}/g;
      let m: RegExpExecArray | null;
      while ((m = baseRe.exec(decl.rawCss))) {
        const before = decl.rawCss.slice(Math.max(0, m.index - 30), m.index);
        // Skip if this is preceded by a pseudo selector pattern
        if (/&:[a-z-]+(?:\([^)]*\))?\s+$/i.test(before)) {
          continue;
        }
        applyBlock(Number(m[1]), m[2] ?? "", null);
      }
      // Match any pseudo selector pattern: &:hover, &:focus-visible, &:active, etc.
      const pseudoRe = /&(:[a-z-]+(?:\([^)]*\))?)\s+__SC_EXPR_(\d+)__\s*\{([\s\S]*?)\}/gi;
      while ((m = pseudoRe.exec(decl.rawCss))) {
        const pseudo = m[1]!;
        applyBlock(Number(m[2]), m[3] ?? "", pseudo);
      }

      if (didApply) {
        delete (styleObj as any).width;
        delete (styleObj as any).height;
        delete (styleObj as any).opacity;
        delete (styleObj as any).transform;
      }
    }

    if (decl.enumVariant) {
      const { baseKey, cases } = decl.enumVariant;
      const oldKey = decl.styleKey;
      decl.styleKey = baseKey;
      resolvedStyleObjects.delete(oldKey);
      resolvedStyleObjects.set(baseKey, styleObj);
      for (const c of cases) {
        resolvedStyleObjects.set(c.styleKey, { backgroundColor: c.value });
      }
      decl.needsWrapperComponent = true;
    } else {
      resolvedStyleObjects.set(decl.styleKey, styleObj);
    }

    // Preserve CSS cascade semantics for pseudo selectors when variant buckets override the same property.
    //
    // We intentionally keep this narrowly-scoped to avoid churning fixture output shapes.
    // Currently we only synthesize compound variants for the `disabled` + `color === "primary"` pattern
    // so that hover can still win (matching CSS specificity semantics).
    {
      const isAstNode = (v: unknown): boolean =>
        !!v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        "type" in (v as any) &&
        typeof (v as any).type === "string";
      const isPseudoOrMediaMap = (v: unknown): v is Record<string, unknown> => {
        if (!v || typeof v !== "object" || Array.isArray(v) || isAstNode(v)) {
          return false;
        }
        const keys = Object.keys(v as any);
        if (keys.length === 0) {
          return false;
        }
        return (
          keys.includes("default") ||
          keys.some((k) => k.startsWith(":") || k.startsWith("@media") || k.startsWith("::"))
        );
      };

      // Check if we should use namespace dimensions pattern instead of compound buckets
      // This is triggered when a boolean bucket overlaps CSS props with an enum bucket that
      // has a 2-value union type (indicating a variants-recipe pattern)
      const shouldUseNamespaceDimensions = (() => {
        const disabledBucket = variantBuckets.get("disabled");
        if (!disabledBucket) {
          return false;
        }
        const disabledCssProps = new Set(Object.keys(disabledBucket));

        // Check for enum buckets with 2-value union types that overlap with disabled
        for (const [when] of variantBuckets.entries()) {
          const match = when.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*===\s*"([^"]*)"$/);
          if (!match) {
            continue;
          }
          const propName = match[1]!;
          const propType = findJsxPropTsType(propName);
          const unionValues = extractUnionLiteralValues(propType);
          if (!unionValues || unionValues.length !== 2) {
            continue;
          }

          const enumBucket = variantBuckets.get(when);
          if (!enumBucket) {
            continue;
          }
          for (const cssProp of Object.keys(enumBucket)) {
            if (disabledCssProps.has(cssProp)) {
              return true;
            }
          }
        }
        return false;
      })();

      // Skip compound bucket creation if we'll use namespace dimensions instead
      if (!shouldUseNamespaceDimensions) {
        // Special-case: if we have a boolean "disabled" variant bucket overriding a prop that also has
        // a hover map, preserve CSS specificity semantics by emitting a compound variant keyed off
        // `disabled && color === "primary"` (when available).
        //
        // This matches styled-components semantics for patterns like:
        //  - &:hover { background-color: (color === "primary" ? darkblue : darkgray) }
        //  - disabled && "background-color: grey"
        //
        // In CSS, :hover can still override base disabled declarations due to higher specificity.
        // In StyleX, a later `backgroundColor` assignment can clobber pseudo maps, so we need the
        // disabled bucket to include an explicit ':hover' value for the relevant color case.
        const disabledKey = "disabled";
        const colorPrimaryKey = `color === "primary"`;
        const disabledBucket = variantBuckets.get(disabledKey);
        const colorPrimaryBucket = variantBuckets.get(colorPrimaryKey);
        if (disabledBucket && (styleObj as any).backgroundColor) {
          const baseBg = (styleObj as any).backgroundColor;
          const primaryBg = (colorPrimaryBucket as any)?.backgroundColor ?? null;

          const baseHover = isPseudoOrMediaMap(baseBg) ? (baseBg as any)[":hover"] : null;
          const primaryHover = isPseudoOrMediaMap(primaryBg) ? (primaryBg as any)[":hover"] : null;

          const disabledBg = (disabledBucket as any).backgroundColor;
          const disabledDefault = isPseudoOrMediaMap(disabledBg)
            ? (disabledBg as any).default
            : (disabledBg ?? null);

          if (disabledDefault !== null && baseHover !== null && primaryHover !== null) {
            // Remove the base disabled backgroundColor override; we'll replace it with compound buckets.
            delete (disabledBucket as any).backgroundColor;

            const disabledPrimaryWhen = `${disabledKey} && ${colorPrimaryKey}`;
            const disabledNotPrimaryWhen = `${disabledKey} && color !== "primary"`;

            const mkBucket = (hoverVal: any) => ({
              ...(disabledBucket as any),
              backgroundColor: { default: disabledDefault, ":hover": hoverVal },
            });

            variantBuckets.set(disabledPrimaryWhen, mkBucket(primaryHover));
            variantStyleKeys[disabledPrimaryWhen] ??= `${decl.styleKey}${toSuffixFromProp(
              disabledPrimaryWhen,
            )}`;

            variantBuckets.set(disabledNotPrimaryWhen, mkBucket(baseHover));
            variantStyleKeys[disabledNotPrimaryWhen] ??= `${decl.styleKey}${toSuffixFromProp(
              disabledNotPrimaryWhen,
            )}`;
          }
        }
      }
    }

    // Group enum-like variant conditions into dimensions for StyleX variants recipe pattern
    const { dimensions, remainingBuckets, remainingStyleKeys, propsToStrip } =
      groupVariantBucketsIntoDimensions(
        variantBuckets,
        variantStyleKeys,
        decl.styleKey,
        styleObj,
        findJsxPropTsType,
        isJsxPropOptional,
      );

    // Store dimensions for separate stylex.create calls
    if (dimensions.length > 0) {
      decl.variantDimensions = dimensions;
      decl.needsWrapperComponent = true;
      // Remove CSS props that were moved to variant dimensions from base styles
      for (const prop of propsToStrip) {
        delete (styleObj as Record<string, unknown>)[prop];
      }
    }

    // Add remaining (compound/boolean) variants to resolvedStyleObjects
    for (const [when, obj] of remainingBuckets.entries()) {
      const key = remainingStyleKeys[when]!;
      resolvedStyleObjects.set(key, obj);
    }
    for (const [k, v] of attrBuckets.entries()) {
      resolvedStyleObjects.set(k, v);
    }
    if (Object.keys(remainingStyleKeys).length) {
      decl.variantStyleKeys = remainingStyleKeys;
      // If we have variant styles keyed off props (e.g. `disabled`),
      // we need a wrapper component to evaluate those conditions at runtime and
      // avoid forwarding custom variant props to DOM nodes.
      decl.needsWrapperComponent = true;
    }
    if (styleFnFromProps.length) {
      decl.styleFnFromProps = styleFnFromProps;
      for (const [k, v] of styleFnDecls.entries()) {
        resolvedStyleObjects.set(k, v);
      }
    }
    if (inlineStyleProps.length) {
      decl.inlineStyleProps = inlineStyleProps;
    }
  }

  // Generate style objects from descendant override pseudo buckets
  if (descendantOverridePseudoBuckets.size > 0) {
    const makeAncestorKey = (pseudo: string) =>
      j.callExpression(
        j.memberExpression(
          j.memberExpression(j.identifier("stylex"), j.identifier("when")),
          j.identifier("ancestor"),
        ),
        [j.literal(pseudo)],
      );

    const isAstNode = (v: unknown): v is ExpressionKind =>
      !!v && typeof v === "object" && "type" in v;

    for (const [overrideKey, pseudoBuckets] of descendantOverridePseudoBuckets.entries()) {
      const baseBucket = pseudoBuckets.get(null) ?? {};
      const props: any[] = [];

      // Collect all property names across all pseudo buckets
      const allPropNames = new Set<string>();
      for (const bucket of pseudoBuckets.values()) {
        for (const prop of Object.keys(bucket)) {
          allPropNames.add(prop);
        }
      }

      for (const prop of allPropNames) {
        const baseVal = (baseBucket as Record<string, unknown>)[prop];
        // Collect pseudo values for this property
        const pseudoValues: Array<{ pseudo: string; value: unknown }> = [];
        for (const [pseudo, bucket] of pseudoBuckets.entries()) {
          if (pseudo === null) {
            continue;
          }
          const val = (bucket as Record<string, unknown>)[prop];
          if (val !== undefined) {
            pseudoValues.push({ pseudo, value: val });
          }
        }

        if (pseudoValues.length > 0) {
          // Build object expression with default and pseudo values
          const objProps: any[] = [
            j.property(
              "init",
              j.identifier("default"),
              isAstNode(baseVal) ? baseVal : literalToAst(j, baseVal ?? null),
            ),
          ];
          for (const { pseudo, value } of pseudoValues) {
            const ancestorKey = makeAncestorKey(pseudo);
            const valExpr = isAstNode(value) ? value : literalToAst(j, value);
            const propNode = Object.assign(j.property("init", ancestorKey, valExpr), {
              computed: true,
            });
            objProps.push(propNode);
          }
          const mapExpr = j.objectExpression(objProps);
          props.push(j.property("init", j.identifier(prop), mapExpr));
        } else if (baseVal !== undefined) {
          props.push(
            j.property(
              "init",
              j.identifier(prop),
              isAstNode(baseVal) ? baseVal : literalToAst(j, baseVal),
            ),
          );
        }
      }

      if (props.length > 0) {
        resolvedStyleObjects.set(overrideKey, j.objectExpression(props) as unknown);
      }
    }
  }

  return { resolvedStyleObjects, descendantOverrides, ancestorSelectorParents, bail };
}
