/**
 * Step: analyze declarations before emitting styles and wrappers.
 * Core concepts: wrapper decisions, export mapping, and styles identifier selection.
 */
import type { JSCodeshift } from "jscodeshift";
import { resolve as pathResolve } from "node:path";
import { collectExportedComponents } from "../analyze-before-emit/exported-components.js";
import {
  CONTINUE,
  getActiveStyledDecls,
  returnResult,
  type StepResult,
} from "../transform-types.js";
import type {
  LocalElementOverrideCandidate,
  LocalElementOverrideRelation,
  StyledDecl,
} from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import {
  countComponentJsxUsages,
  hasInlineableStyleFnOnly,
  hasSpreadInJsx,
  needsShouldForwardPropWrapper,
  propagateDelegationWrapperRequirements,
} from "../utilities/delegation-utils.js";
import { bridgeClassVarName, generateBridgeClassName } from "../utilities/bridge-classname.js";
import { isStyleOnlyElementTypeHost } from "../utilities/element-type-host.js";
import { isNonJsxStyledValueReferencePath } from "../utilities/component-value-references.js";
import {
  astNodesEqual,
  type ExpressionKind,
  getRootJsxIdentifierName,
  isAstNode,
  isConditionalExpressionNode,
  isFunctionNode,
  isNodeOfType,
  isPureIdempotentExpression,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";
import {
  camelToKebabCase,
  escapeRegex,
  isSingleBackgroundComponent,
  isValidIdentifierName,
} from "../utilities/string-utils.js";
import { jsxNameTargetsLocalBinding } from "../utilities/jsx-name-utils.js";
import {
  cssDeclarationToStylexDeclarations,
  isStylexStringOnlyCssProp,
} from "../css-prop-mapping.js";
import type { PromotedStyleEntry } from "../transform-types.js";
import {
  applyTypeScriptMetadataToDecl,
  findTypeScriptComponentMetadata,
} from "../utilities/typescript-metadata.js";
import type { TypeScriptComponentMetadata } from "../prepass/typescript-analysis.js";
import { extractConditionName } from "../utilities/style-key-naming.js";
import { resolveExistingFilePath } from "../utilities/path-utils.js";
import { parseVariantWhenToAst } from "../emit-wrappers/variant-condition.js";
import { BLOCKED_INTRINSIC_ATTR_RENAMES } from "../emit-wrappers/types.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";
import { addPropComments } from "../lower-rules/comments.js";
import { buildRelationOverrideProperties } from "../lower-rules/relation-overrides.js";
import { makeCssPropKey } from "../lower-rules/shared.js";
import { wrappedComponentInterfaceFor } from "../utilities/wrapped-component-interface.js";
import {
  propCommentMetadataToAstComments,
  SOURCE_CSS_PROPERTIES_KEY,
  type PropCommentMetadata,
} from "../transform/helpers.js";
import { guardForwardedSxConditionalDefaults } from "../utilities/forwarded-sx-defaults.js";
import { guardGeneratedConditionalDefaults } from "../utilities/conditional-style-defaults.js";

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

  // Pre-analyze inline style props at JSX call sites to determine if they can be promoted
  // to static/dynamic stylex.create entries (avoiding wrapper components and mergedSx).
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
      // Style props promoted to stylex.create entries don't need a wrapper.
      if (!className && decl.promotedStyleProps?.length) {
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
    // When every call site has promoted style props, each site is fully inlined;
    // a wrapper would be generated but never used. Skip wrapping in that case.
    const usageCount = getJsxUsageCount(decl.localName);
    if (decl.promotedStyleProps?.length && decl.promotedStyleProps.length >= usageCount) {
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

// --- Non-exported helpers ---

function applyTypeScriptMetadata(
  ctx: TransformContext,
  decl: StyledDecl,
  exportName: string | undefined,
): void {
  const names = exportName ? [decl.localName, exportName] : [decl.localName];
  applyTypeScriptMetadataToDecl(ctx, decl, names);
}

function typedComponentHasProp(decl: StyledDecl, propName: string): boolean {
  if (isSpecialSurfaceProp(propName)) {
    return decl.typeScriptExplicitPropNames?.has(propName) === true;
  }
  return decl.typeScriptPropNames?.has(propName) === true;
}

function isSpecialSurfaceProp(propName: string): boolean {
  return (
    propName === "className" || propName === "style" || propName === "sx" || propName === "ref"
  );
}

function typeAwareExternalStyleFallback(fallback: boolean): boolean {
  if (!fallback) {
    return false;
  }
  return true;
}

/** True if any skipped decl in the file extends the given component via `styled(name)`. */
function extendedBySkippedDecl(allStyledDecls: StyledDecl[], name: string): boolean {
  return allStyledDecls.some(
    (d) => d.skipTransform && d.base.kind === "component" && d.base.ident === name,
  );
}

/**
 * Detect a single top-level `const <name> = stylex.create({...})` declaration that
 * we can merge new entries into. Returns `undefined` when there is no such decl,
 * when the object passed to `stylex.create` is not a plain object literal, when
 * there are multiple candidates (ambiguous target), when the binding name collides
 * with a surviving styled-component name, when the name is shadowed elsewhere in
 * the file (so emitted `name.key` references could bind to the wrong scope), or
 * when any existing key would collide with a style key we're about to emit.
 *
 * A collision is a conservative signal: rather than risk overwriting user-authored
 * styles or producing a duplicate property, fall back to emitting a separate
 * `stylexStyles` declaration.
 */
function findExistingStylexStylesTarget(args: {
  ctx: TransformContext;
  styledDeclNames: Set<string>;
  /** The final set of style keys emit-styles will write into the merged object. */
  emitKeyNames: Set<string>;
}): { name: string; objectExpression: unknown; existingKeys: Set<string> } | undefined {
  const { ctx, styledDeclNames, emitKeyNames } = args;
  const { root, j } = ctx;
  const candidates: Array<{
    name: string;
    objectExpression: unknown;
    existingKeys: Set<string>;
    declaratorNode: unknown;
  }> = [];

  root.find(j.VariableDeclaration).forEach((declPath) => {
    // Only consider top-level declarations — nested ones aren't safe merge targets.
    const parentType = declPath.parentPath?.node?.type;
    if (parentType !== "Program" && parentType !== "ExportNamedDeclaration") {
      return;
    }
    for (const declarator of declPath.node.declarations) {
      if (declarator.type !== "VariableDeclarator") {
        continue;
      }
      const id = declarator.id;
      if (id?.type !== "Identifier") {
        continue;
      }
      const name = id.name;
      if (styledDeclNames.has(name)) {
        continue;
      }
      const init = declarator.init;
      if (!isStylexCreateCall(init)) {
        continue;
      }
      const arg = (init as { arguments?: unknown[] }).arguments?.[0];
      if (!isObjectExpression(arg)) {
        continue;
      }
      const existingKeys = collectObjectPropertyKeys(arg);
      if (!existingKeys) {
        // Non-literal keys (computed/spread) — can't reason about collisions, skip.
        continue;
      }
      candidates.push({ name, objectExpression: arg, existingKeys, declaratorNode: declarator });
    }
  });

  if (candidates.length !== 1) {
    return undefined;
  }
  const target = candidates[0]!;

  // Shadow check: reject if `name` is bound anywhere else in the file (nested scope
  // like a function component). Rewrite-jsx emits plain `name.key` references and
  // would silently bind to the shadowing binding instead of the top-level object.
  if (isNameBoundInFile(ctx, target.name, target.declaratorNode)) {
    return undefined;
  }

  for (const key of emitKeyNames) {
    if (target.existingKeys.has(key)) {
      return undefined;
    }
  }
  return target;
}

/**
 * Collects every style key that will be written into the merged `stylex.create`
 * object by emit-styles. Includes the top-level keys in `resolvedStyleObjects`
 * plus any keys injected by analyzeBeforeEmit (staticBooleanVariants,
 * callSiteCombinedStyles, promotedStyleProps — these are already present in
 * `resolvedStyleObjects` by the time this helper runs, but we re-derive them
 * from the decls so future additions stay in sync).
 */
function buildEmitKeyNames(ctx: TransformContext, styledDecls: StyledDecl[]): Set<string> {
  const keys = new Set<string>();
  if (ctx.resolvedStyleObjects) {
    for (const key of ctx.resolvedStyleObjects.keys()) {
      keys.add(key);
    }
  }
  for (const decl of styledDecls) {
    keys.add(decl.styleKey);
    for (const sbv of decl.staticBooleanVariants ?? []) {
      keys.add(sbv.styleKey);
    }
    for (const cc of decl.callSiteCombinedStyles ?? []) {
      keys.add(cc.styleKey);
    }
    for (const ps of decl.promotedStyleProps ?? []) {
      if (!ps.mergeIntoBase) {
        keys.add(ps.styleKey);
      }
    }
    for (const variantKey of Object.values(decl.variantStyleKeys ?? {})) {
      keys.add(variantKey);
    }
  }
  return keys;
}

/**
 * True if the given name is bound anywhere in the file — by a variable declarator,
 * a function declaration's own name, or a function parameter (including destructuring
 * forms). When `excludeDeclaratorNode` is provided, that specific VariableDeclarator
 * is skipped so a decl's own binding doesn't count as self-shadowing.
 */
function isNameBoundInFile(
  ctx: TransformContext,
  name: string,
  excludeDeclaratorNode?: unknown,
): boolean {
  const { root, j } = ctx;
  let found = false;
  root.find(j.VariableDeclarator).forEach((path) => {
    if (found || path.node === excludeDeclaratorNode) {
      return;
    }
    if (patternContainsName(path.node.id, name)) {
      found = true;
    }
  });
  if (found) {
    return true;
  }
  // Function-like bindings (FunctionDeclaration, FunctionExpression,
  // ArrowFunctionExpression, ObjectMethod, ClassMethod): own name or any param.
  root.find(j.Function).forEach((path) => {
    if (found) {
      return;
    }
    const fn = path.node as { id?: { name?: string } | null; params?: Array<unknown> };
    if (fn.id?.name === name) {
      found = true;
      return;
    }
    for (const param of fn.params ?? []) {
      if (paramBindsName(param, name)) {
        found = true;
        return;
      }
    }
  });
  return found;
}

/**
 * True if a function-parameter pattern binds the given name. Covers the full set of
 * destructuring and defaulting forms: `Identifier`, `AssignmentPattern`, `RestElement`,
 * `ObjectPattern` (nested), and `ArrayPattern` (nested).
 */
function paramBindsName(param: unknown, name: string): boolean {
  if (!param || typeof param !== "object") {
    return false;
  }
  const p = param as {
    type?: string;
    name?: string;
    left?: unknown;
    argument?: unknown;
    properties?: Array<{
      type?: string;
      value?: unknown;
      argument?: unknown;
      key?: { name?: string };
    }>;
    elements?: Array<unknown>;
  };
  if (p.type === "Identifier") {
    return p.name === name;
  }
  if (p.type === "AssignmentPattern") {
    return paramBindsName(p.left, name);
  }
  if (p.type === "RestElement") {
    return paramBindsName(p.argument, name);
  }
  if (p.type === "ObjectPattern") {
    for (const prop of p.properties ?? []) {
      if (prop.type === "RestElement") {
        if (paramBindsName(prop.argument, name)) {
          return true;
        }
        continue;
      }
      if (paramBindsName(prop.value, name)) {
        return true;
      }
    }
    return false;
  }
  if (p.type === "ArrayPattern") {
    for (const el of p.elements ?? []) {
      if (el && paramBindsName(el, name)) {
        return true;
      }
    }
    return false;
  }
  return false;
}

/**
 * True if the file would collide on `name` if we used it for the stylex binding.
 * Skipped styled decls keep their own binding (e.g. `const styles = styled.div\`...\``),
 * which is fine as long as no OTHER scope also binds the same name — the regular
 * isNameBoundInFile check handles that.
 */
function fileHasLocalName(
  ctx: TransformContext,
  name: string,
  styledDeclNames: Set<string>,
): boolean {
  if (styledDeclNames.has(name)) {
    return false;
  }
  return isNameBoundInFile(ctx, name);
}

/** True if `node` is `stylex.create(...)`. */
function isStylexCreateCall(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const call = node as {
    type?: string;
    callee?: {
      type?: string;
      object?: { type?: string; name?: string };
      property?: { type?: string; name?: string };
    };
  };
  if (call.type !== "CallExpression") {
    return false;
  }
  const callee = call.callee;
  if (callee?.type !== "MemberExpression") {
    return false;
  }
  return (
    callee.object?.type === "Identifier" &&
    callee.object.name === "stylex" &&
    callee.property?.type === "Identifier" &&
    callee.property.name === "create"
  );
}

function isObjectExpression(node: unknown): boolean {
  return (
    !!node && typeof node === "object" && (node as { type?: string }).type === "ObjectExpression"
  );
}

/**
 * Collect the literal property keys from an ObjectExpression. Returns `undefined`
 * if the object contains spread elements, computed keys, or non-identifier/string
 * keys we can't reason about safely.
 */
function collectObjectPropertyKeys(objectExpression: unknown): Set<string> | undefined {
  const obj = objectExpression as { properties?: Array<unknown> };
  const keys = new Set<string>();
  for (const p of obj.properties ?? []) {
    const prop = p as {
      type?: string;
      computed?: boolean;
      key?: { type?: string; name?: string; value?: unknown };
    };
    if (prop.type !== "Property" && prop.type !== "ObjectProperty") {
      return undefined;
    }
    if (prop.computed) {
      return undefined;
    }
    const key = prop.key;
    if (key?.type === "Identifier" && typeof key.name === "string") {
      keys.add(key.name);
      continue;
    }
    if (
      (key?.type === "Literal" || key?.type === "StringLiteral") &&
      typeof key.value === "string"
    ) {
      keys.add(key.value);
      continue;
    }
    return undefined;
  }
  return keys;
}

/**
 * Check if a name refers to a locally-defined function component (FunctionDeclaration,
 * arrow function, or function expression), as opposed to a variable assigned from an
 * opaque call expression or import.
 */
function isLocalFunctionComponent(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  name: string,
): boolean {
  // Check FunctionDeclaration: function Foo(...) {}
  if (root.find(j.FunctionDeclaration, { id: { type: "Identifier", name } } as any).size() > 0) {
    return true;
  }
  // Check VariableDeclarator with arrow/function expression: const Foo = (...) => ...
  return (
    root
      .find(j.VariableDeclarator, { id: { type: "Identifier", name } } as any)
      .filter((p) => {
        const init = p.node.init as { type?: string } | null;
        return init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression";
      })
      .size() > 0
  );
}

/**
 * Extracts the top-level type name from a propsType AST node.
 * Returns the identifier name for TSTypeReference, null otherwise.
 */
function extractReferencedTypeName(propsType: unknown): string | null {
  const node = propsType as
    | { type?: string; typeName?: { type?: string; name?: string } }
    | undefined;
  if (node?.type === "TSTypeReference" && node.typeName?.type === "Identifier") {
    return node.typeName.name ?? null;
  }
  return null;
}

/**
 * Collects all referenced type names from a propsType AST node,
 * including those inside intersection types.
 */
function collectReferencedTypeNames(propsType: unknown): string[] {
  const names: string[] = [];
  const name = extractReferencedTypeName(propsType);
  if (name) {
    names.push(name);
  }
  const node = propsType as { type?: string; types?: unknown[] } | undefined;
  if (node?.type === "TSIntersectionType" && Array.isArray(node.types)) {
    for (const t of node.types) {
      names.push(...collectReferencedTypeNames(t));
    }
  }
  return names;
}

/**
 * Returns true when a type name is defined locally (as an interface or type alias),
 * as opposed to being imported from another module.
 */
function isTypeLocallyDefined(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  typeName: string,
): boolean {
  return (
    root
      .find(j.TSInterfaceDeclaration)
      .filter((p: unknown) => {
        const node = p as { node?: { id?: { name?: string } } };
        return node.node?.id?.name === typeName;
      })
      .size() > 0 ||
    root
      .find(j.TSTypeAliasDeclaration)
      .filter((p: unknown) => {
        const node = p as { node?: { id?: { name?: string } } };
        return node.node?.id?.name === typeName;
      })
      .size() > 0
  );
}

/**
 * Returns true when a name is bound at module scope (import specifier, top-level
 * variable, etc.) other than the given owner's declaration.
 */
function isModuleScopeBinding(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  name: string,
  ownerLocalName: string,
): boolean {
  // Check import specifiers (named, default, and namespace)
  const hasImport =
    root
      .find(j.ImportSpecifier)
      .filter((p) => {
        const local = p.node.local?.name ?? p.node.imported?.name;
        return local === name;
      })
      .size() > 0 ||
    root
      .find(j.ImportDefaultSpecifier)
      .filter((p) => p.node.local?.name === name)
      .size() > 0 ||
    root
      .find(j.ImportNamespaceSpecifier)
      .filter((p) => p.node.local?.name === name)
      .size() > 0;
  if (hasImport) {
    return true;
  }
  // Check top-level declarations: variables, functions, classes (excluding the owner).
  // Walk up the path chain to determine if a binding is at module scope — handles
  // both `const $x = ...` and `export const $x = ...` parent structures.
  const isTopLevel = (p: { parentPath?: { node?: { type?: string }; parentPath?: unknown } }) => {
    let cur = p.parentPath;
    while (cur) {
      const t = (cur as { node?: { type?: string } }).node?.type;
      if (t === "Program") {
        return true;
      }
      if (t && t !== "VariableDeclaration" && t !== "ExportNamedDeclaration") {
        return false;
      }
      cur = (cur as { parentPath?: unknown }).parentPath as typeof cur;
    }
    return false;
  };
  const hasVariable =
    root
      .find(j.VariableDeclarator)
      .filter((p) => {
        const id = p.node.id;
        return id.type === "Identifier" && id.name === name && id.name !== ownerLocalName;
      })
      .filter((p) => isTopLevel(p))
      .size() > 0;
  if (hasVariable) {
    return true;
  }
  const hasFunction =
    root
      .find(j.FunctionDeclaration)
      .filter((p) => p.node.id?.name === name && p.node.id?.name !== ownerLocalName)
      .size() > 0;
  if (hasFunction) {
    return true;
  }
  return (
    root
      .find(j.ClassDeclaration)
      .filter((p) => {
        const id = p.node.id;
        return id?.type === "Identifier" && id.name === name && id.name !== ownerLocalName;
      })
      .size() > 0
  );
}

/**
 * Collects all local identifier names that will be introduced by resolver imports
 * (e.g., theme token variables like `$colors` from `tokens.stylex`).
 */
function collectResolverImportNames(ctx: TransformContext): Set<string> {
  const names = new Set<string>();
  for (const imp of ctx.resolverImports.values()) {
    for (const n of imp.names ?? []) {
      const local = n.local ?? n.imported;
      if (local) {
        names.add(local);
      }
    }
  }
  return names;
}

/**
 * Collects non-`$`-prefixed attribute names from JSX call sites of a component.
 * Returns true if any call site uses a JSX spread attribute (e.g., `{...props}`),
 * which means the spread may contain `$`-prefixed keys at runtime — renames are
 * only safe for `$`-props that appear **after** the last spread at every call site,
 * since in JSX later attributes override earlier ones.
 */
interface CallSiteAttrResult {
  hasSpread: boolean;
  /**
   * `$`-prefixed props explicitly passed at every spread-containing call site.
   * Renames for these are safe even with spreads (explicit attrs override spread values).
   * `null` when no spread sites exist.
   */
  explicitTransientAtSpreadSites: Set<string> | null;
}

function collectCallSiteAttrNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  componentName: string,
  names: Set<string>,
): CallSiteAttrResult {
  let hasSpread = false;
  const spreadSiteTransientProps: Set<string>[] = [];
  const collectFromElement = (openingElement: { attributes?: unknown[] }) => {
    let siteHasSpread = false;
    const siteTransientAfterSpread = new Set<string>();
    const siteTransientBeforeSpread = new Set<string>();
    for (const attr of (openingElement as any).attributes ?? []) {
      if (attr.type === "JSXSpreadAttribute") {
        hasSpread = true;
        siteHasSpread = true;
        // Track props seen before any spread, then clear — only props AFTER
        // the last spread are safe to rename.
        for (const name of siteTransientAfterSpread) {
          siteTransientBeforeSpread.add(name);
        }
        siteTransientAfterSpread.clear();
      } else if (attr.type === "JSXAttribute" && attr.name?.type === "JSXIdentifier") {
        const name: string = attr.name.name;
        if (name.startsWith("$")) {
          siteTransientAfterSpread.add(name);
        } else {
          names.add(name);
        }
      }
    }
    if (siteHasSpread) {
      // Remove props that appear both before AND after a spread — renaming
      // would produce duplicate JSX attributes (e.g., `$open={a} {...rest} $open={b}`
      // → `open={a} {...rest} open={b}` = TS17001 error).
      for (const name of siteTransientBeforeSpread) {
        siteTransientAfterSpread.delete(name);
      }
      spreadSiteTransientProps.push(siteTransientAfterSpread);
    }
  };
  root
    .find(j.JSXElement)
    .filter((p: any) =>
      jsxNameTargetsLocalBinding({
        root,
        j,
        name: p.node.openingElement?.name,
        localName: componentName,
      }),
    )
    .forEach((p: any) => collectFromElement(p.node.openingElement));
  root
    .find(j.JSXSelfClosingElement)
    .filter((p: any) =>
      jsxNameTargetsLocalBinding({
        root,
        j,
        name: p.node.name,
        localName: componentName,
      }),
    )
    .forEach((p: any) => collectFromElement(p.node));
  if (!hasSpread) {
    return { hasSpread: false, explicitTransientAtSpreadSites: null };
  }
  // Intersect: find $-prefixed props that appear at ALL spread-containing sites
  if (spreadSiteTransientProps.length === 0) {
    return { hasSpread: true, explicitTransientAtSpreadSites: new Set() };
  }
  const intersection = new Set(spreadSiteTransientProps[0]);
  for (let i = 1; i < spreadSiteTransientProps.length; i++) {
    for (const prop of intersection) {
      if (!spreadSiteTransientProps[i]!.has(prop)) {
        intersection.delete(prop);
      }
    }
  }
  return { hasSpread: true, explicitTransientAtSpreadSites: intersection };
}

/**
 * Collects prop names from a locally-defined base component's type that match
 * the given filter. Default filter excludes `$`-prefixed names (for collision checking).
 */
function collectBaseComponentPropNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  componentName: string,
  names: Set<string>,
  filter: (name: string) => boolean = (n) => !n.startsWith("$"),
): void {
  const extractFromParam = (param: any) => {
    const typeRef = param?.typeAnnotation?.typeAnnotation;
    if (!typeRef) {
      return;
    }
    if (typeRef.type === "TSTypeLiteral") {
      walkTypePropNames(typeRef, (n) => {
        if (filter(n)) {
          names.add(n);
        }
      });
    } else if (typeRef.type === "TSTypeReference" && typeRef.typeName?.type === "Identifier") {
      const typeName = typeRef.typeName.name;
      // Check interface
      root
        .find(j.TSInterfaceDeclaration)
        .filter((p: any) => (p.node as any).id?.name === typeName)
        .forEach((p: any) => {
          for (const member of (p.node.body?.body ?? []) as any[]) {
            if (
              member.type === "TSPropertySignature" &&
              member.key?.type === "Identifier" &&
              filter(member.key.name)
            ) {
              names.add(member.key.name);
            }
          }
        });
      // Check type alias
      root
        .find(j.TSTypeAliasDeclaration)
        .filter((p: any) => (p.node as any).id?.name === typeName)
        .forEach((p: any) => {
          walkTypePropNames(p.node.typeAnnotation, (n) => {
            if (filter(n)) {
              names.add(n);
            }
          });
        });
    }
    if (typeRef.type === "TSIntersectionType") {
      for (const t of typeRef.types ?? []) {
        extractFromParam({ typeAnnotation: { typeAnnotation: t } });
      }
    }
  };

  // Check function declarations
  root
    .find(j.FunctionDeclaration)
    .filter((p) => p.node.id?.type === "Identifier" && p.node.id.name === componentName)
    .forEach((p) => {
      extractFromParam(p.node.params[0]);
    });
  // Check arrow function variable declarations
  root
    .find(j.VariableDeclarator)
    .filter((p: any) => p.node.id?.type === "Identifier" && p.node.id.name === componentName)
    .forEach((p: any) => {
      const init = p.node.init;
      if (init?.type === "ArrowFunctionExpression" && init.params[0]) {
        extractFromParam(init.params[0]);
      }
    });
}

/**
 * Returns true when a named type (interface or type alias) is referenced
 * in the file outside of the given styled component's own declaration.
 * This catches sharing with other styled decls, non-styled components,
 * helper functions, or any other code that uses the type.
 */
function isTypeNameUsedElsewhere(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  typeName: string,
  ownerLocalName: string,
  namespaceName: string | null,
): boolean {
  let count = 0;
  root
    .find(j.TSTypeReference)
    .filter((p: any) => {
      const id = p.node.typeName;
      return id?.type === "Identifier" && id.name === typeName;
    })
    // TypeScript name resolution lets descendant namespaces (and top-level code,
    // when the owner is top-level) reach the same declaration, so count those
    // references too — otherwise the type appears solely owned by the styled
    // component and we'd rename it out from under unrelated consumers.
    .filter((p: any) => pathReachesNamespace(p, namespaceName))
    .forEach((p: any) => {
      // Walk up to the nearest variable/function declaration to find the owner.
      // If the owner is the styled decl itself, don't count it.
      let cur = p.parentPath;
      while (cur) {
        const node = cur.node;
        if (
          node?.type === "VariableDeclarator" &&
          node.id?.type === "Identifier" &&
          node.id.name === ownerLocalName
        ) {
          return;
        }
        if (node?.type === "FunctionDeclaration" && node.id?.name === ownerLocalName) {
          return;
        }
        cur = cur.parentPath;
      }
      count++;
    });
  return count > 0;
}

/**
 * Collects prop names from a decl's styling data that match a filter.
 * Reuses `parseVariantWhenToAst` to extract prop names from "when" strings,
 * keeping prop extraction consistent with the emit phase.
 */
function collectDeclPropNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  decl: StyledDecl,
  filter: (name: string) => boolean,
): Set<string> {
  const result = new Set<string>();
  const addIfMatch = (name: string) => {
    if (filter(name)) {
      result.add(name);
    }
  };
  for (const when of Object.keys(decl.variantStyleKeys ?? {})) {
    for (const p of parseVariantWhenToAst(j, when).props) {
      addIfMatch(p);
    }
  }
  for (const sf of decl.styleFnFromProps ?? []) {
    addIfMatch(sf.jsxProp);
    if (sf.conditionWhen) {
      for (const p of parseVariantWhenToAst(j, sf.conditionWhen).props) {
        addIfMatch(p);
      }
    }
  }
  for (const isp of decl.inlineStyleProps ?? []) {
    addIfMatch(isp.jsxProp ?? isp.prop);
  }
  for (const cv of decl.compoundVariants ?? []) {
    if (cv.kind === "3branch" || cv.kind === "4branch") {
      addIfMatch(cv.outerProp);
      addIfMatch(cv.innerProp);
    }
  }
  for (const vd of decl.variantDimensions ?? []) {
    addIfMatch(vd.propName);
  }
  for (const sbv of decl.staticBooleanVariants ?? []) {
    addIfMatch(sbv.propName);
  }
  if (decl.enumVariant) {
    addIfMatch(decl.enumVariant.propName);
  }
  walkTypePropNames(decl.propsType, (name) => {
    addIfMatch(name);
  });
  if (shouldResolveReferencedPropsForTransientRename(root, j, decl.propsType)) {
    for (const name of collectResolvedTypePropNames(
      root,
      j,
      decl.propsType,
      getDeclAncestorNamespaceChain(root, j, decl.localName),
    )) {
      addIfMatch(name);
    }
  }
  return result;
}

