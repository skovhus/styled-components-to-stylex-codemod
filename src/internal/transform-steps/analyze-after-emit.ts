/**
 * Step: analyze post-emit wrappers and delegation needs.
 * Core concepts: wrapper decisions and polymorphic-as handling.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { propagateDelegationWrapperRequirements } from "../utilities/delegation-utils.js";
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

  // Helper to check if a component has any of the given attribute names on its JSX opening tag
  const hasAttrOnOpeningTag = (componentName: string, attrNames: ReadonlySet<string>): boolean => {
    let found = false;
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: componentName } },
      })
      .forEach((p: unknown) => {
        const opening = (p as { node: { openingElement: { attributes?: unknown[] } } }).node
          .openingElement;
        for (const attr of opening.attributes ?? []) {
          const typed = attr as { type?: string; name?: { type?: string; name?: string } };
          if (
            typed.type === "JSXAttribute" &&
            typed.name?.type === "JSXIdentifier" &&
            typed.name.name &&
            attrNames.has(typed.name.name)
          ) {
            found = true;
          }
        }
      });
    return found;
  };

  const polymorphicAttrs = new Set(["as", "forwardedAs"]);
  const hasPolymorphicAttrOnOpeningTag = (componentName: string): boolean =>
    hasAttrOnOpeningTag(componentName, polymorphicAttrs);

  for (const [baseName, children] of extendedBy.entries()) {
    const names = [baseName, ...children];
    const hasPolymorphicUsage = names.some((nm) => hasPolymorphicAttrOnOpeningTag(nm));
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
      if (hasPolymorphicAttrOnOpeningTag(decl.localName)) {
        wrapperNames.add(decl.localName);
      }
    }
  }

  // Also check for `as` usage on intrinsic styled components
  // (e.g., styled.span with as={animated.span})
  for (const decl of styledDecls) {
    if (decl.base.kind === "intrinsic" && !wrapperNames.has(decl.localName)) {
      if (hasPolymorphicAttrOnOpeningTag(decl.localName)) {
        wrapperNames.add(decl.localName);
      }
    }
  }

  // Detect internal ref usage on styled components.
  // When <StyledComponent ref={...}> appears in the same file, mark supportsRefProp
  // so the emitter includes `ref` in the component's public type.
  const refAttr = new Set(["ref"]);
  for (const decl of styledDecls) {
    if (decl.supportsRefProp) {
      continue;
    }
    if (hasAttrOnOpeningTag(decl.localName, refAttr)) {
      decl.supportsRefProp = true;
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
    const resolverOnlyShouldForwardProp =
      !!decl.inlinedBaseComponent && !decl.shouldForwardPropFromWithConfig;
    if (decl.shouldForwardProp && !resolverOnlyShouldForwardProp) {
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

    // Component wrappers with `.attrs({ as: ... })` that specify a different element
    // need wrappers to render the correct element type (not the base component's element).
    if (decl.base.kind === "component" && hasAttrsAsOverride(decl.attrsInfo)) {
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
  // - isPolymorphicIntrinsicWrapper - renders a dynamic element via `as` prop
  const hasWrapperSemantics = (d: StyledDecl): boolean => {
    // .attrs({ as: ... }) changes the rendered element (string tag or component reference)
    if (hasAttrsAsOverride(d.attrsInfo)) {
      return true;
    }
    // shouldForwardProp from withConfig() filters props at wrapper boundaries and
    // must be preserved. Resolver-only dropProps for inlined bases are handled
    // directly in JSX rewrite, so they do not block flattening.
    const resolverOnlyShouldForwardProp =
      !!d.inlinedBaseComponent && !d.shouldForwardPropFromWithConfig;
    if (d.shouldForwardProp && !resolverOnlyShouldForwardProp) {
      return true;
    }
    // Polymorphic intrinsic wrappers render a dynamic element type via the `as` prop.
    // Flattening through them would lose the polymorphic type resolution and
    // forwardedAs delegation semantics.
    if ((d as any).isPolymorphicIntrinsicWrapper) {
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
  //
  // We collect all flattening decisions first, then apply them. This prevents order-dependent bugs
  // where an earlier decl's base is mutated to intrinsic before a later decl can traverse through it.
  type FlattenResult = {
    decl: StyledDecl;
    newBase: StyledDecl["base"];
    intermediateStyleKeys: string[];
    clearExtendsStyleKey: boolean;
  };
  const flattenResults: FlattenResult[] = [];

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
        // Don't flatten if this component has .attrs({ as: ... }) that specifies
        // a different element - it needs to render that element directly.
        const hasAsAttr = hasAttrsAsOverride(decl.attrsInfo);
        if (!hasAsAttr) {
          flattenResults.push({
            decl,
            newBase: { kind: "intrinsic", tagName: currentBase.tagName },
            intermediateStyleKeys,
            clearExtendsStyleKey: false,
          });
        }
      } else if (currentBase.kind === "component") {
        flattenResults.push({
          decl,
          newBase: currentBase,
          intermediateStyleKeys,
          clearExtendsStyleKey: true,
        });
      }
    }
  }

  // Apply all flattening decisions after chain resolution is complete.
  // Intermediate style keys are collected parent-first (immediate → grandparent),
  // but in stylex.props() last argument wins, so we reverse to grandparent-first.
  for (const { decl, newBase, intermediateStyleKeys, clearExtendsStyleKey } of flattenResults) {
    decl.base = newBase;
    const reversed = [...intermediateStyleKeys].reverse();
    if (clearExtendsStyleKey) {
      // External component: all intermediate keys go into extraStyleKeys (grandparent-first)
      if (reversed.length > 0) {
        const extras = decl.extraStyleKeys ?? [];
        for (const key of reversed) {
          if (!extras.includes(key)) {
            extras.push(key);
          }
        }
        decl.extraStyleKeys = extras;
      }
      // Clear extendsStyleKey since we're not extending a local styled component anymore
      delete decl.extendsStyleKey;
    } else {
      // Intrinsic: deepest ancestor goes to extendsStyleKey (first in stylex.props()),
      // remaining intermediates go to extraStyleKeys (in ascending priority order).
      if (reversed.length > 0) {
        decl.extendsStyleKey = reversed[0];
      }
      if (reversed.length > 1) {
        const extras = decl.extraStyleKeys ?? [];
        for (const key of reversed.slice(1)) {
          if (!extras.includes(key)) {
            extras.push(key);
          }
        }
        decl.extraStyleKeys = extras;
      }
    }
  }

  // After flattening, some parents in extendedBy may no longer have children delegating to them.
  // Clear supportsExternalStyles for non-exported parents that no child delegates to anymore,
  // to avoid unnecessary className/style/mergedSx handling on the parent's wrapper.
  for (const [parentName] of extendedBy.entries()) {
    const parentDecl = declByLocal.get(parentName);
    if (!parentDecl || exportedComponents.has(parentName)) {
      continue;
    }
    // Check if any child still delegates to this parent (i.e., has base.kind === "component"
    // with base.ident pointing to the parent after flattening)
    const hasDelegate = styledDecls.some(
      (d) => d.base.kind === "component" && d.base.ident === parentName,
    );
    if (!hasDelegate) {
      parentDecl.supportsExternalStyles = false;
      // Leave supportsAsProp untouched (undefined for extendedBy parents) so that
      // shouldAllowAsPropForIntrinsic can still auto-derive `as` from JSX usage.
    }
  }

  ctx.wrapperNames = wrapperNames;

  // Bail when a direct polymorphic component wrapper is detected but the helper path
  // is not configured — the codemod needs it to emit correct Substitute-based typing.
  if (!ctx.adapter.polymorphicHelperPath) {
    for (const decl of styledDecls) {
      if (decl.base.kind !== "component") {
        continue;
      }
      const wrappedHasAs = wrapperNames.has(decl.base.ident);
      const shouldAllow = wrapperNames.has(decl.localName) || (decl.supportsAsProp ?? false);
      if (shouldAllow && !wrappedHasAs) {
        return returnResult(
          {
            code: null,
            warnings: [
              {
                severity: "warning",
                type: "Polymorphic component wrapper needs adapter.polymorphicHelperPath to generate correct as-prop typing",
                loc: decl.loc ?? null,
                context: {
                  component: decl.localName,
                  wrappedComponent: decl.base.ident,
                  hint: 'Set adapter.polymorphicHelperPath to an absolute path (e.g. path.resolve("src/lib/stylex-codemod.d.ts"))',
                },
              },
            ],
          },
          "bail",
        );
      }
    }
  }

  return CONTINUE;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Checks if attrs contain an `as` override (either a component ref or a string tag). */
function hasAttrsAsOverride(attrsInfo: StyledDecl["attrsInfo"]): boolean {
  return !!(
    attrsInfo?.attrsAsTag ||
    (attrsInfo?.staticAttrs?.as && typeof attrsInfo.staticAttrs.as === "string")
  );
}
