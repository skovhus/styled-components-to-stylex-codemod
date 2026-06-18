/**
 * Resolves runtime (prop/theme-dependent) conditional styles into StyleX style
 * functions and observed-variant buckets. Split out of `css-helper-conditional.ts`.
 *
 * `createRuntimeStyleVariantHandlers` is created once per handler invocation so the
 * closures can capture the invocation-scoped `parseChainedTestInfo`/`avoidNames`
 * helpers; `testInfo` is always threaded explicitly as a parameter.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind, StyleFnFromPropsEntry, TestInfo } from "./decl-types.js";
import type { LowerRulesState } from "./state.js";
import { cloneAstNode, type ASTNodeRecord } from "../utilities/jscodeshift-utils.js";
import { getImportedStylexIdentifiers } from "./inline-styles.js";
import { invertWhen } from "./variant-utils.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";
import {
  emitObservedVariantBuckets,
  resolveObservedVariantValues,
} from "./observed-variant-buckets.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import { evaluateObservedDynamicExpression } from "./static-evaluator.js";
import {
  normalizeTransientPropName,
  staticValueFromExpression,
  styleValueToExpression,
  toRuntimeStyleExpression,
} from "./css-conditional-ast-utils.js";
import { bridgeRuntimePseudoColorValues, referencesRuntimeValue } from "./runtime-pseudo-bridge.js";
import {
  collectRuntimeStylePropNames,
  ensureUniqueKey,
  styleReferencesRuntimeTheme,
} from "./runtime-prop-names.js";

type DynamicPropEntry = {
  jsxProp: string;
  stylexProp: string;
  callArg?: ExpressionKind;
};

type RuntimeStyleVariantDeps = {
  j: JSCodeshift;
  root: LowerRulesState["root"];
  decl: StyledDecl;
  parseExpr: LowerRulesState["parseExpr"];
  applyVariant: (testInfo: TestInfo, styleObj: Record<string, unknown>) => void;
  dropAllTestInfoProps: (testInfo: TestInfo) => void;
  annotateParamFromJsxProp: (paramId: unknown, jsxProp: string) => void;
  isJsxPropOptional: (jsxProp: string) => boolean;
  importMap: LowerRulesState["importMap"];
  resolverImports: LowerRulesState["resolverImports"];
  styleFnDecls: Map<string, unknown>;
  styleFnFromProps: StyleFnFromPropsEntry[];
  extraStyleObjects: Map<string, Record<string, unknown>>;
  resolvedStyleObjects: Map<string, unknown>;
  avoidNames: Set<string>;
  parseChainedTestInfo: (test: ExpressionKind) => TestInfo | null;
  propUsageByComponent?: LowerRulesState["propUsageByComponent"];
  exportedComponentNames: LowerRulesState["exportedComponentNames"];
  componentsUsedAsValue: LowerRulesState["componentsUsedAsValue"];
};

export function createRuntimeStyleVariantHandlers(deps: RuntimeStyleVariantDeps): {
  tryApplyRuntimeStyleFunction: (
    testInfo: TestInfo,
    style: Record<string, unknown>,
    opts?: { dynamicProps?: DynamicPropEntry[] },
  ) => boolean;
} {
  const {
    j,
    root,
    decl,
    parseExpr,
    applyVariant,
    dropAllTestInfoProps,
    annotateParamFromJsxProp,
    isJsxPropOptional,
    importMap,
    resolverImports,
    styleFnDecls,
    styleFnFromProps,
    extraStyleObjects,
    resolvedStyleObjects,
    avoidNames,
    parseChainedTestInfo,
    propUsageByComponent,
    exportedComponentNames,
    componentsUsedAsValue,
  } = deps;

  const tryApplyObservedVariants = (
    testInfo: TestInfo,
    propName: string,
    buildStyle: (propValue: string | number) => Record<string, unknown> | null,
  ): boolean => {
    const observedValues = resolveObservedVariantValues({
      usage: propUsageByComponent?.get(decl.localName),
      propName,
      isOptional: isJsxPropOptional(propName),
      isExported: exportedComponentNames.has(decl.localName),
      escapesAsValue: componentsUsedAsValue.has(decl.localName),
    });
    const testExpr = parseExpr(testInfo.when);
    if (!observedValues || !testExpr) {
      return false;
    }
    return emitObservedVariantBuckets({
      decl,
      propName,
      observedValues,
      applyVariant,
      ensurePropDrop: (prop) => ensureShouldForwardPropDrop(decl, prop),
      buildBucket: (propValue) => {
        const testValue = evaluateObservedDynamicExpression({
          j,
          root,
          expression: testExpr,
          propName,
          propValue,
        });
        if (testValue !== true) {
          return { kind: "skip" };
        }
        const style = buildStyle(propValue);
        return style === null ? { kind: "bail" } : { kind: "emit", style };
      },
    });
  };

  const tryApplyObservedDynamicPropVariants = (
    testInfo: TestInfo,
    dynamicProps: DynamicPropEntry[],
  ): boolean => {
    if (dynamicProps.length === 0) {
      return false;
    }
    const propNames = [...new Set(dynamicProps.map((entry) => entry.jsxProp))];
    if (propNames.length !== 1) {
      return false;
    }
    const propName = propNames[0]!;
    return tryApplyObservedVariants(testInfo, propName, (propValue) => {
      const style: Record<string, unknown> = {};
      for (const dyn of dynamicProps) {
        if (!dyn.callArg) {
          return null;
        }
        const cssValue = evaluateObservedDynamicExpression({
          j,
          root,
          expression: dyn.callArg,
          propName,
          propValue,
        });
        if (typeof cssValue !== "string" && typeof cssValue !== "number") {
          return null;
        }
        style[dyn.stylexProp] = cssValue;
      }
      return style;
    });
  };

  const tryApplyObservedRuntimeStyleVariants = (
    testInfo: TestInfo,
    style: Record<string, unknown>,
    basePropNames: ReadonlySet<string>,
  ): boolean => {
    if (Object.keys(style).length === 0 || basePropNames.size !== 1) {
      return false;
    }
    const propName = [...basePropNames][0]!;
    return tryApplyObservedVariants(testInfo, propName, (propValue) => {
      const evaluatedStyle: Record<string, unknown> = {};
      for (const [stylexProp, value] of Object.entries(style)) {
        if (!value || typeof value !== "object") {
          evaluatedStyle[stylexProp] = value;
          continue;
        }
        const cssValue = evaluateObservedDynamicExpression({
          j,
          root,
          expression: value,
          propName,
          propValue,
        });
        if (typeof cssValue !== "string" && typeof cssValue !== "number") {
          return null;
        }
        evaluatedStyle[stylexProp] = cssValue;
      }
      return evaluatedStyle;
    });
  };

  const sameVariantCondition = (left: string, right: string): boolean => left === right;

  const hasParenthesizedLogicalOperator = (when: string): boolean =>
    /\([^)]*(?:&&|\|\|)[^)]*\)/.test(when);

  const composeVariantTestInfo = (outer: TestInfo, inner: TestInfo): TestInfo | null => {
    if (
      hasParenthesizedLogicalOperator(outer.when) ||
      hasParenthesizedLogicalOperator(inner.when)
    ) {
      return null;
    }
    const outerProps = outer.allPropNames ?? (outer.propName ? [outer.propName] : []);
    const innerProps = inner.allPropNames ?? (inner.propName ? [inner.propName] : []);
    const allPropNames = [...new Set([...outerProps, ...innerProps])];
    return {
      when: `${outer.when} && ${inner.when}`,
      propName: inner.propName ?? outer.propName,
      ...(allPropNames.length > 0 ? { allPropNames } : {}),
    };
  };

  const parseRuntimeConditionalTestInfo = (test: ExpressionKind): TestInfo | null => {
    const parsed = parseChainedTestInfo(test);
    if (parsed) {
      return parsed;
    }
    if (test.type === "Identifier" && (test as { name?: string }).name?.startsWith("$")) {
      const propName = (test as { name: string }).name;
      return { when: propName, propName };
    }
    if (test.type === "UnaryExpression" && (test as { operator?: string }).operator === "!") {
      const argument = (test as { argument?: ExpressionKind }).argument;
      if (
        argument?.type === "Identifier" &&
        (argument as { name?: string }).name?.startsWith("$")
      ) {
        const propName = (argument as { name: string }).name;
        return { when: `!${propName}`, propName };
      }
    }
    return null;
  };

  const splitStaticConditionalExpression = (
    value: unknown,
  ): {
    testInfo: TestInfo;
    consequentValue: string | number;
    alternateValue: string | number;
  } | null => {
    if (!value || typeof value !== "object") {
      return null;
    }
    const node = value as ASTNodeRecord;
    if (node.type !== "ConditionalExpression") {
      return null;
    }
    const testInfo = parseRuntimeConditionalTestInfo(node.test as ExpressionKind);
    if (!testInfo) {
      return null;
    }
    const consequentValue = staticValueFromExpression(node.consequent);
    const alternateValue = staticValueFromExpression(node.alternate);
    if (
      (typeof consequentValue !== "string" && typeof consequentValue !== "number") ||
      (typeof alternateValue !== "string" && typeof alternateValue !== "number")
    ) {
      return null;
    }
    return { testInfo, consequentValue, alternateValue };
  };

  const referencesRuntimeStyleValue = (
    value: unknown,
    stylexTokenIdentifiers: ReadonlySet<string>,
  ): boolean =>
    !!value &&
    typeof value === "object" &&
    referencesRuntimeValue(styleValueToExpression(j, value), stylexTokenIdentifiers);

  const splitStaticConditionalRuntimeStyle = (
    testInfo: TestInfo,
    style: Record<string, unknown>,
    stylexTokenIdentifiers: ReadonlySet<string>,
  ): {
    baseStyle: Record<string, unknown>;
    remainingStyle: Record<string, unknown>;
    variants: Array<{ testInfo: TestInfo; style: Record<string, unknown> }>;
  } | null => {
    const baseStyle: Record<string, unknown> = {};
    const remainingStyle: Record<string, unknown> = {};
    const variants: Array<{ testInfo: TestInfo; style: Record<string, unknown> }> = [];
    let splitAny = false;

    for (const [stylexProp, value] of Object.entries(style)) {
      const split = splitStaticConditionalExpression(value);
      if (!split) {
        if (referencesRuntimeStyleValue(value, stylexTokenIdentifiers)) {
          remainingStyle[stylexProp] = value;
        } else {
          baseStyle[stylexProp] = value;
        }
        continue;
      }

      splitAny = true;
      const innerWhen = split.testInfo.when;
      const outerWhen = testInfo.when;
      const invertedInnerWhen = invertWhen(innerWhen);
      if (sameVariantCondition(innerWhen, outerWhen)) {
        baseStyle[stylexProp] = split.consequentValue;
      } else if (invertedInnerWhen && sameVariantCondition(invertedInnerWhen, outerWhen)) {
        baseStyle[stylexProp] = split.alternateValue;
      } else {
        baseStyle[stylexProp] = split.alternateValue;
        const composedTestInfo = composeVariantTestInfo(testInfo, split.testInfo);
        if (!composedTestInfo) {
          return null;
        }
        variants.push({
          testInfo: composedTestInfo,
          style: { [stylexProp]: split.consequentValue },
        });
      }
    }

    return splitAny ? { baseStyle, remainingStyle, variants } : null;
  };

  const applyStaticConditionalRuntimeStyleVariants = (
    testInfo: TestInfo,
    style: Record<string, unknown>,
    stylexTokenIdentifiers: ReadonlySet<string>,
  ): Record<string, unknown> | null => {
    const split = splitStaticConditionalRuntimeStyle(testInfo, style, stylexTokenIdentifiers);
    if (!split) {
      return null;
    }

    if (Object.keys(split.baseStyle).length > 0) {
      applyVariant(testInfo, split.baseStyle);
    }
    for (const variant of split.variants) {
      applyVariant(variant.testInfo, variant.style);
    }
    dropAllTestInfoProps(testInfo);
    return split.remainingStyle;
  };

  const tryApplyRuntimeStyleFunction = (
    testInfo: TestInfo,
    style: Record<string, unknown>,
    opts?: {
      dynamicProps?: DynamicPropEntry[];
    },
  ): boolean => {
    const importedStylexIdentifiers = getImportedStylexIdentifiers(importMap, resolverImports);
    const basePropNames = collectRuntimeStylePropNames(style, importMap, importedStylexIdentifiers);
    const referencesTheme = styleReferencesRuntimeTheme(style);
    const dynamicProps = opts?.dynamicProps ?? [];
    if (basePropNames.size === 0 && dynamicProps.length === 0 && !referencesTheme) {
      return false;
    }

    if (!referencesTheme) {
      const remainingStyle = applyStaticConditionalRuntimeStyleVariants(
        testInfo,
        style,
        importedStylexIdentifiers,
      );
      if (remainingStyle) {
        if (Object.keys(remainingStyle).length === 0 && dynamicProps.length === 0) {
          return true;
        }
        return tryApplyRuntimeStyleFunction(testInfo, remainingStyle, opts);
      }
    }

    if (!referencesTheme && tryApplyObservedRuntimeStyleVariants(testInfo, style, basePropNames)) {
      return true;
    }

    if (
      Object.keys(style).length === 0 &&
      !referencesTheme &&
      tryApplyObservedDynamicPropVariants(testInfo, dynamicProps)
    ) {
      return true;
    }

    if (Object.keys(style).length === 0 && dynamicProps.length > 0 && !referencesTheme) {
      for (const dyn of dynamicProps) {
        const fnKey = styleKeyWithSuffix(decl.styleKey, dyn.stylexProp);
        const isGuardedBySameProp =
          !!testInfo.propName &&
          normalizeTransientPropName(dyn.jsxProp) === normalizeTransientPropName(testInfo.propName);
        const conditionWhen = isGuardedBySameProp ? undefined : testInfo.when;
        const condition = isGuardedBySameProp ? ("truthy" as const) : undefined;
        if (!styleFnDecls.has(fnKey)) {
          const dynParamName = cssPropertyToIdentifier(dyn.stylexProp, avoidNames);
          const param = j.identifier(dynParamName);
          annotateParamFromJsxProp(param, dyn.jsxProp);
          const p = makeCssProperty(j, dyn.stylexProp, dynParamName);
          const bodyExpr = j.objectExpression([p]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
        }
        if (
          !styleFnFromProps.some(
            (p) =>
              p.fnKey === fnKey &&
              p.jsxProp === dyn.jsxProp &&
              p.condition === condition &&
              p.conditionWhen === conditionWhen,
          )
        ) {
          styleFnFromProps.push({
            fnKey,
            jsxProp: dyn.jsxProp,
            ...(condition ? { condition } : {}),
            ...(conditionWhen ? { conditionWhen } : {}),
          });
        }
        ensureShouldForwardPropDrop(decl, dyn.jsxProp);
      }
      for (const propName of testInfo.allPropNames ??
        (testInfo.propName ? [testInfo.propName] : [])) {
        if (propName) {
          ensureShouldForwardPropDrop(decl, propName);
        }
      }
      decl.needsWrapperComponent = true;
      return true;
    }

    const runtimeStyle = { ...style };
    for (const dyn of dynamicProps) {
      runtimeStyle[dyn.stylexProp] = j.memberExpression(
        j.identifier("props"),
        j.identifier(normalizeTransientPropName(dyn.jsxProp)),
      );
    }

    const propNames = collectRuntimeStylePropNames(
      runtimeStyle,
      importMap,
      importedStylexIdentifiers,
    );

    for (const propName of testInfo.allPropNames ??
      (testInfo.propName ? [testInfo.propName] : [])) {
      if (propName) {
        propNames.add(normalizeTransientPropName(propName));
      }
    }

    const fnKey = ensureUniqueKey(
      [styleFnDecls as Map<string, unknown>, extraStyleObjects, resolvedStyleObjects],
      styleKeyWithSuffix(
        decl.styleKey,
        testInfo.propName ? normalizeTransientPropName(testInfo.propName) : "dynamic",
      ),
    );
    const params = [j.identifier("props")];
    if (referencesTheme) {
      params.push(j.identifier("theme"));
    }

    const callArg = j.objectExpression(
      [...propNames].sort().map((propName) => {
        const id = j.identifier(propName);
        const prop = j.property("init", id, id) as ReturnType<typeof j.property> & {
          shorthand?: boolean;
        };
        prop.shorthand = true;
        return prop;
      }),
    ) as ExpressionKind;
    const addRuntimeStyleFn = (key: string, body: ExpressionKind): void => {
      styleFnDecls.set(
        key,
        j.arrowFunctionExpression(
          params.map((param) => cloneAstNode(param)),
          body,
        ),
      );
      styleFnFromProps.push({
        fnKey: key,
        jsxProp: "__props",
        callArg: cloneAstNode(callArg) as ExpressionKind,
        conditionWhen: testInfo.when,
        ...(referencesTheme
          ? {
              extraCallArgs: [
                {
                  jsxProp: "__helper" as const,
                  callArg: j.identifier("theme") as ExpressionKind,
                },
              ],
            }
          : {}),
      });
    };

    const styleProperties = Object.entries(runtimeStyle).flatMap(([prop, value]) => {
      const { expression, customProps } = bridgeRuntimePseudoColorValues(
        j,
        fnKey,
        prop,
        toRuntimeStyleExpression(j, value, importedStylexIdentifiers),
      );
      return [...customProps, j.property("init", makeCssPropKey(j, prop), expression)];
    });
    addRuntimeStyleFn(fnKey, j.objectExpression(styleProperties) as ExpressionKind);

    for (const propName of propNames) {
      ensureShouldForwardPropDrop(decl, propName);
    }
    if (referencesTheme) {
      decl.needsUseThemeHook ??= [];
      if (!decl.needsUseThemeHook.some((entry) => entry.themeProp === "__runtime")) {
        decl.needsUseThemeHook.push({
          themeProp: "__runtime",
          trueStyleKey: null,
          falseStyleKey: null,
        });
      }
    }
    decl.needsWrapperComponent = true;
    return true;
  };

  return { tryApplyRuntimeStyleFunction };
}
