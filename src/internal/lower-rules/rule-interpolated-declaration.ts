/**
 * Handles interpolated CSS declarations during rule processing.
 * Core concepts: resolve dynamic values, map StyleX props, and emit wrappers.
 */
import type { JSCodeshift } from "jscodeshift";
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type { CallResolveResult, ResolveValueContext } from "../../adapter.js";
import type { CallValueTransform } from "../builtin-handlers/types.js";
import type { StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import type { ExpressionKind } from "./decl-types.js";
import type { DeclProcessingState } from "./decl-setup.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  cssPropertyToStylexProp,
  parseBorderShorthandParts,
  resolveBackgroundStylexProp,
} from "../css-prop-mapping.js";
import { buildThemeStyleKeys } from "../utilities/style-key-naming.js";
import {
  cloneAstNode,
  collectIdentifiers,
  extractRootAndPath,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import { tryHandleAnimation } from "./animation.js";
import { tryHandleInterpolatedBorder } from "./borders.js";
import {
  extractStaticPartsForDecl,
  tryHandleInterpolatedStringValue,
  wrapExprWithStaticParts,
} from "./interpolations.js";
import { ensureShouldForwardPropDrop, literalToStaticValue } from "./types.js";
import {
  buildTemplateWithStaticParts,
  collectPropsFromArrowFn,
  hasThemeAccessInArrowFn,
  hasUnsupportedConditionalTest,
  inlineArrowFunctionBody,
  rewritePropsThemeToThemeVar,
  unwrapArrowFunctionToPropsExpr,
} from "./inline-styles.js";
import { addStyleKeyMixin, trackMixinPropertyValues } from "./precompute.js";
import { buildSafeIndexedParamName } from "./import-resolution.js";
import {
  handleDualBranchCompoundVariantsResolvedValue,
  handleSplitMultiPropVariantsResolvedValue,
  handleSplitVariantsResolvedValue,
} from "./interpolated-variant-resolvers.js";
import { handleInlineStyleValueFromProps } from "./inline-style-props.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import { extractUnionLiteralValues } from "./variants.js";
import { toStyleKey, styleKeyWithSuffix } from "../transform/helpers.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
type CommentSource = { leading?: string; trailingLine?: string } | null;

type InterpolatedDeclarationContext = {
  ctx: DeclProcessingState;
  rule: CssRuleIR;
  d: CssDeclarationIR;
  media: string | undefined;
  pseudos: string[] | null;
  pseudoElement: string | null;
  attrTarget: Record<string, unknown> | null;
  resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  applyResolvedPropValue: (prop: string, value: unknown, commentSource: CommentSource) => void;
};
export function handleInterpolatedDeclaration(args: InterpolatedDeclarationContext): void {
  const { ctx, rule, d, media, pseudos, pseudoElement, attrTarget, applyResolvedPropValue } = args;
  const {
    state,
    decl,
    styleObj,
    perPropPseudo,
    variantBuckets,
    variantStyleKeys,
    variantSourceOrder,
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
    findJsxPropTsType,
    findJsxPropTsTypeForVariantExtraction,
    annotateParamFromJsxProp,
    applyVariant,
    notifyResolvedStylesArg,
  } = ctx;
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
    warnPropInlineStyle,
    applyCssHelperMixin,
    hasLocalThemeBinding,
    resolveThemeValue,
    resolveThemeValueFromFn,
    resolveImportInScope,
    resolveImportForExpr,
  } = state;
  const avoidNames = new Set(importMap.keys());

  if (state.bail) {
    return;
  }
  if (d.value.kind !== "interpolated") {
    return;
  }

  let bail = false;
  const getRootIdentifierInfo = extractRootAndPath;
  const bailUnsupportedLocal = (declArg: StyledDecl, type: WarningType) => {
    bail = true;
    state.bailUnsupported(declArg, type);
  };

  /**
   * Try to convert an identity prop with a finite string union type into static variant
   * buckets. Returns true if the optimization applied and the caller should `continue`.
   * @param skipValue — For props with a default, the default value is handled as base style
   *   and should be skipped in the variant buckets.
   */
  const tryEmitIdentityVariantBuckets = (
    jsxProp: string,
    stylexProp: string,
    skipValue?: string,
  ): boolean => {
    const propType = findJsxPropTsTypeForVariantExtraction(jsxProp);
    const unionValues = extractUnionLiteralValues(propType);
    if (!unionValues || unionValues.length < 2 || unionValues.length > 20) {
      return false;
    }
    for (const value of unionValues) {
      if (value === skipValue) {
        continue;
      }
      applyVariant(
        { when: `${jsxProp} === "${value}"`, propName: jsxProp },
        { [stylexProp]: value },
      );
    }
    if (jsxProp.startsWith("$")) {
      ensureShouldForwardPropDrop(decl, jsxProp);
    }
    return true;
  };

  const maybeEmitPreservedRuntimeCallOverride = (args: {
    resolveCallResult: CallResolveResult | undefined;
    originalExpr: unknown;
    loc: { line: number; column: number } | null | undefined;
  }): "not-requested" | "emitted" | "failed" => {
    const { resolveCallResult, originalExpr, loc } = args;
    if (!resolveCallResult?.preserveRuntimeCall) {
      return "not-requested";
    }
    if (!d.property) {
      warnings.push({
        severity: "error",
        type: "Unsupported interpolation: call expression",
        loc,
      });
      bail = true;
      return "failed";
    }
    if (
      !originalExpr ||
      typeof originalExpr !== "object" ||
      ((originalExpr as { type?: string }).type !== "ArrowFunctionExpression" &&
        (originalExpr as { type?: string }).type !== "FunctionExpression")
    ) {
      warnings.push({
        severity: "error",
        type: "Arrow function: helper call body is not supported",
        loc,
      });
      bail = true;
      return "failed";
    }

    const fnExpr = originalExpr as Parameters<typeof inlineArrowFunctionBody>[1];
    const inlinedExpr = inlineArrowFunctionBody(j, fnExpr);
    if (!inlinedExpr) {
      warnings.push({
        severity: "error",
        type: "Unsupported prop-based inline style expression cannot be safely inlined",
        loc,
      });
      bail = true;
      return "failed";
    }

    const hasThemeAccess = hasThemeAccessInArrowFn(fnExpr);
    const baseRuntimeExpr = hasThemeAccess
      ? rewritePropsThemeToThemeVar(inlinedExpr as ExpressionKind)
      : (inlinedExpr as ExpressionKind);

    // P1 fix: Wrap with static prefix/suffix and !important (same as static branch)
    const { prefix, suffix } = extractStaticPartsForDecl(d);
    const effectiveSuffix = d.important ? `${suffix} !important` : suffix;
    const runtimeCallArg =
      prefix || effectiveSuffix
        ? buildTemplateWithStaticParts(j, baseRuntimeExpr, prefix, effectiveSuffix)
        : baseRuntimeExpr;

    if (hasThemeAccess) {
      if (!decl.needsUseThemeHook) {
        decl.needsUseThemeHook = [];
      }
      if (!decl.needsUseThemeHook.some((entry) => entry.themeProp === "__runtimeCall")) {
        decl.needsUseThemeHook.push({
          themeProp: "__runtimeCall",
          trueStyleKey: null,
          falseStyleKey: null,
        });
      }
    }

    const outs = cssDeclarationToStylexDeclarations(d);
    if (outs.length !== 1 || !outs[0]?.prop) {
      warnings.push({
        severity: "error",
        type: "Arrow function: helper call body is not supported",
        loc,
      });
      bail = true;
      return "failed";
    }

    const out = outs[0]!;
    const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
    if (!styleFnDecls.has(fnKey)) {
      const outParamName = cssPropertyToIdentifier(out.prop, avoidNames);
      const param = j.identifier(outParamName);
      if (/\.(ts|tsx)$/.test(filePath)) {
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsStringKeyword(),
        );
      }
      const body = j.objectExpression([makeCssProperty(j, out.prop, outParamName)]);
      styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
    }

    // P2 fix: Later declarations should override earlier ones (CSS source order).
    // Find and replace existing entry instead of skipping, or add new if not found.
    const existingIdx = styleFnFromProps.findIndex(
      (entry) =>
        entry.fnKey === fnKey && entry.jsxProp === "__props" && entry.condition === "always",
    );
    const newEntry = {
      fnKey,
      jsxProp: "__props" as const,
      condition: "always" as const,
      callArg: cloneAstNode(runtimeCallArg) as ExpressionKind,
    };
    if (existingIdx >= 0) {
      styleFnFromProps[existingIdx] = newEntry;
    } else {
      styleFnFromProps.push(newEntry);
    }

    decl.needsWrapperComponent = true;
    return "emitted";
  };

  for (let _i = 0; _i < 1; _i++) {
    if (bail) {
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
        styleObj,
        styleFnDecls,
        styleFnFromProps,
        filePath,
        avoidNames,
        applyResolvedPropValue,
      })
    ) {
      continue;
    }
    // Dynamic styles inside ::before/::after pseudo-elements are not natively supported
    // by StyleX (see https://github.com/facebook/stylex/issues/1396).
    // Workaround: use CSS custom properties set as inline styles on the parent element,
    // referenced via var() in the pseudo-element's static StyleX styles.
    if (isPseudoElementSelector(pseudoElement)) {
      if (tryHandleDynamicPseudoElementViaCustomProperty(args)) {
        continue;
      }
      warnings.push({
        severity: "error",
        type: "Dynamic styles inside pseudo elements (::before/::after) are not supported by StyleX. See https://github.com/facebook/stylex/issues/1396",
        loc: decl.loc,
        context: { pseudoElement },
      });
      bail = true;
      break;
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
            bail = true;
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
      );
      // When pseudoElement is also set (e.g., ::-webkit-slider-thumb:hover),
      // delegate to applyResolvedPropValue which correctly scopes the pseudo-class
      // within the pseudo-element's nested selector bucket.
      if (pseudoElement) {
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          applyResolvedPropValue(out.prop, finalValue, null);
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
          existing[ps] = finalValue;
        }
      }
      return true;
    };
    if (tryHandleThemeValueInPseudo()) {
      continue;
    }
    const resolveImportedValueExpr = (
      expr: any,
    ): { resolved: any; imports?: any[] } | { bail: true } | null => {
      if (expr?.type === "BinaryExpression") {
        const leftResult = resolveImportedValueExpr(expr.left);
        const rightResult = resolveImportedValueExpr(expr.right);
        if (!leftResult && !rightResult) {
          return null;
        }
        if (leftResult && "bail" in leftResult) {
          return leftResult;
        }
        if (rightResult && "bail" in rightResult) {
          return rightResult;
        }
        const resolvedLeft = leftResult ? leftResult.resolved : expr.left;
        const resolvedRight = rightResult ? rightResult.resolved : expr.right;
        const imports = [...(leftResult?.imports ?? []), ...(rightResult?.imports ?? [])];
        return {
          resolved: j.binaryExpression(expr.operator, resolvedLeft, resolvedRight),
          imports,
        };
      }
      const info = getRootIdentifierInfo(expr);
      if (!info) {
        return null;
      }
      const imp = resolveImportInScope(info.rootName, info.rootNode);
      if (!imp) {
        return null;
      }
      const resolveValueContext: ResolveValueContext = {
        kind: "importedValue",
        importedName: imp.importedName,
        source: imp.source,
        ...(info.path.length ? { path: info.path.join(".") } : {}),
        filePath,
        loc: getNodeLocStart(expr) ?? undefined,
      };
      const resolveValueResult = resolveValue(resolveValueContext);
      if (!resolveValueResult) {
        // Adapter returned undefined for an identified imported value - bail
        warnings.push({
          severity: "error",
          type: "Adapter resolveValue returned undefined for imported value",
          loc: getNodeLocStart(expr) ?? decl.loc,
          context: {
            localName: decl.localName,
            importedName: imp.importedName,
            source: imp.source.value,
            path: info.path.length ? info.path.join(".") : undefined,
          },
        });
        bail = true;
        return { bail: true };
      }
      const exprAst = parseExpr(resolveValueResult.expr);
      if (!exprAst) {
        warnings.push({
          severity: "error",
          type: "Adapter resolveValue returned an unparseable value expression",
          loc: getNodeLocStart(expr),
          context: {
            localName: decl.localName,
            resolveValueResult,
            resolveValueContext,
          },
        });
        return null;
      }
      return { resolved: exprAst, imports: resolveValueResult.imports };
    };
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
          component: componentInfo,
          usage: { jsxUsages: 0, hasPropsSpread: false },
        },
        {
          ...handlerContext,
          resolveImport: (localName: string) => resolveImportForExpr(expr, localName),
        },
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
        bail = true;
        break;
      }
      if (bail) {
        continue;
      }
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
      })
    ) {
      continue;
    }
    if (bail) {
      break;
    }

    if (!d.property) {
      const slot = d.value.parts.find(
        (p: any): p is { kind: "slot"; slotId: number } => p.kind === "slot",
      );
      if (slot) {
        const expr = decl.templateExpressions[slot.slotId] as any;
        // Handle css helper identifier: ${primaryStyles}
        if (expr?.type === "Identifier" && cssHelperNames.has(expr.name)) {
          const helperDecl = declByLocalName.get(expr.name);
          if (helperDecl) {
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
            applyCssHelperMixin(decl, helperDecl, cssHelperPropValues, inlineStyleProps);
            continue;
          }
          // Imported function calls fall through to be handled via resolveCall
        }
        if (expr?.type === "Identifier") {
          // Case 1: Local styled component mixin
          const mixinDecl = declByLocalName.get(expr.name);
          if (mixinDecl && !mixinDecl.isCssHelper && mixinDecl.localName !== decl.localName) {
            bail = true;
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
                for (const imp of resolved.imports) {
                  resolverImports.set(JSON.stringify(imp), imp);
                }
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
      if (tryHandleCssHelperConditionalBlock(d, pseudos ?? null)) {
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

    const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
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

    if (res && res.type === "resolvedStyles") {
      // Adapter-resolved StyleX style objects are emitted as additional stylex.props args.
      // This is only safe for base selector declarations.
      if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
        const resolveCallMeta =
          res.resolveCallContext && res.resolveCallResult
            ? {
                resolveCallContext: res.resolveCallContext,
                resolveCallResult: res.resolveCallResult,
              }
            : undefined;
        warnings.push({
          severity: "warning",
          type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
          loc,
          context: resolveCallMeta
            ? { selector: rule.selector, ...resolveCallMeta }
            : { selector: rule.selector },
        });
        bail = true;
        break;
      }
      for (const imp of res.imports ?? []) {
        resolverImports.set(JSON.stringify(imp), imp);
      }
      const exprAst = parseExpr(res.expr);
      if (!exprAst) {
        const resolveCallMeta =
          res.resolveCallContext && res.resolveCallResult
            ? {
                resolveCallContext: res.resolveCallContext,
                resolveCallResult: res.resolveCallResult,
              }
            : undefined;
        warnings.push({
          severity: "error",
          type: "Adapter resolveCall returned an unparseable styles expression",
          loc: decl.loc,
          context: resolveCallMeta
            ? { localName: decl.localName, res, ...resolveCallMeta }
            : { localName: decl.localName, res },
        });
        bail = true;
        break;
      }
      // Track mixinOrder for correct cascade interleaving
      const hasStaticPropsBefore =
        Object.keys(styleObj).length > 0 || ctx.getBaseStyleTarget() !== styleObj;
      const order = decl.mixinOrder ?? [];
      order.push("propsArg");
      decl.mixinOrder = order;
      decl.extraStylexPropsArgs ??= [];
      decl.extraStylexPropsArgs.push({
        expr: exprAst as any,
        afterBase: hasStaticPropsBefore,
      });
      // Create an after-base segment so subsequent static properties
      // are placed after this helper in the stylex.props() call
      notifyResolvedStylesArg();
      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "resolvedDirectional") {
      // Adapter returned directional longhand entries for a shorthand property.
      // Route each longhand through applyResolvedPropValue to preserve
      // media/pseudo/attribute scoping.
      let directionalFailed = false;
      for (const entry of res.directional) {
        for (const imp of entry.imports) {
          resolverImports.set(JSON.stringify(imp), imp);
        }
        const exprAst = parseExpr(entry.expr);
        if (!exprAst) {
          warnings.push({
            severity: "error",
            type: "Adapter resolveCall returned an unparseable value expression",
            loc: decl.loc,
            context: { localName: decl.localName, entry },
          });
          directionalFailed = true;
          break;
        }
        applyResolvedPropValue(entry.prop, exprAst, null);
      }
      if (directionalFailed) {
        bail = true;
        break;
      }
      continue;
    }

    if (res && res.type === "resolvedValue") {
      for (const imp of res.imports ?? []) {
        resolverImports.set(JSON.stringify(imp), imp);
      }

      // Extract and wrap static prefix/suffix (skip for border-color since expansion handled it)
      const { prefix, suffix } = extractStaticPartsForDecl(d);
      // Preserve !important by appending it to the suffix
      const effectiveSuffix = d.important ? `${suffix} !important` : suffix;
      const wrappedExpr = wrapExprWithStaticParts(res.expr, prefix, effectiveSuffix);

      const exprAst = parseExpr(wrappedExpr);
      if (!exprAst) {
        const resolveCallMeta =
          res.resolveCallContext && res.resolveCallResult
            ? {
                resolveCallContext: res.resolveCallContext,
                resolveCallResult: res.resolveCallResult,
              }
            : undefined;
        warnings.push({
          severity: "error",
          type: "Adapter resolveCall returned an unparseable value expression",
          loc: decl.loc,
          context: resolveCallMeta
            ? { localName: decl.localName, res, ...resolveCallMeta }
            : { localName: decl.localName, res },
        });
        bail = true;
        break;
      }
      const outs = cssDeclarationToStylexDeclarations(d);
      for (let i = 0; i < outs.length; i++) {
        const out = outs[i]!;
        const commentSource =
          i === 0
            ? {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              }
            : null;
        applyResolvedPropValue(out.prop, exprAst as any, commentSource);
      }

      const runtimeOverride = maybeEmitPreservedRuntimeCallOverride({
        resolveCallResult: res.resolveCallResult,
        originalExpr: expr,
        loc,
      });
      if (runtimeOverride === "failed") {
        break;
      }
      continue;
    }

    if (res && res.type === "runtimeCallOnly") {
      const runtimeOverride = maybeEmitPreservedRuntimeCallOverride({
        resolveCallResult: res.resolveCallResult,
        originalExpr: expr,
        loc,
      });
      if (runtimeOverride === "failed") {
        break;
      }
      continue;
    }

    // Handle theme boolean conditional patterns (e.g., theme.isDark, theme.isHighContrast)
    if (res && res.type === "splitThemeBooleanVariants") {
      // Add imports if present
      for (const imp of res.trueImports ?? []) {
        resolverImports.set(JSON.stringify(imp), imp);
      }
      for (const imp of res.falseImports ?? []) {
        resolverImports.set(JSON.stringify(imp), imp);
      }

      const { trueKey: trueStyleKey, falseKey: falseStyleKey } = buildThemeStyleKeys(
        decl.styleKey,
        res.themeProp,
      );

      // Initialize the array if needed
      if (!decl.needsUseThemeHook) {
        decl.needsUseThemeHook = [];
      }

      // Check if we already have an entry for this theme prop
      let entry = decl.needsUseThemeHook.find((e) => e.themeProp === res.themeProp);
      if (!entry) {
        entry = {
          themeProp: res.themeProp,
          trueStyleKey,
          falseStyleKey,
        };
        decl.needsUseThemeHook.push(entry);

        // Initialize the style objects
        extraStyleObjects.set(trueStyleKey, {});
        extraStyleObjects.set(falseStyleKey, {});
      }

      // Add the property to the true/false style objects
      const trueStyle = extraStyleObjects.get(trueStyleKey) ?? {};
      const falseStyle = extraStyleObjects.get(falseStyleKey) ?? {};

      // Expand CSS shorthands (border → width/style/color, background → backgroundColor)
      if (!applyThemeBooleanValue(j, res.cssProp, res.trueValue, trueStyle)) {
        bail = true;
        continue;
      }
      if (!applyThemeBooleanValue(j, res.cssProp, res.falseValue, falseStyle)) {
        bail = true;
        continue;
      }

      extraStyleObjects.set(trueStyleKey, trueStyle);
      extraStyleObjects.set(falseStyleKey, falseStyle);

      decl.needsWrapperComponent = true;
      continue;
    }

    // Handle theme boolean conditional with one unresolvable call expression branch.
    // The resolved branch becomes the base StyleX style; the unresolvable branch
    // is emitted as a conditional inline style using the useTheme() hook.
    if (res && res.type === "splitThemeBooleanWithInlineStyleFallback") {
      // Add imports for the resolved value
      for (const imp of res.resolvedImports ?? []) {
        resolverImports.set(JSON.stringify(imp), imp);
      }

      // Ensure useTheme() is imported and called by adding a needsUseThemeHook entry
      // with both keys null (no style buckets needed — only the import/declaration)
      if (!decl.needsUseThemeHook) {
        decl.needsUseThemeHook = [];
      }
      if (!decl.needsUseThemeHook.some((e) => e.themeProp === res.themeProp)) {
        decl.needsUseThemeHook.push({
          themeProp: res.themeProp,
          trueStyleKey: null,
          falseStyleKey: null,
        });
      }

      // Build the conditional inline style expression:
      //   theme.<prop> ? <inlineExpr> : undefined   (when resolved branch is false)
      //   theme.<prop> ? undefined : <inlineExpr>   (when resolved branch is true)
      // Simplified: use the theme condition to pick the inline expr or undefined
      const themeCondition = j.memberExpression(j.identifier("theme"), j.identifier(res.themeProp));
      const undefinedExpr = j.identifier("undefined") as ExpressionKind;
      const inlineExpr = res.inlineExpr as ExpressionKind;

      // Determine when the inline style should apply:
      // The inline style replaces the unresolvable branch.
      // resolvedBranchIsTrue means: true branch is resolved → inline style is for the false branch.
      // isNegated flips the mapping between consequent/alternate and true/false.
      const inlineAppliesWhenThemeIsTrue = !res.resolvedBranchIsTrue !== res.isNegated;
      const conditionalExpr = inlineAppliesWhenThemeIsTrue
        ? j.conditionalExpression(themeCondition, inlineExpr, undefinedExpr)
        : j.conditionalExpression(themeCondition, undefinedExpr, inlineExpr);

      // Expand shorthand CSS properties (e.g., padding → paddingBlock/paddingInline)
      // using the CSS declaration IR, consistent with other handlers.
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        if (!out.prop) {
          continue;
        }
        styleObj[out.prop] = res.resolvedValue;
        inlineStyleProps.push({ prop: out.prop, expr: conditionalExpr });
      }

      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "splitVariants") {
      // Extract any imports from variants (used by template literal theme resolution)
      for (const v of res.variants) {
        if (v.imports) {
          for (const imp of v.imports) {
            resolverImports.set(JSON.stringify(imp), imp);
          }
        }
      }

      const negVariants = res.variants.filter((v) => v.when.startsWith("!"));
      const posVariants = res.variants.filter((v) => !v.when.startsWith("!"));

      if (negVariants.length === 1 && posVariants.length > 0) {
        // Classic pattern with one default (neg) and conditional variants (pos)
        // Pattern: prop === "a" ? A : prop === "b" ? B : C
        // → C is default, A and B are conditional
        const neg = negVariants[0]!;

        // Check whether the neg variant's CSS properties overlap with the pos variants'.
        // When they differ (e.g., truthy sets padding/position, falsy sets margin/border),
        // both branches are meaningful variant buckets — folding neg into base would lose it.
        const negPropKeys = Object.keys(neg.style);
        const allPosPropKeys = new Set(posVariants.flatMap((v) => Object.keys(v.style)));
        // Fold neg into base when: neg is empty (no-op), or neg has the same property
        // set as the pos variants (classic default/conditional pattern).
        const shouldFoldNegIntoBase =
          negPropKeys.length === 0 ||
          (negPropKeys.length === allPosPropKeys.size &&
            negPropKeys.every((k) => allPosPropKeys.has(k)));

        // Process pos variants (same in both branches)
        for (const pos of posVariants) {
          variantBuckets.set(pos.when, { ...variantBuckets.get(pos.when), ...pos.style });
          variantStyleKeys[pos.when] ??= styleKeyWithSuffix(decl.styleKey, pos.when);
        }

        if (shouldFoldNegIntoBase) {
          // Same property sets — fold neg into base (default branch)
          Object.assign(styleObj, neg.style);
        } else {
          // Different property sets — keep neg as a variant bucket too
          variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
          variantStyleKeys[neg.when] ??= styleKeyWithSuffix(decl.styleKey, neg.when);
        }
      } else if (negVariants.length === 1 && posVariants.length === 0) {
        // Only negated variant: style is conditional on !prop
        // Pattern: !prop ? A : "" → A is conditional on !prop (i.e., when prop is false)
        const neg = negVariants[0]!;
        variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
        // toSuffixFromProp handles negated props: !$open → NotOpen
        variantStyleKeys[neg.when] ??= styleKeyWithSuffix(decl.styleKey, neg.when);
      } else if (posVariants.length > 0) {
        // Positive variants (with or without multiple negatives)
        // Pattern: prop ? A : "" or prop === "a" ? A : ""
        // Also handles: hollow ? A : (inner ternary produces multiple negatives)
        for (const pos of posVariants) {
          variantBuckets.set(pos.when, { ...variantBuckets.get(pos.when), ...pos.style });
          variantStyleKeys[pos.when] ??= styleKeyWithSuffix(decl.styleKey, pos.when);
        }
        // Also process negative variants (compound conditions like !hollow && $primary)
        for (const neg of negVariants) {
          variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
          variantStyleKeys[neg.when] ??= styleKeyWithSuffix(decl.styleKey, neg.when);
        }
      } else if (negVariants.length > 0) {
        // Only negative variants (multiple compound conditions)
        for (const neg of negVariants) {
          variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
          variantStyleKeys[neg.when] ??= styleKeyWithSuffix(decl.styleKey, neg.when);
        }
      }
      continue;
    }

    if (res && res.type === "splitVariantsResolvedStyles") {
      if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
        warnings.push({
          severity: "warning",
          type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
          loc,
          context: { selector: rule.selector },
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
            type: "Adapter resolveCall returned an unparseable styles expression",
            loc,
            context: { localName: decl.localName, variant: v },
          });
          bail = true;
          break;
        }
        decl.extraStylexPropsArgs ??= [];
        decl.extraStylexPropsArgs.push({ when: v.when, expr: exprAst as any });
      }
      if (bail) {
        break;
      }
      decl.needsWrapperComponent = true;
      continue;
    }

    if (
      handleSplitVariantsResolvedValue({
        j,
        decl,
        d,
        res,
        styleObj,
        variantBuckets,
        variantStyleKeys,
        pseudos,
        media,
        parseExpr,
        resolverImports,
        warnings,
        setBail: () => {
          bail = true;
        },
        bailUnsupported: bailUnsupportedLocal,
      })
    ) {
      continue;
    }

    if (
      handleSplitMultiPropVariantsResolvedValue({
        j,
        decl,
        d,
        res,
        styleObj,
        variantBuckets,
        variantStyleKeys,
        pseudos,
        media,
        parseExpr,
        resolverImports,
        warnings,
        setBail: () => {
          bail = true;
        },
        bailUnsupported: bailUnsupportedLocal,
      })
    ) {
      continue;
    }

    if (
      handleDualBranchCompoundVariantsResolvedValue({
        j,
        decl,
        d,
        res,
        styleObj,
        variantBuckets,
        variantStyleKeys,
        pseudos,
        media,
        parseExpr,
        resolverImports,
        warnings,
        setBail: () => {
          bail = true;
        },
        bailUnsupported: bailUnsupportedLocal,
      })
    ) {
      continue;
    }

    if (res && res.type === "emitConditionalIndexedThemeFunction") {
      // Handle conditional indexed theme lookup:
      //   props.textColor ? props.theme.color[props.textColor] : props.theme.color.labelTitle
      //
      // Strategy: Add fallback as base style, style function provides override when prop is defined.
      // This works because the emit logic guards the function call with `propName != null &&`.
      //   Base style: { color: themeVars.labelTitle }
      //   Style function: (textColor: Colors) => ({ color: themeVars[textColor] })
      //   Usage: styles.badge, textColor != null && styles.badgeColor(textColor)

      // Add imports from both theme resolutions
      for (const imp of res.themeObjectImports) {
        resolverImports.set(JSON.stringify(imp), imp);
      }
      for (const imp of res.fallbackImports) {
        resolverImports.set(JSON.stringify(imp), imp);
      }

      // Mark prop to not forward to DOM
      ensureShouldForwardPropDrop(decl, res.propName);

      // Parse the theme expressions
      const themeObjAst = parseExpr(res.themeObjectExpr);
      const fallbackAst = parseExpr(res.fallbackExpr);
      if (!themeObjAst || !fallbackAst) {
        warnings.push({
          severity: "error",
          type: "Failed to parse theme expressions",
          loc: decl.loc,
          context: {
            localName: decl.localName,
            themeObjExpr: res.themeObjectExpr,
            fallbackExpr: res.fallbackExpr,
          },
        });
        bail = true;
        break;
      }

      // Generate function-based style for each CSS output property
      const outs = cssDeclarationToStylexDeclarations(d);
      for (const out of outs) {
        if (!out.prop) {
          continue;
        }

        // Add fallback to base styleObj
        styleObj[out.prop] = fallbackAst as any;

        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        if (!styleFnDecls.has(fnKey)) {
          // Get prop type from component's type annotation if available
          const propTsType = findJsxPropTsType(res.propName);
          const paramName = buildSafeIndexedParamName(res.propName, themeObjAst);
          const param = j.identifier(paramName);

          // Add type annotation (without | undefined since the function is only called when defined)
          if (propTsType && typeof propTsType === "object" && (propTsType as any).type) {
            (param as any).typeAnnotation = j.tsTypeAnnotation(propTsType as any);
          }

          // Build: themeObj[propName] (no conditional - fallback is in base style)
          const valueExpr = j.memberExpression(themeObjAst as any, j.identifier(paramName), true);

          const body = j.objectExpression([
            j.property("init", makeCssPropKey(j, out.prop), valueExpr),
          ]);

          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
        }

        // Use condition: "truthy" to mirror the original `props.textColor ? ... : fallback`
        // semantics. This ensures falsy-but-defined values (empty string, 0, false) use
        // the fallback rather than attempting an indexed lookup.
        styleFnFromProps.push({ fnKey, jsxProp: res.propName, condition: "truthy" });
      }

      if (bail) {
        break;
      }

      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "emitIndexedThemeFunctionWithPropFallback") {
      // Handle indexed theme lookup with prop fallback:
      //   props.theme.color[props.backgroundColor] || props.backgroundColor
      //
      // Output: (backgroundColor: Color) => ({ backgroundColor: $colors[backgroundColor] ?? backgroundColor })

      // Add imports from theme resolution
      for (const imp of res.themeObjectImports) {
        resolverImports.set(JSON.stringify(imp), imp);
      }

      // Mark prop to not forward to DOM
      ensureShouldForwardPropDrop(decl, res.propName);

      // Parse the theme expression
      const themeObjAst = parseExpr(res.themeObjectExpr);
      if (!themeObjAst) {
        warnings.push({
          severity: "error",
          type: "Failed to parse theme expressions",
          loc: decl.loc,
          context: {
            localName: decl.localName,
            themeObjExpr: res.themeObjectExpr,
          },
        });
        bail = true;
        break;
      }

      // Generate function-based style for each CSS output property
      const outs = cssDeclarationToStylexDeclarations(d);
      for (const out of outs) {
        if (!out.prop) {
          continue;
        }

        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        if (!styleFnDecls.has(fnKey)) {
          // Get prop type from component's type annotation if available
          const propTsType = findJsxPropTsType(res.propName);
          const paramName = buildSafeIndexedParamName(res.propName, themeObjAst);
          const param = j.identifier(paramName);

          // Add type annotation if available
          if (propTsType && typeof propTsType === "object" && (propTsType as any).type) {
            (param as any).typeAnnotation = j.tsTypeAnnotation(propTsType as any);
          }

          // Build: themeObj[propName] ?? `${propName}`
          // The template literal wrapper satisfies StyleX's static analyzer for the fallback
          const indexedLookup = j.memberExpression(
            themeObjAst as any,
            j.identifier(paramName),
            true,
          );
          const fallbackExpr = j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: "", cooked: "" }, true),
            ],
            [j.identifier(paramName)],
          );
          const valueExpr = j.logicalExpression(res.operator, indexedLookup, fallbackExpr);

          const body = j.objectExpression([
            j.property("init", makeCssPropKey(j, out.prop), valueExpr),
          ]);

          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
        }

        // Let the wrapper emitter handle required vs optional props:
        // - Required props: styles.fn(prop)
        // - Optional props: prop != null && styles.fn(prop)
        styleFnFromProps.push({ fnKey, jsxProp: res.propName });
      }

      if (bail) {
        break;
      }

      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "splitConditionalWithDynamicBranch") {
      if (!d.property) {
        // Only intended for value interpolations on concrete properties.
      } else {
        const { conditionProp, staticValue, dynamicBranchExpr, dynamicProps, isStaticWhenFalse } =
          res;

        // --- A. Static branch → base style ---
        const { prefix, suffix } = extractStaticPartsForDecl(d);
        const cssValueStr = `${prefix}${staticValue}${suffix}`;
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          styleObj[out.prop] = cssValueStr;
        }

        // --- B. Dynamic branch → merge with existing variant or create new ---
        const clonedDynamic = cloneAstNode(dynamicBranchExpr) as ExpressionKind;
        const dynamicValueExpr =
          prefix || suffix
            ? buildTemplateWithStaticParts(j, clonedDynamic, prefix, suffix)
            : clonedDynamic;

        // Mark dynamic props for DOM exclusion
        for (const propName of dynamicProps) {
          ensureShouldForwardPropDrop(decl, propName);
        }
        // Also mark the condition prop for DOM exclusion
        ensureShouldForwardPropDrop(decl, conditionProp);

        const conditionWhen = isStaticWhenFalse ? conditionProp : `!${conditionProp}`;

        // Build call argument: object shorthand for dynamic props only
        const callArg = j.objectExpression(
          dynamicProps.map((name) => {
            const prop = j.property("init", j.identifier(name), j.identifier(name)) as any;
            prop.shorthand = true;
            return prop;
          }),
        );

        const existingBucket = variantBuckets.get(conditionProp);
        if (existingBucket) {
          // --- Merge path: combine existing variant bucket with dynamic branch ---
          const existingFnKey = variantStyleKeys[conditionProp];
          if (!existingFnKey) {
            // Shouldn't happen, but bail gracefully
            break;
          }
          const capturedSourceOrder = variantSourceOrder[conditionProp];

          // Build combined arrow function: (props) => ({ ...existingStatic, ...newDynamic })
          const properties: unknown[] = [];

          // Clone existing static properties from the variant bucket.
          // Values may be raw primitives or AST nodes depending on how they were inserted.
          for (const [propKey, propValue] of Object.entries(existingBucket)) {
            const valueNode =
              propValue !== null && typeof propValue === "object" && "type" in propValue
                ? (cloneAstNode(propValue) as ExpressionKind)
                : (staticValueToLiteral(
                    j,
                    propValue as string | number | boolean,
                  ) as ExpressionKind);
            properties.push(j.property("init", makeCssPropKey(j, propKey), valueNode));
          }

          // Add the new dynamic properties
          for (const out of cssDeclarationToStylexDeclarations(d)) {
            properties.push(
              j.property("init", makeCssPropKey(j, out.prop), dynamicValueExpr as any),
            );
          }

          const param = j.identifier("props");
          const body = j.objectExpression(properties as any);
          styleFnDecls.set(existingFnKey, j.arrowFunctionExpression([param], body));

          // Remove from variant buckets — now handled as a style function
          variantBuckets.delete(conditionProp);
          delete variantStyleKeys[conditionProp];

          styleFnFromProps.push({
            fnKey: existingFnKey,
            jsxProp: "__props",
            callArg,
            conditionWhen,
            ...(capturedSourceOrder !== undefined ? { sourceOrder: capturedSourceOrder } : {}),
          });
        } else {
          // --- Standalone path: create new conditional style function ---
          for (const out of cssDeclarationToStylexDeclarations(d)) {
            const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
            if (!styleFnDecls.has(fnKey)) {
              const param = j.identifier("props");
              const body = j.objectExpression([
                j.property("init", makeCssPropKey(j, out.prop), dynamicValueExpr as any),
              ]);
              styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
            }
            if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
              styleFnFromProps.push({
                fnKey,
                jsxProp: "__props",
                callArg,
                conditionWhen,
              });
            }
          }
        }

        decl.needsWrapperComponent = true;
        continue;
      }
    }

    if (res && res.type === "emitStyleFunctionFromPropsObject") {
      if (!d.property) {
        // This handler is only intended for value interpolations on concrete properties.
        // If the IR is missing a property, fall through to other handlers.
      } else {
        const e = decl.templateExpressions[slotId] as any;
        if (e?.type !== "ArrowFunctionExpression" && e?.type !== "FunctionExpression") {
          bailUnsupportedLocal(decl, "Unsupported interpolation: arrow function");
          break;
        }
        if (hasThemeAccessInArrowFn(e)) {
          warnPropInlineStyle(
            decl,
            "Unsupported prop-based inline style props.theme access is not supported",
            d.property,
            loc,
          );
          bail = true;
          break;
        }
        const bodyExpr = getFunctionBodyExpr(e);
        if (!bodyExpr) {
          warnPropInlineStyle(
            decl,
            "Unsupported prop-based inline style expression cannot be safely inlined",
            d.property,
            loc,
          );
          bail = true;
          break;
        }
        for (const propName of res.props ?? []) {
          ensureShouldForwardPropDrop(decl, propName);
        }
        decl.needsWrapperComponent = true;
        const paramName = e.params?.[0]?.type === "Identifier" ? e.params[0].name : "props";
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          if (!out.prop) {
            continue;
          }
          const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
          if (!styleFnDecls.has(fnKey)) {
            const valueExprRaw = cloneAstNode(bodyExpr);
            // Apply CSS value prefix/suffix (e.g., `${...}ms`) to the expression
            const { prefix, suffix } = extractStaticPartsForDecl(d);
            const valueExpr =
              prefix || suffix
                ? buildTemplateWithStaticParts(j, valueExprRaw, prefix, suffix)
                : valueExprRaw;
            const param = j.identifier(paramName);
            const body = j.objectExpression([
              j.property(
                "init",
                makeCssPropKey(j, out.prop),
                buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
              ),
            ]);
            styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
          }
          if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
            const callArg = j.objectExpression(
              (res.props ?? []).map((propName) => {
                const prop = j.property(
                  "init",
                  j.identifier(propName),
                  j.identifier(propName),
                ) as any;
                prop.shorthand = true;
                return prop;
              }),
            );
            styleFnFromProps.push({
              fnKey,
              jsxProp: "__props",
              callArg,
            });
          }
        }
        continue;
      }
    }

    if (
      handleInlineStyleValueFromProps({
        j,
        decl,
        d,
        res,
        slotId,
        pseudos,
        media,
        filePath,
        loc,
        warnings,
        styleObj,
        styleFnDecls,
        styleFnFromProps,
        inlineStyleProps,
        warnPropInlineStyle,
        setBail: () => {
          bail = true;
        },
        avoidNames,
      })
    ) {
      if (bail) {
        break;
      }
      continue;
    }

    // Handle emitStyleFunctionWithDefault: emit both static base style AND dynamic override
    if (res && res.type === "emitStyleFunctionWithDefault") {
      const jsxProp = res.call;
      const outs = cssDeclarationToStylexDeclarations(d);

      // Extract the static default value
      const defaultStaticValue = literalToStaticValue(res.defaultValue);

      // Identity prop with default + finite union type → static variant lookups
      // (e.g., `({ padding = "16px" }) => padding` with `padding: "8px" | "16px" | "24px"`)
      if (
        !res.valueTransform &&
        !res.wrapValueInTemplateLiteral &&
        !media &&
        (!pseudos || pseudos.length === 0) &&
        outs.length === 1 &&
        defaultStaticValue !== null &&
        typeof defaultStaticValue === "string"
      ) {
        const out = outs[0]!;
        if (tryEmitIdentityVariantBuckets(jsxProp, out.prop, defaultStaticValue)) {
          styleObj[out.prop] = defaultStaticValue;
          continue;
        }
      }

      for (let i = 0; i < outs.length; i++) {
        const out = outs[i]!;

        // Add static base style with default value
        if (defaultStaticValue !== null && !pseudos?.length && !media) {
          styleObj[out.prop] = defaultStaticValue;
        }

        // Add dynamic style function (same as emitStyleFunction)
        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        styleFnFromProps.push({ fnKey, jsxProp });

        if (!styleFnDecls.has(fnKey)) {
          const outParamName = cssPropertyToIdentifier(out.prop, avoidNames);
          const param = j.identifier(outParamName);
          if (jsxProp !== "__props") {
            annotateParamFromJsxProp(param, jsxProp);
          }
          if (jsxProp?.startsWith?.("$")) {
            ensureShouldForwardPropDrop(decl, jsxProp);
          }

          const p = makeCssProperty(j, out.prop, outParamName);
          const body = j.objectExpression([p]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
        }
      }
      continue;
    }

    if (res && res.type === "emitStyleFunction") {
      const jsxProp = res.call;

      // Identity prop with finite union type → static variant lookups
      // (e.g., `align-items: ${({ align }) => align}` with `align: "stretch" | "center" | ...`)
      if (
        !res.valueTransform &&
        !res.wrapValueInTemplateLiteral &&
        !media &&
        (!pseudos || pseudos.length === 0)
      ) {
        const outs = cssDeclarationToStylexDeclarations(d);
        if (outs.length === 1 && tryEmitIdentityVariantBuckets(jsxProp, outs[0]!.prop)) {
          continue;
        }
      }

      {
        const outs = cssDeclarationToStylexDeclarations(d);
        for (let i = 0; i < outs.length; i++) {
          const out = outs[i]!;
          const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
          styleFnFromProps.push({ fnKey, jsxProp });

          if (!styleFnDecls.has(fnKey)) {
            // IMPORTANT: don't reuse the same Identifier node for both the function param and
            // expression positions. If the param identifier has a TS annotation, reusing it
            // in expression positions causes printers to emit `value: any` inside templates.
            const outParamName = cssPropertyToIdentifier(out.prop, avoidNames);
            const param = j.identifier(outParamName);
            const valueId = j.identifier(outParamName);
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
                const vt = (res as { valueTransform?: CallValueTransform }).valueTransform;
                if (vt?.kind === "call" && typeof vt.calleeIdent === "string") {
                  // Add adapter-resolved imports if present
                  if (vt.resolvedImports) {
                    for (const imp of vt.resolvedImports) {
                      resolverImports.set(JSON.stringify(imp), imp);
                    }
                  }
                  // Use adapter-resolved expression, choosing call or member access
                  // based on resolvedUsage (default: "call")
                  if (vt.resolvedExpr) {
                    const resolvedCallee = parseExpr(vt.resolvedExpr);
                    if (vt.resolvedUsage === "memberAccess") {
                      return j.memberExpression(resolvedCallee, valueId, true);
                    }
                    return j.callExpression(resolvedCallee, [valueId]);
                  }
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
              const hasStatic = parts.some((p: any) => p?.kind === "static" && p.value !== "");
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
                    existingValue = prop.value;
                  }
                }
              }
              const defaultValue = existingValue ?? j.literal(null);
              return j.objectExpression([
                j.property("init", j.identifier("default"), defaultValue),
                j.property("init", j.literal(media), valueExpr),
              ]);
            };
            const propKey = makeCssPropKey(j, out.prop);
            const p = j.property("init", propKey, getPropValue()) as any;
            // Only use shorthand if the key is an identifier (not a string literal for CSS vars)
            const paramName = cssPropertyToIdentifier(out.prop, avoidNames);
            p.shorthand =
              propKey.type === "Identifier" &&
              valueExpr?.type === "Identifier" &&
              valueExpr.name === paramName;
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
        type: res.reason,
        loc,
      });
      bail = true;
      break;
    }

    if (decl.shouldForwardProp && d.property) {
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        if (!out.prop) {
          continue;
        }
        const e = decl.templateExpressions[slotId] as any;
        let baseExpr = e;
        let propsParam = j.identifier("props");
        let jsxProp: string = "__props";
        if (e?.type === "ArrowFunctionExpression") {
          if (hasUnsupportedConditionalTest(e)) {
            warnPropInlineStyle(
              decl,
              "Unsupported conditional test in shouldForwardProp",
              d.property,
              loc,
            );
            bail = true;
            break;
          }
          if (hasThemeAccessInArrowFn(e)) {
            warnPropInlineStyle(
              decl,
              "Unsupported prop-based inline style props.theme access is not supported",
              d.property,
              loc,
            );
            bail = true;
            break;
          }
          const propsUsed = collectPropsFromArrowFn(e);
          for (const propName of propsUsed) {
            ensureShouldForwardPropDrop(decl, propName);
          }
          // Try to unwrap props access (props.$x → $x) for cleaner style functions.
          // When only one transient prop is used, emit a single-param function
          // (e.g., ($size) => ...) instead of (props) => ..., enabling consolidation.
          const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
          if (unwrapped && unwrapped.propsUsed.size === 1) {
            const singleProp = [...unwrapped.propsUsed][0]!;
            propsParam = j.identifier(singleProp);
            jsxProp = singleProp;
            baseExpr = unwrapped.expr;
          } else {
            if (e.params?.[0]?.type === "Identifier") {
              propsParam = j.identifier(e.params[0].name);
            }
            const inlineExpr = inlineArrowFunctionBody(j, e);
            if (!inlineExpr) {
              warnPropInlineStyle(
                decl,
                "Unsupported prop-based inline style expression cannot be safely inlined",
                d.property,
                loc,
              );
              bail = true;
              break;
            }
            baseExpr = inlineExpr;
          }
        }
        // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
        const { prefix, suffix } = extractStaticPartsForDecl(d);
        const expr =
          prefix || suffix ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix) : baseExpr;
        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        if (!styleFnDecls.has(fnKey)) {
          const body = j.objectExpression([
            j.property(
              "init",
              makeCssPropKey(j, out.prop),
              buildPseudoMediaPropValue({ j, valueExpr: expr, pseudos, media }),
            ),
          ]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([propsParam], body));
        }
        if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
          styleFnFromProps.push({ fnKey, jsxProp });
        }
      }
      if (bail) {
        break;
      }
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
      if (expr.type === "MemberExpression" || expr.type === "OptionalMemberExpression") {
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
    bail = true;
    break;
  }

  if (state.bail) {
    bail = true;
  }
  if (bail) {
    state.markBail();
  }
}