function getDeclNamespaceName(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  localName: string,
): string | null {
  let namespaceName: string | null = null;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: localName } } as any)
    .forEach((path: any) => {
      if (namespaceName) {
        return;
      }
      namespaceName = nearestNamespacePath(path);
    });
  return namespaceName;
}

/**
 * Builds the chain of namespaces visible to a styled decl by TypeScript name
 * resolution, ordered innermost-first and terminated with `null` (top-level).
 * For `namespace A { namespace B { const Grid = styled.div ... } }`, returns
 * `["A.B", "A", null]`. Used so type references resolve to the closest enclosing
 * declaration, matching how TS would resolve them at runtime.
 */
function getDeclAncestorNamespaceChain(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  localName: string,
): Array<string | null> {
  let declaratorPath: { parentPath?: unknown } | null = null;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: localName } } as any)
    .forEach((path: any) => {
      if (declaratorPath) {
        return;
      }
      declaratorPath = path;
    });
  if (!declaratorPath) {
    return [null];
  }
  const namespacePath = namespacePathForPath(declaratorPath);
  const chain: Array<string | null> = [];
  for (let end = namespacePath.length; end > 0; end--) {
    chain.push(namespacePath.slice(0, end).join("."));
  }
  chain.push(null);
  return chain;
}

function nearestNamespacePath(path: { parentPath?: unknown }): string | null {
  const namespacePath = namespacePathForPath(path);
  return namespacePath.length > 0 ? namespacePath.join(".") : null;
}

function namespacePathForPath(path: { parentPath?: unknown }): string[] {
  const names: string[] = [];
  let current = path.parentPath as { node?: { type?: string; id?: unknown }; parentPath?: unknown };
  while (current) {
    const node = current.node;
    if (node?.type === "TSModuleDeclaration") {
      const id = node.id as { type?: string; name?: string };
      if (id.type === "Identifier" && id.name) {
        names.push(id.name);
      }
    }
    current = current.parentPath as typeof current;
  }
  return names.reverse();
}

/**
 * Returns true when `path` lives inside `namespaceName` or any namespace nested
 * within it. `namespaceName === null` represents top-level scope, which all
 * references reach via TypeScript name resolution.
 *
 * Used for the cross-namespace ownership/usage checks: a type declared in
 * namespace `A` is reachable from `A.Sub.Inner` because TS resolves names
 * outward through enclosing namespaces.
 */
