import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import {
  isComponentUsedInJsx,
  propagateDelegationWrapperRequirements,
} from "../utilities/delegation-utils.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";

/**
 * Finalizes wrapper decisions, polymorphic handling, and base flattening after style emission.
 */
export function analyzeAfterEmitStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls || !ctx.declByLocal || !ctx.extendedBy || !ctx.exportedComponents) {
    return CONTINUE;
  }

  const declByLocal = ctx.declByLocal;
  const extendedBy = ctx.extendedBy;
  const exportedComponents = ctx.exportedComponents;

  const wrapperNames = new Set<string>();
  // Detect styled components whose props type includes polymorphic `as`
  // (either `as?: React.ElementType` or `as?: C` where C extends React.ElementType).
  // These need polymorphic wrapper generation.
  // Note: Don't automatically add children - they may use .attrs({ as: "element" })
  // to specify a fixed element type instead of inheriting polymorphism.
  for (const decl of styledDecls) {
    if (decl.propsType && typeContainsPolymorphicAs({ root, j, typeNode: decl.propsType })) {
      wrapperNames.add(decl.localName);
    }
  }

  for (const [baseName, children] of extendedBy.entries()) {
    const names = [baseName, ...children];
    const hasPolymorphicUsage = names.some((nm) => {
      const el = root.find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: nm } },
      });
      const hasAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } }).size() > 0;
      const hasForwardedAs =
        el
          .find(j.JSXAttribute, {
            name: { type: "JSXIdentifier", name: "forwardedAs" },
          })
          .size() > 0;
      return hasAs || hasForwardedAs;
    });
    if (hasPolymorphicUsage) {
      wrapperNames.add(baseName);
      for (const c of children) {
        wrapperNames.add(c);
      }
    }
  }

  // Also check for `as` usage on styled components that wrap external components
  // (not in extendedBy because they don't extend other styled components)
  for (const decl of styledDecls) {
    if (decl.base.kind === "component" && !declByLocal.has(decl.base.ident)) {
      const el = root.find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
      });
      const hasAs =
        el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } }).size() > 0;
      const hasForwardedAs =
        el
          .find(j.JSXAttribute, {
            name: { type: "JSXIdentifier", name: "forwardedAs" },
          })
          .size() > 0;
      if (hasAs || hasForwardedAs) {
        wrapperNames.add(decl.localName);
      }
    }
  }

  // Also check for `as` usage on intrinsic styled components
  // (e.g., styled.span with as={animated.span})
  for (const decl of styledDecls) {
    if (decl.base.kind === "intrinsic" && !wrapperNames.has(decl.localName)) {
      const el = root.find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
      });
      const asAttrs = el.find(j.JSXAttribute, { name: { type: "JSXIdentifier", name: "as" } });
      const hasAs = asAttrs.size() > 0;
      const hasForwardedAs =
        el
          .find(j.JSXAttribute, {
            name: { type: "JSXIdentifier", name: "forwardedAs" },
          })
          .size() > 0;
      if (hasAs || hasForwardedAs) {
        wrapperNames.add(decl.localName);
      }
    }
  }

  for (const decl of styledDecls) {
    if (wrapperNames.has(decl.localName)) {
      decl.needsWrapperComponent = true;
      // Mark intrinsic components with polymorphic `as` usage - these pass style through
      // directly instead of merging, so they don't need the merger import
      if (decl.base.kind === "intrinsic") {
        (decl as any).isPolymorphicIntrinsicWrapper = true;
      }
    }
    // `withConfig({ shouldForwardProp })` cases need wrappers so we can consume
    // styling props without forwarding them to the DOM.
    if (decl.shouldForwardProp) {
      decl.needsWrapperComponent = true;
    }
    if (decl.base.kind === "component") {
      const baseDecl = declByLocal.get(decl.base.ident);
      if (baseDecl) {
        // Save original base component name for static property inheritance
        (decl as any).originalBaseIdent = decl.base.ident;
        decl.extendsStyleKey = baseDecl.styleKey;
        // Defer base flattening decision until after all needsWrapperComponent flags are set
      }
    }

    // Preserve `withConfig({ componentId })` semantics by keeping a wrapper component.
    // This ensures the component boundary remains, even if the styles are static.
    if (decl.base.kind === "intrinsic" && decl.withConfig?.componentId) {
      decl.needsWrapperComponent = true;
    }

    // Exported styled components need wrapper components to maintain the export.
    // Without this, removing the styled declaration would leave an empty `export {}`.
    // Exception: intrinsic-based components with fully inlinable attrs can skip the wrapper
    // since each usage site is independently transformed with the correct attrs.
    const hasInlinableAttrs =
      decl.attrsInfo &&
      (Object.keys(decl.attrsInfo.staticAttrs).length > 0 ||
        decl.attrsInfo.conditionalAttrs.length > 0 ||
        (decl.attrsInfo.invertedBoolAttrs?.length ?? 0) > 0);
    if (exportedComponents.has(decl.localName)) {
      // Allow inlining for intrinsic components with attrs (like TextInput)
      const canInline = decl.base.kind === "intrinsic" && hasInlinableAttrs;
      if (!canInline) {
        decl.needsWrapperComponent = true;
      } else {
        // Even if canInline is true, we need a wrapper if the component has no JSX usages.
        // Without usages, there's nothing to inline into and the export would be lost.
        const hasJsxUsages =
          root
            .find(j.JSXElement, {
              openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
            })
            .size() > 0 ||
          root
            .find(j.JSXOpeningElement, { name: { type: "JSXIdentifier", name: decl.localName } })
            .size() > 0;
        if (!hasJsxUsages) {
          decl.needsWrapperComponent = true;
        }
      }
    }

    // Component wrappers with `.attrs({ as: "element" })` that specify a different element
    // need wrappers to render the correct element type (not the base component's element).
    if (
      decl.base.kind === "component" &&
      decl.attrsInfo?.staticAttrs?.as &&
      typeof decl.attrsInfo.staticAttrs.as === "string"
    ) {
      decl.needsWrapperComponent = true;
    }
  }

  // Propagate needsWrapperComponent transitively through chains.
  // Run AFTER all local needsWrapperComponent flags are set (lines above).
  propagateDelegationWrapperRequirements({ root, j, styledDecls, declByLocal });

  // Helper to check if a styled decl has wrapper semantics that would be lost by flattening.
  // These are behaviors that change the rendered output beyond just styles:
  // - .attrs({ as: "element" }) - changes the rendered element type
  // - shouldForwardProp - filters which props are forwarded to the DOM
  const hasWrapperSemantics = (d: StyledDecl): boolean => {
    // .attrs({ as: "element" }) with a string value changes the rendered element
    if (d.attrsInfo?.staticAttrs?.as && typeof d.attrsInfo.staticAttrs.as === "string") {
      return true;
    }
    // shouldForwardProp filters props, so it must be preserved
    if (d.shouldForwardProp) {
      return true;
    }
    return false;
  };

  // Now that all needsWrapperComponent flags are set, flatten base components where appropriate.
  // This must happen AFTER extendsStyleKey is set (line 986) and AFTER all wrapper flags are set.
  //
  // This also handles chains of styled components (e.g., A = styled(B), B = styled(C), C = styled(div))
  // by resolving the entire chain and collecting intermediate style keys.
  //
  // IMPORTANT: Skip flattening when any intermediate component in the chain has wrapper semantics
  // (e.g., due to .attrs({ as: "button" }) or shouldForwardProp). Otherwise we would drop those
  // wrapper semantics, changing the rendered element or prop forwarding behavior.
  for (const decl of styledDecls) {
    if (decl.base.kind === "component") {
      // Resolve the chain of styled components to find the ultimate base.
      // Collect intermediate style keys along the way.
      // Also track if any intermediate component has wrapper semantics.
      const intermediateStyleKeys: string[] = [];
      let anyIntermediateHasWrapperSemantics = false;
      let currentBase: StyledDecl["base"] = decl.base;
      let resolvedBaseDecl = declByLocal.get(decl.base.ident);
      const visited = new Set<string>([decl.localName]); // Prevent infinite loops

      while (resolvedBaseDecl && currentBase.kind === "component") {
        // Avoid circular references
        if (visited.has(currentBase.ident)) {
          break;
        }
        visited.add(currentBase.ident);

        // Check if this intermediate component has wrapper semantics
        if (hasWrapperSemantics(resolvedBaseDecl)) {
          anyIntermediateHasWrapperSemantics = true;
        }

        // Add the intermediate component's style key
        intermediateStyleKeys.push(resolvedBaseDecl.styleKey);

        // Move to the next level in the chain
        currentBase = resolvedBaseDecl.base;
        if (currentBase.kind === "component") {
          resolvedBaseDecl = declByLocal.get(currentBase.ident);
        } else {
          resolvedBaseDecl = undefined;
        }
      }

      // Now currentBase is either:
      // 1. An intrinsic element (kind === "intrinsic")
      // 2. A component that's not in declByLocal (external/imported component)

      // Skip flattening if any intermediate component has wrapper semantics that would be lost
      if (anyIntermediateHasWrapperSemantics) {
        continue;
      }

      if (currentBase.kind === "intrinsic") {
        // If the immediate base component is used in JSX AND this component needs a wrapper,
        // keep as component reference so the wrapper can delegate to the base wrapper.
        // Otherwise flatten to intrinsic tag for inline style merging.
        const immediateBaseIdent = decl.base.ident;
        const baseUsedInJsx = isComponentUsedInJsx(root, j, immediateBaseIdent);
        const shouldDelegate = baseUsedInJsx && decl.needsWrapperComponent;
        // Don't flatten if this component has .attrs({ as: "element" }) that specifies
        // a different element - it needs to render that element directly.
        const hasAsAttr =
          decl.attrsInfo?.staticAttrs?.as && typeof decl.attrsInfo.staticAttrs.as === "string";
        if (!shouldDelegate && !hasAsAttr) {
          // Flatten to intrinsic tag for inline style merging
          decl.base = { kind: "intrinsic", tagName: currentBase.tagName };
          // Add intermediate style keys (excluding the one we already set via extendsStyleKey)
          if (intermediateStyleKeys.length > 1) {
            const extras = decl.extraStyleKeys ?? [];
            // Add all intermediate keys except the first one (which is already in extendsStyleKey)
            for (const key of intermediateStyleKeys.slice(1)) {
              if (!extras.includes(key)) {
                extras.push(key);
              }
            }
            decl.extraStyleKeys = extras;
          }
        }
      } else if (currentBase.kind === "component") {
        // The ultimate base is an external component (not in declByLocal).
        // Update the base to point directly to the external component.
        const immediateBaseIdent = decl.base.ident;
        const immediateBaseDecl = declByLocal.get(immediateBaseIdent);
        const baseUsedInJsx = isComponentUsedInJsx(root, j, immediateBaseIdent);
        const shouldDelegate = baseUsedInJsx && decl.needsWrapperComponent && immediateBaseDecl;

        if (!shouldDelegate) {
          // Flatten to the ultimate external component
          decl.base = currentBase;
          // Add intermediate style keys (all of them, since we're skipping the intermediate components)
          if (intermediateStyleKeys.length > 0) {
            const extras = decl.extraStyleKeys ?? [];
            for (const key of intermediateStyleKeys) {
              if (!extras.includes(key)) {
                extras.push(key);
              }
            }
            decl.extraStyleKeys = extras;
          }
          // Clear extendsStyleKey since we're not extending a local styled component anymore
          // (the styles are now in extraStyleKeys)
          delete decl.extendsStyleKey;
        }
      }
    }
  }

  ctx.wrapperNames = wrapperNames;

  return CONTINUE;
}