/**
 * Searches the function body for a local variable with the given name whose
 * initializer references `fnParamName`. Returns a cloned expression with
 * `fnParamName` replaced by `jsxProp`, or null if no such variable is found.
 *
 * Returns null when the derived expression references other helper-local variables
 * that would not be in scope at the call site.
 */
function resolveDerivedLocalVariable(
  j: JSCodeshift,
  fnBody: unknown,
  fnParamName: string,
  localName: string,
  jsxProp: string,
): ExpressionKind | null {
  const stmts = (fnBody as { body: unknown[] }).body;

  // Collect all local variable names declared in the function body
  const helperLocals = new Set<string>();
  for (const stmt of stmts) {
    const s = stmt as { type?: string; declarations?: unknown[] };
    if (s.type !== "VariableDeclaration" || !s.declarations) {
      continue;
    }
    for (const decl_ of s.declarations) {
      const vd = decl_ as { id?: { type?: string; name?: string } };
      if (vd.id?.type === "Identifier" && vd.id.name) {
        helperLocals.add(vd.id.name);
      }
    }
  }

  for (const stmt of stmts) {
    const s = stmt as { type?: string; declarations?: unknown[] };
    if (s.type !== "VariableDeclaration" || !s.declarations) {
      continue;
    }
    for (const decl_ of s.declarations) {
      const vd = decl_ as { id?: { type?: string; name?: string }; init?: unknown };
      if (vd.id?.type !== "Identifier" || vd.id.name !== localName || !vd.init) {
        continue;
      }
      // Check if the initializer references fnParamName
      const initIds = new Set<string>();
      collectIdentifiers(vd.init, initIds);
      if (!initIds.has(fnParamName)) {
        continue;
      }
      // Bail if the initializer also references other helper-local variables
      // that would not be in scope at the call site
      for (const id of initIds) {
        if (id !== fnParamName && helperLocals.has(id)) {
          return null;
        }
      }
      // Build the callArg by replacing fnParamName with jsxProp in the initializer
      const clonedInit = cloneAstNode(vd.init) as ExpressionKind;
      const replaceParam = (node: unknown): unknown => {
        if (!node || typeof node !== "object") {
          return node;
        }
        if (Array.isArray(node)) {
          return node.map(replaceParam);
        }
        const rec = node as Record<string, unknown>;
        if (rec.type === "Identifier" && rec.name === fnParamName) {
          return j.identifier(jsxProp);
        }
        for (const key of Object.keys(rec)) {
          if (key === "loc" || key === "comments") {
            continue;
          }
          const child = rec[key];
          if (child && typeof child === "object") {
            rec[key] = replaceParam(child);
          }
        }
        return rec;
      };
      return replaceParam(clonedInit) as ExpressionKind;
    }
  }
  return null;
}