function pathReachesNamespace(
  path: { parentPath?: unknown },
  namespaceName: string | null,
): boolean {
  if (namespaceName === null) {
    return true;
  }
  const target = namespaceName.split(".");
  const current = namespacePathForPath(path);
  return target.every((part, index) => current[index] === part);
}

function shouldResolveReferencedPropsForTransientRename(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  propsType: unknown,
): boolean {
  const typeRef = propsType as { type?: string; typeName?: { type?: string; name?: string } };
  if (typeRef?.type !== "TSTypeReference" || typeRef.typeName?.type !== "Identifier") {
    return false;
  }
  const typeName = typeRef.typeName.name;
  const isNamespaced = (path: { parentPath?: unknown }): boolean => {
    let cur = path.parentPath as { node?: { type?: string }; parentPath?: unknown } | undefined;
    while (cur) {
      if (cur.node?.type === "TSModuleDeclaration") {
        return true;
      }
      cur = cur.parentPath as typeof cur;
    }
    return false;
  };
  return (
    root
      .find(j.TSInterfaceDeclaration)
      .filter(
        (p) => p.node.id.type === "Identifier" && p.node.id.name === typeName && isNamespaced(p),
      )
      .size() > 0 ||
    root
      .find(j.TSTypeAliasDeclaration)
      .filter((p) => p.node.id.name === typeName && isNamespaced(p))
      .size() > 0
  );
}

/**
 * Renames `$`-prefixed prop references in a "when" condition string.
 * Sorts renames by length descending to avoid partial matches.
 */
function renamePropsInWhenString(when: string, renames: Map<string, string>): string {
  let result = when;
  const sorted = [...renames.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    const escaped = escapeRegex(from);
    result = result.replace(new RegExp(`(?<![\\w$])${escaped}(?=(?:True|False)?(?!\\w))`, "g"), to);
  }
  return result;
}

/**
 * Applies transient prop renames to all relevant fields of a StyledDecl.
 */
function applyTransientPropRenames(decl: StyledDecl, renames: Map<string, string>): void {
  if (decl.variantStyleKeys) {
    const updated: Record<string, string> = {};
    for (const [when, key] of Object.entries(decl.variantStyleKeys)) {
      updated[renamePropsInWhenString(when, renames)] = key;
    }
    decl.variantStyleKeys = updated;
  }

  if (decl.variantSourceOrder) {
    const updated: Record<string, number> = {};
    for (const [when, order] of Object.entries(decl.variantSourceOrder)) {
      updated[renamePropsInWhenString(when, renames)] = order;
    }
    decl.variantSourceOrder = updated;
  }

  if (decl.styleFnFromProps) {
    for (const sf of decl.styleFnFromProps) {
      sf.jsxProp = renames.get(sf.jsxProp) ?? sf.jsxProp;
      if (sf.propsObjectKey) {
        sf.propsObjectKey = renames.get(sf.propsObjectKey) ?? sf.propsObjectKey;
      }
      if (sf.conditionWhen) {
        sf.conditionWhen = renamePropsInWhenString(sf.conditionWhen, renames);
      }
      if (sf.callArg) {
        renameIdentifiersInAst(sf.callArg, renames);
      }
      if (sf.extraCallArgs) {
        for (const extra of sf.extraCallArgs) {
          extra.jsxProp = renames.get(extra.jsxProp) ?? extra.jsxProp;
          if (extra.callArg) {
            renameIdentifiersInAst(extra.callArg, renames);
          }
        }
      }
    }
  }

  if (decl.inlineStyleProps) {
    for (const isp of decl.inlineStyleProps) {
      const jprop = isp.jsxProp ?? isp.prop;
      const renamed = renames.get(jprop);
      if (renamed) {
        if (isp.jsxProp) {
          isp.jsxProp = renamed;
        } else {
          isp.prop = renamed;
        }
      }
      renameIdentifiersInAst(isp.expr, renames);
    }
  }

  if (decl.compoundVariants) {
    for (const cv of decl.compoundVariants) {
      if (cv.kind === "3branch" || cv.kind === "4branch") {
        cv.outerProp = renames.get(cv.outerProp) ?? cv.outerProp;
        cv.innerProp = renames.get(cv.innerProp) ?? cv.innerProp;
        if (cv.kind === "3branch") {
          cv.innerTruthyWhen = renamePropsInWhenString(cv.innerTruthyWhen, renames);
          cv.innerFalsyWhen = renamePropsInWhenString(cv.innerFalsyWhen, renames);
        }
      }
    }
  }

  if (decl.variantDimensions) {
    for (const vd of decl.variantDimensions) {
      const renamedProp = renames.get(vd.propName);
      if (renamedProp) {
        // Also update the variant object name if it was derived from the $-prefixed prop name
        if (vd.variantObjectName.startsWith(vd.propName)) {
          vd.variantObjectName = renamedProp + vd.variantObjectName.slice(vd.propName.length);
        }
        vd.propName = renamedProp;
      }
    }
  }

  if (decl.staticBooleanVariants) {
    for (const sbv of decl.staticBooleanVariants) {
      sbv.propName = renames.get(sbv.propName) ?? sbv.propName;
    }
  }

  if (decl.enumVariant) {
    decl.enumVariant.propName = renames.get(decl.enumVariant.propName) ?? decl.enumVariant.propName;
  }

  walkTypePropNames(decl.propsType, (name, keyNode) => {
    const renamed = renames.get(name);
    if (renamed) {
      keyNode.name = renamed;
    }
  });

  if (decl.shouldForwardProp?.dropProps) {
    decl.shouldForwardProp.dropProps = decl.shouldForwardProp.dropProps.map(
      (p) => renames.get(p) ?? p,
    );
  }

  if (decl.attrsInfo?.defaultAttrs) {
    for (const attr of decl.attrsInfo.defaultAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
      attr.attrName = renames.get(attr.attrName) ?? attr.attrName;
    }
  }
  if (decl.attrsInfo?.conditionalAttrs) {
    for (const attr of decl.attrsInfo.conditionalAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
      attr.attrName = renames.get(attr.attrName) ?? attr.attrName;
    }
  }
  if (decl.attrsInfo?.invertedBoolAttrs) {
    for (const attr of decl.attrsInfo.invertedBoolAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
      attr.attrName = renames.get(attr.attrName) ?? attr.attrName;
    }
  }
  if (decl.attrsInfo?.dynamicAttrs) {
    for (const attr of decl.attrsInfo.dynamicAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
      attr.attrName = renames.get(attr.attrName) ?? attr.attrName;
    }
  }
  if (decl.attrsInfo?.staticAttrs) {
    decl.attrsInfo.staticAttrs = renameStaticAttrKeys(decl.attrsInfo.staticAttrs, renames);
  }
  if (decl.attrsInfo?.attrsDynamicStyles) {
    for (const ds of decl.attrsInfo.attrsDynamicStyles) {
      ds.jsxProp = renames.get(ds.jsxProp) ?? ds.jsxProp;
      renameIdentifiersInAst(ds.callArgExpr, renames);
    }
  }

  if (decl.extraStylexPropsArgs) {
    for (const arg of decl.extraStylexPropsArgs) {
      if (arg.when) {
        arg.when = renamePropsInWhenString(arg.when, renames);
      }
      renameIdentifiersInAst(arg.expr, renames);
    }
  }

  if (decl.preResolvedFnDecls) {
    for (const value of Object.values(decl.preResolvedFnDecls)) {
      renameIdentifiersInAst(value, renames);
    }
  }

  if (decl.pseudoAliasSelectors) {
    for (const pas of decl.pseudoAliasSelectors) {
      if (pas.guard?.when) {
        pas.guard.when = renamePropsInWhenString(pas.guard.when, renames);
      }
    }
  }

  if (decl.callSiteCombinedStyles) {
    for (const cs of decl.callSiteCombinedStyles) {
      cs.propNames = cs.propNames.map((p) => renames.get(p) ?? p);
    }
  }
}

function renameStaticAttrKeys(
  attrs: Record<string, unknown>,
  renames: Map<string, string>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const renamed = renames.get(key) ?? key;
    if (renamed !== key) {
      changed = true;
    }
    out[renamed] = value;
  }
  return changed ? out : attrs;
}

/**
 * Collects all style keys that belong to a decl (for renaming in resolvedStyleObjects).
 */
function collectAllStyleKeysForDecl(decl: StyledDecl): string[] {
  const keys: string[] = [decl.styleKey];
  if (decl.adjacentSiblingStyleKey) {
    keys.push(decl.adjacentSiblingStyleKey);
  }
  for (const key of Object.values(decl.variantStyleKeys ?? {})) {
    keys.push(key);
  }
  for (const sf of decl.styleFnFromProps ?? []) {
    keys.push(sf.fnKey);
  }
  for (const key of decl.extraStyleKeys ?? []) {
    keys.push(key);
  }
  for (const key of decl.extraStyleKeysAfterBase ?? []) {
    keys.push(key);
  }
  if (decl.preResolvedFnDecls) {
    for (const key of Object.keys(decl.preResolvedFnDecls)) {
      keys.push(key);
    }
  }
  if (decl.enumVariant) {
    keys.push(decl.enumVariant.baseKey);
    for (const c of decl.enumVariant.cases) {
      keys.push(c.styleKey);
    }
  }
  for (const sbv of decl.staticBooleanVariants ?? []) {
    keys.push(sbv.styleKey);
  }
  for (const cs of decl.callSiteCombinedStyles ?? []) {
    keys.push(cs.styleKey);
  }
  for (const ps of decl.promotedStyleProps ?? []) {
    if (!ps.mergeIntoBase) {
      keys.push(ps.styleKey);
    }
  }
  for (const pas of decl.pseudoAliasSelectors ?? []) {
    keys.push(...pas.styleKeys);
  }
  for (const pes of decl.pseudoExpandSelectors ?? []) {
    keys.push(pes.styleKey);
  }
  if (decl.attrWrapper) {
    const aw = decl.attrWrapper;
    for (const k of [
      aw.checkboxKey,
      aw.radioKey,
      aw.readonlyKey,
      aw.externalKey,
      aw.httpsKey,
      aw.pdfKey,
    ]) {
      if (k) {
        keys.push(k);
      }
    }
  }
  return keys;
}

const AST_METADATA_KEYS = new Set([
  "loc",
  "start",
  "end",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "extra",
  "range",
  "tokens",
]);

/**
 * Recursively renames identifiers in an AST expression node based on the rename map.
 * Only walks structural AST properties (skips metadata like `loc`, `comments`, etc.).
 */
function renameIdentifiersInAst(node: unknown, renames: Map<string, string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as Record<string, unknown>;
  if (typeof n.type !== "string") {
    return;
  }
  if (n.type === "Identifier" && typeof n.name === "string") {
    const renamed = renames.get(n.name);
    if (renamed) {
      n.name = renamed;
    }
    // Continue walking into Identifier's other properties (e.g., typeAnnotation)
    // which may contain nested identifiers that need renaming.
  }
  for (const [key, value] of Object.entries(n)) {
    if (AST_METADATA_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        renameIdentifiersInAst(item, renames);
      }
    } else if (value && typeof value === "object") {
      renameIdentifiersInAst(value, renames);
    }
  }
}

function transientRenameWouldTouchExpressionIdentifier(
  decl: StyledDecl,
  propName: string,
): boolean {
  for (const styleFn of decl.styleFnFromProps ?? []) {
    if (astContainsIdentifier(styleFn.callArg, propName)) {
      return true;
    }
    for (const extra of styleFn.extraCallArgs ?? []) {
      if (astContainsIdentifier(extra.callArg, propName)) {
        return true;
      }
    }
  }
  for (const inlineStyle of decl.inlineStyleProps ?? []) {
    if (astContainsIdentifier(inlineStyle.expr, propName)) {
      return true;
    }
  }
  return false;
}

function transientRenameWouldTouchResolvedStyleObject(
  decl: StyledDecl,
  propName: string,
  resolvedStyleObjects: Map<string, unknown> | undefined,
): boolean {
  if (!resolvedStyleObjects) {
    return false;
  }
  for (const styleKey of collectAllStyleKeysForDecl(decl)) {
    const value = resolvedStyleObjects.get(styleKey);
    if (value && typeof value === "object" && astContainsIdentifier(value, propName)) {
      return true;
    }
  }
  return false;
}

function transientRenameHasNormalizedPropUsage(decl: StyledDecl, propName: string): boolean {
  const normalized = propName.startsWith("$") ? propName.slice(1) : propName;
  for (const styleFn of decl.styleFnFromProps ?? []) {
    if (astContainsIdentifier(styleFn.callArg, normalized)) {
      return true;
    }
    for (const extra of styleFn.extraCallArgs ?? []) {
      if (astContainsIdentifier(extra.callArg, normalized)) {
        return true;
      }
    }
  }
  for (const inlineStyle of decl.inlineStyleProps ?? []) {
    if (astContainsIdentifier(inlineStyle.expr, normalized)) {
      return true;
    }
  }
  return false;
}

function astContainsIdentifier(node: unknown, name: string): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as Record<string, unknown>;
  if (typeof n.type !== "string") {
    return false;
  }
  if (n.type === "Identifier" && n.name === name) {
    return true;
  }
  for (const [key, value] of Object.entries(n)) {
    if (AST_METADATA_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.some((item) => astContainsIdentifier(item, name))) {
        return true;
      }
    } else if (value && typeof value === "object" && astContainsIdentifier(value, name)) {
      return true;
    }
  }
  return false;
}

/**
 * Renames `$`-prefixed members in interface/type alias declarations
 * referenced by a propsType AST node.
 */
function renameTransientPropsInReferencedTypes(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  propsType:
    | {
        type?: string;
        typeName?: { type?: string; name?: string };
        types?: unknown[];
      }
    | undefined,
  renames: Map<string, string>,
  namespaceChain: ReadonlyArray<string | null>,
): void {
  if (!propsType) {
    return;
  }
  if (propsType.type === "TSTypeReference" && propsType.typeName?.type === "Identifier") {
    const typeName = propsType.typeName.name;
    if (!typeName) {
      return;
    }
    const interfaceDecl = findFirstTypeDeclInChain(
      root,
      j.TSInterfaceDeclaration,
      typeName,
      namespaceChain,
    );
    if (interfaceDecl) {
      for (const member of (interfaceDecl.body?.body ?? []) as any[]) {
        if (member.type === "TSPropertySignature" && member.key?.type === "Identifier") {
          const renamed = renames.get(member.key.name);
          if (renamed) {
            member.key.name = renamed;
          }
        }
      }
    }
    const typeAliasDecl = findFirstTypeDeclInChain(
      root,
      j.TSTypeAliasDeclaration,
      typeName,
      namespaceChain,
    );
    if (typeAliasDecl) {
      walkTypePropNames(typeAliasDecl.typeAnnotation, (name, keyNode) => {
        const renamed = renames.get(name);
        if (renamed) {
          keyNode.name = renamed;
        }
      });
    }
  }
  if (propsType.type === "TSIntersectionType" && Array.isArray(propsType.types)) {
    for (const t of propsType.types) {
      renameTransientPropsInReferencedTypes(
        root,
        j,
        t as typeof propsType,
        renames,
        namespaceChain,
      );
    }
  }
}

