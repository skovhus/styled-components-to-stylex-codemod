/**
 * Handles interpolated CSS declarations during rule processing.
 * Core concepts: resolve dynamic values, map StyleX props, and emit wrappers.
 */
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type { ResolveValueContext } from "../../adapter.js";
import type { StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import type { ExpressionKind } from "./decl-types.js";
import type { DeclProcessingState } from "./decl-setup.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  cssPropertyToStylexProp,
} from "../css-prop-mapping.js";
import { buildThemeStyleKeys } from "../utilities/style-key-naming.js";
import {
  cloneAstNode,
  extractRootAndPath,
  getFunctionBodyExpr,
  getNodeLocStart,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
import { tryHandleAnimation } from "./animation.js";
import { tryHandleInterpolatedBorder } from "./borders.js";
import {
  extractStaticParts,
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
  unwrapArrowFunctionToPropsExpr,
} from "./inline-styles.js";
import { addStyleKeyMixin, trackMixinPropertyValues } from "./precompute.js";
import { buildSafeIndexedParamName } from "./import-resolution.js";
import {
  handleSplitMultiPropVariantsResolvedValue,
  handleSplitVariantsResolvedValue,
} from "./interpolated-variant-resolvers.js";
import { handleInlineStyleValueFromProps } from "./inline-style-props.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import { toStyleKey, toSuffixFromProp } from "../transform/helpers.js";
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
    annotateParamFromJsxProp,
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

  for (let _i = 0; _i < 1; _i++) {
    if (bail) {
      break;
    }
    if (tryHandleMappedFunctionColor(d)) {
      continue;
    }
    if (tryHandleAnimation({ j, decl, d, keyframesNames, styleObj })) {
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
          existing[ps] = resolved;
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
                extras.push({ expr: parsedExpr });
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
    // Only apply to base declarations; variant expansion for pseudo/media/attr buckets is more complex.
    if (!media && !attrTarget && !pseudos?.length) {
      if (tryHandleCssHelperConditionalBlock(d)) {
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
    if (tryHandleThemeIndexedLookup(d, { media, attrTarget, pseudos, pseudoElement })) {
      continue;
    }

    const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
    const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
    const expr = decl.templateExpressions[slotId];
    const loc = getNodeLocStart(expr as any);

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
        continue;
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

      // Map CSS prop to StyleX prop
      const stylexProp = cssPropertyToStylexProp(res.cssProp);

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

      trueStyle[stylexProp] = res.trueValue;
      falseStyle[stylexProp] = res.falseValue;

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
        // Positive variants (with or without multiple negatives)
        // Pattern: prop ? A : "" or prop === "a" ? A : ""
        // Also handles: hollow ? A : (inner ternary produces multiple negatives)
        for (const pos of posVariants) {
          variantBuckets.set(pos.when, { ...variantBuckets.get(pos.when), ...pos.style });
          variantStyleKeys[pos.when] ??= `${decl.styleKey}${toSuffixFromProp(pos.when)}`;
        }
        // Also process negative variants (compound conditions like !hollow && $primary)
        for (const neg of negVariants) {
          variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
          variantStyleKeys[neg.when] ??= `${decl.styleKey}${toSuffixFromProp(neg.when)}`;
        }
      } else if (negVariants.length > 0) {
        // Only negative variants (multiple compound conditions)
        for (const neg of negVariants) {
          variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
          variantStyleKeys[neg.when] ??= `${decl.styleKey}${toSuffixFromProp(neg.when)}`;
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
          continue;
        }
        decl.extraStylexPropsArgs ??= [];
        decl.extraStylexPropsArgs.push({ when: v.when, expr: exprAst as any });
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

        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
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

        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
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
          const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
          if (!styleFnDecls.has(fnKey)) {
            const valueExpr = cloneAstNode(bodyExpr);
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
        styleFnDecls,
        styleFnFromProps,
        inlineStyleProps,
        warnPropInlineStyle,
        setBail: () => {
          bail = true;
        },
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

      for (let i = 0; i < outs.length; i++) {
        const out = outs[i]!;

        // Add static base style with default value
        if (defaultStaticValue !== null && !pseudos?.length && !media) {
          styleObj[out.prop] = defaultStaticValue;
        }

        // Add dynamic style function (same as emitStyleFunction)
        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
        styleFnFromProps.push({ fnKey, jsxProp });

        if (!styleFnDecls.has(fnKey)) {
          const outParamName = cssPropertyToIdentifier(out.prop);
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
            const outParamName = cssPropertyToIdentifier(out.prop);
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
                const vt = (res as { valueTransform?: { kind: string; calleeIdent?: string } })
                  .valueTransform;
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
            const paramName = cssPropertyToIdentifier(out.prop);
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
          if (e.params?.[0]?.type === "Identifier") {
            propsParam = j.identifier(e.params[0].name);
          }
          const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
          const inlineExpr = unwrapped?.expr ?? inlineArrowFunctionBody(j, e);
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
        // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
        const { prefix, suffix } = extractStaticParts(d.value);
        const expr =
          prefix || suffix ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix) : baseExpr;
        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
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
          styleFnFromProps.push({ fnKey, jsxProp: "__props" });
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

function isPseudoElementSelector(pseudoElement: string | null): boolean {
  return (
    pseudoElement === "::before" ||
    pseudoElement === "::after" ||
    pseudoElement === ":before" ||
    pseudoElement === ":after"
  );
}

/**
 * Handles dynamic interpolations inside ::before/::after pseudo-elements by emitting
 * CSS custom properties on the parent element and referencing them with var() in the
 * pseudo-element's static StyleX styles.
 *
 * Example transform:
 *   Input:  `&::after { background-color: ${(props) => props.$badgeColor}; }`
 *   Output: StyleX  → `"::after": { backgroundColor: "var(--backgroundColor)" }`
 *           Inline  → `style={{ "--backgroundColor": $badgeColor }}`
 */
function tryHandleDynamicPseudoElementViaCustomProperty(
  args: InterpolatedDeclarationContext,
): boolean {
  const { ctx, d, applyResolvedPropValue } = args;
  const { state, decl, inlineStyleProps } = ctx;
  const { j } = state;

  if (!d.property || d.value.kind !== "interpolated") {
    return false;
  }

  const slotPart = d.value.parts.find(
    (p: { kind?: string }): p is { kind: "slot"; slotId: number } => p.kind === "slot",
  );
  if (!slotPart) {
    return false;
  }

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
  const { prefix, suffix } = extractStaticParts(d.value);
  const valueExpr: ExpressionKind =
    prefix || suffix ? buildTemplateWithStaticParts(j, inlineExpr, prefix, suffix) : inlineExpr;

  // For each CSS output property, generate a custom property and var() reference
  for (const out of cssDeclarationToStylexDeclarations(d)) {
    if (!out.prop) {
      continue;
    }
    const customPropName = `--${out.prop}`;
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