function isPseudoElementSelector(pseudoElement: string | null): boolean {
  return pseudoElement === "::before" || pseudoElement === "::after";
}

/**
 * Handles dynamic interpolations inside ::before/::after pseudo-elements by emitting
 * CSS custom properties on the parent element and referencing them with var() in the
 * pseudo-element's static StyleX styles.
 *
 * Example transform:
 *   Input:  `&::after { background-color: ${(props) => props.$badgeColor}; }`
 *   Output: StyleX  → `"::after": { backgroundColor: "var(--Badge-after-backgroundColor)" }`
 *           Inline  → `style={{ "--Badge-after-backgroundColor": $badgeColor }}`
 *
 * Bails (returns false) for unsupported shapes: multi-slot interpolations or CSS shorthands.
 */
function tryHandleDynamicPseudoElementViaCustomProperty(
  args: InterpolatedDeclarationContext,
): boolean {
  const { ctx, d, pseudoElement, applyResolvedPropValue } = args;
  const { state, decl, inlineStyleProps } = ctx;
  const { j } = state;

  if (!d.property || d.value.kind !== "interpolated") {
    return false;
  }

  const parts: Array<{ kind?: string }> = d.value.parts ?? [];
  const slotParts = parts.filter((p): p is { kind: "slot"; slotId: number } => p.kind === "slot");

  // Bail on multi-slot values (e.g., gradients, template combos)
  if (slotParts.length !== 1) {
    return false;
  }

  const slotPart = slotParts[0]!;
  const expr = decl.templateExpressions[slotPart.slotId] as { type?: string } | undefined;
  if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
    return false;
  }

  // Theme-based dynamic values inside pseudo-elements cannot be handled this way
  if (hasThemeAccessInArrowFn(expr)) {
    return false;
  }

  // Extract prop references and inline the arrow function body
  const unwrapped = unwrapArrowFunctionToPropsExpr(j, expr);
  if (!unwrapped) {
    return false;
  }

  const { expr: inlineExpr, propsUsed } = unwrapped;

  // Handle static parts (prefix/suffix like `${value}px`)
  const { prefix, suffix } = extractStaticPartsForDecl(d);
  const valueExpr: ExpressionKind =
    prefix || suffix ? buildTemplateWithStaticParts(j, inlineExpr, prefix, suffix) : inlineExpr;

  // Expand CSS declaration to StyleX longhand(s); bail on shorthands that can't
  // be represented as a single var() value (e.g., border, margin, padding).
  const stylexDecls = cssDeclarationToStylexDeclarations(d);
  if (stylexDecls.some((out) => UNSUPPORTED_CUSTOM_PROP_SHORTHANDS.has(out.prop))) {
    return false;
  }

  // Derive a pseudo-element label for the custom property name (e.g., "after", "before")
  const pseudoLabel = pseudoElement ? pseudoElement.replace(/^:+/, "") : "";

  // For each CSS output property, generate a custom property and var() reference.
  // Bail if a custom property with the same name already exists (e.g., same property
  // in base and @media contexts would produce duplicate keys, with last-one-wins semantics).
  const existingPropNames = new Set(inlineStyleProps.map((p) => p.prop));
  for (const out of stylexDecls) {
    if (!out.prop) {
      continue;
    }
    const customPropName = pseudoLabel
      ? `--${decl.localName}-${pseudoLabel}-${out.prop}`
      : `--${decl.localName}-${out.prop}`;
    if (existingPropNames.has(customPropName)) {
      return false;
    }
    applyResolvedPropValue(out.prop, `var(${customPropName})`, null);
    inlineStyleProps.push({ prop: customPropName, expr: valueExpr });
  }

  // Mark props to not forward to DOM
  for (const propName of propsUsed) {
    ensureShouldForwardPropDrop(decl, propName);
  }

  decl.needsWrapperComponent = true;
  return true;
}