/**
 * Mirrors TypeScript name resolution: walks the namespace chain from the inside
 * out and returns the first matching declaration. Used so a type reference inside
 * a nested namespace resolves to the closest enclosing declaration rather than
 * accidentally matching every same-named declaration in the file.
 */
function findFirstTypeDeclInChain(
  root: ReturnType<JSCodeshift>,
  builder: any,
  typeName: string,
  namespaceChain: ReadonlyArray<string | null>,
): any {
  for (const ns of namespaceChain) {
    let found: any = null;
    root
      .find(builder)
      .filter((p: any) => p.node?.id?.name === typeName)
      .filter((p: any) => nearestNamespacePath(p) === ns)
      .forEach((p: any) => {
        if (!found) {
          found = p.node;
        }
      });
    if (found) {
      return found;
    }
  }
  return null;
}

type TypeNodeLike = { type?: string; members?: unknown[]; types?: unknown[] } | undefined;

/**
 * Walks TSPropertySignature members in a type AST node (TSTypeLiteral,
 * TSIntersectionType) and calls `visitor` with each member's key name
 * and the key node itself. Used for both collecting and renaming props.
 */
function walkTypePropNames(
  typeNode: TypeNodeLike,
  visitor: (name: string, keyNode: { name: string }) => void,
): void {
  if (!typeNode) {
    return;
  }
  if (typeNode.type === "TSTypeLiteral" && Array.isArray(typeNode.members)) {
    for (const member of typeNode.members) {
      const m = member as {
        type?: string;
        key?: { type?: string; name?: string };
      };
      if (m.type === "TSPropertySignature" && m.key?.type === "Identifier" && m.key.name) {
        visitor(m.key.name, m.key as { name: string });
      }
    }
  }
  if (typeNode.type === "TSIntersectionType" && Array.isArray(typeNode.types)) {
    for (const t of typeNode.types) {
      walkTypePropNames(t as TypeNodeLike, visitor);
    }
  }
}

/**
 * Collects prop names from a propsType AST node, resolving through
 * TSTypeReference nodes to the underlying type declaration.
 */
function collectResolvedTypePropNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  propsType: unknown,
  namespaceChain: ReadonlyArray<string | null> = [null],
): Set<string> {
  const names = new Set<string>();
  const visit = (node: unknown): void => {
    const n = node as TypeNodeLike & { typeName?: { type?: string; name?: string } };
    if (!n) {
      return;
    }
    if (n.type === "TSTypeLiteral") {
      walkTypePropNames(n, (name) => {
        names.add(name);
      });
    } else if (n.type === "TSIntersectionType" && Array.isArray(n.types)) {
      for (const t of n.types) {
        visit(t);
      }
    } else if (n.type === "TSTypeReference" && n.typeName?.type === "Identifier") {
      const typeName = n.typeName.name;
      if (!typeName) {
        return;
      }
      const interfaceDecl = findFirstTypeDeclInChain(
        root,
        j.TSInterfaceDeclaration,
        typeName,
        namespaceChain,
      );
      if (interfaceDecl) {
        const body = ((interfaceDecl as any).body?.body ?? []) as any[];
        for (const member of body) {
          if (member?.type === "TSPropertySignature" && member.key?.type === "Identifier") {
            names.add(member.key.name);
          }
        }
      }
      const typeAliasDecl = findFirstTypeDeclInChain(
        root,
        j.TSTypeAliasDeclaration,
        typeName,
        namespaceChain,
      );
      if (typeAliasDecl) {
        visit((typeAliasDecl as any).typeAnnotation);
      }
    }
  };
  visit(propsType);
  return names;
}

/**
 * Emits a warning and cross-file consumer patching info when an exported
 * component has transient prop renames.
 */
function emitTransientPropRenameWarning(
  ctx: TransformContext,
  decl: StyledDecl,
  renames: Map<string, string>,
  exportedComponents: Map<string, { exportName?: string }>,
): void {
  const exportInfo = exportedComponents.get(decl.localName);
  if (!exportInfo) {
    return;
  }
  const exportName = exportInfo.exportName ?? decl.localName;
  const renameRecord: Record<string, string> = {};
  const renameList: string[] = [];
  for (const [from, to] of renames) {
    renameRecord[from] = to;
    renameList.push(`${from} → ${to}`);
  }
  ctx.warnings.push({
    severity: "info",
    type: "Transient $-prefixed props renamed on exported component — update consumer call sites to use the new prop names",
    loc: decl.loc ?? null,
    context: {
      componentName: decl.localName,
      renames: renameList.join(", "),
    },
  });
  ctx.transientPropRenames ??= [];
  ctx.transientPropRenames.push({ exportName, renames: renameRecord });
}

/** Recursively check if a pattern (Identifier, ArrayPattern, ObjectPattern, etc.) contains a binding with the given name. */
function patternContainsName(node: { type?: string } | null | undefined, name: string): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (node.type === "Identifier") {
    return (node as { name: string }).name === name;
  }
  if (node.type === "ArrayPattern") {
    return ((node as any).elements ?? []).some(
      (el: { type?: string } | null) => el && patternContainsName(el, name),
    );
  }
  if (node.type === "ObjectPattern") {
    return ((node as any).properties ?? []).some((prop: any) => {
      if (prop.type === "RestElement" || prop.type === "RestProperty") {
        return patternContainsName(prop.argument, name);
      }
      return patternContainsName(prop.value, name);
    });
  }
  if (node.type === "RestElement" || node.type === "RestProperty") {
    return patternContainsName((node as any).argument, name);
  }
  if (node.type === "AssignmentPattern") {
    return patternContainsName((node as any).left, name);
  }
  return false;
}

// --- Promotable style prop analysis ---

/**
 * StyleX shorthand properties that the codemod's CSS expander treats as
 * "longhand-only": StyleX (`@stylexjs/valid-styles`) rejects these when given
 * a multi-token value. We bail from promotion when the helper can't fully
 * decompose them into safe longhands.
 */
const FORBIDDEN_SHORTHAND_PROPS = new Set([
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "background",
]);

/**
 * React-style camelCase CSS property names that promotion refuses to emit into
 * `stylex.create`. Membership means: even when the value is a literal we can
 * read statically, the property is structurally too unconstrained for the
 * codemod to know it's safe (multi-component shorthands, `all`, etc.). Anything
 * NOT in this set is allowed through — StyleX's `valid-styles` and TypeScript
 * types remain the ultimate source of truth for typo/unsupported-prop errors.
 *
 * Keep in sync with the kebab-case sources of truth in this repo:
 * - `STYLEX_LONGHAND_ONLY_SHORTHANDS` in `stylex-shorthands.ts` (handled by
 *   `cssDeclarationToStylexDeclarations`, so they don't appear here).
 * - `NOT_APPLICABLE_SHORTHANDS` in `stylex-property-priorities.test.ts`
 *   (multi-component shorthands the codemod refuses to expand — mirrored here
 *   in camelCase).
 */
export const NON_PROMOTABLE_STYLE_PROPS = new Set<string>([
  // Mirror of NOT_APPLICABLE_SHORTHANDS in `stylex-property-priorities.test.ts`.
  "all",
  "animation",
  "borderBlock",
  "borderInline",
  "font",
  "grid",
  "gridArea",
  "gridTemplate",
  "inset",
  // Additional multi-component shorthands StyleX rejects when given multiple
  // tokens, but which aren't classified by StyleX as shorthandsOfShorthands so
  // they don't appear in NOT_APPLICABLE_SHORTHANDS above.
  "transition",
]);

/** Returns true when this key is one we refuse to emit into stylex.create. */
function isNonPromotableStylexKey(key: string): boolean {
  return NON_PROMOTABLE_STYLE_PROPS.has(key);
}

/**
 * Expands a static React-style inline style entry into one or more StyleX
 * longhand entries via the authoritative `cssDeclarationToStylexDeclarations`
 * helper. The React key is converted to kebab-case CSS first (e.g.
 * `backgroundColor` → `background-color`) so the helper sees the same input
 * shape it sees when processing styled-components template declarations.
 *
 * Returns null when the input key (or any expanded longhand) is on the
 * non-promotable denylist, or when the helper failed to decompose a forbidden
 * StyleX shorthand. The caller bails in those cases and preserves the original
 * inline style verbatim.
 */
function expandStaticStylePropToStylex(
  reactKey: string,
  value: string | number | boolean,
): Array<{ key: string; value: string | number | boolean }> | null {
  if (isNonPromotableStylexKey(reactKey)) {
    return null;
  }
  if (typeof value === "boolean") {
    return [{ key: reactKey, value }];
  }
  const cssProp = camelToKebabCase(reactKey);
  const rawValue = typeof value === "number" ? String(value) : value;
  // `cssDeclarationToStylexDeclarations` handles `background` by classifying
  // the value as image-like vs color, but doesn't validate that the value is a
  // single component. A multi-token shorthand like `red no-repeat center/cover`
  // would be silently mapped to `backgroundColor: "red no-repeat ..."`, which
  // is invalid CSS. Bail so the inline style is preserved verbatim.
  if (reactKey === "background" && !isSingleBackgroundComponent(rawValue)) {
    return null;
  }
  const expanded = cssDeclarationToStylexDeclarations({
    property: cssProp,
    value: { kind: "static", value: rawValue },
    valueRaw: rawValue,
    important: false,
  });
  const result: Array<{ key: string; value: string | number | boolean }> = [];
  for (const entry of expanded) {
    if (FORBIDDEN_SHORTHAND_PROPS.has(entry.prop)) {
      // Helper couldn't fully decompose the shorthand — bail so we don't emit
      // invalid StyleX (e.g. `border: "1px"` with no style/color tokens).
      return null;
    }
    if (isNonPromotableStylexKey(entry.prop)) {
      return null;
    }
    if (entry.value.kind !== "static") {
      return null;
    }
    result.push({ key: entry.prop, value: coerceExpandedValue(entry.prop, entry.value.value) });
  }
  return result.length > 0 ? result : null;
}

/**
 * Re-numifies a static expanded value when it is purely numeric. The expansion
 * pipeline emits everything as strings; converting bare numbers back to JS
 * numbers keeps emitted StyleX entries consistent with handwritten code (e.g.
 * `paddingInline: 0` instead of `paddingInline: "0"`).
 */
function coerceExpandedValue(prop: string, raw: string): string | number {
  if (raw === "") {
    return raw;
  }
  if (isStylexStringOnlyCssProp(prop)) {
    return raw;
  }
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return raw;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

/**
 * Returns true if a StyledDecl ultimately renders as an intrinsic element,
 * either directly (`styled.div`) or through a chain of styled extensions
 * (`styled(OtherStyledComponent)` where the root is intrinsic).
 */
function resolvesToIntrinsic(decl: StyledDecl, declByLocal: Map<string, StyledDecl>): boolean {
  let current: StyledDecl | undefined = decl;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.localName)) {
      return false; // circular reference guard
    }
    visited.add(current.localName);
    if (current.base.kind === "intrinsic") {
      return true;
    }
    current = declByLocal.get(current.base.ident);
  }
  return false;
}

/** CSS properties whose values are typically numeric (no unit string needed). */
const NUMERIC_CSS_PROPS = new Set([
  "zIndex",
  "opacity",
  "flex",
  "flexGrow",
  "flexShrink",
  "order",
  "fontWeight",
  "lineHeight",
  "tabSize",
  "orphans",
  "widows",
  "columnCount",
]);

/**
 * CSS properties that accept numeric values in standard CSS / React inline styles
 * but are typed as `string` in StyleX. Numeric values must be coerced to strings.
 */
type PromotedParamType = "number" | "string" | "numberOrString";

const LENGTH_LIKE_CSS_PROP_RE =
  /^(top|right|bottom|left|width|height|minWidth|maxWidth|minHeight|maxHeight|margin|padding|gap|inset|translate|fontSize|letterSpacing|lineHeight|borderWidth|borderRadius|outline)/;

type PromotableStyleProperty = {
  key: string;
  staticValue: string | number | boolean | null;
  dynamicExpr: unknown;
  comments: PropCommentMetadata | null;
};

type PromotedDynamicParam = {
  cssProp: string;
  expr: unknown;
  comments: PropCommentMetadata | null;
};

type CommentableStylePropertyNode = {
  comments?: unknown;
  leadingComments?: unknown;
  trailingComments?: unknown;
};

function coerceToStringForStyleX(cssProp: string, value: unknown): unknown {
  if (isStylexStringOnlyCssProp(cssProp) && typeof value === "number") {
    return String(value);
  }
  return value;
}

/**
 * Infers a TS type keyword for a dynamic expression based on the CSS property it's assigned to.
 * Numeric-only properties get `number`; ambiguous length-like values get `number | string`.
 * StyleX string-only properties always get `string` even when the value is numeric.
 */
function inferTypeForCssProp(cssProp: string, expr: unknown): PromotedParamType {
  if (isStylexStringOnlyCssProp(cssProp)) {
    return "string";
  }
  const conditionalType = inferTypeFromConditionalBranches(expr);
  if (conditionalType) {
    if (conditionalType === "number" && LENGTH_LIKE_CSS_PROP_RE.test(cssProp)) {
      return "numberOrString";
    }
    return conditionalType;
  }
  const staticVal = literalToStaticValue(expr);
  if (typeof staticVal === "number") {
    return "number";
  }
  if (typeof staticVal === "string") {
    return "string";
  }
  if (NUMERIC_CSS_PROPS.has(cssProp)) {
    return "number";
  }
  if (LENGTH_LIKE_CSS_PROP_RE.test(cssProp)) {
    return "numberOrString";
  }
  return "string";
}

function inferTypeFromConditionalBranches(expr: unknown): PromotedParamType | null {
  if (!expr || typeof expr !== "object") {
    return null;
  }
  const node = expr as { type?: string; consequent?: unknown; alternate?: unknown };
  if (node.type !== "ConditionalExpression") {
    return null;
  }
  const consequent = inferTypeFromExpressionValue(node.consequent);
  const alternate = inferTypeFromExpressionValue(node.alternate);
  if (!consequent || !alternate) {
    return null;
  }
  if (consequent === alternate) {
    return consequent;
  }
  return "numberOrString";
}

function inferTypeFromExpressionValue(expr: unknown): PromotedParamType | null {
  const nested = inferTypeFromConditionalBranches(expr);
  if (nested) {
    return nested;
  }
  if (expr && typeof expr === "object" && (expr as { type?: string }).type === "TemplateLiteral") {
    return "string";
  }
  const value = literalToStaticValue(expr);
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  return null;
}

/**
 * Analyzes JSX call-site `style={{ ... }}` objects for all intrinsic styled components
 * and promotes analyzable style objects to proper `stylex.create` entries.
 *
 * This avoids wrapper components and `mergedSx` calls for components whose
 * call-site style props are static objects (or objects with known dynamic values).
 */
