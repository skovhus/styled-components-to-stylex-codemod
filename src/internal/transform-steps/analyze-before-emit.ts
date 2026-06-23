/**
 * Step: analyze declarations before emitting styles and wrappers.
 * Core concepts: wrapper decisions, export mapping, and styles identifier selection.
 */
import { resolve as pathResolve } from "node:path";
import { collectExportedComponents } from "../analyze-before-emit/exported-components.js";
import {
  CONTINUE,
  getActiveStyledDecls,
  returnResult,
  type StepResult,
} from "../transform-types.js";
import type { LocalElementOverrideCandidate, StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import {
  countComponentJsxUsages,
  hasSpreadInJsx,
  needsShouldForwardPropWrapper,
  propagateDelegationWrapperRequirements,
} from "../utilities/delegation-utils.js";
import { bridgeClassVarName, generateBridgeClassName } from "../utilities/bridge-classname.js";
import { isStyleOnlyElementTypeHost } from "../utilities/element-type-host.js";
import { isNonJsxStyledValueReferencePath } from "../utilities/component-value-references.js";
import {
  type ExpressionKind,
  getRootJsxIdentifierName,
  isAstNode,
  isFunctionNode,
  isNodeOfType,
} from "../utilities/jscodeshift-utils.js";
import { BLOCKED_INTRINSIC_ATTR_RENAMES } from "../emit-wrappers/types.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";
import { wrappedComponentInterfaceFor } from "../utilities/wrapped-component-interface.js";
import { guardForwardedSxConditionalDefaults } from "../utilities/forwarded-sx-defaults.js";
import { guardGeneratedConditionalDefaults } from "../utilities/conditional-style-defaults.js";
import {
  collectReferencedTypeNames,
  fileHasLocalName,
  isLocalFunctionComponent,
  isModuleScopeBinding,
  isTypeLocallyDefined,
} from "./binding-scope-analysis.js";
import { getDeclAncestorNamespaceChain, getDeclNamespaceName } from "./namespace-scope.js";
import {
  applyTransientPropRenames,
  collectAllStyleKeysForDecl,
  collectResolvedTypePropNames,
  emitTransientPropRenameWarning,
  renameIdentifiersInAst,
  renameTransientPropsInReferencedTypes,
  transientRenameHasNormalizedPropUsage,
  transientRenameWouldTouchExpressionIdentifier,
  transientRenameWouldTouchResolvedStyleObject,
  walkTypePropNames,
} from "./transient-prop-renames.js";
import {
  analyzePromotableStyleProps,
  canDowngradeStyleFnOnlyWrapper,
  collectReservedStyleKeys,
  ensureUniqueKey,
  mergePromotedStaticStyleObject,
} from "./promotable-style-props.js";
import {
  applyTypeScriptMetadata,
  buildEmitKeyNames,
  collectResolverImportNames,
  extendedBySkippedDecl,
  findExistingStylexStylesTarget,
  typeAwareExternalStyleFallback,
  typedComponentHasProp,
} from "./stylex-merge-target.js";
import {
  collectBaseComponentPropNames,
  collectCallSiteAttrNames,
  collectDeclPropNames,
  isTypeNameUsedElsewhere,
} from "./decl-prop-name-collection.js";
import {
  buildLocalElementOverrideProperties,
  buildResolvedStyleObjectList,
  getLocalElementWarningType,
  getPlainStyleObjectsFromResolvedValue,
  hasOnlyProvableAdjacentSiblingUsages,
  hasOverlappingPseudoOnlyLocalOverride,
  hasPseudoLocalElementOverride,
  hasRuntimeStyleEntriesForLocalElementTarget,
  type LocalElementProofReason,
  type LocalElementProofResult,
  makeLocalElementTargetStyleKey,
  proveLocalElementOverrideUsages,
} from "./local-element-override-analysis.js";
import { mergeInheritedAttrsInfo } from "./attrs-info-merge.js";
import {
  validateSxRestrictedWrappedComponentStyles,
  validateWrappedComponentStyleChannels,
} from "./sx-style-validation.js";

const INLINE_USAGE_THRESHOLD = 1;
const ELEMENT_TYPE_PROP_NAMES = new Set(["innerElementType", "outerElementType"]);

/**
 * Analyzes declarations to determine wrappers, exports, usage patterns, and import aliasing before emit.
 */
export function analyzeBeforeEmitStep(ctx: TransformContext): StepResult {
  const { root, j, adapter, file } = ctx;
  const allStyledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!allStyledDecls) {
    return CONTINUE;
  }

  // Detect if there's a local variable named `styles` in the file (not part of styled-components code)
  // If so, we'll use `stylexStyles` as the StyleX constant name to avoid shadowing.
  // Naming-collision check uses ALL decl names (including skipped ones) because skipped
  // declarations remain in the source as `const <name> = styled\`...\``.
  const styledDeclNames = new Set(allStyledDecls.map((d) => d.localName));
  // All per-decl analyses below skip decls that couldn't be lowered — they stay in the
  // source as-is and must not be wrapped, exported-tagged, or re-analyzed.
  const styledDecls = getActiveStyledDecls(allStyledDecls) ?? [];

  // The stylesIdentifier / merge-target decision runs at the END of this step: any
  // keys added below (staticBooleanVariants, callSiteCombinedStyles, promoted styles)
  // must be visible to the collision check against an existing stylex.create object.

  // Build lookup maps and set needsWrapperComponent BEFORE emitStylesAndImports
  // so that comment placement can be determined correctly.
  const declByLocal = new Map(styledDecls.map((d) => [d.localName, d]));
  // The `extendedBy` map must include skipped decls as potential extenders. A
  // skipped leaf preserved as `styled(Base)\`...\`` references `Base` at
  // runtime, which only works if Base keeps a wrapper function (not inlined).
  // Downstream wrapper-decision logic keys off this map to require a wrapper.
  const extendedBy = new Map<string, string[]>();
  const allDeclsByLocal = new Map(allStyledDecls.map((d) => [d.localName, d]));
  for (const decl of allStyledDecls) {
    if (decl.base.kind !== "component") {
      continue;
    }
    const base = allDeclsByLocal.get(decl.base.ident);
    if (!base) {
      continue;
    }
    // Only track relationships pointing at base decls we still plan to emit.
    // If the base is skipped it remains as raw styled-components and doesn't
    // need wrapper bookkeeping.
    if (base.skipTransform) {
      continue;
    }
    extendedBy.set(base.localName, [...(extendedBy.get(base.localName) ?? []), decl.localName]);
  }
  ctx.declByLocal = declByLocal;
  ctx.extendedBy = extendedBy;

  const exportedComponents = collectExportedComponents(root, j, declByLocal);
  for (const decl of styledDecls) {
    decl.isExported = exportedComponents.has(decl.localName);
  }
  ctx.exportedComponents = exportedComponents;

  // First, scan for static property assignments to identify which components have them
  const componentsWithStaticProps = new Set<string>();
  root.find(j.ExpressionStatement).forEach((p) => {
    const expr = p.node.expression;
    if (expr?.type !== "AssignmentExpression") {
      return;
    }
    const left = expr.left;
    if (left?.type !== "MemberExpression") {
      return;
    }
    const obj = left.object;
    if (obj?.type !== "Identifier") {
      return;
    }
    const styledNames = new Set(styledDecls.map((d) => d.localName));
    if (styledNames.has(obj.name)) {
      componentsWithStaticProps.add(obj.name);
    }
  });

  // Pre-pass: set needsWrapperComponent BEFORE emitStylesAndImports
  // This allows comment placement logic to know which decls need wrappers.
  // Track which decls have the flag set by this pre-pass (vs lowering).
  const wrapperForcedByPrepass = new Set<string>();
  for (const decl of styledDecls) {
    if (decl.isCssHelper) {
      continue;
    }
    if (decl.isDirectJsxResolution) {
      continue;
    }
    if (decl.base.kind === "component") {
      const baseDecl = declByLocal.get(decl.base.ident);
      if (baseDecl?.attrsInfo) {
        decl.attrsInfo = mergeInheritedAttrsInfo(baseDecl.attrsInfo, decl.attrsInfo);
      }
      if (
        decl.attrsInfo &&
        ((decl.attrsInfo.defaultAttrs?.length ?? 0) > 0 ||
          (decl.attrsInfo.dynamicAttrs?.length ?? 0) > 0 ||
          Object.keys(decl.attrsInfo.staticAttrs ?? {}).length > 0 ||
          !!decl.attrsInfo.attrsStaticStyleExpr ||
          (decl.attrsInfo.attrsDynamicStyles?.length ?? 0) > 0 ||
          (decl.attrsInfo.attrsStaticStyles &&
            Object.keys(decl.attrsInfo.attrsStaticStyles).length > 0))
      ) {
        decl.needsWrapperComponent = true;
      }
    }
    const hadWrapperBeforePrepass = decl.needsWrapperComponent;
    // Intrinsic components with prop-conditional attrs (e.g. `size: props.$small ? 5 : undefined`)
    // tend to produce very noisy inline substitutions when there are multiple callsite variations.
    // Prefer emitting a wrapper function component in these cases.
    if (decl.base.kind === "intrinsic" && (decl.attrsInfo?.conditionalAttrs?.length ?? 0) > 0) {
      decl.needsWrapperComponent = true;
    }
    // Intrinsic components with default attrs (e.g. `tabIndex: props.tabIndex ?? 0`)
    // need a wrapper to destructure the prop and apply the default value.
    if (decl.base.kind === "intrinsic" && (decl.attrsInfo?.defaultAttrs?.length ?? 0) > 0) {
      decl.needsWrapperComponent = true;
    }
    if (decl.base.kind === "intrinsic" && (decl.attrsInfo?.dynamicAttrs?.length ?? 0) > 0) {
      decl.needsWrapperComponent = true;
    }
    // shouldForwardProp from withConfig() still needs wrappers.
    // Resolver-added prop drops for inlined imported bases can be handled in JSX rewrite.
    if (needsShouldForwardPropWrapper(decl)) {
      decl.needsWrapperComponent = true;
    }
    // withConfig.componentId needs wrapper
    if (decl.base.kind === "intrinsic" && decl.withConfig?.componentId) {
      decl.needsWrapperComponent = true;
    }
    // Components with static properties that are extended need wrappers
    // (for static property inheritance). Delegation case is handled later.
    if (extendedBy.has(decl.localName) && componentsWithStaticProps.has(decl.localName)) {
      decl.needsWrapperComponent = true;
    }
    // Exported components must keep a wrapper to preserve the module's public API.
    if (exportedComponents.has(decl.localName)) {
      decl.needsWrapperComponent = true;
    }

    // A skipped extender preserved as `styled(decl.localName)\`...\`` still
    // references `decl.localName` at runtime, so the identifier must remain
    // a callable component — emit a wrapper rather than inlining the decl.
    if (extendedBySkippedDecl(allStyledDecls, decl.localName)) {
      decl.needsWrapperComponent = true;
    }

    if (!hadWrapperBeforePrepass && decl.needsWrapperComponent) {
      wrapperForcedByPrepass.add(decl.localName);
    }

    // Bridge className injection: components referenced by unconverted consumer selectors
    // get a deterministic className so the consumer's `${Component} { ... }` still works.
    // Note: for default imports, the prepass stores "default" as importedName; resolve it
    // to the actual local name by checking which decl is the default export.
    const isBridgeComponent =
      ctx.bridgeComponentNames?.has(decl.localName) ||
      (ctx.bridgeComponentNames?.has("default") &&
        exportedComponents.get(decl.localName)?.isDefault);
    if (isBridgeComponent) {
      const absPath = pathResolve(file.path);
      decl.bridgeClassName = generateBridgeClassName(absPath, decl.localName);
    }
  }

  // styled(Base).attrs({ as: Other }) keeps Base's styled-components class on
  // the rendered Other component. If Base needs a bridge class for unconverted
  // selectors, the attrs wrapper must carry that selector identity too.
  for (const decl of styledDecls) {
    if (decl.base.kind !== "component" || !decl.attrsInfo?.attrsAsTag) {
      continue;
    }
    const baseDecl = declByLocal.get(decl.base.ident);
    if (!baseDecl?.bridgeClassName) {
      continue;
    }
    const inheritedBridgeClass = bridgeClassVarName(baseDecl.localName);
    const alreadyForwarded = (decl.extraClassNames ?? []).some(
      (entry) => entry.expr.type === "Identifier" && entry.expr.name === inheritedBridgeClass,
    );
    if (!alreadyForwarded) {
      decl.extraClassNames = [
        ...(decl.extraClassNames ?? []),
        { expr: j.identifier(inheritedBridgeClass) as ExpressionKind },
      ];
    }
  }

  // Downgrade needsWrapperComponent for intrinsic elements where the wrapper was set only
  // by lowering for unconditional extraStylexPropsArgs (usage:"props" mixins).
  // The inline JSX rewrite path already handles unconditional extraStylexPropsArgs,
  // so the wrapper function is unnecessary for these components.
  // This must happen before the promotion analysis (which bails on needsWrapperComponent).
  for (const decl of styledDecls) {
    if (
      decl.needsWrapperComponent &&
      !wrapperForcedByPrepass.has(decl.localName) &&
      !decl.isCssHelper &&
      !decl.isDirectJsxResolution &&
      decl.base.kind === "intrinsic" &&
      !decl.bridgeClassName &&
      // attrWrapper components (input[type="checkbox"], a[href^="https"], etc.) need
      // specialized wrapper emitters for conditional attribute-based styles.
      !decl.attrWrapper &&
      // Only safe when the wrapper was SOLELY for extraStylexPropsArgs/extraStyleKeys.
      // Any other dynamic feature (prop-dependent styles, variants, theme hooks, etc.)
      // needs the wrapper for prop destructuring and conditional logic.
      (decl.styleFnFromProps ?? []).length === 0 &&
      !decl.needsUseThemeHook?.length &&
      Object.keys(decl.variantStyleKeys ?? {}).length === 0 &&
      !decl.enumVariant &&
      !decl.inlineStyleProps?.length &&
      // attrs-derived runtime props require wrapper evaluation; inline JSX rewrite
      // cannot preserve dynamic semantics for conditional/default/inverted attrs.
      (decl.attrsInfo?.conditionalAttrs?.length ?? 0) === 0 &&
      (decl.attrsInfo?.defaultAttrs?.length ?? 0) === 0 &&
      (decl.attrsInfo?.dynamicAttrs?.length ?? 0) === 0 &&
      (decl.attrsInfo?.invertedBoolAttrs?.length ?? 0) === 0 &&
      // Conditional extraStylexPropsArgs (with `when` guards) are filtered out by the
      // inline path, so they need the wrapper to emit the conditional logic.
      !(decl.extraStylexPropsArgs ?? []).some((arg) => arg.when) &&
      // Must actually have extraStylexPropsArgs, extraStyleKeys, or extraClassNames —
      // otherwise the wrapper was set for some other untracked reason and it's not safe to unset.
      ((decl.extraStylexPropsArgs ?? []).length > 0 ||
        (decl.extraStyleKeys ?? []).length > 0 ||
        (decl.extraClassNames ?? []).length > 0)
    ) {
      decl.needsWrapperComponent = false;
    }
  }

  // Downgrade needsWrapperComponent for intrinsic elements where the wrapper was set
  // only for styleFnFromProps with transient ($-prefixed) props.
  // The inline JSX rewrite path already handles:
  //   1. Consuming styleFnFromProps values from JSX attributes (processAttr)
  //   2. Stripping $-prefixed props on intrinsic elements (transient prop stripping)
  // So the wrapper function is unnecessary — the component can be inlined.
  for (const decl of styledDecls) {
    if (!canDowngradeStyleFnOnlyWrapper(decl, wrapperForcedByPrepass)) {
      continue;
    }
    decl.needsWrapperComponent = false;
  }

  // Helper to check if a component is used in JSX
  const jsxUsageCountCache = new Map<string, number>();
  const relationChildStyleKeys = new Set((ctx.relationOverrides ?? []).map((o) => o.childStyleKey));
  const getJsxUsageCount = (name: string): number => {
    const cached = jsxUsageCountCache.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const usageCount = countComponentJsxUsages(root, j, name);
    jsxUsageCountCache.set(name, usageCount);
    return usageCount;
  };
  const isUsedInJsx = (name: string): boolean => getJsxUsageCount(name) > 0;

  // Helper to determine if a styled(ImportedComponent) wrapper is simple enough to inline.
  // Returns true if there's no complex logic that requires a wrapper function.
  const canInlineImportedComponentWrapper = (decl: StyledDecl): boolean => {
    if (
      decl.base.kind === "component" &&
      wrappedComponentInterfaceFor(ctx, decl.base.ident)?.sxTarget === "inner"
    ) {
      return false;
    }
    if (decl.variantStyleKeys && Object.keys(decl.variantStyleKeys).length > 0) {
      return false;
    }
    if (
      decl.variantDimensions &&
      decl.variantDimensions.length > 0 &&
      !decl.inlinedBaseComponent?.hasInlineJsxVariants
    ) {
      return false;
    }
    // styleFnFromProps CAN be inlined - the JSX rewriter handles extracting
    // prop values and calling the style functions at usage sites.
    if (decl.inlineStyleProps && decl.inlineStyleProps.length > 0) {
      return false;
    }
    // extraStylexPropsArgs with a `when` condition need a wrapper for conditional logic,
    // but unconditional ones can be inlined directly.
    if (decl.extraStylexPropsArgs && decl.extraStylexPropsArgs.some((arg) => arg.when)) {
      return false;
    }
    if (decl.extraStyleKeys && decl.extraStyleKeys.length > 0) {
      return false;
    }
    if (decl.enumVariant) {
      return false;
    }
    if (decl.attrWrapper) {
      return false;
    }
    if (decl.shouldForwardProp) {
      return false;
    }

    if (decl.attrsInfo) {
      if (decl.attrsInfo.conditionalAttrs?.length) {
        return false;
      }
      if (decl.attrsInfo.defaultAttrs?.length) {
        return false;
      }
      if (decl.attrsInfo.dynamicAttrs?.length) {
        return false;
      }
      if (decl.attrsInfo.invertedBoolAttrs?.length) {
        return false;
      }
    }

    return true;
  };

  // Styled components wrapping IMPORTED (non-styled) components that are used in JSX.
  // Simple wrappers can be inlined; complex ones (variants, dynamic styles, attrs logic, etc.)
  // still need wrappers.
  for (const decl of styledDecls) {
    if (decl.isCssHelper) {
      continue;
    }
    if (decl.base.kind === "component") {
      const baseDecl = declByLocal.get(decl.base.ident);
      // Check if the base is an IMPORTED component (not a styled or local component)
      const isImportedComponent = ctx.importMap?.has(decl.base.ident);
      if (!baseDecl && isImportedComponent) {
        const isUsedInJsxElement = isUsedInJsx(decl.localName);
        if (isUsedInJsxElement) {
          // Skip if already marked as needing wrapper (e.g., exported components)
          if (decl.needsWrapperComponent) {
            continue;
          }

          // If this component is extended by another styled component, it must remain
          // as a component (not inlined) so the extending component can delegate to it.
          if (extendedBy.has(decl.localName)) {
            decl.needsWrapperComponent = true;
            continue;
          }

          const isSimple = canInlineImportedComponentWrapper(decl);
          if (!isSimple) {
            decl.needsWrapperComponent = true;
          }
          // Note: other conditions (used as value, className/style in JSX, as prop) are checked later
          // and may still set needsWrapperComponent = true
        }
      }
    }
  }

  // Locally-defined non-styled components wrapped with styled() need wrapper components
  // because we cannot guarantee the base component accepts className/style props.
  for (const decl of styledDecls) {
    if (decl.isCssHelper || decl.needsWrapperComponent) {
      continue;
    }
    if (decl.base.kind !== "component") {
      continue;
    }
    const baseDecl = declByLocal.get(decl.base.ident);
    const isImportedComponent = ctx.importMap?.has(decl.base.ident);
    // If base is neither a styled-component nor an imported component,
    // it's a locally-defined non-styled component — force wrapper,
    // but only if it's declared as a function/class (not a variable assignment)
    if (!baseDecl && !isImportedComponent && isLocalFunctionComponent(root, j, decl.base.ident)) {
      decl.needsWrapperComponent = true;
    }
  }

  // Helper to check if a styled component receives className in JSX usages.
  // If className is passed, it needs to be a wrapper to merge with stylex className.
  // Check if a styled component receives className or style props in JSX callsites.
  // These components need wrapper functions to merge external className/style with stylex output.
  const getJsxAttributeUsage = (
    name: string,
  ): { className: boolean; style: boolean; ref: boolean } => {
    let foundClassName = false;
    let foundStyle = false;
    let foundRef = false;
    const collectFromOpening = (opening: any) => {
      if (foundClassName && foundStyle && foundRef) {
        return;
      }
      for (const a of (opening?.attributes ?? []) as any[]) {
        if (!a) {
          continue;
        }
        if (a.type === "JSXAttribute" && a.name?.type === "JSXIdentifier") {
          if (a.name.name === "className") {
            foundClassName = true;
          }
          if (a.name.name === "style") {
            foundStyle = true;
          }
          if (a.name.name === "ref") {
            foundRef = true;
          }
        }
      }
    };
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name } },
      } as any)
      .forEach((p: any) => collectFromOpening(p.node.openingElement));
    root
      .find(j.JSXSelfClosingElement, {
        name: { type: "JSXIdentifier", name },
      } as any)
      .forEach((p: any) => collectFromOpening(p.node));
    return { className: foundClassName, style: foundStyle, ref: foundRef };
  };
  const isInlineableLocalElementTarget = (targetDecl: StyledDecl): boolean => {
    const { className, style, ref } = getJsxAttributeUsage(targetDecl.localName);
    return (
      targetDecl.base.kind === "intrinsic" &&
      !targetDecl.isExported &&
      !targetDecl.needsWrapperComponent &&
      !className &&
      !style &&
      !ref &&
      !hasSpreadInJsx(root, j, targetDecl.localName)
    );
  };
  const nonJsxComponentValueReferences = (name: string) =>
    root
      .find(j.Identifier, { name })
      .filter((p) => isNonJsxStyledValueReferencePath(p, ctx.styledDefaultImport));
  const hasNonJsxComponentValueReference = (name: string): boolean =>
    nonJsxComponentValueReferences(name).size() > 0;
  const hasOnlyElementTypePropValueReferences = (name: string): boolean => {
    const refs = nonJsxComponentValueReferences(name);
    if (refs.size() === 0) {
      return false;
    }
    let onlyElementTypeProp = true;
    refs.forEach((p: any) => {
      const usage = findContainingJsxAttributeExpression(p);
      const expressionContainer = usage?.expressionContainer;
      const attr = usage?.attr;
      if (
        !isNodeOfType(expressionContainer, "JSXExpressionContainer") ||
        !isNodeOfType(attr, "JSXAttribute") ||
        !isNodeOfType(attr.name, "JSXIdentifier") ||
        typeof attr.name.name !== "string" ||
        !ELEMENT_TYPE_PROP_NAMES.has(attr.name.name)
      ) {
        onlyElementTypeProp = false;
      }
    });
    return onlyElementTypeProp;
  };

  const findContainingJsxAttributeExpression = (
    path: any,
  ): { expressionContainer: unknown; attr: unknown; attrPath: unknown } | null => {
    let current = path.parentPath;
    while (current) {
      const node = current.node;
      if (node?.type === "JSXExpressionContainer") {
        const attrPath = current.parentPath;
        return {
          expressionContainer: node,
          attr: attrPath?.node,
          attrPath,
        };
      }
      if (
        node?.type === "JSXElement" ||
        node?.type === "JSXOpeningElement" ||
        node?.type === "Program"
      ) {
        return null;
      }
      current = current.parentPath;
    }
    return null;
  };

  // The narrow element-type wrapper contract (drop className) is only safe when every host that
  // receives this component via an element-type prop is provably style-only. Otherwise a host that
  // forwards `className` to the slot would have it overwritten by the narrow wrapper, so we keep the
  // broad value wrapper instead.
  const styleOnlyElementTypeHostCache = new Map<string, boolean>();
  const elementTypeHostsAreStyleOnly = (name: string): boolean => {
    const refs = nonJsxComponentValueReferences(name);
    if (refs.size() === 0) {
      return false;
    }
    let allStyleOnly = true;
    refs.forEach((p: any) => {
      const usage = findContainingJsxAttributeExpression(p);
      const openingElement = (usage?.attrPath as { parentPath?: { node?: unknown } } | undefined)
        ?.parentPath?.node;
      if (!isNodeOfType(openingElement, "JSXOpeningElement")) {
        allStyleOnly = false;
        return;
      }
      const hostName = getRootJsxIdentifierName(openingElement.name);
      if (!hostName) {
        allStyleOnly = false;
        return;
      }
      let styleOnly = styleOnlyElementTypeHostCache.get(hostName);
      if (styleOnly === undefined) {
        styleOnly = isStyleOnlyElementTypeHost({
          j,
          root,
          hostName,
          elementTypePropNames: ELEMENT_TYPE_PROP_NAMES,
        });
        styleOnlyElementTypeHostCache.set(hostName, styleOnly);
      }
      if (!styleOnly) {
        allStyleOnly = false;
      }
    });
    return allStyleOnly;
  };

  // Adjacent sibling (`& + &`) can only be preserved when every same-file JSX usage
  // is statically enumerable, each usage site stays on the inline JSX rewrite path,
  // and no caller-supplied merge/ref behavior requires a wrapper component.
  for (const decl of styledDecls) {
    if (!decl.adjacentSiblingStyleKey) {
      continue;
    }

    const { className, style, ref } = getJsxAttributeUsage(decl.localName);
    const adjacentSupported =
      decl.base.kind === "intrinsic" &&
      !decl.isExported &&
      !decl.needsWrapperComponent &&
      !className &&
      !style &&
      !ref &&
      !hasSpreadInJsx(root, j, decl.localName) &&
      hasOnlyProvableAdjacentSiblingUsages(root, j, decl.localName);

    if (adjacentSupported) {
      continue;
    }

    if (ctx.resolvedStyleObjects) {
      ctx.resolvedStyleObjects.delete(decl.adjacentSiblingStyleKey);
    }
    decl.adjacentSiblingStyleKey = undefined;
    ctx.warnings.push({
      severity: "warning",
      type: "Unsupported selector: adjacent sibling combinator",
      loc: decl.adjacentSiblingLoc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  const reservedStyleKeys = collectReservedStyleKeys(
    ctx.resolvedStyleObjects ?? new Map(),
    styledDecls,
  );
  const usedLocalElementStyleKeys = new Set<string>();
  const localElementTargetStyleKeys = new Set<string>();
  const localElementProofs = new Map<
    string,
    {
      proof: LocalElementProofResult;
      unsupportedReason: "none" | "dynamic" | "exported-parent" | LocalElementProofReason;
    }
  >();

  for (const decl of styledDecls) {
    if (!decl.localElementOverrides?.length) {
      continue;
    }

    const { className, style, ref } = getJsxAttributeUsage(decl.localName);
    const proof = proveLocalElementOverrideUsages(
      root,
      j,
      decl.localName,
      decl.localElementOverrides,
      declByLocal,
    );
    const unsupportedReason = decl.isExported
      ? "exported-parent"
      : decl.base.kind !== "intrinsic" ||
          decl.needsWrapperComponent ||
          className ||
          style ||
          ref ||
          extendedBy.has(decl.localName) ||
          hasNonJsxComponentValueReference(decl.localName) ||
          hasSpreadInJsx(root, j, decl.localName)
        ? "dynamic"
        : proof.safe
          ? "none"
          : proof.reason;
    localElementProofs.set(decl.localName, { proof, unsupportedReason });
  }

  // Pre-analyze inline style props at JSX call sites to determine if static values
  // can be promoted or dynamic caller styles can be preserved while inlining.
  analyzePromotableStyleProps(
    root,
    j,
    styledDecls,
    allStyledDecls,
    declByLocal,
    getJsxUsageCount,
    ctx.resolvedStyleObjects ?? new Map(),
  );
  for (const decl of styledDecls) {
    for (const entry of decl.promotedStyleProps ?? []) {
      if (!entry.mergeIntoBase) {
        reservedStyleKeys.add(entry.styleKey);
      }
    }
  }

  // Styled components that receive className/style props in JSX need wrappers to merge them.
  // Without a wrapper, passing `className` would replace the stylex className instead of merging.
  // Exception: single-use intrinsic components can be inlined with adapter merge handling instead.
  // Exception: components with all promotable style props (no className) can be inlined.
  // Components with static inline fallback styles also stay inline for a single callsite so
  // the JSX rewriter can attach the generated style object directly.
  // Also track which components receive className/style in JSX for merger import determination.
  for (const decl of styledDecls) {
    if (decl.isDirectJsxResolution) {
      continue;
    }
    const { className, style } = getJsxAttributeUsage(decl.localName);
    if (className || style) {
      decl.receivesClassNameOrStyleInJsx = true;
      // Style props promoted to stylex.create entries, or dynamic style props
      // preserved on intrinsic JSX, don't need a wrapper.
      if (!className && (decl.promotedStyleProps?.length || decl.preserveInlineStyleProps)) {
        continue;
      }
      if (
        decl.base.kind === "intrinsic" &&
        !decl.needsWrapperComponent &&
        getJsxUsageCount(decl.localName) <= INLINE_USAGE_THRESHOLD
      ) {
        continue;
      }
      if (!decl.needsWrapperComponent) {
        decl.needsWrapperComponent = true;
      }
    }
  }

  for (const decl of styledDecls) {
    if (!decl.localElementOverrides?.length) {
      continue;
    }

    const proofInfo = localElementProofs.get(decl.localName);
    if (!proofInfo) {
      continue;
    }

    const localElementUnsupportedReason = proofInfo.unsupportedReason;
    if (localElementUnsupportedReason !== "none") {
      for (const override of decl.localElementOverrides) {
        ctx.warnings.push({
          severity: "warning",
          type: getLocalElementWarningType(
            override,
            localElementUnsupportedReason as LocalElementProofReason,
          ),
          loc: override.loc,
        });
      }
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }

    const nextOverrides: LocalElementOverrideCandidate[] = [];
    for (const override of decl.localElementOverrides) {
      const targetIds =
        proofInfo.proof.targetsByStyleKey.get(override.styleKey) ?? new Set<string>();
      const styleKeysByTargetId: Record<string, string> = {};
      for (const targetId of [...targetIds].sort()) {
        if (hasOverlappingPseudoOnlyLocalOverride(nextOverrides, override, targetId)) {
          ctx.warnings.push({
            severity: "warning",
            type: "Unsupported selector: ambiguous element selector",
            loc: override.loc,
          });
          return returnResult({ code: null, warnings: ctx.warnings }, "bail");
        }
        const targetDecl = targetId.startsWith("styled:")
          ? declByLocal.get(targetId.slice("styled:".length))
          : undefined;
        if (targetDecl) {
          const childInlineable = isInlineableLocalElementTarget(targetDecl);
          if (!childInlineable) {
            ctx.warnings.push({
              severity: "warning",
              type: "Unsupported selector: ambiguous element selector",
              loc: override.loc,
            });
            return returnResult({ code: null, warnings: ctx.warnings }, "bail");
          }
          if (
            hasPseudoLocalElementOverride(override) &&
            hasRuntimeStyleEntriesForLocalElementTarget(targetDecl)
          ) {
            ctx.warnings.push({
              severity: "warning",
              type: "Unsupported selector: ambiguous element selector",
              loc: override.loc,
            });
            return returnResult({ code: null, warnings: ctx.warnings }, "bail");
          }
          targetDecl.localElementTargetProofs ??= [];
          targetDecl.localElementTargetProofs.push({
            targetId,
            wasInlineableAtProofTime: childInlineable,
            loc: override.loc,
          });
          localElementTargetStyleKeys.add(targetDecl.styleKey);
        }

        const emittedStyleKey = ensureUniqueKey(
          makeLocalElementTargetStyleKey(override, targetId),
          usedLocalElementStyleKeys,
          reservedStyleKeys,
        );
        usedLocalElementStyleKeys.add(emittedStyleKey);
        reservedStyleKeys.add(emittedStyleKey);
        styleKeysByTargetId[targetId] = emittedStyleKey;

        const resolvedStyleObjects = ctx.resolvedStyleObjects;
        const priorLocalOverrideStyleObjects = resolvedStyleObjects
          ? nextOverrides
              .slice()
              .reverse()
              .map((priorOverride) => priorOverride.styleKeysByTargetId?.[targetId])
              .filter((key): key is string => !!key)
              .map((key) => resolvedStyleObjects.get(key))
              .flatMap(getPlainStyleObjectsFromResolvedValue)
          : [];
        const childStyleObjects = [
          ...priorLocalOverrideStyleObjects,
          ...(targetDecl && resolvedStyleObjects
            ? buildResolvedStyleObjectList(targetDecl, resolvedStyleObjects)
            : []),
        ];
        const props = buildLocalElementOverrideProperties({
          j,
          override,
          childStyleObjects,
        });
        if (props.length > 0) {
          ctx.resolvedStyleObjects?.set(emittedStyleKey, j.objectExpression(props));
        }
      }

      nextOverrides.push({ ...override, styleKeysByTargetId });
      if (override.ancestorPseudo) {
        ctx.ancestorSelectorParents ??= new Set<string>();
        ctx.ancestorSelectorParents.add(decl.styleKey);
        ctx.parentsNeedingDefaultMarker ??= new Set<string>();
        ctx.parentsNeedingDefaultMarker.add(decl.styleKey);
      }
    }

    decl.localElementOverrides = nextOverrides;
  }

  // Preserve locally reusable intrinsic components by emitting wrappers when used more than once.
  // Skip ref callsites: generated wrappers are plain functions (not forwardRef), so forcing
  // a wrapper would swallow `ref` and change behavior versus inline DOM output.
  for (const decl of styledDecls) {
    if (decl.isCssHelper || decl.needsWrapperComponent) {
      continue;
    }
    if (decl.isDirectJsxResolution) {
      continue;
    }
    if (decl.base.kind !== "intrinsic") {
      continue;
    }
    // Relation overrides (`Parent > Child`, `${Parent} &`, etc.) and same-file local
    // element overrides are attached at callsites. Keep these children inlined so
    // post-process can inject override style keys conditionally.
    if (
      relationChildStyleKeys.has(decl.styleKey) ||
      localElementTargetStyleKeys.has(decl.styleKey)
    ) {
      continue;
    }
    // When every call site is handled directly (via promoted style props or
    // preserved inline style props), a wrapper would be unused. If only a subset
    // is handled directly, keep the wrapper for the remaining reusable call sites.
    const usageCount = getJsxUsageCount(decl.localName);
    const directlyHandledStylePropCount =
      (decl.promotedStyleProps?.length ?? 0) + (decl.preservedInlineStylePropCount ?? 0);
    if (directlyHandledStylePropCount > 0 && directlyHandledStylePropCount >= usageCount) {
      continue;
    }
    const { ref } = getJsxAttributeUsage(decl.localName);
    if (ref) {
      continue;
    }
    if (decl.adjacentSiblingStyleKey) {
      continue;
    }
    if (usageCount > INLINE_USAGE_THRESHOLD) {
      decl.needsWrapperComponent = true;
    }
  }

  const hasSpreadInJsxLocal = (name: string): boolean => hasSpreadInJsx(root, j, name);

  // Components with styleFnFromProps that have spread attributes in JSX need wrappers.
  // The JSX rewriter can only extract styleFn prop values from explicit attributes,
  // not from spreads like `<StyledComp {...props} />`.
  for (const decl of styledDecls) {
    if (decl.needsWrapperComponent) {
      continue;
    }
    if (decl.styleFnFromProps && decl.styleFnFromProps.length > 0) {
      if (hasSpreadInJsxLocal(decl.localName)) {
        decl.needsWrapperComponent = true;
      }
    }
  }

  // Styled components used with JSX spread attributes need wrappers.
  // Spreads may contain className/style from callers; without a wrapper, the
  // inline stylex.props() placed after the spread would clobber those values.
  for (const decl of styledDecls) {
    if (decl.needsWrapperComponent || decl.isCssHelper) {
      continue;
    }
    if (decl.isDirectJsxResolution) {
      continue;
    }
    if (hasSpreadInJsxLocal(decl.localName)) {
      decl.needsWrapperComponent = true;
    }
  }

  // Determine supportsExternalStyles and supportsAsProp for each decl
  // (before emitStylesAndImports for merger import and wrapper generation)
  for (const decl of styledDecls) {
    applyTypeScriptMetadata(ctx, decl, exportedComponents.get(decl.localName)?.exportName);

    // 1. If extended by another styled component in this file -> enable external styles
    //    Leave supportsAsProp unset (undefined) so the emitter can auto-derive `as`
    //    support for intrinsic-based components.
    if (extendedBy.has(decl.localName)) {
      decl.supportsExternalStyles = true;
      // Same-file extensions: conservative — the extending component may pass any props
      decl.consumerUsesClassName = true;
      decl.consumerUsesStyle = true;
      decl.consumerUsesElementProps = true;
      decl.consumerUsesSpread = true;
      continue;
    }

    // 2. If NOT exported -> disable both
    const exportInfo = exportedComponents.get(decl.localName);
    if (!exportInfo) {
      decl.supportsExternalStyles = false;
      decl.supportsAsProp = false;
      continue;
    }

    // 3. If exported, ask adapter for external interface configuration
    const extResult = adapter.externalInterface({
      filePath: file.path,
      componentName: decl.localName,
      exportName: exportInfo.exportName,
      isDefaultExport: exportInfo.isDefault,
    });
    decl.supportsExternalStyles = extResult.styles;
    decl.supportsAsProp = extResult.as || typedComponentHasProp(decl, "as");
    decl.supportsRefProp = extResult.ref || typedComponentHasProp(decl, "ref");
    decl.consumerUsesClassName =
      extResult.className ?? typeAwareExternalStyleFallback(extResult.styles);
    decl.consumerUsesStyle = extResult.style ?? typeAwareExternalStyleFallback(extResult.styles);
    decl.consumerUsesElementProps = extResult.elementProps ?? extResult.styles;
    decl.consumerUsesSpread = extResult.spreadProps ?? extResult.styles;
  }

  // Rename transient ($-prefixed) props for all styled components.
  // The $ prefix is a styled-components convention for transient props that should not be
  // forwarded to the DOM. In StyleX output, these are plain React component props where
  // the $ prefix is unnecessary and inconsistent with StyleX conventions.
  // For exported components, cross-file consumer patching is also emitted.
  const resolverImportNames = collectResolverImportNames(ctx);
  for (const decl of styledDecls) {
    const transientProps = collectDeclPropNames(root, j, decl, (n) => n.startsWith("$"));
    if (transientProps.size === 0) {
      // Even if this wrapper has no $-prefixed props in its own styling data,
      // inherit transient prop renames from the base component so that the emitter
      // correctly renames the type, destructuring, and JSX call sites.
      if (decl.base.kind === "component") {
        const baseIdent = decl.base.ident;
        const baseDecl = styledDecls.find((d) => d.localName === baseIdent);
        if (baseDecl?.transientPropRenames && baseDecl.transientPropRenames.size > 0) {
          decl.transientPropRenames = new Map(baseDecl.transientPropRenames);
          decl.transientPropRenamesInherited = true;
          applyTransientPropRenames(decl, decl.transientPropRenames);
          // Note: we intentionally do NOT set transientOmitFromBase here because
          // the base component's type has already been renamed ($prop → prop).
          // The Omit+remap approach only works when the base type still has the
          // $-prefixed prop name. Since it was already renamed, the base type
          // natively includes the renamed prop — no Omit+remap needed.

          // Emit cross-file consumer patching info for inherited renames
          emitTransientPropRenameWarning(ctx, decl, decl.transientPropRenames, exportedComponents);

          // Rename in the wrapper's own propsType if it has one
          if (decl.propsType) {
            walkTypePropNames(decl.propsType, (name, keyNode) => {
              const renamed = decl.transientPropRenames!.get(name);
              if (renamed) {
                keyNode.name = renamed;
              }
            });
            renameTransientPropsInReferencedTypes(
              root,
              j,
              decl.propsType as
                | {
                    type?: string;
                    typeName?: { type?: string; name?: string };
                    types?: unknown[];
                  }
                | undefined,
              decl.transientPropRenames,
              getDeclAncestorNamespaceChain(root, j, decl.localName),
            );
          }
        }
      }
      continue;
    }
    const existingPropNames = collectDeclPropNames(root, j, decl, (n) => !n.startsWith("$"));
    existingPropNames.add("className").add("style").add("children").add("ref").add("key").add("as");
    // Also check the base component's props for collisions (e.g., Base has `color`,
    // wrapper has `$color` — renaming to `color` would collide).
    if (decl.base.kind === "component") {
      collectBaseComponentPropNames(root, j, decl.base.ident, existingPropNames);
    }
    // For intrinsic elements, block renames that would collide with HTML attributes
    // the emitter explicitly forwards to the DOM (e.g., disabled on <button>).
    if (decl.base.kind === "intrinsic") {
      for (const attr of BLOCKED_INTRINSIC_ATTR_RENAMES[decl.base.tagName] ?? []) {
        existingPropNames.add(attr);
      }
    }
    // Block renames where the stripped name already appears as a JSX attribute at
    // a call site (e.g., <Input size={5} $size="lg" /> — renaming $size → size
    // would create duplicate attributes). When a call site uses spread attributes,
    // only allow renames for $-prefixed props that are explicitly passed at ALL
    // spread-containing sites (explicit attrs override spread values, so the rename
    // is safe).
    const { hasSpread, explicitTransientAtSpreadSites } = collectCallSiteAttrNames(
      root,
      j,
      decl.localName,
      existingPropNames,
    );
    const renames = new Map<string, string>();
    for (const prop of transientProps) {
      const stripped = prop.slice(1);
      if (existingPropNames.has(stripped)) {
        continue;
      }
      // When spreads exist, only rename props explicitly passed at all spread sites
      if (hasSpread && !explicitTransientAtSpreadSites?.has(prop)) {
        continue;
      }
      renames.set(prop, stripped);
    }
    if (renames.size > 0) {
      const declNamespaceName = getDeclNamespaceName(root, j, decl.localName);
      // Don't rename props when the propsType references a named type (interface
      // or type alias) that is used elsewhere in the file — mutating the shared
      // declaration would break non-styled code that also references it.
      // Also skip when the type is imported (not locally defined) since we can't
      // modify the external type declaration.
      const referencedTypeNames = collectReferencedTypeNames(decl.propsType);
      if (
        referencedTypeNames.some(
          (name) =>
            isTypeNameUsedElsewhere(root, j, name, decl.localName, declNamespaceName) ||
            !isTypeLocallyDefined(root, j, name),
        )
      ) {
        continue;
      }
      // Skip renaming individual props whose $-prefixed name also exists as a
      // module-scope binding (e.g., import { $colors } from "...") or a
      // resolver-generated import (e.g., theme token variables), since
      // renameIdentifiersInAst cannot distinguish prop references from other bindings.
      const propsToSkip: string[] = [];
      for (const prop of renames.keys()) {
        const hasDollarModuleBinding =
          isModuleScopeBinding(root, j, prop, decl.localName) || resolverImportNames.has(prop);
        if (
          hasDollarModuleBinding &&
          (!transientRenameHasNormalizedPropUsage(decl, prop) ||
            transientRenameWouldTouchExpressionIdentifier(decl, prop) ||
            transientRenameWouldTouchResolvedStyleObject(decl, prop, ctx.resolvedStyleObjects))
        ) {
          propsToSkip.push(prop);
        }
      }
      for (const prop of propsToSkip) {
        renames.delete(prop);
      }
      if (renames.size === 0) {
        continue;
      }
      decl.transientPropRenames = renames;
      // Determine which $-prefixed props actually exist in the base component's type.
      // Only those need Omit+remap in the wrapper type to avoid type conflicts.
      if (decl.base.kind === "component") {
        const baseTransientProps = new Set<string>();
        collectBaseComponentPropNames(root, j, decl.base.ident, baseTransientProps, (n) =>
          n.startsWith("$"),
        );
        const omitFromBase = new Set<string>();
        for (const original of renames.keys()) {
          if (baseTransientProps.has(original)) {
            omitFromBase.add(original);
          }
        }
        if (omitFromBase.size > 0) {
          decl.transientOmitFromBase = omitFromBase;
        }
      }
      applyTransientPropRenames(decl, renames);
      renameTransientPropsInReferencedTypes(
        root,
        j,
        decl.propsType as
          | {
              type?: string;
              typeName?: { type?: string; name?: string };
              types?: unknown[];
            }
          | undefined,
        renames,
        getDeclAncestorNamespaceChain(root, j, decl.localName),
      );
      // Also rename in resolvedStyleObjects (style function bodies may reference $-prefixed props)
      const resolvedStyleObjects = ctx.resolvedStyleObjects;
      if (resolvedStyleObjects) {
        const styleKeys = collectAllStyleKeysForDecl(decl);
        for (const key of styleKeys) {
          const value = resolvedStyleObjects.get(key);
          if (value && typeof value === "object") {
            renameIdentifiersInAst(value, renames);
          }
        }
      }
      // For exported components, emit cross-file consumer patching info and warnings
      emitTransientPropRenameWarning(ctx, decl, renames, exportedComponents);
    }
  }

  // When multiple styled components share a type declaration and one component's
  // rename was applied to the shared type but another component was skipped (e.g.,
  // due to call-site spreads), the skipped component's styling data still has
  // $-prefixed prop names while the type now has renamed names. Detect this
  // inconsistency and apply the same renames to the styling data.
  for (const decl of styledDecls) {
    if (decl.transientPropRenames) {
      continue;
    }
    const transientProps = collectDeclPropNames(root, j, decl, (n) => n.startsWith("$"));
    if (transientProps.size === 0) {
      continue;
    }
    // Collect prop names from the resolved type (may be a TSTypeReference). Walk the
    // decl's full namespace chain (innermost to outermost) so namespace-local shared
    // types and types declared in enclosing namespaces resolve to the closest
    // declaration, matching how TS would resolve the reference.
    const typePropNames = collectResolvedTypePropNames(
      root,
      j,
      decl.propsType,
      getDeclAncestorNamespaceChain(root, j, decl.localName),
    );
    if (typePropNames.size === 0) {
      continue;
    }
    const inheritedRenames = new Map<string, string>();
    for (const prop of transientProps) {
      const stripped = prop.slice(1);
      // The type has the renamed name but not the original $-prefixed name —
      // another component sharing this type already applied the rename.
      if (typePropNames.has(stripped) && !typePropNames.has(prop)) {
        inheritedRenames.set(prop, stripped);
      }
    }
    if (inheritedRenames.size > 0) {
      decl.transientPropRenames = inheritedRenames;
      applyTransientPropRenames(decl, inheritedRenames);
      emitTransientPropRenameWarning(ctx, decl, inheritedRenames, exportedComponents);
    }
  }

  // Early detection of components used as values (before emitStylesAndImports for merger import)
  // Components passed as props (e.g., <Component elementType={StyledDiv} />) need className/style merging
  for (const decl of styledDecls) {
    if (canInlinePrivateMemberBaseJsx(decl)) {
      decl.isDirectJsxResolution = true;
      decl.needsWrapperComponent = false;
      continue;
    }
    if (decl.isDirectJsxResolution) {
      continue;
    }
    const usedAsValue = hasNonJsxComponentValueReference(decl.localName);

    if (usedAsValue) {
      decl.usedAsValue = true;
      if (
        hasOnlyElementTypePropValueReferences(decl.localName) &&
        elementTypeHostsAreStyleOnly(decl.localName)
      ) {
        decl.valueUsageKind = "elementTypeProp";
        if (!exportedComponents.has(decl.localName)) {
          decl.supportsExternalStyles = false;
          decl.consumerUsesClassName = false;
          decl.consumerUsesStyle = false;
          decl.consumerUsesElementProps = false;
          decl.consumerUsesSpread = false;
        }
      }
      decl.needsWrapperComponent = true;
    }
  }

  // A private `styled(Foo.Bar)` (member-expression base) rendered at a single JSX site can be
  // inlined directly, dropping the wrapper entirely. That is only safe when the component exposes
  // no external surface (preconditions below) and carries no prop-driven styling at all — both the
  // cases the imported-component inline path rejects and the dynamic ones it would otherwise push
  // into the JSX rewriter.
  function canInlinePrivateMemberBaseJsx(decl: StyledDecl): boolean {
    if (
      decl.base.kind !== "component" ||
      !decl.base.ident.includes(".") ||
      decl.isExported ||
      exportedComponents.has(decl.localName) ||
      decl.propsType ||
      decl.attrsInfo ||
      // `decl.usedAsValue` is computed later in this loop, so check value references directly here:
      // a binding rendered once in JSX but also passed as a value must keep its wrapper.
      decl.usedAsValue ||
      hasNonJsxComponentValueReference(decl.localName) ||
      decl.supportsExternalStyles ||
      decl.supportsAsProp ||
      decl.supportsRefProp ||
      decl.consumerUsesSpread ||
      decl.consumerUsesClassName ||
      decl.consumerUsesStyle ||
      decl.consumerUsesElementProps ||
      decl.isCssHelper ||
      decl.rules.some((rule) => rule.selector.trim() !== "&")
    ) {
      return false;
    }
    if (!canInlineImportedComponentWrapper(decl) || hasDynamicPropStyling(decl)) {
      return false;
    }
    return getJsxUsageCount(decl.localName) === 1;
  }

  // Prop-driven styling that the imported-component inline path tolerates (it can defer dynamic
  // work to the JSX rewriter) but full member-base inlining cannot, since there is no wrapper left
  // to host it.
  function hasDynamicPropStyling(decl: StyledDecl): boolean {
    return !!(
      (decl.styleFnFromProps?.length ?? 0) > 0 ||
      (decl.variantDimensions?.length ?? 0) > 0 ||
      (decl.compoundVariants?.length ?? 0) > 0 ||
      (decl.transientPropRenames?.size ?? 0) > 0 ||
      (decl.observedExpressionConditionDropProps?.size ?? 0) > 0 ||
      (decl.styleValueVariantProps?.size ?? 0) > 0
    );
  }

  const jsxNamespaceRoots = new Set<string>();
  root.find(j.JSXMemberExpression).forEach((p) => {
    const rootName = getRootJsxIdentifierName(p.node);
    if (rootName) {
      jsxNamespaceRoots.add(rootName);
    }
  });

  // Styled components referenced only via JSX namespaces (e.g., <Styled.Option />)
  // still need wrappers so the namespace binding remains in the output.
  if (jsxNamespaceRoots.size > 0) {
    for (const decl of styledDecls) {
      if (decl.isCssHelper || decl.isDirectJsxResolution) {
        continue;
      }
      if (jsxNamespaceRoots.has(decl.localName)) {
        decl.needsWrapperComponent = true;
      }
    }
  }

  // Ensure base components get wrappers when a derived component delegates to them.
  // Run this AFTER all needsWrapperComponent signals (exports, className/style usage, usedAsValue, etc.)
  // so delegation doesn't reference a base that was inlined/removed.
  propagateDelegationWrapperRequirements({ root, j, styledDecls, declByLocal });

  // Detection of polymorphic intrinsic wrappers (before emitStylesAndImports for merger import)
  // These are intrinsic styled components (styled.tag) used with as={} in JSX OR whose props type
  // includes polymorphic `as` (either `as?: React.ElementType` or `as?: C` where C extends React.ElementType).
  // They pass style through directly instead of merging.
  for (const decl of styledDecls) {
    if (decl.base.kind === "intrinsic") {
      // Check for as/forwardedAs usage in JSX
      const el = root.find(j.JSXElement, {
        openingElement: {
          name: { type: "JSXIdentifier", name: decl.localName },
        },
      });
      const hasAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } }).size() > 0;
      const hasForwardedAs =
        el
          .find(j.JSXAttribute, {
            name: { type: "JSXIdentifier", name: "forwardedAs" },
          })
          .size() > 0;
      // Also check if props type contains polymorphic `as`
      const propsTypeHasAs =
        decl.propsType && typeContainsPolymorphicAs({ root, j, typeNode: decl.propsType });
      if (hasAs || hasForwardedAs || propsTypeHasAs) {
        decl.isPolymorphicIntrinsicWrapper = true;
      }
    }
  }

  for (const decl of styledDecls) {
    if (!decl.localElementTargetProofs?.length) {
      continue;
    }
    const isInlineableNow = isInlineableLocalElementTarget(decl);
    const becameUnsafeAfterProof =
      decl.localElementTargetProofs.some((proof) => proof.wasInlineableAtProofTime) &&
      !isInlineableNow;
    if (becameUnsafeAfterProof) {
      ctx.warnings.push({
        severity: "warning",
        type: "Unsupported selector: ambiguous element selector",
        loc: decl.localElementTargetProofs.find((proof) => proof.wasInlineableAtProofTime)?.loc,
      });
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
  }

  // If adapter imports collide with existing local bindings, alias the adapter imports
  // and rewrite references inside stylex.create objects to use the alias.
  const isUsedOutsideStyledTemplates = (localName: string): boolean =>
    root
      .find(j.Identifier, { name: localName } as any)
      .filter((p: any) => {
        if (j(p).closest(j.ImportDeclaration).size() > 0) {
          return false;
        }
        const tagged = j(p)
          .closest(j.TaggedTemplateExpression)
          .filter((tp: any) => ctx.isStyledTag(tp.node.tag));
        if (tagged.size() > 0) {
          return false;
        }
        return true;
      })
      .size() > 0;

  const existingImportLocals = new Set<string>();
  root.find(j.ImportDeclaration).forEach((p: any) => {
    const specs = (p.node.specifiers ?? []) as any[];
    for (const s of specs) {
      if (s?.importKind === "type") {
        continue;
      }
      const local =
        s?.local?.type === "Identifier"
          ? s.local.name
          : s?.type === "ImportDefaultSpecifier" && s.local?.type === "Identifier"
            ? s.local.name
            : s?.type === "ImportNamespaceSpecifier" && s.local?.type === "Identifier"
              ? s.local.name
              : null;
      if (local && isUsedOutsideStyledTemplates(local)) {
        existingImportLocals.add(local);
      }
    }
  });

  const resolverImportAliases = new Map<string, string>();
  const usedLocals = new Set(existingImportLocals);
  const makeUniqueLocal = (base: string): string => {
    let candidate = base;
    let i = 1;
    while (usedLocals.has(candidate)) {
      candidate = `${base}${i}`;
      i += 1;
    }
    usedLocals.add(candidate);
    return candidate;
  };

  for (const imp of ctx.resolverImports.values()) {
    for (const n of imp.names ?? []) {
      const desired = n.local ?? n.imported;
      if (!desired) {
        continue;
      }
      if (existingImportLocals.has(desired)) {
        const alias = makeUniqueLocal(`${desired}Vars`);
        resolverImportAliases.set(desired, alias);
        n.local = alias;
      } else {
        usedLocals.add(desired);
      }
    }
  }

  ctx.resolverImportAliases = resolverImportAliases;

  // Detect if any styled component is used in JSX at module level (not inside a function).
  // This causes TDZ issues if styles are placed at the end of the file, so we hoist them.
  const isUsedAtModuleLevel = (): boolean => {
    const styledNames = new Set(styledDecls.map((d) => d.localName));
    let foundModuleLevelUsage = false;

    // Helper to check if a path is inside a function-like scope
    const isInsideFunctionScope = (p: any): boolean => {
      let cur = p.parentPath;
      while (cur) {
        const node = cur.node;
        if (isFunctionNode(node) || node?.type === "MethodDefinition") {
          return true;
        }
        cur = cur.parentPath;
      }
      return false;
    };

    // Check JSX elements (opening tags)
    root.find(j.JSXElement).forEach((p: any) => {
      if (foundModuleLevelUsage) {
        return;
      }
      const openingName = p.node.openingElement?.name;
      if (openingName?.type === "JSXIdentifier" && styledNames.has(openingName.name)) {
        if (!isInsideFunctionScope(p)) {
          foundModuleLevelUsage = true;
        }
      }
    });

    // Check self-closing JSX elements
    root.find(j.JSXSelfClosingElement).forEach((p: any) => {
      if (foundModuleLevelUsage) {
        return;
      }
      const name = p.node.name;
      if (name?.type === "JSXIdentifier" && styledNames.has(name.name)) {
        if (!isInsideFunctionScope(p)) {
          foundModuleLevelUsage = true;
        }
      }
    });

    return foundModuleLevelUsage;
  };

  // If any styled component is used at module level, hoist styles to avoid TDZ errors.
  if (!ctx.stylesInsertPosition && isUsedAtModuleLevel()) {
    ctx.stylesInsertPosition = "afterImports";
  }

  // Inject staticBooleanVariants into resolvedStyleObjects and variantStyleKeys.
  // This must run after lowerRulesStep (which populates resolvedStyleObjects) and
  // before emitStylesStep (which reads resolvedStyleObjects to emit stylex.create).
  if (ctx.resolvedStyleObjects) {
    for (const decl of styledDecls) {
      if (decl.staticBooleanVariants?.length) {
        for (const { propName, variantKey, styleKey, styles } of decl.staticBooleanVariants) {
          ctx.resolvedStyleObjects.set(styleKey, styles);
          if (!decl.variantStyleKeys) {
            decl.variantStyleKeys = {};
          }
          // Non-boolean single-key variants use equality syntax so the emitter
          // generates `prop === "value"` instead of a truthy guard.
          const whenKey = variantKey != null ? `${propName} === "${variantKey}"` : propName;
          decl.variantStyleKeys[whenKey] = styleKey;
        }
      }
      if (decl.callSiteCombinedStyles?.length) {
        for (const { styleKey, styles } of decl.callSiteCombinedStyles) {
          ctx.resolvedStyleObjects.set(styleKey, styles);
        }
      }
      // Inject promoted style props into resolvedStyleObjects.
      if (decl.promotedStyleProps?.length) {
        for (const entry of decl.promotedStyleProps) {
          if (entry.mergeIntoBase) {
            if (isAstNode(entry.styleValue)) {
              // Dynamic merge: replace the base entry with the arrow function.
              ctx.resolvedStyleObjects.set(decl.styleKey, entry.styleValue);
            } else {
              // Static merge: merge properties into the component's existing style object.
              const existing = ctx.resolvedStyleObjects.get(decl.styleKey);
              if (existing && typeof existing === "object" && !isAstNode(existing)) {
                mergePromotedStaticStyleObject(
                  existing as Record<string, unknown>,
                  entry.styleValue,
                );
              }
            }
          } else {
            ctx.resolvedStyleObjects.set(entry.styleKey, entry.styleValue);
          }
        }
      }
    }
  }

  if (!validateSxRestrictedWrappedComponentStyles(ctx, styledDecls)) {
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }
  if (!validateWrappedComponentStyleChannels(ctx, styledDecls)) {
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }
  if (guardGeneratedConditionalDefaults(ctx, styledDecls) === "bail") {
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }
  if (guardForwardedSxConditionalDefaults(ctx, styledDecls) === "bail") {
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  // Partial-migration support: if the file already has exactly one top-level
  // `const <name> = stylex.create({...})` call with no collisions and no shadowing,
  // merge new entries into the existing object instead of emitting a second
  // `stylexStyles` declaration. Deferred to here so every emit-time style key
  // (incl. staticBooleanVariants, callSiteCombinedStyles, promotedStyleProps) is
  // in `resolvedStyleObjects` when we check for collisions.
  const emitKeyNames = buildEmitKeyNames(ctx, styledDecls);
  const existingStylexTarget = findExistingStylexStylesTarget({
    ctx,
    styledDeclNames,
    emitKeyNames,
  });
  ctx.existingStylexStylesTarget = existingStylexTarget;
  const hasStylesVariable =
    !existingStylexTarget && fileHasLocalName(ctx, "styles", styledDeclNames);
  ctx.stylesIdentifier = existingStylexTarget
    ? existingStylexTarget.name
    : hasStylesVariable
      ? "stylexStyles"
      : "styles";

  return CONTINUE;
}