/**
 * Apply a resolved theme boolean value to a style object, expanding CSS shorthands.
 * Returns false if the value cannot be expanded (caller should bail).
 */
function applyThemeBooleanValue(
  j: { literal: (value: string) => unknown },
  cssProp: string,
  value: unknown,
  target: Record<string, unknown>,
): boolean {
  // Try to extract string value from AST node (shared across border/background paths)
  const node = value as { type?: string; value?: unknown; expression?: unknown } | null;
  const unwrapped = node?.type === "ExpressionStatement" ? (node.expression as typeof node) : node;
  const strValue =
    unwrapped &&
    (unwrapped.type === "StringLiteral" || unwrapped.type === "Literal") &&
    typeof unwrapped.value === "string"
      ? unwrapped.value
      : null;

  // Border shorthand → expand to width/style/color
  const borderMatch = cssProp.match(/^border(-top|-right|-bottom|-left)?$/);
  if (borderMatch) {
    if (strValue === null) {
      return false;
    }
    const direction = borderMatch[1]
      ? borderMatch[1].slice(1).charAt(0).toUpperCase() + borderMatch[1].slice(2)
      : "";
    const parsed = parseBorderShorthandParts(strValue);
    if (!parsed) {
      return false;
    }
    if (parsed.width) {
      target[`border${direction}Width`] = j.literal(parsed.width);
    }
    if (parsed.style) {
      target[`border${direction}Style`] = j.literal(parsed.style);
    }
    if (parsed.color) {
      target[`border${direction}Color`] = j.literal(parsed.color);
    }
    return true;
  }

  // Background shorthand → backgroundColor or backgroundImage
  // Use the actual branch value (not valueRaw which contains placeholders)
  if (cssProp === "background") {
    target[resolveBackgroundStylexProp(strValue ?? "")] = value;
    return true;
  }

  // Default: camelCase the property name
  target[cssPropertyToStylexProp(cssProp)] = value;
  return true;
}