function analyzePromotableStyleProps(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  styledDecls: StyledDecl[],
  /**
   * Every decl in the file, including skipped ones. A preserved `styled(Base)` leaf
   * still references `Base` at runtime, so Base must stay a wrapper — the extends
   * check uses this list so it sees skipped extenders.
   */
  allStyledDecls: StyledDecl[],
  declByLocal: Map<string, StyledDecl>,
  getJsxUsageCount: (name: string) => number,
  resolvedStyleObjects: Map<string, unknown>,
): void {
  // Collect every style key that already exists across the file so promoted
  // entries can be safely deduplicated against unrelated styled components,
  // template-derived variants (`decl.variantStyleKeys`), per-call-site combined
  // styles, and base-component-resolved boolean variants. Without this, a
  // generated variant key like `${baseKey}${ConditionName}` could silently
  // overwrite an unrelated style entry.
  const reservedStyleKeys = collectReservedStyleKeys(resolvedStyleObjects, styledDecls);

  for (const decl of styledDecls) {
    // Only promote for elements that don't already need wrappers and ultimately render
    // as intrinsic elements (either directly or through a chain of styled extensions).
    if (decl.isCssHelper || decl.needsWrapperComponent) {
      continue;
    }
    if (!resolvesToIntrinsic(decl, declByLocal)) {
      continue;
    }
    // Promotion inlines call sites (replacing `<Decl ... style={...}>` with the
    // intrinsic JSX). Inlining is unsafe when the styled decl's resolved style
    // pipeline still has wrapper-scoped expressions or extra-style logic that
    // can't be re-evaluated at the call site. In those cases, the call site
    // would emit unresolved identifiers (e.g. `showProperty(width) ? ...`).
    // Conservatively bail when any of these wrapper-only artifacts are present.
    if (
      decl.inlineStyleProps?.length ||
      decl.extraStylexPropsArgs?.length ||
      decl.extraStyleKeys?.length ||
      decl.styleFnFromProps?.some((p) => p.conditionWhen)
    ) {
      continue;
    }
    // Bail if the base style uses !important on any property — promoting call-site
    // styles to StyleX entries would lose the !important-beats-inline-style semantics.
    if (baseStyleHasImportant(resolvedStyleObjects.get(decl.styleKey))) {
      continue;
    }

    // Collect all JSX call sites for this component.
    const callSites: Array<{ opening: any; children?: unknown[] }> = [];
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
      } as object)
      .forEach((p) =>
        callSites.push({ opening: p.node.openingElement, children: p.node.children as unknown[] }),
      );
    root
      .find(j.JSXSelfClosingElement, {
        name: { type: "JSXIdentifier", name: decl.localName },
      } as object)
      .forEach((p) => callSites.push({ opening: p.node }));

    if (callSites.length === 0) {
      continue;
    }

    // Check if ALL call sites with style props are promotable.
    let allPromotable = true;
    const siteAnalyses: Array<{
      opening: any;
      children?: unknown[];
      styleAttr: any;
      properties: PromotableStyleProperty[];
    }> = [];

    for (const { opening, children } of callSites) {
      const attrs = (opening.attributes ?? []) as any[];

      // Bail condition 6: JSXSpreadAttribute present
      if (attrs.some((a: any) => a.type === "JSXSpreadAttribute")) {
        allPromotable = false;
        break;
      }

      let styleAttr: any = null;
      let hasClassName = false;
      let hasAsProp = false;
      for (const a of attrs) {
        if (a.type !== "JSXAttribute" || a.name?.type !== "JSXIdentifier") {
          continue;
        }
        if (a.name.name === "style") {
          styleAttr = a;
        }
        if (a.name.name === "className") {
          hasClassName = true;
        }
        if (a.name.name === "as" || a.name.name === "forwardedAs") {
          hasAsProp = true;
        }
      }

      // Bail: `as` or `forwardedAs` requires wrapper for polymorphic element handling
      if (hasAsProp) {
        allPromotable = false;
        break;
      }

      // Bail condition 5: className present (needs mergedSx for className merging)
      if (hasClassName) {
        allPromotable = false;
        break;
      }

      // No style prop on this call site → it's fine, no promotion needed
      if (!styleAttr) {
        siteAnalyses.push({ opening, children, styleAttr: null, properties: [] });
        continue;
      }

      // Bail condition 1: style value is not an inline ObjectExpression
      const styleValue = styleAttr.value;
      if (
        !styleValue ||
        styleValue.type !== "JSXExpressionContainer" ||
        !styleValue.expression ||
        styleValue.expression.type !== "ObjectExpression"
      ) {
        allPromotable = false;
        break;
      }

      const objExpr = styleValue.expression;
      const properties: PromotableStyleProperty[] = [];

      let siteBail = false;
      for (const prop of objExpr.properties ?? []) {
        // Bail condition 2: SpreadElement
        if (prop.type === "SpreadElement" || prop.type === "SpreadProperty") {
          siteBail = true;
          break;
        }
        // Bail condition 3: Computed property key
        if (prop.computed) {
          siteBail = true;
          break;
        }
        const keyName =
          prop.key?.type === "Identifier"
            ? prop.key.name
            : prop.key?.type === "StringLiteral"
              ? prop.key.value
              : prop.key?.type === "Literal" && typeof prop.key.value === "string"
                ? prop.key.value
                : null;
        if (!keyName) {
          siteBail = true;
          break;
        }
        // Bail condition 4: CSS custom property keys
        if (keyName.startsWith("--")) {
          siteBail = true;
          break;
        }
        // Promotion only supports React-style identifier keys. Non-identifier keys
        // (e.g. "background-color") are preserved via inline style merging.
        if (!isValidIdentifierName(keyName)) {
          siteBail = true;
          break;
        }
        const comments = extractInlineStylePropComments(prop);
        const staticVal = literalToStaticValue(prop.value);
        if (staticVal !== null) {
          // Route static values through the authoritative CSS → StyleX mapping so
          // shorthands (`padding`, `margin`, `border`, `background`, …) are expanded
          // into longhand-only entries that StyleX accepts.
          const expanded = expandStaticStylePropToStylex(keyName, staticVal);
          if (!expanded) {
            siteBail = true;
            break;
          }
          for (let i = 0; i < expanded.length; i++) {
            const entry = expanded[i]!;
            properties.push({
              key: entry.key,
              staticValue: entry.value,
              dynamicExpr: null,
              comments: i === 0 ? comments : null,
            });
          }
        } else {
          // Dynamic values can't be statically decomposed, so shorthands and
          // multi-component properties on the denylist (or the StyleX-rejected
          // shorthand set) can't be safely promoted with a dynamic value.
          if (isNonPromotableStylexKey(keyName) || FORBIDDEN_SHORTHAND_PROPS.has(keyName)) {
            siteBail = true;
            break;
          }
          properties.push({ key: keyName, staticValue: null, dynamicExpr: prop.value, comments });
        }
      }

      if (siteBail) {
        allPromotable = false;
        break;
      }

      siteAnalyses.push({ opening, children, styleAttr, properties });
    }

    if (!allPromotable) {
      continue;
    }

    // All call sites are promotable. Generate entries and tag JSX nodes.
    const promotedEntries: PromotedStyleEntry[] = [];
    const usageCount = getJsxUsageCount(decl.localName);
    const usedKeyNames = new Set<string>();

    for (const site of siteAnalyses) {
      if (!site.styleAttr || site.properties.length === 0) {
        continue;
      }

      const allStatic = site.properties.every((p) => p.staticValue !== null);
      const hasDynamic = site.properties.some((p) => p.dynamicExpr !== null);

      if (allStatic && !hasDynamic) {
        // All-static style object
        const staticObj: Record<string, unknown> = {};
        for (const p of site.properties) {
          staticObj[p.key] = coerceToStringForStyleX(p.key, p.staticValue);
          addStylePropComments(staticObj, p.key, p.comments);
        }

        // Single-use component with extending chain: merge into base style key,
        // but only if no promoted property overlaps with existing base properties.
        const canMerge =
          usageCount <= 1 &&
          !decl.isExported &&
          !hasPropertyOverlap(staticObj, resolvedStyleObjects.get(decl.styleKey));
        if (canMerge) {
          promotedEntries.push({
            styleKey: decl.styleKey,
            styleValue: staticObj,
            mergeIntoBase: true,
          });
          (site.opening as any).__promotedMergeIntoBase = true;
        } else {
          // Multi-use or exported: create a new style key.
          const styleKey = generatePromotedStyleKey(decl.styleKey, usedKeyNames, site.children);
          usedKeyNames.add(styleKey);
          promotedEntries.push({ styleKey, styleValue: staticObj });
          (site.opening as any).__promotedStyleKey = styleKey;
        }
      } else if (hasDynamic) {
        // Mixed static+dynamic or all-dynamic: create a dynamic style function.
        // Build static part of the style object and collect dynamic params.
        const inlineStaticObj: Record<string, unknown> = {};
        const dynamicParams: PromotedDynamicParam[] = [];

        for (const p of site.properties) {
          if (p.staticValue !== null) {
            inlineStaticObj[p.key] = coerceToStringForStyleX(p.key, p.staticValue);
            addStylePropComments(inlineStaticObj, p.key, p.comments);
          } else {
            dynamicParams.push({ cssProp: p.key, expr: p.dynamicExpr, comments: p.comments });
          }
        }

        // Don't merge if another styled component extends this one — converting
        // the base style to a function would break the child's static style
        // reference. Also include skipped decls here: a preserved `styled(Base)`
        // leaf references `Base` at runtime and would break if merged.
        const isExtendedByOther = allStyledDecls.some(
          (d) => d !== decl && d.base.kind === "component" && d.base.ident === decl.localName,
        );
        const baseObj = resolvedStyleObjects.get(decl.styleKey);
        const baseIsSimpleObject = isPlainStyleObject(baseObj);
        const isReusable = usageCount > 1 || decl.isExported === true;

        // Shared-ternary promotion: when every dynamic value is the same
        // conditional `cond ? a : b` with literal branches, fold the alternate
        // values into the base and emit the consequent values as a separate
        // boolean-gated variant style. This produces `[styles.x, cond && styles.xVariant]`
        // instead of `styles.x(cond ? a : b, cond ? c : d, ...)`.
        if (!isReusable && !isExtendedByOther && baseIsSimpleObject) {
          const sharedTernary = tryExtractSharedTernaryPromotion({
            dynamicParams,
            inlineStaticObj,
            baseStyleKey: decl.styleKey,
            existingBaseStyles: baseObj,
            usedKeyNames,
            reservedKeys: reservedStyleKeys,
          });
          if (sharedTernary) {
            promotedEntries.push({
              styleKey: decl.styleKey,
              styleValue: sharedTernary.alternateStyles,
              mergeIntoBase: true,
            });
            promotedEntries.push({
              styleKey: sharedTernary.variantKey,
              styleValue: sharedTernary.consequentStyles,
            });
            (site.opening as { __promotedMergeIntoBase?: boolean }).__promotedMergeIntoBase = true;
            (
              site.opening as { __promotedConditionalVariant?: PromotedConditionalVariantTag }
            ).__promotedConditionalVariant = {
              styleKey: sharedTernary.variantKey,
              conditionExpr: sharedTernary.conditionExpr,
            };
            usedKeyNames.add(sharedTernary.variantKey);
            continue;
          }
        }

        // Check if we can merge the base static styles into this dynamic function.
        // This produces a single style entry instead of separate static + dynamic keys.
        const canMergeDynamic =
          !isReusable &&
          !isExtendedByOther &&
          baseIsSimpleObject &&
          !hasPropertyOverlap(inlineStaticObj, baseObj as Record<string, unknown>);

        // Collect all static properties (base + inline) for the merged function body.
        // Dynamic params override base properties with the same key, so filter them out.
        const dynamicPropKeys = new Set(dynamicParams.map((dp) => dp.cssProp));
        const mergedStaticProps: Array<{
          key: string;
          value: unknown;
          comments: PropCommentMetadata | null;
        }> = [];
        if (canMergeDynamic) {
          for (const [k, v] of Object.entries(baseObj as Record<string, unknown>)) {
            if (isPromotedStyleMetadataKey(k)) {
              continue;
            }
            if (!dynamicPropKeys.has(k)) {
              mergedStaticProps.push({
                key: k,
                value: v,
                comments: getStoredPropComments(baseObj as Record<string, unknown>, k),
              });
            }
          }
        }
        for (const [k, v] of Object.entries(inlineStaticObj)) {
          if (isPromotedStyleMetadataKey(k)) {
            continue;
          }
          mergedStaticProps.push({
            key: k,
            value: v,
            comments: getStoredPropComments(inlineStaticObj, k),
          });
        }

        const styleKey = canMergeDynamic
          ? decl.styleKey
          : generatePromotedDynamicStyleKey(decl.styleKey, usedKeyNames, site.children);
        if (!canMergeDynamic) {
          usedKeyNames.add(styleKey);
        }

        // Build the ArrowFunctionExpression AST node.
        // Use CSS property names as function parameter names for self-documenting code.
        // Deduplicate parameters with the same CSS property name.
        const paramEntries: Array<{
          paramName: string;
          cssProp: string;
          type: PromotedParamType;
        }> = [];
        const seenParamNames = new Set<string>();

        for (const dp of dynamicParams) {
          const paramName = dp.cssProp;
          if (!seenParamNames.has(paramName)) {
            seenParamNames.add(paramName);
            paramEntries.push({
              paramName,
              cssProp: dp.cssProp,
              type: inferTypeForCssProp(dp.cssProp, dp.expr),
            });
          }
        }

        // Build arrow function params
        const params = paramEntries.map((pe) => {
          const id = j.identifier(pe.paramName);
          const typeNode =
            pe.type === "number"
              ? j.tsNumberKeyword()
              : pe.type === "numberOrString"
                ? j.tsUnionType([j.tsNumberKeyword(), j.tsStringKeyword()])
                : j.tsStringKeyword();
          (id as any).typeAnnotation = j.tsTypeAnnotation(typeNode);
          return id;
        });

        // Build object expression body with merged base + inline properties
        const bodyProperties: ReturnType<typeof j.property>[] = [];
        for (const sp of mergedStaticProps) {
          const val = isAstNode(sp.value)
            ? (sp.value as ExpressionKind) // Already an AST node — use directly
            : typeof sp.value === "string"
              ? j.stringLiteral(sp.value)
              : typeof sp.value === "number"
                ? j.numericLiteral(sp.value)
                : j.booleanLiteral(sp.value as boolean);
          const prop = j.property("init", j.identifier(sp.key), val);
          attachStylePropComments(prop, sp.comments);
          bodyProperties.push(prop);
        }
        for (const p of site.properties) {
          if (p.dynamicExpr !== null) {
            const prop = j.property("init", j.identifier(p.key), j.identifier(p.key));
            (prop as any).shorthand = true;
            attachStylePropComments(prop, p.comments);
            bodyProperties.push(prop);
          }
        }

        const fnNode = j.arrowFunctionExpression(params, j.objectExpression(bodyProperties));

        if (canMergeDynamic) {
          // Replace the base static entry with the merged function.
          promotedEntries.push({
            styleKey: decl.styleKey,
            styleValue: fnNode as unknown as Record<string, unknown>,
            mergeIntoBase: true,
          });
          // Tag JSX: merge consumes the style attr, and the base key becomes a fn call.
          (site.opening as any).__promotedMergeIntoBase = true;
          (site.opening as any).__promotedMergeArgs = dynamicParams.map((dp) =>
            isStylexStringOnlyCssProp(dp.cssProp)
              ? j.callExpression(j.identifier("String"), [dp.expr as ExpressionKind])
              : dp.expr,
          );
        } else {
          // Store the AST node directly in resolvedStyleObjects (emitter handles AST nodes).
          promotedEntries.push({
            styleKey,
            styleValue: fnNode as unknown as Record<string, unknown>,
          });

          // Tag the JSX node with the style key and call arguments.
          (site.opening as any).__promotedStyleKey = styleKey;
          // The call args are the actual expressions from the style object.
          // For string-only CSS props (e.g. gridRow), wrap in String() to coerce numeric values.
          const callArgs = dynamicParams.map((dp) =>
            isStylexStringOnlyCssProp(dp.cssProp)
              ? j.callExpression(j.identifier("String"), [dp.expr as ExpressionKind])
              : dp.expr,
          );
          (site.opening as any).__promotedStyleArgs = callArgs;
        }
      }
    }

    if (promotedEntries.length > 0) {
      decl.promotedStyleProps = promotedEntries;
    }
  }
}

