import type { ExprWithImports } from "../../adapter.js";
import type { StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import type { ExpressionKind } from "./decl-types.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  isUnsupportedStylexProperty,
} from "../css-prop-mapping.js";
import {
  extractRootAndPath,
  getFunctionBodyExpr,
  getNodeLocStart,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import { tryHandleAnimation } from "./animation.js";
import { tryHandleInterpolatedBorder } from "./borders.js";
import { extractStaticPartsForDecl, tryHandleInterpolatedStringValue } from "./interpolations.js";
import {
  buildTemplateWithStaticParts,
  collectPropsFromArrowFn,
  collectPropsFromArrowFnDestructured,
  getNumericImportedStylexIdentifiers,
  maybeOmitPxUnitFromStylexValue,
} from "./inline-styles.js";
import { addStyleKeyMixin, trackMixinPropertyValues } from "./precompute.js";
import { toStyleKey, styleKeyWithSuffix } from "../transform/helpers.js";
import { isMemberExpression } from "./utils.js";

import type { InterpolatedDeclarationContext } from "./interpolated-declaration-context.js";
import { tryHandleRuntimeConditionalStaticBranches } from "./directional-props.js";
import { tryHandleDynamicPseudoElementStyleFunction } from "./dynamic-helper-call.js";
import { isImportedShorthandUnitValue } from "./numeric-css-props.js";
import { tryHandleLocalCustomPropertyDefinition } from "./custom-property-fallback.js";
import { tryHandleLocalHelperCall } from "./local-helper-call.js";
import {
  addUndefinedToParamType,
  isPseudoElementSelector,
  memberExpressionTouchesTheme,
  tryHandleMultiSlotTernary,
} from "./interpolated-decl-helpers.js";
import { createObservedVariantHandlers } from "./observed-variant-handlers.js";
import { createImportedValueResolver } from "./imported-value-resolver.js";
import { tryHandleResolvedDynamicNode } from "./resolved-dynamic-node-handlers.js";

export function handleInterpolatedDeclaration(args: InterpolatedDeclarationContext): void {
  const {
    ctx,
    rule,
    allRules,
    d,
    media,
    pseudos,
    pseudoElement,
    attrTarget,
    resolvedSelectorMedia,
    applyResolvedPropValue,
  } = args;
  const {
    state,
    decl,
    styleObj,
    perPropPseudo,
    variantBuckets,
    variantStyleKeys,
    extraStyleObjects,
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    cssHelperPropValues,
    tryHandleMappedFunctionColor,
    tryHandleLogicalOrDefault,
    tryHandleConditionalPropCoalesceWithTheme,
    tryHandleEnumIfChainValue,
    tryHandleThemeIndexedLookup,
    handlerContext,
    componentInfo,
    tryHandlePropertyTernaryTemplateLiteral,
    tryHandleCssHelperFunctionSwitchBlock,
    tryHandleCssHelperConditionalBlock,
    annotateParamFromJsxProp,
    isJsxPropOptional,
    getBaseStyleTarget,
    notifyResolvedStylesArg,
  } = ctx;
  const hasStaticPropsBeforeResolvedStylesArg = (): boolean =>
    Object.keys(styleObj).length > 0 || getBaseStyleTarget() !== styleObj;
  const annotateScalarParams = (params: unknown[], propNames: readonly string[]): void => {
    if (!/\.(ts|tsx)$/.test(filePath)) {
      return;
    }
    propNames.forEach((propName, paramIndex) => {
      const param = params[paramIndex];
      if (!param) {
        return;
      }
      annotateParamFromJsxProp(param, propName);
      if (isJsxPropOptional(propName)) {
        addUndefinedToParamType(j, param);
      }
    });
  };
  const {
    api,
    j,
    filePath,
    warnings,
    resolverImports,
    keyframesNames,
    parseExpr,
    resolveValue,
    resolveCall,
    importMap,
    cssHelperNames,
    cssHelperObjectMembers,
    declByLocalName,
    cssHelperValuesByKey,
    staticPropertyValues,
    applyCssHelperMixin,
    hasLocalThemeBinding,
    resolveThemeValue,
    resolveThemeValueFromFn,
    getOrCreateLocalStylexVar,
  } = state;
  const avoidNames = new Set(importMap.keys());

  if (state.bail) {
    return;
  }
  if (d.value.kind !== "interpolated") {
    return;
  }
  if (d.property && isUnsupportedStylexProperty(d.property)) {
    state.bailUnsupported(
      decl,
      `Unsupported CSS property "${d.property}" cannot be emitted in StyleX`,
    );
    return;
  }

  const flags = { bail: false };
  const bailUnsupportedLocal = (declArg: StyledDecl, type: WarningType) => {
    flags.bail = true;
    state.bailUnsupported(declArg, type);
  };
  const addResolverImports = (imports: Iterable<unknown> | undefined | null) => {
    if (!imports) {
      return;
    }
    for (const imp of imports) {
      resolverImports.set(
        JSON.stringify(imp),
        imp as typeof resolverImports extends Map<string, infer V> ? V : never,
      );
    }
  };

  /** Parse and store extra className expressions (from CSS modules) on the decl. */
  const collectExtraClassNames = (entries: ExprWithImports[]) => {
    decl.extraClassNames ??= [];
    for (const cn of entries) {
      addResolverImports(cn.imports);
      const cnExpr = parseExpr(cn.expr);
      if (cnExpr) {
        decl.extraClassNames.push({ expr: cnExpr as any });
      }
    }
  };

  const {
    tryHandleMultiSlotRuntimeValue,
    tryEmitIdentityVariantBuckets,
    tryEmitTransformedObservedVariantBuckets,
    tryEmitObservedExpressionVariantBuckets,
    tryEmitObservedCssBlockVariantBuckets,
    shouldPreserveNumericCssTextForProp,
    maybeEmitPreservedRuntimeCallOverride,
  } = createObservedVariantHandlers({
    ctx,
    rule,
    allRules,
    d,
    media,
    pseudos,
    pseudoElement,
    attrTarget,
    resolvedSelectorMedia,
    avoidNames,
    addResolverImports,
    flags,
  });

  for (let _i = 0; _i < 1; _i++) {
    if (flags.bail) {
      break;
    }
    if (tryHandleMappedFunctionColor(d)) {
      continue;
    }
    if (
      tryHandleAnimation({
        j,
        decl,
        d,
        keyframesNames,
        keyframesAliases: state.keyframesAliases,
        styleObj,
        styleFnDecls,
        styleFnFromProps,
        filePath,
        avoidNames,
        applyResolvedPropValue,
        bailUnsupportedUnknownVar: () =>
          bailUnsupportedLocal(
            decl,
            "animation shorthand contains a var() with no classifiable fallback — its longhand position cannot be determined statically; bind the variable to a specific longhand (e.g. animation-duration: var(--x)) instead",
          ),
      })
    ) {
      continue;
    }
    if (flags.bail) {
      break;
    }
    if (isPseudoElementSelector(pseudoElement)) {
      if (tryHandleDynamicPseudoElementStyleFunction(args)) {
        continue;
      }
    }
    if (
      tryHandleInterpolatedBorder(
        {
          api,
          j,
          filePath,
          decl,
          extraStyleObjects,
          hasLocalThemeBinding,
          resolveValue,
          resolveCall,
          importMap,
          resolverImports,
          parseExpr,
          variantBuckets,
          variantStyleKeys,
          inlineStyleProps,
          hasStaticPropsBeforeResolvedStylesArg,
          notifyResolvedStylesArg,
        },
        {
          d,
          selector: rule.selector,
          atRuleStack: rule.atRuleStack ?? [],
          applyResolvedPropValue: (prop, value) => applyResolvedPropValue(prop, value, null),
          bailUnsupported: (type) => bailUnsupportedLocal(decl, type),
          bailUnsupportedWithContext: (type, context, loc) => {
            warnings.push({
              severity: "error",
              type,
              loc: loc ?? decl.loc,
              context,
            });
            flags.bail = true;
          },
        },
      )
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
      // Preserve static text surrounding the interpolation slot (e.g. "0 0 0 1px ${theme} , ...")
      const { prefix, suffix } = extractStaticPartsForDecl(d);
      const finalValue = buildTemplateWithStaticParts(
        j,
        resolved as ExpressionKind,
        prefix,
        suffix,
        {
          rawCss: decl.rawCss,
          property: (d.property ?? "").trim(),
          stylisValueRaw: d.valueRaw ?? "",
        },
      );
      // When pseudoElement is also set (e.g., ::-webkit-slider-thumb:hover),
      // delegate to applyResolvedPropValue which correctly scopes the pseudo-class
      // within the pseudo-element's nested selector bucket.
      if (pseudoElement) {
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          applyResolvedPropValue(
            out.prop,
            maybeOmitPxUnitFromStylexValue(j, finalValue, out.prop, d.important),
            null,
          );
        }
        return true;
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
                const resolvedHelper = state.resolvedStyleObjects.get(
                  toStyleKey(helperDecl.localName),
                );
                if (resolvedHelper && typeof resolvedHelper === "object") {
                  existing.default = (resolvedHelper as Record<string, unknown>)[out.prop] ?? null;
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
          existing[ps] = maybeOmitPxUnitFromStylexValue(j, finalValue, out.prop, d.important);
        }
      }
      return true;
    };
    if (tryHandleThemeValueInPseudo()) {
      continue;
    }
    const { resolveCallExpr, resolveImportedValueExpr } = createImportedValueResolver({
      ctx,
      rule,
      d,
      flags,
    });
    const addImport = (imp: any) => {
      addResolverImports([imp]);
    };
    if (d.property && d.value.kind === "interpolated") {
      const slotParts =
        (d.value as { parts?: Array<{ kind?: string; slotId?: number }> }).parts ?? [];
      for (const part of slotParts) {
        if (part?.kind !== "slot" || part.slotId === undefined) {
          continue;
        }
        const expr = decl.templateExpressions[part.slotId] as {
          type?: string;
          body?: unknown;
          object?: { type?: string; name?: string };
          property?: { type?: string; name?: string };
        };
        const baseExpr =
          expr?.type === "ArrowFunctionExpression" || expr?.type === "FunctionExpression"
            ? (expr.body as any)
            : (expr as any);
        if (
          baseExpr?.type !== "MemberExpression" &&
          baseExpr?.type !== "OptionalMemberExpression"
        ) {
          continue;
        }
        const obj = baseExpr.object;
        const prop = baseExpr.property as { type?: string; name?: string } | undefined;
        if (obj?.type !== "Identifier") {
          continue;
        }
        const ownerName = obj.name;
        const ownerMap = staticPropertyValues.get(ownerName);
        if (!ownerMap) {
          continue;
        }
        // Try to resolve the static property value
        const propName = prop?.type === "Identifier" ? prop.name : undefined;
        const resolvedValue = propName ? ownerMap.get(propName) : undefined;
        if (resolvedValue !== undefined) {
          // Replace the template expression with a literal value
          decl.templateExpressions[part.slotId] = staticValueToLiteral(j, resolvedValue) as any;
          // Add a comment documenting the inlined value for maintainability
          const memberExprStr = `${ownerName}.${propName}`;
          (d as any).leadingComment =
            `NOTE: Inlined ${memberExprStr} as StyleX requires it to be statically evaluable`;
          continue;
        }
        // Value not resolvable - bail
        warnings.push({
          severity: "error",
          type: "Unsupported interpolation: member expression",
          loc: getNodeLocStart(baseExpr) ?? decl.loc,
        });
        flags.bail = true;
        break;
      }
      if (flags.bail) {
        continue;
      }
    }
    const localVarSlotPart =
      d.value.parts.find((p: any) => p.kind === "slot" && d.property?.startsWith("--")) ??
      d.value.parts.find(
        (p: any) => p.kind === "slot" && d.valueRaw.includes(`__SC_EXPR_${p.slotId}__`),
      );
    const localVarSlotId =
      localVarSlotPart && localVarSlotPart.kind === "slot" ? localVarSlotPart.slotId : 0;
    const localVarExpr = decl.templateExpressions[localVarSlotId];
    if (
      tryHandleLocalCustomPropertyDefinition({
        j,
        d,
        decl,
        expr: localVarExpr,
        getOrCreateLocalStylexVar,
        inlineStyleProps,
      })
    ) {
      continue;
    }
    if (
      tryHandleRuntimeConditionalStaticBranches(ctx, {
        rule,
        allRules,
        d,
        media,
        pseudos,
        pseudoElement,
        attrTarget,
        resolvedSelectorMedia,
      })
    ) {
      continue;
    }
    const numericIdentifiers = getNumericImportedStylexIdentifiers(
      j,
      filePath,
      importMap,
      resolverImports,
    );
    if (isImportedShorthandUnitValue(d, decl, importMap, numericIdentifiers)) {
      bailUnsupportedLocal(decl, "Unsupported interpolation: call expression");
      continue;
    }
    if (
      tryHandleInterpolatedStringValue({
        j,
        decl,
        d,
        styleObj,
        resolveCallExpr,
        addImport,
        resolveImportedValueExpr,
        resolveThemeValue,
        numericIdentifiers,
        setStyleValue: (prop, value) => applyResolvedPropValue(prop, value, null),
      })
    ) {
      continue;
    }
    if (flags.bail) {
      break;
    }

    if (!d.property) {
      const slot = d.value.parts.find(
        (p: any): p is { kind: "slot"; slotId: number } => p.kind === "slot",
      );
      if (slot) {
        const expr = decl.templateExpressions[slot.slotId] as any;
        if (tryEmitObservedCssBlockVariantBuckets(expr)) {
          continue;
        }
        // A helper whose template interpolates component props (beyond theme access)
        // carries conditional variants/dynamic values that applyCssHelperMixin does
        // not wire into the consumer — only the helper's base style key would be
        // referenced, silently dropping the prop-dependent styles. Bail instead.
        const bailOnPropDependentCssHelper = (helperDecl: StyledDecl): boolean => {
          for (const helperExpr of (helperDecl.templateExpressions ?? []) as Array<{
            type?: string;
          }>) {
            if (
              !helperExpr ||
              (helperExpr.type !== "ArrowFunctionExpression" &&
                helperExpr.type !== "FunctionExpression")
            ) {
              continue;
            }
            const propsUsed = new Set([
              ...collectPropsFromArrowFn(helperExpr as never),
              ...collectPropsFromArrowFnDestructured(helperExpr as never),
            ]);
            propsUsed.delete("theme");
            if (propsUsed.size > 0) {
              warnings.push({
                severity: "warning",
                type: "css helper with prop-based interpolation cannot be reused as a mixin",
                loc: decl.loc,
                context: { localName: decl.localName, mixin: helperDecl.localName },
              });
              flags.bail = true;
              return true;
            }
          }
          return false;
        };
        // Handle css helper identifier: ${primaryStyles}
        if (expr?.type === "Identifier" && cssHelperNames.has(expr.name)) {
          const helperDecl = declByLocalName.get(expr.name);
          if (helperDecl) {
            if (bailOnPropDependentCssHelper(helperDecl)) {
              break;
            }
            applyCssHelperMixin(decl, helperDecl, cssHelperPropValues, inlineStyleProps);
            continue;
          }
        }
        // Handle css helper function calls: ${getPrimaryStyles()}
        if (
          expr?.type === "CallExpression" &&
          expr.callee?.type === "Identifier" &&
          (expr.arguments ?? []).length === 0
        ) {
          const calleeName = expr.callee.name as string;
          const helperDecl = declByLocalName.get(calleeName);
          if (helperDecl?.isCssHelper) {
            if (bailOnPropDependentCssHelper(helperDecl)) {
              break;
            }
            applyCssHelperMixin(decl, helperDecl, cssHelperPropValues, inlineStyleProps);
            continue;
          }
          // Imported function calls fall through to be handled via resolveCall
        }
        if (expr?.type === "Identifier") {
          // Case 1: Local styled component mixin
          const mixinDecl = declByLocalName.get(expr.name);
          if (mixinDecl && !mixinDecl.isCssHelper && mixinDecl.localName !== decl.localName) {
            flags.bail = true;
            warnings.push({
              severity: "warning",
              type: "Using styled-components components as mixins is not supported; use css`` mixins or strings instead",
              loc: getNodeLocStart(expr) ?? decl.loc,
              context: {
                localName: decl.localName,
                mixin: mixinDecl.localName,
              },
            });
            continue;
          }

          // Case 2: Imported styled component mixin (resolved via adapter)
          const importEntry = importMap?.get(expr.name);
          if (importEntry && !cssHelperNames.has(expr.name)) {
            const resolved = resolveValue({
              kind: "importedValue",
              importedName: importEntry.importedName,
              source: importEntry.source,
              filePath,
              loc: getNodeLocStart(expr) ?? undefined,
            });
            if (resolved?.usage === "props") {
              if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
                if (resolved.cssText) {
                  const parsedStyle = parseCssDeclarationBlock(resolved.cssText);
                  if (parsedStyle) {
                    for (const [prop, value] of Object.entries(parsedStyle)) {
                      applyResolvedPropValue(prop, value, null);
                    }
                    continue;
                  }
                  warnings.push({
                    severity: "error",
                    type: 'Adapter resolveValue cssText could not be parsed as CSS declarations — expected semicolon-separated property: value pairs (e.g. "white-space: nowrap; overflow: hidden;")',
                    loc: getNodeLocStart(expr) ?? decl.loc,
                    context: {
                      selector: rule.selector,
                      cssText: resolved.cssText,
                      importedName: importEntry.importedName,
                      source: importEntry.source.value,
                    },
                  });
                  flags.bail = true;
                  break;
                }
                warnings.push({
                  severity: "warning",
                  type: "Adapter resolved imported StyleX value under nested selectors/at-rules but did not provide cssText for property expansion — add cssText to resolveValue result to enable pseudo-wrapping",
                  loc: getNodeLocStart(expr) ?? decl.loc,
                  context: {
                    selector: rule.selector,
                    importedName: importEntry.importedName,
                    source: importEntry.source.value,
                  },
                });
                flags.bail = true;
                break;
              }
              // Add as an extra stylex.props argument
              const extras = decl.extraStylexPropsArgs ?? [];
              const order = decl.mixinOrder ?? [];
              const parsedExpr = parseExpr(resolved.expr);
              if (parsedExpr) {
                extras.push({ expr: parsedExpr, afterBase: true });
                order.push("propsArg");
                decl.extraStylexPropsArgs = extras;
                decl.mixinOrder = order;
                // Merge imports
                addResolverImports(resolved.imports);
                continue;
              }
            }
            // If adapter returns undefined or usage !== "props", fall through
          }
        }
        // Handle member expression CSS helpers (e.g., buttonStyles.rootCss)
        const rootInfo = extractRootAndPath(expr);
        const firstRootInfoPath = rootInfo?.path[0];
        if (rootInfo && rootInfo.path.length === 1 && firstRootInfoPath) {
          const objectMemberMap = cssHelperObjectMembers.get(rootInfo.rootName);
          if (objectMemberMap) {
            const memberDecl = objectMemberMap.get(firstRootInfoPath);
            if (memberDecl) {
              addStyleKeyMixin(decl, memberDecl.styleKey);
              trackMixinPropertyValues(
                cssHelperValuesByKey.get(memberDecl.styleKey),
                cssHelperPropValues,
              );
              continue;
            }
          }
        }
      }
    }
    if (tryHandlePropertyTernaryTemplateLiteral(d)) {
      continue;
    }
    // Apply to base declarations and pseudo/attr selectors (not media).
    if (!media && !attrTarget) {
      if (tryHandleCssHelperConditionalBlock(d, pseudos ?? null, pseudoElement)) {
        continue;
      }
    }
    if (tryHandleCssHelperFunctionSwitchBlock(d)) {
      continue;
    }
    if (tryHandleLogicalOrDefault(d)) {
      continue;
    }
    if (!media && !attrTarget && !pseudos?.length) {
      if (tryHandleConditionalPropCoalesceWithTheme(d)) {
        continue;
      }
    }

    // Support enum-like block-body `if` chains that return static values.
    // Example:
    //   transform: ${(props) => { if (props.$state === "up") return "scaleY(3)"; return "scaleY(1)"; }};
    if (tryHandleEnumIfChainValue(d, { media, attrTarget, pseudos })) {
      continue;
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
          const variantPseudoEntries = Object.fromEntries(pseudos.map((p) => [p, cons.value]));
          variantBuckets.set(when, {
            ...variantBuckets.get(when),
            [stylexProp]: { default: cons.value, ...variantPseudoEntries },
          });
          variantStyleKeys[when] ??= styleKeyWithSuffix(decl.styleKey, when);
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
    if (tryHandleThemeIndexedLookup(d, { media, attrTarget, pseudos, pseudoElement })) {
      continue;
    }

    // Handle multiple interpolation slots that all branch on the same prop ternary.
    // Pattern: transform: translateY(-50%) translateX(${p => p.$expanded ? "0" : "-8px"}) scale(${p => p.$expanded ? 1 : 0.9})
    // When all slots are ternaries on the same condition with literal branches, produce
    // two static variant styles by evaluating each branch direction.
    if (d.property && d.value.kind === "interpolated" && tryHandleMultiSlotTernary(ctx, d)) {
      continue;
    }
    if (tryHandleMultiSlotRuntimeValue(resolveImportedValueExpr)) {
      continue;
    }

    // The fallback below resolves a single interpolation slot. If multiple
    // function-valued slots remain in one declaration (e.g.
    // `padding: ${p => p.$v}px ${p => p.$h}px`) and no specialized handler
    // consumed them, emitting only the first slot would silently drop the
    // others — bail instead. Slots holding static expressions (identifiers,
    // constants) are fine: the template builders below substitute them in place.
    const remainingSlotParts = d.value.parts.filter((p: any) => p.kind === "slot");
    const functionSlotCount = remainingSlotParts.filter((p: any) => {
      const slotExpr = decl.templateExpressions[p.slotId] as { type?: string } | undefined;
      return (
        slotExpr?.type === "ArrowFunctionExpression" || slotExpr?.type === "FunctionExpression"
      );
    }).length;
    if (functionSlotCount > 1) {
      warnings.push({
        severity: "error",
        type: "Unsupported interpolation: multiple dynamic slots in one declaration",
        loc: decl.loc,
        context: { localName: decl.localName, property: d.property },
      });
      flags.bail = true;
      break;
    }

    const slotPart = remainingSlotParts[0];
    const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
    const expr = decl.templateExpressions[slotId];
    const loc = getNodeLocStart(expr as any);

    // Handle local helper function calls that return CSS strings.
    // Pattern: ${(props) => localFn(props.size)} where localFn returns multi-property CSS.
    if (tryHandleLocalHelperCall({ ctx, d, expr })) {
      continue;
    }

    const res = resolveDynamicNode(
      {
        slotId,
        expr,
        css: {
          kind: "declaration",
          selector: rule.selector,
          atRuleStack: rule.atRuleStack,
          ...(d.property ? { property: d.property } : {}),
          valueRaw: d.valueRaw,
        },
        component: componentInfo,
        usage: { jsxUsages: 0, hasPropsSpread: false },
        ...(loc ? { loc } : {}),
      },
      handlerContext,
    );
    if (
      tryHandleResolvedDynamicNode({
        ctx,
        rule,
        allRules,
        d,
        media,
        pseudos,
        pseudoElement,
        attrTarget,
        resolvedSelectorMedia,
        applyResolvedPropValue,
        res,
        slotId,
        expr,
        loc,
        avoidNames,
        flags,
        addResolverImports,
        collectExtraClassNames,
        bailUnsupportedLocal,
        annotateScalarParams,
        tryEmitIdentityVariantBuckets,
        tryEmitTransformedObservedVariantBuckets,
        tryEmitObservedExpressionVariantBuckets,
        shouldPreserveNumericCssTextForProp,
        maybeEmitPreservedRuntimeCallOverride,
      })
    ) {
      continue;
    }

    const describeInterpolation = (): {
      type: WarningType;
      context?: Record<string, unknown>;
    } | null => {
      type SlotPart = { kind: "slot"; slotId: number };
      const valueParts = (d.value as { parts?: unknown[] }).parts ?? [];
      const slotPart = valueParts.find(
        (p): p is SlotPart => !!p && typeof p === "object" && (p as SlotPart).kind === "slot",
      );
      if (!slotPart) {
        return d.property
          ? { type: "Unsupported interpolation: property", context: { property: d.property } }
          : null;
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
        return d.property
          ? { type: "Unsupported interpolation: property", context: { property: d.property } }
          : null;
      }
      if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
        // Provide more specific warning based on arrow function body type.
        // Use getFunctionBodyExpr to handle block bodies with single return statements.
        const body = getFunctionBodyExpr(expr as { body?: unknown }) as {
          type?: string;
          operator?: string;
        } | null;
        const bodyType = body?.type;
        if (bodyType === "ConditionalExpression") {
          return {
            type: "Arrow function: conditional branches could not be resolved to static or theme values",
          };
        }
        if (bodyType === "LogicalExpression") {
          const op = body?.operator;
          if (op === "&&") {
            return {
              type: "Arrow function: logical expression pattern not supported",
              context: {
                operator: op,
                hint: "Expected: props.x && 'css-string'",
              },
            };
          }
          if (op === "||" || op === "??") {
            const left = (body as { left?: { type?: string } } | null)?.left;
            // Only theme-rooted left operands are indexed theme lookups
            // (e.g. props.theme.color[props.x] || fallback). A prop-rooted
            // member access splices an opaque `css` result into the template
            // (e.g. props => props.$styles ?? ""), which is the same bail as
            // an un-wrapped member-expression interpolation.
            if (isMemberExpression(left) && !memberExpressionTouchesTheme(left)) {
              return {
                type: "Unsupported interpolation: member expression",
                context: { memberExpression: left?.type, operator: op },
              };
            }
            return {
              type: "Arrow function: indexed theme lookup pattern not matched",
              context: { property: d.property, operator: op },
            };
          }
        }
        if (bodyType === "CallExpression") {
          return {
            type: "Arrow function: helper call body is not supported",
            context: { property: d.property },
          };
        }
        if (bodyType === "MemberExpression") {
          return {
            type: "Arrow function: theme access path could not be resolved",
            context: { property: d.property },
          };
        }
        return {
          type: "Arrow function: body is not a recognized pattern (expected ternary, logical, call, or member expression)",
          context: { property: d.property, bodyType },
        };
      }
      if (expr.type === "CallExpression") {
        const callee = expr.callee;
        const calleeName =
          callee?.type === "Identifier"
            ? callee.name
            : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
              ? callee.property.name
              : null;
        return {
          type: "Unsupported interpolation: call expression",
          context: { callExpression: calleeName, property: d.property },
        };
      }
      if (expr.type === "Identifier") {
        return {
          type: "Unsupported interpolation: identifier",
          context: { identifier: expr.name },
        };
      }
      if (isMemberExpression(expr)) {
        return {
          type: "Unsupported interpolation: member expression",
          context: { memberExpression: expr.type },
        };
      }
      return d.property
        ? {
            type: "Unsupported interpolation: call expression",
            context: { expression: d.property },
          }
        : null;
    };

    const warning = describeInterpolation();
    warnings.push({
      severity: "warning",
      type: warning?.type || "Unsupported interpolation: unknown",
      loc: loc ?? decl.loc,
      context: warning?.context,
    });
    flags.bail = true;
    break;
  }

  if (state.bail) {
    flags.bail = true;
  }
  if (flags.bail) {
    state.markBail();
  }
}