/**
 * Handles local helper function calls in template interpolations.
 * Pattern: ${(props) => localFn(props.size)} where localFn is defined in the same file
 * and returns a CSS string like "width: ${size}px; height: ${size}px;".
 *
 * Extracts each CSS property from the helper's return value and creates
 * dynamic style functions for them.
 */
function tryHandleLocalHelperCall(args: {
  ctx: InterpolatedDeclarationContext["ctx"];
  d: CssDeclarationIR;
  expr: unknown;
}): boolean {
  const { ctx, d, expr } = args;
  const { state, decl, styleFnDecls, styleFnFromProps } = ctx;
  const { j, root } = state;
  const avoidNames = new Set(state.importMap.keys());

  // Only handle standalone interpolations (no property name)
  if (d.property) {
    return false;
  }

  // Must be an arrow function
  const e = expr as { type?: string; params?: unknown[]; body?: unknown } | undefined;
  if (!e || (e.type !== "ArrowFunctionExpression" && e.type !== "FunctionExpression")) {
    return false;
  }
  const paramName = getArrowFnSingleParamName(e as Parameters<typeof getArrowFnSingleParamName>[0]);
  if (!paramName) {
    return false;
  }

  const body = getFunctionBodyExpr(e);
  if (!body || typeof body !== "object") {
    return false;
  }
  const bodyNode = body as {
    type?: string;
    callee?: { type?: string; name?: string };
    arguments?: unknown[];
  };
  if (bodyNode.type !== "CallExpression") {
    return false;
  }
  // Only support simple identifier callees (localFn)
  if (bodyNode.callee?.type !== "Identifier" || !bodyNode.callee.name) {
    return false;
  }
  const calleeName = bodyNode.callee.name;

  // Check it's NOT an imported function (those are handled by resolveCall)
  const importInfo = state.resolveImportInScope(calleeName, bodyNode.callee);
  if (importInfo) {
    return false;
  }

  // Must have a single argument that's a prop access: props.size
  const callArgs = bodyNode.arguments ?? [];
  if (callArgs.length !== 1) {
    return false;
  }
  const arg0 = callArgs[0] as { type?: string } | undefined;
  if (!arg0 || arg0.type !== "MemberExpression") {
    return false;
  }
  const propPath = getMemberPathFromIdentifier(
    arg0 as Parameters<typeof getMemberPathFromIdentifier>[0],
    paramName,
  );
  if (!propPath || propPath.length !== 1 || !propPath[0]) {
    return false;
  }
  const jsxProp = propPath[0];

  // Find the local function definition
  const fnDecls = root.find(j.FunctionDeclaration, { id: { name: calleeName } });
  if (fnDecls.size() === 0) {
    return false;
  }
  const fnNode = fnDecls.get().node;
  const fnParams = fnNode.params ?? [];
  if (fnParams.length !== 1) {
    return false;
  }
  const fnParamNode = fnParams[0] as { type?: string; name?: string };
  if (fnParamNode.type !== "Identifier" || !fnParamNode.name) {
    return false;
  }
  const fnParamName = fnParamNode.name;

  // Extract the return value
  const fnBody = fnNode.body as { body?: unknown[] } | undefined;
  if (!fnBody?.body) {
    return false;
  }
  const retStmt = fnBody.body.find(
    (s: unknown) => (s as { type?: string })?.type === "ReturnStatement",
  ) as { argument?: unknown } | undefined;
  if (!retStmt?.argument) {
    return false;
  }

  // The return value should be a template literal containing CSS declarations
  const retExpr = retStmt.argument as {
    type?: string;
    quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
    expressions?: unknown[];
  };
  if (retExpr.type !== "TemplateLiteral" || !retExpr.quasis || !retExpr.expressions) {
    return false;
  }

  // Build a CSS string with indexed placeholders to track which expression maps to which property
  let cssString = "";
  for (let i = 0; i < retExpr.quasis.length; i++) {
    cssString += retExpr.quasis[i]?.value?.cooked ?? retExpr.quasis[i]?.value?.raw ?? "";
    if (i < retExpr.expressions.length) {
      cssString += `__LOCAL_PARAM_${i}__`;
    }
  }

  // Parse the CSS string to extract properties (replace placeholders with dummy values)
  const parsedCss = parseCssDeclarationBlock(cssString.replace(/__LOCAL_PARAM_\d+__/g, "0"));
  if (!parsedCss || Object.keys(parsedCss).length === 0) {
    // The local helper function returns CSS that cannot be parsed into individual declarations.
    // This happens with child selectors (& > div), at-rules, or other complex CSS constructs.
    state.bailUnsupported(
      decl,
      `Local helper function returns CSS that cannot be decomposed into individual properties`,
    );
    return true;
  }

  // Build a per-property unit map by matching expression indices to CSS properties.
  // Parse the CSS string with placeholders intact to see which property contains each expression.
  const parsedWithPlaceholders = parseCssDeclarationBlock(
    cssString.replace(/__LOCAL_PARAM_(\d+)__/g, "PLACEHOLDER_$1"),
  );
  const propToUnit = new Map<string, string>();
  // Track CSS properties that directly reference the function parameter (with or without a unit)
  const directParamProps = new Set<string>();
  // Track derived call arguments per CSS property when the expression is a local variable
  // derived from the function parameter (e.g., `const px = sizeMap[size]` → callArg = sizeMap[size])
  const propToCallArg = new Map<string, ExpressionKind>();
  if (parsedWithPlaceholders) {
    for (const [cssProp, value] of Object.entries(parsedWithPlaceholders)) {
      const m = typeof value === "string" ? value.match(/PLACEHOLDER_(\d+)/) : null;
      if (!m) {
        continue;
      }
      const exprIdx = Number(m[1]);
      const nextQuasi =
        retExpr.quasis[exprIdx + 1]?.value?.cooked ?? retExpr.quasis[exprIdx + 1]?.value?.raw ?? "";
      const unitMatch = nextQuasi.match(/^(px|em|rem|%|vh|vw|ms|s)\b/);
      const exprNode = retExpr.expressions[exprIdx] as { type?: string; name?: string } | undefined;
      if (exprNode?.type === "Identifier" && exprNode.name === fnParamName) {
        directParamProps.add(cssProp);
        if (unitMatch) {
          propToUnit.set(cssProp, unitMatch[1]!);
        }
      } else if (exprNode?.type === "Identifier" && exprNode.name) {
        // Check if this identifier is a local variable derived from fnParamName
        const callArg = resolveDerivedLocalVariable(j, fnBody, fnParamName, exprNode.name, jsxProp);
        if (callArg) {
          propToCallArg.set(cssProp, callArg);
          // For px unit with derived expression, StyleX auto-adds px for numeric values,
          // so we don't need a unit suffix — just pass the number directly.
          // For non-px units, append the unit suffix.
          if (unitMatch && unitMatch[1] !== "px") {
            propToUnit.set(cssProp, unitMatch[1]!);
          }
        }
      }
    }
  }

  // Get the type annotation from the local function parameter
  const fnParamTypeAnnotation = (fnParams[0] as { typeAnnotation?: { typeAnnotation?: unknown } })
    ?.typeAnnotation?.typeAnnotation;

  // Verify that every CSS property can be traced back to the function parameter.
  // If any expression can't be resolved (neither direct param reference, unit-suffixed param,
  // nor a local variable derived from the param), bail rather than silently producing wrong code.
  for (const cssProp of Object.keys(parsedCss)) {
    if (!directParamProps.has(cssProp) && !propToCallArg.has(cssProp)) {
      // Check if the CSS value contains a placeholder at all
      const rawVal = parsedWithPlaceholders
        ? (parsedWithPlaceholders as Record<string, unknown>)[cssProp]
        : null;
      if (typeof rawVal === "string" && rawVal.includes("PLACEHOLDER_")) {
        // The local helper function computes CSS property values with logic that can't be
        // statically traced back to the function parameter (e.g., conditional assignments,
        // chained lookups). Bail rather than silently dropping these styles.
        state.bailUnsupported(
          decl,
          `Local helper function computes CSS values that cannot be statically traced to the component prop`,
        );
        return true;
      }
    }
  }

  // Create style functions for each extracted CSS property
  for (const cssProp of Object.keys(parsedCss)) {
    const fnKey = styleKeyWithSuffix(decl.styleKey, cssProp);
    const derivedCallArg = propToCallArg.get(cssProp);
    if (!styleFnDecls.has(fnKey)) {
      const paramName_ = cssPropertyToIdentifier(cssProp, avoidNames);
      const param = j.identifier(derivedCallArg ? paramName_ : jsxProp);
      if (derivedCallArg) {
        // Derived from a lookup expression (e.g., `sizeMap[size]`). The style function
        // receives the lookup result, which is typically numeric for CSS property values.
        // Use `number | string` to handle both numeric and token-based lookup tables.
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsUnionType([j.tsNumberKeyword(), j.tsStringKeyword()]),
        );
      } else if (fnParamTypeAnnotation) {
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          cloneAstNode(fnParamTypeAnnotation) as Parameters<typeof j.tsTypeAnnotation>[0],
        );
      }
      const propUnit = propToUnit.get(cssProp) ?? "";
      const valueParamName = derivedCallArg ? paramName_ : jsxProp;
      const valueExpr = propUnit
        ? j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: propUnit, cooked: propUnit }, true),
            ],
            [j.identifier(valueParamName)],
          )
        : j.identifier(valueParamName);
      const propKey = j.identifier(cssProp);
      const prop = j.property("init", propKey, valueExpr);
      // Use shorthand when key and value are the same identifier (e.g., { width } instead of { width: width })
      if (!propUnit && valueExpr.type === "Identifier" && valueExpr.name === cssProp) {
        (prop as { shorthand?: boolean }).shorthand = true;
      }
      const bodyExprNode = j.objectExpression([prop]);
      styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExprNode));
    }
    if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
      styleFnFromProps.push({
        fnKey,
        jsxProp,
        ...(derivedCallArg ? { callArg: derivedCallArg } : {}),
      });
    }
  }

  ensureShouldForwardPropDrop(decl, jsxProp);
  decl.needsWrapperComponent = true;

  // Track the consumed local helper for later removal in post-processing.
  // The function declaration can't be removed here because the template expression
  // still references it; it's cleaned up after the styled declaration is removed.
  if (!decl.consumedLocalHelpers) {
    decl.consumedLocalHelpers = [];
  }
  decl.consumedLocalHelpers.push(calleeName);

  return true;
}