function extractInlineStylePropComments(
  prop: CommentableStylePropertyNode,
): PropCommentMetadata | null {
  const comments = collectUniqueComments([
    prop.comments,
    prop.leadingComments,
    prop.trailingComments,
  ]);
  const leadingLines: string[] = [];
  const leadingBlocks: string[] = [];
  const trailingLines: string[] = [];

  for (const comment of comments) {
    const value = getCommentValue(comment);
    if (!value) {
      continue;
    }
    if (isTrailingLineComment(comment)) {
      trailingLines.push(value);
      continue;
    }
    if (!isLeadingComment(comment)) {
      continue;
    }
    if (isLineComment(comment)) {
      leadingLines.push(value);
    } else if (isBlockComment(comment)) {
      leadingBlocks.push(value);
    }
  }

  const metadata: PropCommentMetadata = {};
  if (leadingBlocks.length > 0) {
    metadata.leading = leadingBlocks.join("\n");
  }
  if (leadingLines.length > 0) {
    metadata.leadingLine = leadingLines.join("\n");
  }
  if (trailingLines.length > 0) {
    metadata.trailingLine = trailingLines.join("\n");
  }
  return hasPropCommentMetadata(metadata) ? metadata : null;
}

function addStylePropComments(
  target: Record<string, unknown>,
  prop: string,
  comments: PropCommentMetadata | null,
): void {
  if (!comments) {
    return;
  }
  addPropComments(target, prop, comments);
}

function mergePromotedStaticStyleObject(
  target: Record<string, unknown>,
  incoming: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "__propComments") {
      mergeStoredPropComments(target, value);
      continue;
    }
    if (isPromotedStyleMetadataKey(key)) {
      continue;
    }
    target[key] = value;
  }
}

function mergeStoredPropComments(target: Record<string, unknown>, commentsMap: unknown): void {
  if (!commentsMap || typeof commentsMap !== "object" || Array.isArray(commentsMap)) {
    return;
  }
  for (const [prop, comments] of Object.entries(commentsMap as Record<string, unknown>)) {
    if (!comments || typeof comments !== "object" || Array.isArray(comments)) {
      continue;
    }
    addPropComments(target, prop, comments as PropCommentMetadata);
  }
}

function attachStylePropComments(prop: unknown, comments: PropCommentMetadata | null): void {
  const astComments = propCommentMetadataToAstComments(comments);
  if (astComments.length > 0) {
    (prop as { comments?: unknown[] }).comments = astComments;
  }
}

function getStoredPropComments(
  target: Record<string, unknown>,
  prop: string,
): PropCommentMetadata | null {
  const propComments = target.__propComments;
  if (!propComments || typeof propComments !== "object" || Array.isArray(propComments)) {
    return null;
  }
  const entry = (propComments as Record<string, unknown>)[prop];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  return entry as PropCommentMetadata;
}

function isPromotedStyleMetadataKey(key: string): boolean {
  return key === "__propComments" || key === SOURCE_CSS_PROPERTIES_KEY;
}

function hasPropCommentMetadata(metadata: PropCommentMetadata): boolean {
  return Boolean(metadata.leading || metadata.leadingLine || metadata.trailingLine);
}

