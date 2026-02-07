/**
 * CSS helper-specific handlers extracted from lower-rules.
 * Core concepts: css`` helper parsing and variant/test handling.
 */
import type { StyledDecl } from "../transform-types.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import {
  getArrowFnParamBindings,
  getMemberPathFromIdentifier,
} from "../utilities/jscodeshift-utils.js";
import { createPropTestHelpers, invertWhen } from "./variant-utils.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import { mergeStyleObjects } from "./utils.js";
import type { InternalHandlerContext } from "../builtin-handlers.js";
import type { TestInfo } from "./decl-types.js";
import { parseSwitchReturningCssTemplates } from "./switch-variants.js";
import {
  resolveTemplateLiteralValue,
  type ComponentInfo,
  type TemplateLiteralContext,
} from "./template-literals.js";
import { cssValueToJs, toSuffixFromProp } from "../transform/helpers.js";
import type { LowerRulesState } from "./state.js";

type CssHelperHandlersContext = Pick<
  LowerRulesState,
  | "j"
  | "filePath"
  | "warnings"
  | "parseExpr"
  | "resolveValue"
  | "resolveCall"
  | "resolveImportInScope"
  | "resolverImports"
  | "isCssHelperTaggedTemplate"
  | "resolveCssHelperTemplate"
  | "cssHelperFunctions"
  | "usedCssHelperFunctions"
  | "markBail"
> & {
  decl: StyledDecl;
  styleObj: Record<string, unknown>;
  variantBuckets: Map<string, Record<string, unknown>>;
  variantStyleKeys: Record<string, string>;
  applyVariant: (testInfo: TestInfo, consStyle: Record<string, unknown>) => void;
  dropAllTestInfoProps: (testInfo: TestInfo) => void;
  componentInfo: ComponentInfo;
  handlerContext: InternalHandlerContext;
};