/**
 * Handles declarations with multiple interpolation slots where all slots are
 * ternary expressions branching on the same prop.
 *
 * Pattern: `transform: translateY(-50%) translateX(${p => p.$expanded ? "0" : "-8px"}) scale(${p => p.$expanded ? 1 : 0.9})`
 *
 * Produces two static variant styles by evaluating each branch direction:
 *   popover: { transform: "translateY(-50%) translateX(-8px) scale(0.9)" }
 *   popoverExpanded: { transform: "translateY(-50%) translateX(0) scale(1)" }
 */
function tryHandleMultiSlotTernary(ctx: DeclProcessingState, d: CssDeclarationIR): boolean {
  const { decl, styleObj } = ctx;
  const parts = d.value.kind === "interpolated" ? d.value.parts : [];
  const slotParts = parts.filter(
    (p: { kind: string }): p is { kind: "slot"; slotId: number } => p.kind === "slot",
  );

  if (slotParts.length < 2) {
    return false;
  }

  // Extract and validate all slot expressions: each must be an arrow/function
  // with a ConditionalExpression body testing the same prop.
  let commonPropName: string | null = null;
  const branchValues: Array<{ consequent: string; alternate: string }> = [];

  for (const slot of slotParts) {
    const expr = decl.templateExpressions[slot.slotId] as
      | {
          type?: string;
          body?: unknown;
        }
      | undefined;
    if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
      return false;
    }
    const paramName = getArrowFnSingleParamName(
      expr as Parameters<typeof getArrowFnSingleParamName>[0],
    );
    if (!paramName) {
      return false;
    }
    const body = getFunctionBodyExpr(expr) as {
      type?: string;
      test?: unknown;
      consequent?: unknown;
      alternate?: unknown;
    } | null;
    if (!body || body.type !== "ConditionalExpression") {
      return false;
    }

    // Extract the tested prop name (e.g., "$expanded" from "props.$expanded")
    const testPath =
      body.test && typeof body.test === "object"
        ? getMemberPathFromIdentifier(
            body.test as Parameters<typeof getMemberPathFromIdentifier>[0],
            paramName,
          )
        : null;
    if (!testPath || testPath.length !== 1 || !testPath[0]) {
      return false;
    }
    const propName = testPath[0];

    if (commonPropName === null) {
      commonPropName = propName;
    } else if (commonPropName !== propName) {
      return false; // Different conditions — can't merge
    }

    // Both branches must be static literals
    const consVal = literalToStaticValue(body.consequent);
    const altVal = literalToStaticValue(body.alternate);
    if (consVal === null || altVal === null) {
      return false;
    }
    branchValues.push({
      consequent: String(consVal),
      alternate: String(altVal),
    });
  }

  if (!commonPropName) {
    return false;
  }

  // Build the full value string for each branch direction by combining
  // static parts with the evaluated branch values.
  const buildFullValue = (direction: "consequent" | "alternate"): string => {
    let result = "";
    let slotIndex = 0;
    for (const part of parts) {
      if (part.kind === "static") {
        result += (part as { value: string }).value;
      } else if (part.kind === "slot") {
        const branch = branchValues[slotIndex];
        result += branch ? branch[direction] : "";
        slotIndex++;
      }
    }
    return result;
  };

  const importantSuffix = d.important ? " !important" : "";
  const consFullValue = buildFullValue("consequent") + importantSuffix;
  const altFullValue = buildFullValue("alternate") + importantSuffix;

  // Apply CSS property mapping (e.g., transform stays as transform)
  for (const out of cssDeclarationToStylexDeclarations(d)) {
    // Default (false/alternate branch) goes to base styles
    styleObj[out.prop] = altFullValue;
    // True (consequent) branch goes to a variant
    ctx.applyVariant(
      { when: commonPropName, propName: commonPropName },
      { [out.prop]: consFullValue },
    );
  }

  // Drop the transient prop from forwarding
  if (commonPropName.startsWith("$")) {
    ensureShouldForwardPropDrop(decl, commonPropName);
  }
  decl.needsWrapperComponent = true;

  return true;
}

/** CSS shorthand properties that cannot be represented as a single var() custom property. */
const UNSUPPORTED_CUSTOM_PROP_SHORTHANDS = new Set([
  "border",
  "margin",
  "padding",
  "background",
  "flex",
  "overflow",
  "outline",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
]);