function collectUniqueComments(commentGroups: unknown[]): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const group of commentGroups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const comment of group) {
      if (!comment || typeof comment !== "object") {
        continue;
      }
      const record = comment as Record<string, unknown>;
      const key = `${String(record.type)}\0${String(record.value)}\0${String(record.leading)}\0${String(record.trailing)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(record);
    }
  }
  return result;
}

function getCommentValue(comment: Record<string, unknown>): string | null {
  return typeof comment.value === "string" && comment.value.trim() ? comment.value.trim() : null;
}

function isLeadingComment(comment: Record<string, unknown>): boolean {
  return comment.trailing !== true && comment.leading !== false;
}

function isTrailingLineComment(comment: Record<string, unknown>): boolean {
  return comment.trailing === true && isLineComment(comment);
}

function isLineComment(comment: Record<string, unknown>): boolean {
  return comment.type === "CommentLine" || comment.type === "Line";
}

function isBlockComment(comment: Record<string, unknown>): boolean {
  return comment.type === "CommentBlock" || comment.type === "Block";
}

/**
 * Generates a unique style key for a promoted static style entry.
 * Tries to derive a descriptive suffix from JSX children text content,
 * falling back to `Inline`, `Inline2`, etc.
 */
function generatePromotedStyleKey(
  baseKey: string,
  usedKeys: Set<string>,
  children?: unknown[],
): string {
  return generateUniqueStyleKey(baseKey, usedKeys, children, "Inline");
}

/**
 * Generates a unique style key for a promoted dynamic style function.
 * Tries to derive a descriptive suffix from JSX children text content,
 * falling back to `Dynamic`, `Dynamic2`, etc.
 */
function generatePromotedDynamicStyleKey(
  baseKey: string,
  usedKeys: Set<string>,
  children?: unknown[],
): string {
  return generateUniqueStyleKey(baseKey, usedKeys, children, "Dynamic");
}

/**
 * Generates a unique style key with an optional text-derived suffix.
 * Extracts text from JSX children (direct text or text inside a child element)
 * and converts it to a camelCase suffix. Falls back to the provided fallback suffix.
 */
function generateUniqueStyleKey(
  baseKey: string,
  usedKeys: Set<string>,
  children: unknown[] | undefined,
  fallbackSuffix: string,
): string {
  const textSuffix = extractTextSuffixFromChildren(children);
  // Skip text suffix if it duplicates the base key (e.g., base "tick" + text "Tick" → "tickTick")
  if (textSuffix && textSuffix.toLowerCase() !== baseKey.toLowerCase()) {
    const candidate = `${baseKey}${textSuffix}`;
    if (!usedKeys.has(candidate)) {
      return candidate;
    }
  }
  // Fall back to numbered suffix
  let candidate = `${baseKey}${fallbackSuffix}`;
  if (!usedKeys.has(candidate)) {
    return candidate;
  }
  let i = 2;
  while (usedKeys.has(`${baseKey}${fallbackSuffix}${i}`)) {
    i++;
  }
  return `${baseKey}${fallbackSuffix}${i}`;
}

/**
 * Extracts a short camelCase suffix from JSX children text content.
 * Looks for direct JSXText or text inside the first child element (e.g., `<span>Label A</span>`).
 * Returns null if no usable text is found.
 */
function extractTextSuffixFromChildren(children: unknown[] | undefined): string | null {
  if (!children?.length) {
    return null;
  }

  let text: string | null = null;

  for (const child of children) {
    const c = child as { type?: string; value?: string; children?: unknown[] };
    // Direct JSXText (e.g., `<Box>Visible</Box>`)
    if (c.type === "JSXText" && c.value) {
      const trimmed = c.value.trim();
      if (trimmed) {
        text = trimmed;
        break;
      }
    }
    // JSXExpressionContainer with a string literal (e.g., `<Box>{"text"}</Box>`)
    if (c.type === "JSXExpressionContainer") {
      const expr = (c as { expression?: { type?: string; value?: unknown } }).expression;
      if (expr?.type === "StringLiteral" && typeof expr.value === "string" && expr.value.trim()) {
        text = expr.value.trim();
        break;
      }
    }
    // Text inside a child element (e.g., `<Box><span>Label A</span></Box>`)
    if (c.type === "JSXElement" && c.children?.length) {
      const nested = extractTextSuffixFromChildren(c.children);
      if (nested) {
        return nested;
      }
    }
  }

  if (!text) {
    return null;
  }

  // Convert to camelCase suffix: "Label A" → "LabelA", "hello world" → "HelloWorld"
  // Keep only alphanumeric chars, capitalize each word
  const words = text.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  // Limit to first 3 words and 20 chars to keep keys readable
  const truncated = words.slice(0, 3);
  // Drop trailing connector words (e.g. "Margin quad and explicit" → "MarginQuad")
  // so suffixes don't dangle on filler words.
  while (
    truncated.length > 0 &&
    SUFFIX_STOP_WORDS.has(truncated[truncated.length - 1]!.toLowerCase())
  ) {
    truncated.pop();
  }
  if (truncated.length === 0) {
    return null;
  }
  const suffix = truncated.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  if (suffix.length > 20) {
    return null;
  }
  return suffix;
}

/** Connector words dropped from the trailing position of text-derived style key suffixes. */
const SUFFIX_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/**
 * Returns true if any property key in `incoming` already exists in `base`.
 * Used to prevent merge-into-base from overwriting existing style properties.
 */
function hasPropertyOverlap(incoming: Record<string, unknown>, base: unknown): boolean {
  if (!base || typeof base !== "object" || isAstNode(base)) {
    return false;
  }
  const baseObj = base as Record<string, unknown>;
  for (const key of Object.keys(incoming)) {
    if (isPromotedStyleMetadataKey(key)) {
      continue;
    }
    if (key in baseObj) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if any value in the base resolved style object contains `!important`.
 * When the base uses `!important`, style props must stay as inline styles (via mergedSx)
 * to preserve the semantics where `!important` CSS beats inline `style` attributes.
 */
function baseStyleHasImportant(base: unknown): boolean {
  if (!base || typeof base !== "object" || isAstNode(base)) {
    return false;
  }
  return Object.values(base as Record<string, unknown>).some(
    (v) => typeof v === "string" && v.includes("!important"),
  );
}

/**
 * Returns true if an intrinsic styled component's wrapper was set only for
 * styleFnFromProps with transient ($-prefixed) props, and the inline JSX
 * rewrite path can handle the style function calls and prop stripping.
 */
function canDowngradeStyleFnOnlyWrapper(
  decl: StyledDecl,
  wrapperForcedByPrepass: Set<string>,
): boolean {
  if (!decl.needsWrapperComponent) {
    return false;
  }
  if (wrapperForcedByPrepass.has(decl.localName)) {
    return false;
  }
  if (decl.isCssHelper || decl.isDirectJsxResolution) {
    return false;
  }
  if (decl.base.kind !== "intrinsic") {
    return false;
  }
  if (decl.bridgeClassName || decl.attrWrapper) {
    return false;
  }
  return hasInlineableStyleFnOnly(decl);
}

/** JSX-side tag for shared-ternary promotion: applies `cond && styles.variantKey` at the call site. */
type PromotedConditionalVariantTag = {
  styleKey: string;
  conditionExpr: unknown;
};

/**
 * Detects when every dynamic property in a promoted style object shares the same
 * conditional `cond ? a : b` test with literal branches, and folds the alternate
 * values into the base style + emits the consequent values as a boolean-gated
 * variant style key. Returns `null` when the pattern doesn't apply.
 *
 * Caller must already have verified that:
 * - The component is single-use, non-exported, and not extended by another component.
 * - The base style object has only primitive/AST-node values (no nested rule objects).
 */
function tryExtractSharedTernaryPromotion(args: {
  dynamicParams: Array<{ cssProp: string; expr: unknown }>;
  inlineStaticObj: Record<string, unknown>;
  baseStyleKey: string;
  existingBaseStyles: Record<string, unknown>;
  /** Keys generated by other promotion sites within this `analyzePromotableStyleProps` pass. */
  usedKeyNames: Set<string>;
  /** Keys already in use globally (other styled decls, template variants, base-resolved variants). */
  reservedKeys: Set<string>;
}): {
  variantKey: string;
  consequentStyles: Record<string, unknown>;
  alternateStyles: Record<string, unknown>;
  conditionExpr: unknown;
} | null {
  const {
    dynamicParams,
    inlineStaticObj,
    baseStyleKey,
    existingBaseStyles,
    usedKeyNames,
    reservedKeys,
  } = args;

  if (dynamicParams.length < 2) {
    return null;
  }

  let conditionExpr: unknown = null;
  const consequentEntries: Array<{ key: string; value: string | number | boolean }> = [];
  const alternateEntries: Array<{ key: string; value: string | number | boolean }> = [];
  for (const dp of dynamicParams) {
    const expr = dp.expr;
    if (!isConditionalExpressionNode(expr)) {
      return null;
    }
    const consequentVal = literalToStaticValue(expr.consequent);
    const alternateVal = literalToStaticValue(expr.alternate);
    if (consequentVal === null || alternateVal === null) {
      return null;
    }
    if (conditionExpr === null) {
      conditionExpr = expr.test;
    } else if (!astNodesEqual(conditionExpr, expr.test)) {
      return null;
    }
    consequentEntries.push({
      key: dp.cssProp,
      value: coerceToStringForStyleX(dp.cssProp, consequentVal) as string | number | boolean,
    });
    alternateEntries.push({
      key: dp.cssProp,
      value: coerceToStringForStyleX(dp.cssProp, alternateVal) as string | number | boolean,
    });
  }

  if (!conditionExpr) {
    return null;
  }

  // Only collapse N per-property evaluations into one shared evaluation when
  // the test is pure / idempotent. Otherwise hoisting changes runtime behavior:
  // `flipCoin() ? a : b` evaluated once vs N times can pick different branches.
  if (!isPureIdempotentExpression(conditionExpr)) {
    return null;
  }

  // The variant key must be derivable from the condition; bail when we can't
  // produce a stable readable suffix (matches existing variant-naming conventions).
  const conditionName = extractConditionName(conditionExpr as ExpressionKind);
  if (!conditionName) {
    return null;
  }

  // Reject overlap between the alternate-branch values folded into the base and
  // any pre-existing base or inline-static property — overwriting would silently
  // change semantics.
  for (const e of alternateEntries) {
    if (
      Object.prototype.hasOwnProperty.call(existingBaseStyles, e.key) ||
      Object.prototype.hasOwnProperty.call(inlineStaticObj, e.key)
    ) {
      return null;
    }
  }

  const alternateStyles: Record<string, unknown> = { ...inlineStaticObj };
  for (const e of alternateEntries) {
    alternateStyles[e.key] = e.value;
  }
  const consequentStyles: Record<string, unknown> = {};
  for (const e of consequentEntries) {
    consequentStyles[e.key] = e.value;
  }

  const variantKey = ensureUniqueKey(`${baseStyleKey}${conditionName}`, usedKeyNames, reservedKeys);

  return {
    variantKey,
    consequentStyles,
    alternateStyles,
    conditionExpr,
  };
}

function ensureUniqueKey(key: string, ...usedSets: Set<string>[]): string {
  const isUsed = (k: string): boolean => usedSets.some((s) => s.has(k));
  if (!isUsed(key)) {
    return key;
  }
  let i = 2;
  while (isUsed(`${key}${i}`)) {
    i++;
  }
  return `${key}${i}`;
}

/**
 * Snapshot of every style key that is already reserved across the file when
 * `analyzePromotableStyleProps` runs. Used to deduplicate newly-generated
 * promoted keys against unrelated styled components, template-derived variant
 * keys (`decl.variantStyleKeys`), per-call-site combined styles, and base-
 * component-resolved boolean variants — all of which exist in `decl` metadata
 * but may not yet have been injected into `resolvedStyleObjects`.
 */
function collectReservedStyleKeys(
  resolvedStyleObjects: Map<string, unknown>,
  styledDecls: StyledDecl[],
): Set<string> {
  const keys = new Set<string>(resolvedStyleObjects.keys());
  for (const decl of styledDecls) {
    keys.add(decl.styleKey);
    if (decl.extendsStyleKey) {
      keys.add(decl.extendsStyleKey);
    }
    for (const key of Object.values(decl.variantStyleKeys ?? {})) {
      keys.add(key);
    }
    for (const key of decl.extraStyleKeys ?? []) {
      keys.add(key);
    }
    for (const key of decl.extraStyleKeysAfterBase ?? []) {
      keys.add(key);
    }
    for (const sbv of decl.staticBooleanVariants ?? []) {
      keys.add(sbv.styleKey);
    }
    for (const cs of decl.callSiteCombinedStyles ?? []) {
      keys.add(cs.styleKey);
    }
  }
  return keys;
}

function hasOnlyProvableAdjacentSiblingUsages(
  root: TransformContext["root"],
  j: JSCodeshift,
  componentName: string,
): boolean {
  let hasUsage = false;
  let isSafe = true;

  const inspectChildren = (children: unknown[]): void => {
    let previousWasTarget = false;

    for (const child of children) {
      if (!isSafe) {
        return;
      }
      const childState = classifyAdjacentSiblingChild(child, componentName);
      if (childState.kind === "dynamic") {
        isSafe = false;
        return;
      }
      if (childState.kind === "target") {
        hasUsage = true;
        if (!previousWasTarget) {
          previousWasTarget = true;
          continue;
        }
        previousWasTarget = true;
        continue;
      }
      if (childState.kind === "other") {
        previousWasTarget = false;
      }
    }
  };

  root.find(j.JSXElement).forEach((path: any) => {
    if (!isSafe) {
      return;
    }
    const children = path.node.children ?? [];
    if (
      !children.some(
        (child: unknown) => classifyAdjacentSiblingChild(child, componentName).kind === "target",
      )
    ) {
      return;
    }
    inspectChildren(children);
  });

  root.find(j.JSXFragment).forEach((path: any) => {
    if (!isSafe) {
      return;
    }
    const children = path.node.children ?? [];
    if (
      !children.some(
        (child: unknown) => classifyAdjacentSiblingChild(child, componentName).kind === "target",
      )
    ) {
      return;
    }
    inspectChildren(children);
  });

  return hasUsage && isSafe;
}

function classifyAdjacentSiblingChild(
  child: unknown,
  componentName: string,
): { kind: "target" | "other" | "dynamic" } {
  if (!child || typeof child !== "object") {
    return { kind: "other" };
  }

  const node = child as {
    type?: string;
    openingElement?: { name?: unknown };
    name?: unknown;
    expression?: { type?: string };
  };

  if (node.type === "JSXText") {
    return /\S/.test((node as { value?: string }).value ?? "")
      ? { kind: "other" }
      : { kind: "other" };
  }

  if (node.type === "JSXElement") {
    const name = getRootJsxIdentifierName(node.openingElement?.name);
    return name === componentName ? { kind: "target" } : { kind: "other" };
  }

  if (node.type === "JSXFragment") {
    return { kind: "dynamic" };
  }

  if (node.type === "JSXExpressionContainer") {
    const exprType = node.expression?.type;
    if (exprType === "Literal" || exprType === "StringLiteral" || exprType === "TemplateLiteral") {
      return { kind: "other" };
    }
    return { kind: "dynamic" };
  }

  return { kind: "other" };
}

type LocalElementProofReason =
  | "ok"
  | "no-usage"
  | "dynamic-usage"
  | "non-jsx-usage"
  | "unknown-wrapper"
  | "unsupported-wrapper"
  | "child-not-inlineable";

type LocalElementProofResult = {
  safe: boolean;
  reason: LocalElementProofReason;
  targetsByStyleKey: Map<string, Set<string>>;
  sawCandidateMatch: boolean;
};

function proveLocalElementOverrideUsages(
  root: TransformContext["root"],
  j: JSCodeshift,
  componentName: string,
  overrides: LocalElementOverrideCandidate[],
  declByLocal: Map<string, StyledDecl>,
): LocalElementProofResult {
  const targetsByStyleKey = new Map<string, Set<string>>(
    overrides.map((override) => [override.styleKey, new Set<string>()]),
  );
  let sawUsage = false;
  let sawCandidateMatch = false;
  let reason: LocalElementProofReason = "ok";

  const inspectChildren = (
    children: unknown[],
    relation: LocalElementOverrideRelation,
    tagName: string,
  ): { safe: boolean; matches: Set<string>; reason?: LocalElementProofReason } => {
    const matches = new Set<string>();
    let failureReason: LocalElementProofReason | undefined;
    const visitChild = (child: unknown, isDirectChild: boolean): boolean => {
      if (!child || typeof child !== "object") {
        return true;
      }
      const node = child as {
        type?: string;
        children?: unknown[];
        openingElement?: { name?: unknown };
        expression?: {
          type?: string;
          expressions?: unknown[];
          elements?: unknown[];
          left?: unknown;
          right?: unknown;
          consequent?: unknown;
          alternate?: unknown;
        };
      };

      if (node.type === "JSXText") {
        return true;
      }
      if (node.type === "JSXFragment") {
        return false;
      }
      if (node.type === "JSXExpressionContainer") {
        const exprType = node.expression?.type;
        return (
          exprType === "JSXEmptyExpression" ||
          exprType === "Literal" ||
          exprType === "StringLiteral" ||
          exprType === "TemplateLiteral"
        );
      }
      if (node.type !== "JSXElement") {
        return false;
      }

      const name = getRootJsxIdentifierName(node.openingElement?.name);
      if (!name) {
        return false;
      }

      const decl = declByLocal.get(name);
      const isIntrinsicTagName = /^[a-z]/.test(name);
      const isIntrinsicMatch = isIntrinsicTagName && name === tagName;
      const staticAsTag =
        typeof decl?.attrsInfo?.staticAttrs?.as === "string"
          ? decl.attrsInfo.staticAttrs.as
          : undefined;
      const renderedTagName =
        decl?.attrsInfo?.attrsAsTag ??
        staticAsTag ??
        (decl?.base.kind === "intrinsic" ? decl.base.tagName : undefined);
      const isStyledIntrinsicMatch =
        !!decl && decl.base.kind === "intrinsic" && renderedTagName === tagName;
      const isUnknownWrapperBoundary =
        !isIntrinsicMatch && !isStyledIntrinsicMatch && (!!decl || !isIntrinsicTagName);

      if (
        (relation === "child" ? isDirectChild : true) &&
        (isIntrinsicMatch || isStyledIntrinsicMatch)
      ) {
        sawCandidateMatch = true;
        matches.add(isStyledIntrinsicMatch ? `styled:${name}` : `intrinsic:${tagName}`);
      }

      if (relation === "descendant") {
        if (isUnknownWrapperBoundary) {
          failureReason = "unsupported-wrapper";
          return false;
        }
        for (const grandchild of node.children ?? []) {
          if (!visitChild(grandchild, false)) {
            return false;
          }
        }
      }
      if (relation === "child" && isDirectChild && isUnknownWrapperBoundary) {
        failureReason = "unsupported-wrapper";
        return false;
      }
      return true;
    };

    for (const child of children) {
      if (!visitChild(child, true)) {
        return { safe: false, matches, ...(failureReason ? { reason: failureReason } : {}) };
      }
    }
    return { safe: true, matches };
  };

  root
    .find(j.JSXElement, {
      openingElement: { name: { type: "JSXIdentifier", name: componentName } },
    } as any)
    .forEach((path: any) => {
      sawUsage = true;
      for (const override of overrides) {
        const inspected = inspectChildren(
          path.node.children ?? [],
          override.relation,
          override.tagName,
        );
        if (!inspected.safe) {
          reason = inspected.reason ?? "dynamic-usage";
          return;
        }
        const targetSet = targetsByStyleKey.get(override.styleKey)!;
        for (const match of inspected.matches) {
          targetSet.add(match);
        }
      }
    });

  if (reason !== "ok") {
    return { safe: false, reason, targetsByStyleKey, sawCandidateMatch };
  }
  if (!sawUsage) {
    return { safe: false, reason: "no-usage", targetsByStyleKey, sawCandidateMatch };
  }
  if ([...targetsByStyleKey.values()].some((set) => set.size === 0)) {
    return {
      safe: false,
      reason: sawCandidateMatch ? "dynamic-usage" : "no-usage",
      targetsByStyleKey,
      sawCandidateMatch,
    };
  }
  return { safe: true, reason: "ok", targetsByStyleKey, sawCandidateMatch };
}

function getLocalElementWarningType(
  override: LocalElementOverrideCandidate,
  reason: LocalElementProofReason,
):
  | "Unsupported selector: ambiguous element selector"
  | "Unsupported selector: descendant/child/sibling selector"
  | "Unsupported selector: element selector with dynamic children"
  | "Unsupported selector: element selector with plain intrinsic children" {
  if (reason === "no-usage") {
    return "Unsupported selector: descendant/child/sibling selector";
  }
  if (reason === "dynamic-usage" || reason === "unsupported-wrapper") {
    return "Unsupported selector: element selector with dynamic children";
  }
  if (reason === "child-not-inlineable" || reason === "non-jsx-usage") {
    return "Unsupported selector: ambiguous element selector";
  }
  return override.tagName === "svg" || override.tagName === "button"
    ? "Unsupported selector: element selector with plain intrinsic children"
    : "Unsupported selector: ambiguous element selector";
}

function makeLocalElementTargetStyleKey(
  override: LocalElementOverrideCandidate,
  targetId: string,
): string {
  const targetName = targetId.startsWith("styled:")
    ? targetId.slice("styled:".length)
    : targetId.slice("intrinsic:".length);
  const normalizedTargetName =
    targetName[0]?.toLowerCase() === targetName[0]
      ? targetName
      : `${targetName[0]?.toLowerCase() ?? ""}${targetName.slice(1)}`;
  const relationPrefix = override.relation === "child" ? "child" : "descendant";
  const targetSuffix = camelToKebabCase(normalizedTargetName).replace(/-([a-z])/g, (_, c) =>
    c.toUpperCase(),
  );
  return `${relationPrefix}${targetSuffix[0]?.toUpperCase() ?? ""}${targetSuffix.slice(1)}`;
}

function buildLocalElementOverrideProperties(args: {
  j: JSCodeshift;
  override: LocalElementOverrideCandidate;
  childStyleObjects: Array<Record<string, unknown>>;
}) {
  const { j, override, childStyleObjects } = args;
  return buildRelationOverrideProperties({
    j,
    pseudoBuckets: override.pseudoBuckets,
    childStyleObjects,
    makeCssPropKey,
    childPseudos: override.childPseudo ? new Set([override.childPseudo]) : undefined,
    markerVarName: undefined,
  });
}

function hasPseudoLocalElementOverride(override: LocalElementOverrideCandidate): boolean {
  return [...override.pseudoBuckets.keys()].some((pseudo) => pseudo !== null);
}

function hasPseudoOnlyLocalElementOverride(override: LocalElementOverrideCandidate): boolean {
  return override.pseudoBuckets.size > 0 && !override.pseudoBuckets.has(null);
}

function hasOverlappingPseudoOnlyLocalOverride(
  priorOverrides: LocalElementOverrideCandidate[],
  nextOverride: LocalElementOverrideCandidate,
  targetId: string,
): boolean {
  if (!hasPseudoOnlyLocalElementOverride(nextOverride)) {
    return false;
  }
  const nextProps = new Set(getLocalElementOverridePropNames(nextOverride));
  return priorOverrides.some((priorOverride) => {
    if (!hasPseudoOnlyLocalElementOverride(priorOverride)) {
      return false;
    }
    if (!priorOverride.styleKeysByTargetId?.[targetId]) {
      return false;
    }
    return getLocalElementOverridePropNames(priorOverride).some((prop) => nextProps.has(prop));
  });
}

function getLocalElementOverridePropNames(override: LocalElementOverrideCandidate): string[] {
  return [...override.pseudoBuckets.values()].flatMap((bucket) => Object.keys(bucket));
}

function hasRuntimeStyleEntriesForLocalElementTarget(decl: StyledDecl): boolean {
  return (
    Object.keys(decl.variantStyleKeys ?? {}).length > 0 ||
    (decl.variantDimensions?.length ?? 0) > 0 ||
    (decl.staticBooleanVariants?.length ?? 0) > 0 ||
    (decl.callSiteCombinedStyles?.length ?? 0) > 0 ||
    (decl.styleFnFromProps?.length ?? 0) > 0 ||
    (decl.extraStylexPropsArgs?.length ?? 0) > 0
  );
}

function buildResolvedStyleObjectList(
  decl: StyledDecl,
  resolvedStyleObjects: Map<string, unknown>,
): Array<Record<string, unknown>> {
  const afterBaseKeys = new Set(decl.extraStyleKeysAfterBase ?? []);
  const beforeBaseKeys: string[] = [];
  const afterBaseKeysInOrder: string[] = [];
  for (const key of decl.extraStyleKeys ?? []) {
    if (afterBaseKeys.has(key)) {
      afterBaseKeysInOrder.push(key);
    } else {
      beforeBaseKeys.push(key);
    }
  }
  const keys = [
    ...afterBaseKeysInOrder.reverse(),
    decl.styleKey,
    ...beforeBaseKeys.reverse(),
    ...(decl.extendsStyleKey ? [decl.extendsStyleKey] : []),
  ];
  const results: Array<Record<string, unknown>> = [];
  for (const key of keys) {
    const value = resolvedStyleObjects.get(key);
    results.push(...getPlainStyleObjectsFromResolvedValue(value));
  }
  return results;
}

function getPlainStyleObjectsFromResolvedValue(value: unknown): Array<Record<string, unknown>> {
  if (isPlainStyleObject(value)) {
    return [value];
  }
  if (isAstNode(value) && (value as { type?: string }).type === "ObjectExpression") {
    const converted = objectExpressionToPlainStyleObject(
      value as {
        properties?: Array<{
          type?: string;
          key?: { type?: string; name?: string; value?: unknown };
          value?: unknown;
        }>;
      },
    );
    return converted ? [converted] : [];
  }
  return [];
}

function objectExpressionToPlainStyleObject(node: {
  properties?: Array<{
    type?: string;
    key?: { type?: string; name?: string; value?: unknown };
    value?: unknown;
  }>;
}): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  for (const property of node.properties ?? []) {
    if (property.type !== "Property") {
      return null;
    }
    const key =
      property.key?.type === "Identifier"
        ? property.key.name
        : property.key?.type === "Literal" || property.key?.type === "StringLiteral"
          ? String(property.key.value)
          : null;
    if (!key) {
      return null;
    }
    result[key] = property.value;
  }
  return result;
}

function isPlainStyleObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !isAstNode(value) &&
    Object.values(value as Record<string, unknown>).every(
      (v) =>
        typeof v === "string" || typeof v === "number" || typeof v === "boolean" || isAstNode(v),
    )
  );
}

function mergeInheritedAttrsInfo(
  baseAttrsInfo: NonNullable<StyledDecl["attrsInfo"]>,
  ownAttrsInfo: StyledDecl["attrsInfo"],
): NonNullable<StyledDecl["attrsInfo"]> {
  const ownAttrNames = collectAttrsInfoAttrNames(ownAttrsInfo);
  return {
    staticAttrs: {
      ...Object.fromEntries(
        Object.entries(baseAttrsInfo.staticAttrs ?? {}).filter(([key]) => !ownAttrNames.has(key)),
      ),
      ...ownAttrsInfo?.staticAttrs,
    },
    sourceKind: ownAttrsInfo?.sourceKind ?? baseAttrsInfo.sourceKind,
    hasUnsupportedValues:
      (baseAttrsInfo.hasUnsupportedValues ?? false) ||
      (ownAttrsInfo?.hasUnsupportedValues ?? false),
    attrsAsTag: ownAttrsInfo?.attrsAsTag ?? baseAttrsInfo.attrsAsTag,
    defaultAttrs: mergeAttrEntriesByAttrName(
      filterAttrEntriesByAttrName(baseAttrsInfo.defaultAttrs, ownAttrNames),
      ownAttrsInfo?.defaultAttrs,
    ),
    conditionalAttrs: [
      ...filterAttrEntriesByAttrName(baseAttrsInfo.conditionalAttrs, ownAttrNames),
      ...(ownAttrsInfo?.conditionalAttrs ?? []),
    ],
    invertedBoolAttrs: [
      ...filterAttrEntriesByAttrName(baseAttrsInfo.invertedBoolAttrs, ownAttrNames),
      ...(ownAttrsInfo?.invertedBoolAttrs ?? []),
    ],
    dynamicAttrs: mergeAttrEntriesByAttrName(
      filterAttrEntriesByAttrName(baseAttrsInfo.dynamicAttrs, ownAttrNames),
      ownAttrsInfo?.dynamicAttrs,
    ),
    attrsStaticStyles: {
      ...baseAttrsInfo.attrsStaticStyles,
      ...ownAttrsInfo?.attrsStaticStyles,
    },
    attrsStaticStyleExpr: ownAttrsInfo?.attrsStaticStyleExpr ?? baseAttrsInfo.attrsStaticStyleExpr,
    attrsDynamicStyles: [
      ...(baseAttrsInfo.attrsDynamicStyles ?? []),
      ...(ownAttrsInfo?.attrsDynamicStyles ?? []),
    ],
  };
}

function collectAttrsInfoAttrNames(attrsInfo: StyledDecl["attrsInfo"]): Set<string> {
  const names = new Set<string>();
  for (const key of Object.keys(attrsInfo?.staticAttrs ?? {})) {
    names.add(key);
  }
  for (const entry of attrsInfo?.defaultAttrs ?? []) {
    names.add(entry.attrName);
  }
  for (const entry of attrsInfo?.dynamicAttrs ?? []) {
    names.add(entry.attrName);
  }
  for (const entry of attrsInfo?.conditionalAttrs ?? []) {
    names.add(entry.attrName);
  }
  for (const entry of attrsInfo?.invertedBoolAttrs ?? []) {
    names.add(entry.attrName);
  }
  return names;
}

function filterAttrEntriesByAttrName<T extends { attrName: string }>(
  entries: T[] | undefined,
  names: ReadonlySet<string>,
): T[] {
  return (entries ?? []).filter((entry) => !names.has(entry.attrName));
}

function mergeAttrEntriesByAttrName<T extends { attrName: string }>(
  baseEntries: T[] | undefined,
  ownEntries: T[] | undefined,
): T[] {
  const byAttrName = new Map<string, T>();
  for (const entry of baseEntries ?? []) {
    byAttrName.set(entry.attrName, entry);
  }
  for (const entry of ownEntries ?? []) {
    byAttrName.set(entry.attrName, entry);
  }
  return [...byAttrName.values()];
}

function validateSxRestrictedWrappedComponentStyles(
  ctx: TransformContext,
  styledDecls: StyledDecl[],
): boolean {
  if (!ctx.adapter.useSxProp || !ctx.resolvedStyleObjects) {
    return true;
  }

  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.base.kind !== "component") {
      continue;
    }

    const componentInterface = wrappedComponentInterfaceFor(ctx, decl.base.ident);
    const excludedProperties = componentInterface?.sxExcludedProperties;
    const allowedProperties = componentInterface?.sxAllowedProperties;
    const hasAllowedProperties = allowedProperties !== undefined;
    if (
      componentInterface?.acceptsSx !== true ||
      (!excludedProperties?.length &&
        !hasAllowedProperties &&
        !componentInterface.rootOnlyProperties?.length)
    ) {
      continue;
    }

    const excluded = new Set(excludedProperties ?? []);
    const allowed = hasAllowedProperties ? new Set(allowedProperties) : null;
    const rootOnly =
      componentInterface.sxTarget === "inner" && componentInterface.rootOnlyProperties?.length
        ? new Set(componentInterface.rootOnlyProperties)
        : null;
    for (const styleKey of collectAllStyleKeysForDecl(decl)) {
      const style = ctx.resolvedStyleObjects.get(styleKey);
      if (!style || typeof style !== "object") {
        continue;
      }
      const rootOnlyProperty = rootOnly ? findSxExcludedStyleProperty(style, rootOnly) : null;
      if (rootOnlyProperty) {
        ctx.warnings.push({
          severity: "error",
          type: "Wrapped component sx prop targets an inner element for a root style property",
          loc: decl.loc,
          context: {
            localName: decl.localName,
            wrappedComponent: decl.base.ident,
            styleKey,
            property: rootOnlyProperty,
          },
        });
        return false;
      }
      const rejectedProperty =
        excluded.size > 0 ? findSxExcludedStyleProperty(style, excluded) : null;
      if (!rejectedProperty) {
        const disallowedProperty = allowed ? findSxDisallowedStyleProperty(style, allowed) : null;
        if (!disallowedProperty) {
          continue;
        }
        ctx.warnings.push({
          severity: "error",
          type: "Wrapped component sx prop does not accept generated StyleX property",
          loc: decl.loc,
          context: {
            localName: decl.localName,
            wrappedComponent: decl.base.ident,
            styleKey,
            property: disallowedProperty,
          },
        });
        return false;
      }
      ctx.warnings.push({
        severity: "error",
        type: "Wrapped component sx prop rejects logical CSS properties that cannot be preserved losslessly",
        loc: decl.loc,
        context: {
          localName: decl.localName,
          wrappedComponent: decl.base.ident,
          styleKey,
          property: rejectedProperty,
        },
      });
      return false;
    }
  }
  return true;
}

function validateWrappedComponentStyleChannels(
  ctx: TransformContext,
  styledDecls: StyledDecl[],
): boolean {
  if (!ctx.resolvedStyleObjects) {
    return true;
  }

  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.base.kind !== "component") {
      continue;
    }
    const baseIdent = decl.base.ident;
    if (styledDecls.some((candidate) => candidate.localName === baseIdent)) {
      continue;
    }
    const importInfo = ctx.importMap?.get(baseIdent);
    const isLocalNonStyledWrappedComponent =
      !importInfo && isLocalFunctionComponent(ctx.root, ctx.j, baseIdent);
    if (!importInfo && !isLocalNonStyledWrappedComponent) {
      continue;
    }
    if (
      importInfo?.source.kind === "absolutePath" &&
      ctx.options.transformedFileSources?.has(resolveExistingFilePath(importInfo.source.value))
    ) {
      continue;
    }
    if (!declHasEmittedStyle(ctx, decl)) {
      continue;
    }
    const componentInterface = wrappedComponentInterfaceFor(ctx, baseIdent);
    if (componentInterface?.acceptsSx === true && componentInterface.sxTarget !== "inner") {
      continue;
    }

    const metadata = findWrappedComponentMetadata(ctx, baseIdent);
    if (!metadata || componentAcceptsStylexClassName(metadata)) {
      continue;
    }
    if (isLocalNonStyledWrappedComponent && !hasInlineObjectPropType(metadata)) {
      continue;
    }

    ctx.warnings.push({
      severity: "error",
      type: "Wrapped component does not accept className or sx for generated StyleX styles",
      loc: decl.loc,
      context: {
        localName: decl.localName,
        wrappedComponent: decl.base.ident,
      },
    });
    return false;
  }
  return true;
}

function declHasEmittedStyle(ctx: TransformContext, decl: StyledDecl): boolean {
  for (const styleKey of collectAllStyleKeysForDecl(decl)) {
    if (ctx.resolvedStyleObjects?.has(styleKey)) {
      return true;
    }
  }
  return false;
}

function findWrappedComponentMetadata(
  ctx: TransformContext,
  componentLocalName: string,
): TypeScriptComponentMetadata | undefined {
  const metadata = ctx.options.crossFileInfo?.typeScriptMetadata;
  const importInfo = ctx.importMap?.get(componentLocalName);
  if (importInfo?.source.kind === "absolutePath") {
    return findTypeScriptComponentMetadata(metadata, importInfo.source.value, [
      importInfo.importedName,
      componentLocalName,
    ]);
  }
  return findTypeScriptComponentMetadata(metadata, ctx.file.path, [componentLocalName]);
}

function componentAcceptsStylexClassName(metadata: TypeScriptComponentMetadata): boolean {
  if (metadata.propType && isIntrinsicReactPropsTypeText(metadata.propType.text)) {
    return true;
  }
  if (metadata.hasIndexSignature) {
    return true;
  }
  if (metadata.explicitPropNames.includes("className")) {
    return true;
  }
  return metadata.props.some((prop) => prop.name === "className");
}

function isIntrinsicReactPropsTypeText(typeText: string): boolean {
  return /^(?:[$A-Z_a-z][$\w]*\.)*ComponentProps(?:WithRef|WithoutRef)?\s*<\s*(['"])[^'"]+\1\s*>$/.test(
    typeText.trim(),
  );
}

function hasInlineObjectPropType(metadata: TypeScriptComponentMetadata): boolean {
  return metadata.propType?.text.trim().startsWith("{") === true;
}

function findSxDisallowedStyleProperty(
  style: object,
  allowedProperties: ReadonlySet<string>,
): string | null {
  if (isAstNode(style)) {
    return findSxDisallowedStylePropertyInAstNode(style, allowedProperties);
  }

  for (const [key, value] of Object.entries(style)) {
    if (isStylexConditionKey(key)) {
      if (value && typeof value === "object") {
        const nested = findSxDisallowedStyleProperty(value, allowedProperties);
        if (nested) {
          return nested;
        }
      }
      continue;
    }
    if (!allowedProperties.has(key)) {
      return key;
    }
  }
  return null;
}

function staticObjectPropertyName(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") {
    return null;
  }
  const p = prop as { type?: string; computed?: boolean; key?: unknown };
  if ((p.type !== "Property" && p.type !== "ObjectProperty") || p.computed) {
    return null;
  }
  const key = p.key as { type?: string; name?: string; value?: unknown } | undefined;
  if (!key) {
    return null;
  }
  if (key.type === "Identifier") {
    return key.name ?? null;
  }
  if (key.type === "Literal" || key.type === "StringLiteral") {
    return typeof key.value === "string" ? key.value : null;
  }
  return null;
}

function isStylexConditionKey(key: string): boolean {
  return (
    key === "default" ||
    key === "__computedKeys" ||
    key.startsWith(":") ||
    key.startsWith("@") ||
    key.startsWith("stylex.when")
  );
}

function findSxExcludedStyleProperty(
  style: object,
  excludedProperties: ReadonlySet<string>,
): string | null {
  if (isAstNode(style)) {
    return findSxExcludedStylePropertyInAstNode(style, excludedProperties);
  }

  for (const [key, value] of Object.entries(style)) {
    if (excludedProperties.has(key)) {
      return key;
    }
    if (value && typeof value === "object") {
      const nested = findSxExcludedStyleProperty(value, excludedProperties);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function findSxExcludedStylePropertyInAstNode(
  node: object,
  excludedProperties: ReadonlySet<string>,
): string | null {
  const n = node as {
    type?: string;
    argument?: unknown;
    body?: unknown;
    expression?: unknown;
    properties?: unknown[];
  };
  if (n.type === "ObjectExpression") {
    for (const prop of n.properties ?? []) {
      const name = staticObjectPropertyName(prop);
      if (name && excludedProperties.has(name)) {
        return name;
      }
      const value = (prop as { value?: unknown }).value;
      if (value && typeof value === "object") {
        const nested = findSxExcludedStylePropertyInAstNode(value, excludedProperties);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  }
  if (n.type === "ArrowFunctionExpression" && n.body && typeof n.body === "object") {
    return findSxExcludedStylePropertyInAstNode(n.body, excludedProperties);
  }
  if (n.type === "BlockStatement" && Array.isArray((n as { body?: unknown[] }).body)) {
    for (const statement of (n as { body?: unknown[] }).body ?? []) {
      const s = statement as { type?: string; argument?: unknown };
      if (s.type === "ReturnStatement" && s.argument && typeof s.argument === "object") {
        const nested = findSxExcludedStylePropertyInAstNode(s.argument, excludedProperties);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return null;
}

function findSxDisallowedStylePropertyInAstNode(
  node: object,
  allowedProperties: ReadonlySet<string>,
): string | null {
  const n = node as {
    type?: string;
    argument?: unknown;
    body?: unknown;
    expression?: unknown;
    properties?: unknown[];
  };
  if (n.type === "ObjectExpression") {
    for (const prop of n.properties ?? []) {
      const name = staticObjectPropertyName(prop);
      const value = (prop as { value?: unknown }).value;
      if (!name) {
        if (value && typeof value === "object") {
          const nested = findSxDisallowedStylePropertyInAstNode(value, allowedProperties);
          if (nested) {
            return nested;
          }
        }
        continue;
      }
      if (isStylexConditionKey(name)) {
        if (value && typeof value === "object") {
          const nested = findSxDisallowedStylePropertyInAstNode(value, allowedProperties);
          if (nested) {
            return nested;
          }
        }
        continue;
      }
      if (!allowedProperties.has(name)) {
        return name;
      }
    }
    return null;
  }
  if (n.type === "ArrowFunctionExpression" && n.body && typeof n.body === "object") {
    return findSxDisallowedStylePropertyInAstNode(n.body, allowedProperties);
  }
  if (n.type === "ParenthesizedExpression" && n.expression && typeof n.expression === "object") {
    return findSxDisallowedStylePropertyInAstNode(n.expression, allowedProperties);
  }
  return null;
}
