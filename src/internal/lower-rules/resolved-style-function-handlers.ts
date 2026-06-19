/**
 * Style-function branch handlers extracted from
 * resolved-dynamic-node-handlers.ts to keep each module under the size budget.
 *
 * Handles the trailing `res.type` branches that emit StyleX dynamic style
 * functions (emitStyleFunctionFromPropsObject / emitStyleFunctionWithDefault /
 * emitStyleFunction) and the keepOriginal fallback. Tried after the earlier
 * branches in tryHandleResolvedDynamicNode; order preserved.
 */
/**
 * Resolved-dynamic-node branch handlers extracted from
 * handleInterpolatedDeclaration in rule-interpolated-declaration.ts.
 *
 * Given the result of `resolveDynamicNode`, this dispatches the long, ordered
 * sequence of mutually-exclusive `res.type` branches that emit StyleX styles,
 * variants and style functions. Returns true when a branch handled the
 * declaration (mirroring the original `break`/`continue` out of the dispatch
 * loop); false when no branch matched and the caller must fall through to the
 * unsupported-interpolation diagnostics.
 */
import type {} from "jscodeshift";
import type {} from "../../adapter.js";
import type { CallValueTransform } from "../builtin-handlers/types.js";
import type {} from "../transform-types.js";
import type {} from "../logger.js";
import type { ExpressionKind } from "./decl-types.js";
import {} from "../builtin-handlers.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import {} from "../utilities/style-key-naming.js";
import {
  cloneAstNode,
  getArrowFnParamBindings,
  getFunctionBodyExpr,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
import { extractStaticPartsForDecl } from "./interpolations.js";
import {
  ensureShouldForwardPropDrop,
  literalToStaticValue,
  markDeclNeedsUseThemeHook,
} from "./types.js";
import {
  buildTemplateWithStaticParts,
  buildStylexValueWithStaticParts,
  canOmitPxUnitForStylexNumber,
  collectPropsFromArrowFn,
  hasThemeAccessInArrowFn,
  hasUnsupportedConditionalTest,
  inlineArrowFunctionBody,
  isNumericStylexExpression,
  maybeOmitPxUnitFromStylexValue,
  rewritePropsThemeToThemeVar,
  unwrapArrowFunctionToPropsExpr,
} from "./inline-styles.js";
import {} from "./import-resolution.js";
import { handleInlineStyleValueFromProps } from "./inline-style-props.js";
import {} from "./important-values.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
import {} from "./imported-helper-call.js";
import {
  type DynamicHelperCallArgument,
  containsIdentifier,
  dedupeDynamicHelperCallArguments,
  numericIdentifierSetForJsxProp,
  printScalarizedExpression,
  resolveHelperCallsInDynamicValue,
  scalarCallArgForParamName,
  scalarStyleFnEntryFromProps,
  scalarizePropsObjectDynamicValue,
  styleFnParamNameForJsxProp,
} from "./dynamic-helper-call.js";
import { buildFullInterpolatedDeclarationValueExpr } from "./interpolated-calc.js";
import {
  buildDynamicStyleFunctionProperties,
  buildResolvedValueTransformCallArg,
  extractGuardedDynamicBranch,
  isHelperCallGuard,
  shouldUseScalarDynamicArgs,
  staticBaseValueWouldFold,
} from "./interpolated-decl-helpers.js";
import type {} from "./interpolated-declaration-context.js";
import type {} from "./observed-variant-handlers.js";
import type { ResolvedDynamicNodeContext } from "./resolved-dynamic-node-handlers.js";

export function tryHandleResolvedStyleFunctionNode(rc: ResolvedDynamicNodeContext): boolean {
  const {
    ctx,
    d,
    media,
    pseudos,
    res,
    slotId,
    loc,
    avoidNames,
    flags,
    addResolverImports,
    bailUnsupportedLocal,
    annotateScalarParams,
    tryEmitIdentityVariantBuckets,
    tryEmitTransformedObservedVariantBuckets,
    shouldPreserveNumericCssTextForProp,
  } = rc;
  const {
    state,
    decl,
    styleObj,
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    annotateParamFromJsxProp,
  } = ctx;
  const {
    j,
    filePath,
    warnings,
    parseExpr,
    resolveCall,
    warnPropInlineStyle,
    resolveImportInScope,
    resolveImportForExpr,
  } = state;

  if (res && res.type === "emitStyleFunctionFromPropsObject") {
    if (!d.property) {
      // This handler is only intended for value interpolations on concrete properties.
      // If the IR is missing a property, fall through to other handlers.
    } else {
      const e = decl.templateExpressions[slotId] as any;
      if (e?.type !== "ArrowFunctionExpression" && e?.type !== "FunctionExpression") {
        bailUnsupportedLocal(decl, "Unsupported interpolation: arrow function");
        return true;
      }
      if (hasThemeAccessInArrowFn(e)) {
        // StyleX style functions can't use runtime theme values.
        // Redirect to inline styles with useTheme() hook instead.
        const inlinedExpr = inlineArrowFunctionBody(j, e);
        if (!inlinedExpr) {
          warnPropInlineStyle(
            decl,
            "Unsupported prop-based inline style expression cannot be safely inlined",
            d.property,
            loc,
          );
          flags.bail = true;
          return true;
        }
        const themeRewritten = rewritePropsThemeToThemeVar(inlinedExpr as ExpressionKind);
        const { prefix, suffix } = extractStaticPartsForDecl(d);
        const valueExpr =
          prefix || suffix
            ? buildTemplateWithStaticParts(j, themeRewritten, prefix, suffix)
            : themeRewritten;
        markDeclNeedsUseThemeHook(decl);
        for (const propName of res.props ?? []) {
          if (propName === "theme") {
            continue;
          }
          ensureShouldForwardPropDrop(decl, propName);
        }
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          if (!out.prop) {
            continue;
          }
          inlineStyleProps.push({ prop: out.prop, expr: valueExpr });
        }
        return true;
      }
      const bodyExpr = getFunctionBodyExpr(e);
      if (!bodyExpr) {
        warnPropInlineStyle(
          decl,
          "Unsupported prop-based inline style expression cannot be safely inlined",
          d.property,
          loc,
        );
        flags.bail = true;
        return true;
      }
      const dynamicPropNames =
        res.props && res.props.length > 0 ? res.props : [...collectPropsFromArrowFn(e)];
      for (const propName of dynamicPropNames) {
        ensureShouldForwardPropDrop(decl, propName);
      }
      decl.needsWrapperComponent = true;
      const bindings = getArrowFnParamBindings(e);
      const paramName = bindings?.kind === "simple" ? bindings.paramName : "props";
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        if (!out.prop) {
          continue;
        }
        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        let helperCallArgs: DynamicHelperCallArgument[] = [];
        let scalarPropNames: string[] | null = null;
        let guardedConditionWhenForScalar: string | null = null;
        if (!styleFnDecls.has(fnKey)) {
          const originalValueExpr = cloneAstNode(bodyExpr);
          const helperResolution = resolveHelperCallsInDynamicValue({
            j,
            expr: originalValueExpr,
            cssProperty: out.prop,
            paramName,
            resolveImportForExpr,
            resolveImportInScope,
            resolveCall,
            parseExpr,
            filePath,
            loc,
            addResolverImports,
            ...(bindings ? { bindings } : {}),
          });
          if (helperResolution === null) {
            warnings.push({
              severity: "error",
              type: "Unsupported interpolation: call expression",
              loc,
            });
            flags.bail = true;
            break;
          }
          helperCallArgs = dedupeDynamicHelperCallArguments(helperResolution.args);
          const valueExprRaw = helperResolution.expr;
          const scalarProps =
            helperCallArgs.length === 0 && shouldUseScalarDynamicArgs(out.prop, d.valueRaw)
              ? scalarizePropsObjectDynamicValue({
                  j,
                  valueExpr: valueExprRaw,
                  paramName,
                  propNames: dynamicPropNames,
                  bindings: bindings ?? undefined,
                })
              : null;
          scalarPropNames = scalarProps?.paramNames ?? null;
          const needsOriginalParam =
            !scalarProps &&
            helperCallArgs.length > 0 &&
            containsIdentifier(valueExprRaw, paramName);
          const styleFnParamNames = scalarProps
            ? scalarProps.paramNames
            : helperCallArgs.length > 0
              ? helperCallArgs.map((resolution) => resolution.paramName)
              : [paramName];
          if (!scalarProps && needsOriginalParam) {
            styleFnParamNames.unshift(paramName);
          }
          // Apply CSS value prefix/suffix (e.g., `${...}ms`) to the expression.
          // Keep !important on the actual CSS property rather than in the dynamic value:
          // StyleX emits dynamic values through CSS variables, and values like
          // `${value} !important` do not get assigned as runtime variables.
          const { prefix, suffix } = extractStaticPartsForDecl(d);
          const fullTemplateValueExpr =
            d.property === "transition"
              ? buildFullInterpolatedDeclarationValueExpr(j, decl, d)
              : null;
          const valueExpr =
            fullTemplateValueExpr ??
            (prefix || suffix
              ? buildStylexValueWithStaticParts(
                  j,
                  scalarProps?.valueExpr ?? valueExprRaw,
                  prefix,
                  suffix,
                  out.prop,
                )
              : (scalarProps?.valueExpr ?? valueExprRaw));
          const guardedDynamic = extractGuardedDynamicBranch(j, bodyExpr);
          const guardedConditionWhen =
            guardedDynamic && scalarProps?.paramNames.length === 1
              ? printScalarizedExpression({
                  j,
                  expr: guardedDynamic.test,
                  paramName,
                  propNames: scalarProps.paramNames,
                  bindings: bindings ?? undefined,
                })
              : null;
          guardedConditionWhenForScalar =
            guardedConditionWhen && isHelperCallGuard(guardedConditionWhen)
              ? guardedConditionWhen
              : null;
          const params = styleFnParamNames.map((name) => j.identifier(name));
          if (/\.(ts|tsx)$/.test(filePath)) {
            const propsTypeKind = (decl.propsType as { type?: string } | undefined)?.type;
            const isNamedTypeRef = propsTypeKind === "TSTypeReference";
            if (scalarProps) {
              annotateScalarParams(params, scalarProps.paramNames);
            } else if (helperCallArgs.length > 0) {
              for (
                let paramIndex = needsOriginalParam ? 1 : 0;
                paramIndex < params.length;
                paramIndex++
              ) {
                const param = params[paramIndex];
                if (!param) {
                  continue;
                }
                (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                  j.tsStringKeyword(),
                );
              }
              if (needsOriginalParam && !isNamedTypeRef) {
                const typeName = `${decl.localName}Props`;
                (params[0] as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                  j.tsTypeReference(j.identifier(typeName)),
                );
              }
            } else if (!isNamedTypeRef) {
              const typeName = `${decl.localName}Props`;
              (params[0] as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                j.tsTypeReference(j.identifier(typeName)),
              );
            }
          }
          const body = j.objectExpression(
            buildDynamicStyleFunctionProperties({
              j,
              fnKey,
              prop: out.prop,
              valueExpr,
              important: d.important,
              pseudos,
              media,
            }),
          );
          styleFnDecls.set(fnKey, j.arrowFunctionExpression(params, body));
        }
        if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
          const needsOriginalParam =
            helperCallArgs.length > 0 &&
            styleFnDecls.has(fnKey) &&
            containsIdentifier(styleFnDecls.get(fnKey), paramName);
          const firstHelperCallArg = needsOriginalParam ? undefined : helperCallArgs[0];
          const extraHelperCallArgs = needsOriginalParam ? helperCallArgs : helperCallArgs.slice(1);
          const scalarEntry = scalarPropNames
            ? scalarStyleFnEntryFromProps({
                j,
                fnKey,
                propNames: scalarPropNames,
                ...(guardedConditionWhenForScalar
                  ? { conditionWhen: guardedConditionWhenForScalar }
                  : {}),
              })
            : null;
          styleFnFromProps.push(
            scalarEntry ?? {
              fnKey,
              jsxProp: "__props",
              ...(firstHelperCallArg ? { callArg: firstHelperCallArg.callArg } : {}),
              ...(extraHelperCallArgs.length > 0
                ? {
                    extraCallArgs: extraHelperCallArgs.map((resolution) => ({
                      jsxProp: "__props",
                      callArg: resolution.callArg,
                    })),
                  }
                : {}),
            },
          );
        }
      }
      return true;
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
        flags.bail = true;
      },
      avoidNames,
    })
  ) {
    if (flags.bail) {
      return true;
    }
    return true;
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
        return true;
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
      const outParamName = res.valueTransform
        ? cssPropertyToIdentifier(out.prop, avoidNames)
        : styleFnParamNameForJsxProp(jsxProp, out.prop, avoidNames);
      const scalarCallArg = res.valueTransform
        ? undefined
        : scalarCallArgForParamName(
            j,
            jsxProp,
            outParamName,
            decl.transientPropRenames?.get(jsxProp),
          );
      styleFnFromProps.push({
        fnKey,
        jsxProp,
        ...(scalarCallArg ? { callArg: scalarCallArg } : {}),
      });

      if (!styleFnDecls.has(fnKey)) {
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
    return true;
  }

  if (res && res.type === "emitStyleFunction") {
    const jsxProp = res.call;
    const outs = cssDeclarationToStylexDeclarations(d);
    const valueTransform = (res as { valueTransform?: CallValueTransform }).valueTransform;

    // Identity prop with finite union type → static variant lookups
    // (e.g., `align-items: ${({ align }) => align}` with `align: "stretch" | "center" | ...`)
    if (
      !res.valueTransform &&
      !res.wrapValueInTemplateLiteral &&
      !media &&
      (!pseudos || pseudos.length === 0)
    ) {
      if (outs.length === 1 && tryEmitIdentityVariantBuckets(jsxProp, outs[0]!.prop)) {
        return true;
      }
    }
    if (
      !(res as { wrapValueInTemplateLiteral?: boolean }).wrapValueInTemplateLiteral &&
      outs.length === 1 &&
      tryEmitTransformedObservedVariantBuckets(jsxProp, outs[0]!.prop, valueTransform)
    ) {
      return true;
    }

    {
      for (let i = 0; i < outs.length; i++) {
        const out = outs[i]!;
        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        const resolvedCallArg = buildResolvedValueTransformCallArg({
          j,
          jsxProp,
          valueTransform,
          parseExpr,
          addResolverImports,
        });
        const outParamName =
          resolvedCallArg || valueTransform
            ? cssPropertyToIdentifier(out.prop, avoidNames)
            : styleFnParamNameForJsxProp(jsxProp, out.prop, avoidNames);
        const scalarCallArg = valueTransform
          ? undefined
          : scalarCallArgForParamName(
              j,
              jsxProp,
              outParamName,
              decl.transientPropRenames?.get(jsxProp),
            );
        const callArg = resolvedCallArg ?? scalarCallArg;
        // Only mark as "always" (no null guard) when we can prove the prop
        // is required via an explicit type annotation.  Without propsType,
        // isJsxPropOptional returns false by default, but the prop may still
        // be optional at runtime (untyped / JS components).
        const hasExplicitType = !!decl.propsType;
        const isOptional = ctx.isJsxPropOptional(jsxProp);
        // When this value is pseudo-gated and a static base for the same
        // property exists, getPropValue folds that base into the function's
        // `default`. The folded base is only emitted when the function runs,
        // so the function must be called unconditionally — otherwise an absent
        // optional prop would drop the base (e.g. `background: slategray;
        // &:hover { background: ${p => p.$c} }` rendered without `$c`).
        const foldsStaticBaseIntoPseudoDefault =
          !media &&
          !!pseudos?.length &&
          staticBaseValueWouldFold((styleObj as Record<string, unknown>)[out.prop]);
        styleFnFromProps.push({
          fnKey,
          jsxProp,
          ...(callArg ? { callArg } : {}),
          ...((hasExplicitType && !isOptional) || foldsStaticBaseIntoPseudoDefault
            ? { condition: "always" as const }
            : {}),
        });

        if (!styleFnDecls.has(fnKey)) {
          // IMPORTANT: don't reuse the same Identifier node for both the function param and
          // expression positions. If the param identifier has a TS annotation, reusing it
          // in expression positions causes printers to emit `value: any` inside templates.
          const param = j.identifier(outParamName);
          const valueId = j.identifier(outParamName);
          // Be permissive: callers might pass numbers (e.g. `${props => props.$width}px`)
          // or strings (e.g. `${props => props.$color}`).
          if (jsxProp !== "__props") {
            annotateParamFromJsxProp(param, jsxProp);
          }
          if (resolvedCallArg && /\.(ts|tsx)$/.test(filePath)) {
            (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
              j.tsStringKeyword(),
            );
          }
          // Forcing an always-call on an optional prop passes `T | undefined`
          // into the style function, so widen the param to accept undefined.
          if (
            foldsStaticBaseIntoPseudoDefault &&
            isOptional &&
            jsxProp !== "__props" &&
            /\.(ts|tsx)$/.test(filePath)
          ) {
            const annotated = (param as { typeAnnotation?: { typeAnnotation?: unknown } })
              .typeAnnotation?.typeAnnotation;
            const baseTypeNode = (annotated as ExpressionKind | undefined) ?? j.tsStringKeyword();
            (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
              j.tsUnionType([baseTypeNode as never, j.tsUndefinedKeyword()]),
            );
          }
          if (jsxProp?.startsWith?.("$")) {
            ensureShouldForwardPropDrop(decl, jsxProp);
          }

          // If this declaration is a simple interpolated string with a single slot and
          // surrounding static text, preserve it by building a TemplateLiteral around the
          // prop value, e.g. `${value}px`, `opacity ${value}ms`.
          const buildValueExpr = (): any => {
            const transformed = (() => {
              const vt = callArg ? undefined : valueTransform;
              if (vt?.kind === "call" && typeof vt.calleeIdent === "string") {
                // Add adapter-resolved imports if present
                addResolverImports(vt.resolvedImports);
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

            // If it's just the slot, keep it as the raw value (number/string), except
            // number props in CSS text for unitful properties must stay text (`height: 40`),
            // not StyleX numeric px (`height: 40px`).
            const hasStatic = parts.some((p: any) => p?.kind === "static" && p.value !== "");
            if (!hasStatic) {
              if (shouldPreserveNumericCssTextForProp(jsxProp, out.prop)) {
                return j.templateLiteral(
                  [
                    j.templateElement({ raw: "", cooked: "" }, false),
                    j.templateElement({ raw: "", cooked: "" }, true),
                  ],
                  [transformed],
                );
              }
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
            return maybeOmitPxUnitFromStylexValue(
              j,
              j.templateLiteral(quasis, exprs) as ExpressionKind,
              out.prop,
              d.important,
            );
          };

          const valueExpr = buildValueExpr();
          const getPropValue = (): ExpressionKind => {
            if (!media && !pseudos?.length) {
              return valueExpr;
            }
            if (!media && pseudos?.length) {
              // Pseudo-gated dynamic value (e.g. `&:hover { color: ${p => p.$c} }`).
              // Fold the existing static base value (if any) into the function's
              // `default` so the base declaration isn't clobbered by the later
              // style-function entry in the stylex.props() array.
              const existingStatic = (styleObj as Record<string, unknown>)[out.prop];
              let defaultValue: ExpressionKind = j.literal(null);
              if (existingStatic !== undefined && existingStatic !== null) {
                if (typeof existingStatic === "object") {
                  if ("type" in (existingStatic as Record<string, unknown>)) {
                    defaultValue = cloneAstNode(existingStatic) as ExpressionKind;
                    delete (styleObj as Record<string, unknown>)[out.prop];
                  }
                  // Plain condition buckets (prior pseudo/media objects) stay in
                  // styleObj; the null default keeps this function pseudo-only.
                } else {
                  defaultValue = staticValueToLiteral(
                    j,
                    existingStatic as string | number | boolean,
                  ) as ExpressionKind;
                  delete (styleObj as Record<string, unknown>)[out.prop];
                }
              }
              return j.objectExpression([
                j.property("init", j.identifier("default"), defaultValue),
                ...pseudos.map((ps) => j.property("init", j.literal(ps), valueExpr)),
              ]);
            }
            if (!media) {
              return valueExpr;
            }
            if (pseudos?.length) {
              return buildPseudoMediaPropValue({ j, valueExpr, pseudos, media });
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
          const paramName = outParamName;
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
    return true;
  }

  if (res && res.type === "keepOriginal") {
    warnings.push({
      severity: "warning",
      type: res.reason,
      loc,
    });
    flags.bail = true;
    return true;
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
          flags.bail = true;
          break;
        }
        // shouldForwardProp style functions are module-scoped in stylex.create(),
        // so runtime theme values from useTheme() are not available there.
        if (hasThemeAccessInArrowFn(e)) {
          warnPropInlineStyle(
            decl,
            "Unsupported prop-based inline style props.theme access is not supported",
            d.property,
            loc,
          );
          flags.bail = true;
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
            flags.bail = true;
            break;
          }
          baseExpr = inlineExpr;
        }
      }
      // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
      const { prefix, suffix } = extractStaticPartsForDecl(d);
      const numericIdentifiers = numericIdentifierSetForJsxProp(jsxProp, ctx.findJsxPropTsType);
      const omitsPxUnit =
        canOmitPxUnitForStylexNumber(out.prop, prefix, suffix) &&
        isNumericStylexExpression(baseExpr, { numericIdentifiers });
      const expr =
        prefix || suffix
          ? buildStylexValueWithStaticParts(
              j,
              baseExpr,
              prefix,
              suffix,
              out.prop,
              false,
              undefined,
              numericIdentifiers,
            )
          : baseExpr;
      const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
      const scalarProps =
        jsxProp === "__props" &&
        e?.type === "ArrowFunctionExpression" &&
        shouldUseScalarDynamicArgs(out.prop, d.valueRaw)
          ? scalarizePropsObjectDynamicValue({
              j,
              valueExpr: expr,
              paramName: propsParam.name,
              propNames: [...collectPropsFromArrowFn(e)],
              bindings: getArrowFnParamBindings(e) ?? undefined,
            })
          : null;
      const shouldPassComputedCallArg =
        !scalarProps &&
        jsxProp !== "__props" &&
        ((Boolean(prefix || suffix) && !omitsPxUnit) ||
          baseExpr.type !== "Identifier" ||
          (baseExpr as { name?: string }).name !== jsxProp);
      const finalParam = shouldPassComputedCallArg
        ? j.identifier(cssPropertyToIdentifier(out.prop, avoidNames))
        : propsParam;
      const params = scalarProps
        ? scalarProps.paramNames.map((propName) => j.identifier(propName))
        : [finalParam];
      if (scalarProps && /\.(ts|tsx)$/.test(filePath)) {
        annotateScalarParams(params, scalarProps.paramNames);
      } else if (shouldPassComputedCallArg && /\.(ts|tsx)$/.test(filePath)) {
        (finalParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          omitsPxUnit
            ? j.tsUnionType([j.tsNumberKeyword(), j.tsStringKeyword()])
            : j.tsStringKeyword(),
        );
      }
      const valueExpr = scalarProps
        ? scalarProps.valueExpr
        : shouldPassComputedCallArg
          ? j.identifier(finalParam.name)
          : expr;
      if (!styleFnDecls.has(fnKey)) {
        const body = j.objectExpression([
          j.property(
            "init",
            makeCssPropKey(j, out.prop),
            buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
          ),
        ]);
        styleFnDecls.set(fnKey, j.arrowFunctionExpression(params, body));
      }
      if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
        const styleFnEntry = scalarProps
          ? scalarStyleFnEntryFromProps({ j, fnKey, propNames: scalarProps.paramNames })
          : {
              fnKey,
              jsxProp,
              ...(shouldPassComputedCallArg ? { callArg: expr } : {}),
            };
        if (styleFnEntry) {
          styleFnFromProps.push(styleFnEntry);
        }
      }
    }
    if (flags.bail) {
      return true;
    }
    return true;
  }

  return false;
}