export const createCssHelperHandlers = (ctx: CssHelperHandlersContext) => {
  const {
    j,
    filePath,
    decl,
    warnings,
    styleObj,
    variantBuckets,
    variantStyleKeys,
    cssHelperFunctions,
    usedCssHelperFunctions,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    isCssHelperTaggedTemplate,
    resolveCssHelperTemplate,
    applyVariant,
    dropAllTestInfoProps,
    componentInfo,
    handlerContext,
    markBail,
  } = ctx;

  const tplCtx: TemplateLiteralContext = {
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
  };

  // Handle property-level ternary with template literal branches containing helper calls:
  //   background: ${(props) => props.$faded
  //     ? `linear-gradient(..., ${color("bgBorder")(props)} ...)`
  //     : `linear-gradient(..., ${color("bgBorder")(props)} ...)`}
  //
  // When both branches are template literals that can be fully resolved via the adapter,
  // emit StyleX variants for each branch.
  const tryHandlePropertyTernaryTemplateLiteral = (d: any): boolean => {
    if (d.value.kind !== "interpolated") {
      return false;
    }
    if (!d.property) {
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
    const bindings = getArrowFnParamBindings(expr);
    if (!bindings) {
      return false;
    }
    const body = expr.body as any;
    if (!body || body.type !== "ConditionalExpression") {
      return false;
    }

    const { parseTestInfo } = createPropTestHelpers(bindings);
    const testInfo = parseTestInfo(body.test);
    if (!testInfo) {
      return false;
    }

    const cons = body.consequent;
    const alt = body.alternate;
    if (cons?.type !== "TemplateLiteral" || alt?.type !== "TemplateLiteral") {
      return false;
    }

    const consValue = resolveTemplateLiteralValue(tplCtx, {
      tpl: cons as any,
      property: d.property,
    });
    const altValue = resolveTemplateLiteralValue(tplCtx, {
      tpl: alt as any,
      property: d.property,
    });

    if (!consValue || !altValue) {
      return false;
    }

    const invertedWhen = invertWhen(testInfo.when);
    if (!invertedWhen) {
      return false;
    }

    // Extract raw value from the template literal for property mapping
    // (e.g., to detect gradients in "background" property)
    const altQuasis: Array<{ value?: { raw?: string; cooked?: string } }> = alt.quasis ?? [];
    const valueRawFromTemplate = altQuasis.map((q) => q.value?.raw ?? "").join("");

    // Get the StyleX property name for this CSS property
    const stylexProps = cssDeclarationToStylexDeclarations({
      property: d.property,
      value: { kind: "static", value: valueRawFromTemplate },
      valueRaw: valueRawFromTemplate,
      important: false,
    });
    const firstStylexProp = stylexProps[0];
    if (stylexProps.length === 0 || !firstStylexProp) {
      return false;
    }
    const stylexProp = firstStylexProp.prop;

    // Add the "false" branch value to the base style
    styleObj[stylexProp] = altValue;

    // Add the "true" branch value as a variant
    applyVariant(testInfo, { [stylexProp]: consValue });

    dropAllTestInfoProps(testInfo);

    return true;
  };

  const tryHandleCssHelperFunctionSwitchBlock = (d: any): boolean => {
    // Handle: ${(props) => helper(props.appearance)}
    // where `helper` is: const helper = (appearance) => css`... ${() => { switch(appearance) { ... return css`...` }}} ...`
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
    const propsParam = expr.params?.[0];
    if (!propsParam || propsParam.type !== "Identifier") {
      return false;
    }
    const propsParamName = propsParam.name;
    const body = expr.body as any;
    if (!body || body.type !== "CallExpression") {
      return false;
    }
    if (body.callee?.type !== "Identifier") {
      return false;
    }
    const helperName = body.callee.name as string;
    const helperFn = cssHelperFunctions.get(helperName);
    if (!helperFn) {
      return false;
    }
    const arg0 = body.arguments?.[0];
    const propPath = getMemberPathFromIdentifier(arg0 as any, propsParamName);
    if (!propPath || propPath.length !== 1) {
      return false;
    }
    const jsxProp = propPath[0]!;

    // Extract base styles and a single switch interpolation from the helper template.
    const baseFromHelper: Record<string, unknown> = {};
    let sawSwitch = false;

    for (const rule of helperFn.rules) {
      if (rule.atRuleStack.length > 0) {
        warnings.push({
          severity: "warning",
          type: "`css` helper function switch must return css templates in all branches",
          loc: helperFn.loc ?? decl.loc,
          context: { reason: "at-rule-in-helper" },
        });
        markBail();
        return true;
      }
      if ((rule.selector ?? "").trim() !== "&") {
        warnings.push({
          severity: "warning",
          type: "`css` helper function switch must return css templates in all branches",
          loc: helperFn.loc ?? decl.loc,
          context: { reason: "nested-selector-in-helper", selector: rule.selector },
        });
        markBail();
        return true;
      }
      for (const hd of rule.declarations) {
        if (hd.property) {
          if (hd.value.kind !== "static") {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "dynamic-decl-in-helper", property: hd.property },
            });
            markBail();
            return true;
          }
          for (const out of cssDeclarationToStylexDeclarations(hd)) {
            (baseFromHelper as any)[out.prop] = cssValueToJs(out.value, hd.important, out.prop);
          }
          continue;
        }

        // Expect exactly one switch interpolation.
        if (hd.value.kind !== "interpolated") {
          continue;
        }
        const hparts = (hd.value as any).parts ?? [];
        if (hparts.length !== 1 || hparts[0]?.kind !== "slot") {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "unsupported-interpolation-shape" },
          });
          markBail();
          return true;
        }
        if (sawSwitch) {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "multiple-switch-interpolations" },
          });
          markBail();
          return true;
        }
        const hslotId = hparts[0].slotId;
        const hexpr = helperFn.templateExpressions[hslotId] as any;
        if (!hexpr || hexpr.type !== "ArrowFunctionExpression") {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "switch-interpolation-not-arrow" },
          });
          markBail();
          return true;
        }
        if ((hexpr.params ?? []).length !== 0) {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "switch-iife-has-params" },
          });
          markBail();
          return true;
        }
        const hbody = hexpr.body as any;
        if (!hbody || hbody.type !== "BlockStatement") {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "switch-iife-not-block" },
          });
          markBail();
          return true;
        }
        const stmts = hbody.body ?? [];
        if (!Array.isArray(stmts) || stmts.length !== 1 || stmts[0]?.type !== "SwitchStatement") {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "switch-iife-not-single-switch" },
          });
          markBail();
          return true;
        }

        const parsed = parseSwitchReturningCssTemplates({
          switchStmt: stmts[0],
          expectedDiscriminantIdent: helperFn.paramName,
          isCssHelperTaggedTemplate,
          warnings,
          loc: helperFn.loc ?? decl.loc,
        });
        if (!parsed) {
          markBail();
          return true;
        }

        const defaultResolved = resolveCssHelperTemplate(
          parsed.defaultCssTemplate.quasi,
          null,
          helperFn.loc ?? decl.loc,
        );
        if (!defaultResolved || defaultResolved.dynamicProps.length > 0) {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "default-css-not-resolvable" },
          });
          markBail();
          return true;
        }
        mergeStyleObjects(baseFromHelper, defaultResolved.style);

        for (const [caseValue, tpl] of parsed.caseCssTemplates.entries()) {
          const res = resolveCssHelperTemplate(tpl.quasi, null, helperFn.loc ?? decl.loc);
          if (!res || res.dynamicProps.length > 0) {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "case-css-not-resolvable", caseValue },
            });
            markBail();
            return true;
          }
          const when = `${jsxProp} === ${JSON.stringify(caseValue)}`;
          const existingBucket = variantBuckets.get(when);
          const nextBucket = existingBucket ? { ...existingBucket } : {};
          mergeStyleObjects(nextBucket, res.style);
          variantBuckets.set(when, nextBucket);
          variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
        }

        // Ensure prop is dropped from DOM (unless transient)
        if (!jsxProp.startsWith("$")) {
          ensureShouldForwardPropDrop(decl, jsxProp);
        }
        sawSwitch = true;
      }
    }

    if (!sawSwitch) {
      // This was a css helper function, but not the supported switch-returning-css pattern.
      return false;
    }

    // Only mark as inlined once we've successfully handled the helper.
    usedCssHelperFunctions.add(helperName);

    // Merge helper base styles into component base style.
    mergeStyleObjects(styleObj, baseFromHelper);
    return true;
  };

  return {
    tryHandlePropertyTernaryTemplateLiteral,
    tryHandleCssHelperFunctionSwitchBlock,
  };
};
