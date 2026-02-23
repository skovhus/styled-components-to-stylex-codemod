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
  isComponentUsedInJsx,
  propagateDelegationWrapperRequirements,
} from "../utilities/delegation-utils.js";
import { generateBridgeClassName } from "../utilities/bridge-classname.js";
import { getRootJsxIdentifierName, isFunctionNode } from "../utilities/jscodeshift-utils.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";

type JsxAttr = JSXAttribute | JSXSpreadAttribute;

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
          exportedComponents.set(name, { exportName: name, isDefault: false, isSpecifier: false });
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
        exportedComponents.set(localName, { exportName, isDefault: false, isSpecifier: true });
      }
    }
  });

  // Default exports: export default Foo
  root.find(j.ExportDefaultDeclaration).forEach((p) => {
    const name = getIdentifierName(p.node.declaration);
    if (name && declByLocal.has(name)) {
      exportedComponents.set(name, { exportName: "default", isDefault: true, isSpecifier: false });
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
    // shouldForwardProp needs wrapper
    if (decl.shouldForwardProp) {
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
      if (!decl.attrsInfo) {
        decl.attrsInfo = { staticAttrs: {}, conditionalAttrs: [] };
      }
      const existing =
        typeof decl.attrsInfo.staticAttrs.className === "string"
          ? decl.attrsInfo.staticAttrs.className + " "
          : "";
      decl.attrsInfo.staticAttrs.className = existing + decl.bridgeClassName;
    }
  }

  // Helper to check if a component is used in JSX
  const isUsedInJsx = (name: string): boolean => isComponentUsedInJsx(root, j, name);

  // Helper to determine if a styled(ImportedComponent) wrapper is simple enough to inline.
  // Returns true if there's no complex logic that requires a wrapper function.
  const canInlineImportedComponentWrapper = (decl: StyledDecl): boolean => {
    if (decl.variantStyleKeys && Object.keys(decl.variantStyleKeys).length > 0) {
      return false;
    }
    if (decl.variantDimensions && decl.variantDimensions.length > 0) {
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
  const receivesClassNameOrStyleInJsx = (name: string): { className: boolean; style: boolean } => {
    let foundClassName = false;
    let foundStyle = false;
    const collectFromOpening = (opening: any) => {
      if (foundClassName && foundStyle) {
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
        }
      }
    };
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name } },
      } as any)
      .forEach((p: any) => collectFromOpening(p.node.openingElement));
    root
      .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name } } as any)
      .forEach((p: any) => collectFromOpening(p.node));
    return { className: foundClassName, style: foundStyle };
  };

  // Styled components that receive className/style props in JSX need wrappers to merge them.
  // Without a wrapper, passing `className` would replace the stylex className instead of merging.
  // Also track which components receive className/style in JSX for merger import determination.
  for (const decl of styledDecls) {
    const { className, style } = receivesClassNameOrStyleInJsx(decl.localName);
    if (className || style) {
      (decl as any).receivesClassNameOrStyleInJsx = true;
      if (!decl.needsWrapperComponent) {
        decl.needsWrapperComponent = true;
      }
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
      .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name } } as object)
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
  }

  // Early detection of components used as values (before emitStylesAndImports for merger import)
  // Components passed as props (e.g., <Component elementType={StyledDiv} />) need className/style merging
  for (const decl of styledDecls) {
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
      if (decl.isCssHelper) {
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
        openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
      });
      const hasAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } }).size() > 0;
      const hasForwardedAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "forwardedAs" } }).size() >
        0;
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
        // Check for function-like nodes (includes class/object methods which execute at runtime)
        if (
          isFunctionNode(node) ||
          node?.type === "ClassMethod" ||
          node?.type === "MethodDefinition" ||
          node?.type === "ObjectMethod"
        ) {
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
