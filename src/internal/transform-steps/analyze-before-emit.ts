/**
 * Step: analyze declarations before emitting styles and wrappers.
 * Core concepts: wrapper decisions, export mapping, and styles identifier selection.
 */
import type { JSCodeshift, JSXAttribute, JSXSpreadAttribute } from "jscodeshift";
import { resolve as pathResolve } from "node:path";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext, type ExportInfo } from "../transform-context.js";
import {
  countComponentJsxUsages,
  propagateDelegationWrapperRequirements,
} from "../utilities/delegation-utils.js";
import { generateBridgeClassName } from "../utilities/bridge-classname.js";
import {
  getRootJsxIdentifierName,
  isAstNode,
  isFunctionNode,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";
import { escapeRegex } from "../utilities/string-utils.js";
import type { PromotedStyleEntry } from "../transform-types.js";
import { parseVariantWhenToAst } from "../emit-wrappers/variant-condition.js";
import { BLOCKED_INTRINSIC_ATTR_RENAMES } from "../emit-wrappers/types.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";

type JsxAttr = JSXAttribute | JSXSpreadAttribute;
const INLINE_USAGE_THRESHOLD = 1;

/**
 * Analyzes declarations to determine wrappers, exports, usage patterns, and import aliasing before emit.
 */
export function analyzeBeforeEmitStep(ctx: TransformContext): StepResult {
  const { root, j, adapter, file } = ctx;
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls) {
    return CONTINUE;
  }

  // Detect if there's a local variable named `styles` in the file (not part of styled-components code)
  // If so, we'll use `stylexStyles` as the StyleX constant name to avoid shadowing.
  const styledDeclNames = new Set(styledDecls.map((d) => d.localName));
  let hasStylesVariable = false;
  root.find(j.VariableDeclarator).forEach((path) => {
    const id = path.node.id;
    if (patternContainsName(id, "styles") && !styledDeclNames.has("styles")) {
      hasStylesVariable = true;
    }
  });
  const stylesIdentifier = hasStylesVariable ? "stylexStyles" : "styles";
  ctx.stylesIdentifier = stylesIdentifier;

  // Build lookup maps and set needsWrapperComponent BEFORE emitStylesAndImports
  // so that comment placement can be determined correctly.
  const declByLocal = new Map(styledDecls.map((d) => [d.localName, d]));
  const extendedBy = new Map<string, string[]>();
  for (const decl of styledDecls) {
    if (decl.base.kind !== "component") {
      continue;
    }
    const base = declByLocal.get(decl.base.ident);
    if (!base) {
      continue;
    }
    extendedBy.set(base.localName, [...(extendedBy.get(base.localName) ?? []), decl.localName]);
  }
  ctx.declByLocal = declByLocal;
  ctx.extendedBy = extendedBy;

  // Track which styled components are exported (named or default)
  const getIdentifierName = (node: unknown): string | null => {
    const n = node as { type?: string; name?: string } | null | undefined;
    return n?.type === "Identifier" && n.name ? n.name : null;
  };

  const exportedComponents = new Map<string, ExportInfo>();

  // Named exports: export const Foo = styled.div`...` or export { Foo, Bar as Baz }
  root.find(j.ExportNamedDeclaration).forEach((p) => {
    const decl = p.node.declaration;
    if (decl?.type === "VariableDeclaration") {
      for (const d of decl.declarations) {
        if (d.type !== "VariableDeclarator") {
          continue;
        }
        const name = getIdentifierName(d.id);
        if (name && declByLocal.has(name)) {
          exportedComponents.set(name, {
            exportName: name,
            isDefault: false,
            isSpecifier: false,
          });
        }
      }
    }
    for (const spec of p.node.specifiers ?? []) {
      if (spec.type !== "ExportSpecifier") {
        continue;
      }
      const localName = getIdentifierName(spec.local);
      if (localName && declByLocal.has(localName)) {
        const exportName = getIdentifierName(spec.exported) ?? localName;
        exportedComponents.set(localName, {
          exportName,
          isDefault: false,
          isSpecifier: true,
        });
      }
    }
  });

  // Default exports: export default Foo
  root.find(j.ExportDefaultDeclaration).forEach((p) => {
    const name = getIdentifierName(p.node.declaration);
    if (name && declByLocal.has(name)) {
      exportedComponents.set(name, {
        exportName: "default",
        isDefault: true,
        isSpecifier: false,
      });
    }
  });

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
  for (const decl of styledDecls) {
    if (decl.isCssHelper) {
      continue;
    }
    if (decl.isDirectJsxResolution) {
      continue;
    }
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
    // shouldForwardProp from withConfig() still needs wrappers.
    // Resolver-added prop drops for inlined imported bases can be handled in JSX rewrite.
    const resolverOnlyShouldForwardProp =
      !!decl.inlinedBaseComponent && !decl.shouldForwardPropFromWithConfig;
    if (decl.shouldForwardProp && !resolverOnlyShouldForwardProp) {
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

  // Pre-analyze inline style props at JSX call sites to determine if they can be promoted
  // to static/dynamic stylex.create entries (avoiding wrapper components and mergedSx).
  analyzePromotableStyleProps(
    root,
    j,
    styledDecls,
    declByLocal,
    getJsxUsageCount,
    ctx.resolvedStyleObjects ?? new Map(),
  );

  // Styled components that receive className/style props in JSX need wrappers to merge them.
  // Without a wrapper, passing `className` would replace the stylex className instead of merging.
  // Exception: single-use intrinsic components can be inlined with adapter merge handling instead.
  // Exception: components with all promotable style props (no className) can be inlined.
  // Also track which components receive className/style in JSX for merger import determination.
  for (const decl of styledDecls) {
    if (decl.isDirectJsxResolution) {
      continue;
    }
    const { className, style } = getJsxAttributeUsage(decl.localName);
    if (className || style) {
      (decl as any).receivesClassNameOrStyleInJsx = true;
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
    // Relation overrides (`Parent > Child`, `${Parent} &`, etc.) are attached at callsites.
    // Keep these children inlined so post-process can inject override style keys conditionally.
    if (relationChildStyleKeys.has(decl.styleKey)) {
      continue;
    }
    // Components with promoted style props at all call sites don't need wrapping;
    // each call site gets its own promoted style key(s) in the inline output.
    if (decl.promotedStyleProps?.length) {
      continue;
    }
    const { ref } = getJsxAttributeUsage(decl.localName);
    if (ref) {
      continue;
    }
    if (getJsxUsageCount(decl.localName) > INLINE_USAGE_THRESHOLD) {
      decl.needsWrapperComponent = true;
    }
  }

  // Helper to check if any JSX usage of a component has spread attributes.
  // Used to detect cases where styleFnFromProps values might come via spread.
  const hasSpreadInJsx = (name: string): boolean => {
    let found = false;
    const checkOpening = (opening: { attributes?: JsxAttr[] }) => {
      if (found) {
        return;
      }
      for (const attr of opening.attributes ?? []) {
        if (attr.type === "JSXSpreadAttribute") {
          found = true;
          return;
        }
      }
    };
    // Note: jscodeshift's filter types don't match runtime behavior well,
    // so we cast the filter objects (same pattern used throughout codebase).
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name } },
      } as object)
      .forEach((p) => checkOpening(p.node.openingElement as { attributes?: JsxAttr[] }));
    root
      .find(j.JSXSelfClosingElement, {
        name: { type: "JSXIdentifier", name },
      } as object)
      .forEach((p) => checkOpening(p.node as { attributes?: JsxAttr[] }));
    return found;
  };

  // Components with styleFnFromProps that have spread attributes in JSX need wrappers.
  // The JSX rewriter can only extract styleFn prop values from explicit attributes,
  // not from spreads like `<StyledComp {...props} />`.
  for (const decl of styledDecls) {
    if (decl.needsWrapperComponent) {
      continue;
    }
    if (decl.styleFnFromProps && decl.styleFnFromProps.length > 0) {
      if (hasSpreadInJsx(decl.localName)) {
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
    if (hasSpreadInJsx(decl.localName)) {
      decl.needsWrapperComponent = true;
    }
  }

  // Determine supportsExternalStyles and supportsAsProp for each decl
  // (before emitStylesAndImports for merger import and wrapper generation)
  for (const decl of styledDecls) {
    // 1. If extended by another styled component in this file -> enable external styles
    //    Leave supportsAsProp unset (undefined) so the emitter can auto-derive `as`
    //    support for intrinsic-based components.
    if (extendedBy.has(decl.localName)) {
      decl.supportsExternalStyles = true;
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
    decl.supportsAsProp = extResult.as;
    decl.supportsRefProp = extResult.ref;
  }

  // Rename transient ($-prefixed) props for all styled components.
  // The $ prefix is a styled-components convention for transient props that should not be
  // forwarded to the DOM. In StyleX output, these are plain React component props where
  // the $ prefix is unnecessary and inconsistent with StyleX conventions.
  // For exported components, cross-file consumer patching is also emitted.
  const resolverImportNames = collectResolverImportNames(ctx);
  for (const decl of styledDecls) {
    const transientProps = collectDeclPropNames(j, decl, (n) => n.startsWith("$"));
    if (transientProps.size === 0) {
      continue;
    }
    const existingPropNames = collectDeclPropNames(j, decl, (n) => !n.startsWith("$"));
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
    // would create duplicate attributes). Also block ALL renames when any call site
    // uses spread attributes, since the spread may contain $-prefixed keys at runtime.
    const callSiteHasSpread = collectCallSiteAttrNames(root, j, decl.localName, existingPropNames);
    if (callSiteHasSpread) {
      continue;
    }
    const renames = new Map<string, string>();
    for (const prop of transientProps) {
      const stripped = prop.slice(1);
      if (!existingPropNames.has(stripped)) {
        renames.set(prop, stripped);
      }
    }
    if (renames.size > 0) {
      // Don't rename props when the propsType references a named type (interface
      // or type alias) that is used elsewhere in the file — mutating the shared
      // declaration would break non-styled code that also references it.
      // Also skip when the type is imported (not locally defined) since we can't
      // modify the external type declaration.
      const referencedTypeNames = collectReferencedTypeNames(decl.propsType);
      if (
        referencedTypeNames.some(
          (name) =>
            isTypeNameUsedElsewhere(root, j, name, decl.localName) ||
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
        if (isModuleScopeBinding(root, j, prop, decl.localName) || resolverImportNames.has(prop)) {
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
      const exportInfo = exportedComponents.get(decl.localName);
      if (exportInfo) {
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
    }
  }

  // Early detection of components used as values (before emitStylesAndImports for merger import)
  // Components passed as props (e.g., <Component elementType={StyledDiv} />) need className/style merging
  for (const decl of styledDecls) {
    if (decl.isDirectJsxResolution) {
      continue;
    }
    const usedAsValue =
      root
        .find(j.Identifier, { name: decl.localName })
        .filter((p) => {
          // Skip the styled component declaration itself
          if (p.parentPath?.node?.type === "VariableDeclarator") {
            return false;
          }
          // Skip JSX element names (these are handled by inline substitution)
          if (
            p.parentPath?.node?.type === "JSXOpeningElement" ||
            p.parentPath?.node?.type === "JSXClosingElement"
          ) {
            return false;
          }
          // Skip JSX member expressions like <Styled.Component />
          if (
            p.parentPath?.node?.type === "JSXMemberExpression" &&
            (p.parentPath.node as any).object === p.node
          ) {
            return false;
          }
          // Skip styled(Component) extensions
          if (p.parentPath?.node?.type === "CallExpression") {
            const callExpr = p.parentPath.node as any;
            const callee = callExpr.callee;
            if (callee?.type === "Identifier" && callee.name === ctx.styledDefaultImport) {
              return false;
            }
            if (
              callee?.type === "MemberExpression" &&
              callee.object?.type === "CallExpression" &&
              callee.object.callee?.type === "Identifier" &&
              callee.object.callee.name === ctx.styledDefaultImport
            ) {
              return false;
            }
          }
          // Skip TaggedTemplateExpression tags
          if (p.parentPath?.node?.type === "TaggedTemplateExpression") {
            return false;
          }
          // Skip styled(Component) call in TaggedTemplateExpression
          if (
            p.parentPath?.node?.type === "CallExpression" &&
            p.parentPath.parentPath?.node?.type === "TaggedTemplateExpression"
          ) {
            return false;
          }
          // Skip template literal interpolations (e.g., ${Link}:hover &)
          if (p.parentPath?.node?.type === "TemplateLiteral") {
            return false;
          }
          return true;
        })
        .size() > 0;

    if (usedAsValue) {
      decl.usedAsValue = true;
      decl.needsWrapperComponent = true;
    }
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
        (decl as any).isPolymorphicIntrinsicWrapper = true;
      }
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
            // Merge static properties into the component's existing style object.
            const existing = ctx.resolvedStyleObjects.get(decl.styleKey);
            if (existing && typeof existing === "object" && !isAstNode(existing)) {
              Object.assign(existing as Record<string, unknown>, entry.styleValue);
            }
          } else {
            ctx.resolvedStyleObjects.set(entry.styleKey, entry.styleValue);
          }
        }
      }
    }
  }

  return CONTINUE;
}

// --- Non-exported helpers ---

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
 * which means the spread may contain `$`-prefixed keys at runtime — all renames
 * must be blocked to prevent mismatches.
 */
function collectCallSiteAttrNames(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  componentName: string,
  names: Set<string>,
): boolean {
  let hasSpread = false;
  const collectFromElement = (openingElement: { attributes?: unknown[] }) => {
    for (const attr of (openingElement as any).attributes ?? []) {
      if (attr.type === "JSXSpreadAttribute") {
        hasSpread = true;
      } else if (attr.type === "JSXAttribute" && attr.name?.type === "JSXIdentifier") {
        const name: string = attr.name.name;
        if (!name.startsWith("$")) {
          names.add(name);
        }
      }
    }
  };
  root
    .find(j.JSXElement, {
      openingElement: {
        name: { type: "JSXIdentifier", name: componentName },
      },
    } as any)
    .forEach((p: any) => collectFromElement(p.node.openingElement));
  root
    .find(j.JSXSelfClosingElement, {
      name: { type: "JSXIdentifier", name: componentName },
    } as any)
    .forEach((p: any) => collectFromElement(p.node));
  return hasSpread;
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
): boolean {
  let count = 0;
  root
    .find(j.TSTypeReference)
    .filter((p: any) => {
      const id = p.node.typeName;
      return id?.type === "Identifier" && id.name === typeName;
    })
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
  return result;
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
    result = result.replace(new RegExp(`(?<![\\w$])${escaped}(?!\\w)`, "g"), to);
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
      if (sf.conditionWhen) {
        sf.conditionWhen = renamePropsInWhenString(sf.conditionWhen, renames);
      }
      if (sf.callArg) {
        renameIdentifiersInAst(sf.callArg, renames);
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
    }
  }
  if (decl.attrsInfo?.conditionalAttrs) {
    for (const attr of decl.attrsInfo.conditionalAttrs) {
      attr.jsxProp = renames.get(attr.jsxProp) ?? attr.jsxProp;
    }
  }
  if (decl.attrsInfo?.attrsDynamicStyles) {
    for (const ds of decl.attrsInfo.attrsDynamicStyles) {
      ds.jsxProp = renames.get(ds.jsxProp) ?? ds.jsxProp;
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

/**
 * Collects all style keys that belong to a decl (for renaming in resolvedStyleObjects).
 */
function collectAllStyleKeysForDecl(decl: StyledDecl): string[] {
  const keys: string[] = [decl.styleKey];
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
  for (const pas of decl.pseudoAliasSelectors ?? []) {
    keys.push(...pas.styleKeys);
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
    return;
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
): void {
  if (!propsType) {
    return;
  }
  if (propsType.type === "TSTypeReference" && propsType.typeName?.type === "Identifier") {
    const typeName = propsType.typeName.name;
    if (!typeName) {
      return;
    }
    // Rename in interface declarations
    root
      .find(j.TSInterfaceDeclaration)
      .filter((p: any) => (p.node as any).id?.name === typeName)
      .forEach((p: any) => {
        for (const member of (p.node.body?.body ?? []) as any[]) {
          if (member.type === "TSPropertySignature" && member.key?.type === "Identifier") {
            const renamed = renames.get(member.key.name);
            if (renamed) {
              member.key.name = renamed;
            }
          }
        }
      });
    // Rename in type alias declarations
    root
      .find(j.TSTypeAliasDeclaration)
      .filter((p: any) => (p.node as any).id?.name === typeName)
      .forEach((p: any) => {
        walkTypePropNames(p.node.typeAnnotation, (name, keyNode) => {
          const renamed = renames.get(name);
          if (renamed) {
            keyNode.name = renamed;
          }
        });
      });
  }
  if (propsType.type === "TSIntersectionType" && Array.isArray(propsType.types)) {
    for (const t of propsType.types) {
      renameTransientPropsInReferencedTypes(root, j, t as typeof propsType, renames);
    }
  }
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

/** StyleX shorthand properties that must be expanded. Bail from promotion if encountered.
 *  Note: margin/padding are NOT forbidden — StyleX accepts them as single-value shorthands. */
const FORBIDDEN_SHORTHAND_PROPS = new Set([
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "background",
]);

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

type PromotedParamType = "number" | "string" | "numberOrString";

const LENGTH_LIKE_CSS_PROP_RE =
  /^(top|right|bottom|left|width|height|minWidth|maxWidth|minHeight|maxHeight|margin|padding|gap|inset|translate|fontSize|letterSpacing|lineHeight|borderWidth|borderRadius|outline)/;

const IDENTIFIER_NAME_RE = /^[$A-Z_][0-9A-Z_$]*$/i;

function isValidIdentifierName(name: string): boolean {
  return IDENTIFIER_NAME_RE.test(name);
}

/**
 * Infers a TS type keyword for a dynamic expression based on the CSS property it's assigned to.
 * Numeric-only properties get `number`; ambiguous length-like values get `number | string`.
 */
function inferTypeForCssProp(cssProp: string, expr: unknown): PromotedParamType {
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
  declByLocal: Map<string, StyledDecl>,
  getJsxUsageCount: (name: string) => number,
  resolvedStyleObjects: Map<string, unknown>,
): void {
  for (const decl of styledDecls) {
    // Only promote for elements that don't already need wrappers and ultimately render
    // as intrinsic elements (either directly or through a chain of styled extensions).
    if (decl.isCssHelper || decl.needsWrapperComponent || decl.isDirectJsxResolution) {
      continue;
    }
    if (!resolvesToIntrinsic(decl, declByLocal)) {
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
      properties: Array<{
        key: string;
        staticValue: string | number | boolean | null;
        dynamicExpr: unknown;
      }>;
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
      const properties: Array<{
        key: string;
        staticValue: string | number | boolean | null;
        dynamicExpr: unknown;
      }> = [];

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
        // Bail: forbidden StyleX shorthand properties (e.g., `background`, `border`, `margin`)
        if (FORBIDDEN_SHORTHAND_PROPS.has(keyName)) {
          siteBail = true;
          break;
        }

        const staticVal = literalToStaticValue(prop.value);
        if (staticVal !== null) {
          properties.push({ key: keyName, staticValue: staticVal, dynamicExpr: null });
        } else {
          properties.push({ key: keyName, staticValue: null, dynamicExpr: prop.value });
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
          staticObj[p.key] = p.staticValue;
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
        const styleKey = generatePromotedDynamicStyleKey(
          decl.styleKey,
          usedKeyNames,
          site.children,
        );
        usedKeyNames.add(styleKey);

        // Build static part of the style object and collect dynamic params.
        const staticObj: Record<string, unknown> = {};
        const dynamicParams: Array<{ cssProp: string; expr: unknown }> = [];

        for (const p of site.properties) {
          if (p.staticValue !== null) {
            staticObj[p.key] = p.staticValue;
          } else {
            dynamicParams.push({ cssProp: p.key, expr: p.dynamicExpr });
          }
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

        // Build object expression body
        const bodyProperties = site.properties.map((p) => {
          if (p.staticValue !== null) {
            // Static property
            const val =
              typeof p.staticValue === "string"
                ? j.stringLiteral(p.staticValue)
                : typeof p.staticValue === "number"
                  ? j.numericLiteral(p.staticValue)
                  : j.booleanLiteral(p.staticValue as boolean);
            return j.property("init", j.identifier(p.key), val);
          } else {
            // Dynamic property — param name matches CSS property for shorthand: { left }
            const prop = j.property("init", j.identifier(p.key), j.identifier(p.key));
            (prop as any).shorthand = true;
            return prop;
          }
        });

        const fnNode = j.arrowFunctionExpression(params, j.objectExpression(bodyProperties));

        // Store the AST node directly in resolvedStyleObjects (emitter handles AST nodes).
        promotedEntries.push({
          styleKey,
          styleValue: fnNode as unknown as Record<string, unknown>,
        });

        // Tag the JSX node with the style key and call arguments.
        (site.opening as any).__promotedStyleKey = styleKey;
        // The call args are the actual expressions from the style object.
        const callArgs = dynamicParams.map((dp) => dp.expr);
        (site.opening as any).__promotedStyleArgs = callArgs;
      }
    }

    if (promotedEntries.length > 0) {
      decl.promotedStyleProps = promotedEntries;
    }
  }
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
  const suffix = words
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  if (suffix.length > 20) {
    return null;
  }
  return suffix;
}

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
    if (key in baseObj) {
      return true;
    }
  }
  return false;
}
