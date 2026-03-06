/**
 * Post-processes the transformed JSX tree after style emission.
 * Core concepts: relation overrides (descendant/ancestor) and stylex.props cleanup.
 */
import type { Collection } from "jscodeshift";
import type { RelationOverride } from "./lower-rules.js";
import { toStyleKey } from "./transform/helpers.js";
import { getJsxElementName } from "./utilities/jscodeshift-utils.js";

export function postProcessTransformedAst(args: {
  root: Collection<any>;
  j: any;
  relationOverrides: RelationOverride[];
  ancestorSelectorParents: Set<string>;
  /** Map from component local name to its style key (for ancestor selector matching) */
  componentNameToStyleKey?: Map<string, string>;
  /** Set of style keys that have empty style objects (should be excluded from stylex.props calls) */
  emptyStyleKeys?: Set<string>;
  preserveReactImport?: boolean;
  /** Local names of identifiers added as new imports (should shadow old imports with same name) */
  newImportLocalNames?: Set<string>;
  /** Map of local import names to the module specifiers they were added from */
  newImportSourcesByLocal?: Map<string, Set<string>>;
  /** The identifier name used for the stylex.create() object (default: "styles") */
  stylesIdentifier?: string;
  /** Cross-file marker variables: parentStyleKey → markerVarName */
  crossFileMarkers?: Map<string, string>;
}): { changed: boolean; needsReactImport: boolean } {
  const {
    root,
    j,
    relationOverrides,
    ancestorSelectorParents,
    componentNameToStyleKey,
    emptyStyleKeys,
    preserveReactImport,
    newImportLocalNames,
    newImportSourcesByLocal,
    stylesIdentifier = "styles",
    crossFileMarkers,
  } = args;
  let changed = false;

  // Clean up empty variable declarations (e.g. `const X;`)
  root.find(j.VariableDeclaration).forEach((p: any) => {
    if (p.node.declarations.length === 0) {
      j(p).remove();
      changed = true;
    }
  });

  // Apply relation override styles that rely on `stylex.when.*()`:
  // - Add `stylex.defaultMarker()` to elements that need markers (ancestor selectors).
  // - Add override style keys to descendant/child elements' `stylex.props(...)` calls.
  // - For cross-file selectors: use `defineMarker()` and add overrides to imported child JSX.
  if (relationOverrides.length > 0 || ancestorSelectorParents.size > 0) {
    // IMPORTANT: Do not reuse the same AST node instance across multiple insertion points.
    // Recast/jscodeshift expect a tree (no shared references); reuse can corrupt printing.
    const makeDefaultMarkerCall = () =>
      j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("defaultMarker")),
        [],
      );

    // Build cross-file override lookups, split by direction:
    // - Forward: imported component is the child → apply override styles to its JSX
    // - Reverse: imported component is the parent → apply marker to its JSX
    // We distinguish by checking if the component's synthetic style key matches parentStyleKey
    // (reverse) or childStyleKey (forward).
    const crossFileChildOverrides = new Map<string, RelationOverride[]>();
    const crossFileParentMarkers = new Map<string, RelationOverride[]>();
    for (const o of relationOverrides) {
      if (!o.crossFile || !o.crossFileComponentLocalName) {
        continue;
      }
      const componentStyleKey = componentNameToStyleKey?.get(o.crossFileComponentLocalName);
      const isReverse =
        componentStyleKey === o.parentStyleKey ||
        o.parentStyleKey === toStyleKey(o.crossFileComponentLocalName);
      const targetMap = isReverse ? crossFileParentMarkers : crossFileChildOverrides;
      appendToMapList(targetMap, o.crossFileComponentLocalName, o);
    }

    const isStylexPropsCall = (n: any): n is any =>
      n?.type === "CallExpression" &&
      n.callee?.type === "MemberExpression" &&
      n.callee.object?.type === "Identifier" &&
      n.callee.object.name === "stylex" &&
      n.callee.property?.type === "Identifier" &&
      n.callee.property.name === "props";

    const getStylexPropsCallFromAttrs = (attrs: any[]): any => {
      for (const a of attrs ?? []) {
        if (a.type !== "JSXSpreadAttribute") {
          continue;
        }
        if (isStylexPropsCall(a.argument)) {
          return a.argument;
        }
      }
      return undefined;
    };

    /** Returns the flat list of style args from an sx attribute expression. */
    const getSxAttrArgs = (expr: any): any[] => {
      if (!expr) {
        return [];
      }
      if (expr.type === "ArrayExpression") {
        return expr.elements ?? [];
      }
      return [expr];
    };

    /** Finds the sx={...} JSX attribute on an opening element, or undefined. */
    const getSxAttrFromAttrs = (attrs: any[]): any => {
      for (const a of attrs ?? []) {
        if (
          a.type === "JSXAttribute" &&
          a.name?.type === "JSXIdentifier" &&
          a.name.name === "sx" &&
          a.value?.type === "JSXExpressionContainer"
        ) {
          return a;
        }
      }
      return undefined;
    };

    const isStyleKeyRef = (node: any, key: string): boolean =>
      node?.type === "MemberExpression" &&
      node.object?.type === "Identifier" &&
      node.object.name === stylesIdentifier &&
      node.property?.type === "Identifier" &&
      node.property.name === key;

    const hasStyleKeyArg = (call: any, key: string): boolean => {
      return (call.arguments ?? []).some((a: any) => isStyleKeyRef(a, key));
    };

    /** Check for a style key in either stylex.props() args OR sx attribute args. */
    const hasStyleKeyInAttrs = (attrs: any[], key: string): boolean => {
      const call = getStylexPropsCallFromAttrs(attrs);
      if (call && hasStyleKeyArg(call, key)) {
        return true;
      }
      const sxAttr = getSxAttrFromAttrs(attrs);
      if (sxAttr) {
        return getSxAttrArgs(sxAttr.value.expression).some((a: any) => isStyleKeyRef(a, key));
      }
      return false;
    };

    /** Add args to sx attribute, converting single expr to array if needed. */
    const addArgsToSxAttr = (sxAttr: any, newArgs: any[]): void => {
      const container = sxAttr.value;
      const expr = container.expression;
      if (expr.type === "ArrayExpression") {
        expr.elements = [...(expr.elements ?? []), ...newArgs];
      } else {
        container.expression = j.arrayExpression([expr, ...newArgs]);
      }
    };

    const isIdentifierNamed = (a: any, name: string): boolean =>
      a?.type === "Identifier" && a.name === name;

    const isDefaultMarkerCall = (a: any): boolean =>
      a?.type === "CallExpression" &&
      a.callee?.type === "MemberExpression" &&
      a.callee.object?.type === "Identifier" &&
      a.callee.object.name === "stylex" &&
      a.callee.property?.type === "Identifier" &&
      a.callee.property.name === "defaultMarker";

    const hasIdentifierArg = (call: any, name: string): boolean =>
      (call.arguments ?? []).some((a: any) => isIdentifierNamed(a, name));

    const hasIdentifierInSxArgs = (sxAttr: any, name: string): boolean =>
      getSxAttrArgs(sxAttr.value.expression).some((a: any) => isIdentifierNamed(a, name));

    const hasDefaultMarker = (call: any): boolean =>
      (call.arguments ?? []).some(isDefaultMarkerCall);

    const hasDefaultMarkerInSxArgs = (sxAttr: any): boolean =>
      getSxAttrArgs(sxAttr.value.expression).some(isDefaultMarkerCall);

    const overridesByChild = new Map<string, RelationOverride[]>();
    for (const o of relationOverrides) {
      overridesByChild.set(o.childStyleKey, [...(overridesByChild.get(o.childStyleKey) ?? []), o]);
    }

    /** Check if any ancestor in the JSX tree contains the given parent style key. */
    const ancestorHasParentKey = (ancestors: any[], parentStyleKey: string): boolean => {
      // For cross-file reverse selectors, the ancestor has a marker variable instead of styles.X
      const markerVarName = crossFileMarkers?.get(parentStyleKey);
      return ancestors.some(
        (a: any) =>
          (a?.call && hasStyleKeyArg(a.call, parentStyleKey)) ||
          (a?.sxAttr &&
            getSxAttrArgs(a.sxAttr.value.expression).some((arg: any) =>
              isStyleKeyRef(arg, parentStyleKey),
            )) ||
          (a?.elementStyleKey && a.elementStyleKey === parentStyleKey) ||
          (markerVarName && a?.markerVarName === markerVarName),
      );
    };

    // Track empty ancestor style keys to remove AFTER all descendant matching is done.
    // We defer removal so that ancestor matching can still find the style keys.
    const pendingEmptyKeyRemovals: Array<{ call: any; key: string }> = [];

    const visit = (node: any, ancestors: any[]) => {
      if (!node || node.type !== "JSXElement") {
        return;
      }
      const opening = node.openingElement;
      const attrs = (opening.attributes ?? []) as any[];
      const call = getStylexPropsCallFromAttrs(attrs);
      const sxAttr = getSxAttrFromAttrs(attrs);
      const elementName = getJsxElementName(opening?.name, { allowMemberExpression: false });
      // Get the style key for this element if it's a known component
      const elementStyleKey = elementName ? componentNameToStyleKey?.get(elementName) : null;

      // Process ancestor selector parents — works with both stylex.props() and sx={}
      if (call) {
        for (const parentKey of ancestorSelectorParents) {
          if (hasStyleKeyArg(call, parentKey)) {
            if (emptyStyleKeys?.has(parentKey)) {
              pendingEmptyKeyRemovals.push({ call, key: parentKey });
            }
            const markerVarName = crossFileMarkers?.get(parentKey);
            if (markerVarName) {
              if (!hasIdentifierArg(call, markerVarName)) {
                call.arguments = [...(call.arguments ?? []), j.identifier(markerVarName)];
                changed = true;
              }
            } else if (!hasDefaultMarker(call)) {
              call.arguments = [...(call.arguments ?? []), makeDefaultMarkerCall()];
              changed = true;
            }
          }
        }
      } else if (sxAttr) {
        for (const parentKey of ancestorSelectorParents) {
          if (
            getSxAttrArgs(sxAttr.value.expression).some((a: any) => isStyleKeyRef(a, parentKey))
          ) {
            const markerVarName = crossFileMarkers?.get(parentKey);
            if (markerVarName) {
              if (!hasIdentifierInSxArgs(sxAttr, markerVarName)) {
                addArgsToSxAttr(sxAttr, [j.identifier(markerVarName)]);
                changed = true;
              }
            } else if (!hasDefaultMarkerInSxArgs(sxAttr)) {
              addArgsToSxAttr(sxAttr, [makeDefaultMarkerCall()]);
              changed = true;
            }
          }
        }
      }

      // Process child override styles — works with both stylex.props() and sx={}
      if (call || sxAttr) {
        for (const [childKey, list] of overridesByChild.entries()) {
          const hasKey = call
            ? hasStyleKeyArg(call, childKey)
            : hasStyleKeyInAttrs(attrs, childKey);
          if (!hasKey) {
            continue;
          }
          for (const o of list) {
            if (!ancestorHasParentKey(ancestors, o.parentStyleKey)) {
              continue;
            }
            const alreadyHas = call
              ? hasStyleKeyArg(call, o.overrideStyleKey)
              : hasStyleKeyInAttrs(attrs, o.overrideStyleKey);
            if (alreadyHas) {
              continue;
            }
            const overrideArg = j.memberExpression(
              j.identifier(stylesIdentifier),
              j.identifier(o.overrideStyleKey),
            );
            if (call) {
              call.arguments = [...(call.arguments ?? []), overrideArg];
            } else if (sxAttr) {
              addArgsToSxAttr(sxAttr, [overrideArg]);
            }
            changed = true;
          }
        }
      }

      // Cross-file forward child: add override styles to imported child JSX
      const childOverrides = elementName ? crossFileChildOverrides.get(elementName) : undefined;
      if (childOverrides) {
        const overrideArgs: any[] = [];
        for (const o of childOverrides) {
          if (!ancestorHasParentKey(ancestors, o.parentStyleKey)) {
            continue;
          }
          overrideArgs.push(
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(o.overrideStyleKey)),
          );
        }
        if (overrideArgs.length > 0) {
          // Merge into existing stylex.props() or sx={} if present, otherwise create new
          const existingCall = getStylexPropsCallFromAttrs(opening.attributes ?? []);
          const existingSx = getSxAttrFromAttrs(opening.attributes ?? []);
          if (existingCall) {
            existingCall.arguments = [...(existingCall.arguments ?? []), ...overrideArgs];
          } else if (existingSx) {
            addArgsToSxAttr(existingSx, overrideArgs);
          } else {
            const newCall = j.callExpression(
              j.memberExpression(j.identifier("stylex"), j.identifier("props")),
              overrideArgs,
            );
            opening.attributes = [...(opening.attributes ?? []), j.jsxSpreadAttribute(newCall)];
          }
          changed = true;
        }
      }

      // Cross-file reverse parent: add marker to imported parent JSX
      let addedMarkerVarName: string | undefined;
      const parentMarkers = elementName ? crossFileParentMarkers.get(elementName) : undefined;
      if (parentMarkers) {
        for (const o of parentMarkers) {
          if (!o.markerVarName) {
            continue;
          }
          addedMarkerVarName = o.markerVarName;
          const markerIdent = j.identifier(o.markerVarName);
          if (call) {
            if (!hasIdentifierArg(call, o.markerVarName)) {
              call.arguments = [...(call.arguments ?? []), markerIdent];
              changed = true;
            }
          } else if (sxAttr) {
            if (!hasIdentifierInSxArgs(sxAttr, o.markerVarName)) {
              addArgsToSxAttr(sxAttr, [markerIdent]);
              changed = true;
            }
          } else {
            const markerCall = j.callExpression(
              j.memberExpression(j.identifier("stylex"), j.identifier("props")),
              [markerIdent],
            );
            opening.attributes = [...(opening.attributes ?? []), j.jsxSpreadAttribute(markerCall)];
            changed = true;
          }
        }
      }

      const nextAncestors = [
        ...ancestors,
        { call, sxAttr, elementStyleKey, markerVarName: addedMarkerVarName },
      ];
      for (const child of node.children ?? []) {
        visitJsxChild(child, nextAncestors);
      }
    };

    function visitJsxChild(node: any, ancestors: any[]): void {
      if (!node || typeof node !== "object") {
        return;
      }
      if (node.type === "JSXElement") {
        visit(node, ancestors);
        return;
      }
      if (node.type === "JSXFragment") {
        visitJsxFragment(node, ancestors);
        return;
      }
      if (node.type === "JSXExpressionContainer") {
        visitJsxInExpression(node.expression, ancestors);
      }
    }

    function visitJsxFragment(node: any, ancestors: any[]): void {
      for (const child of node.children ?? []) {
        visitJsxChild(child, ancestors);
      }
    }

    function visitJsxInExpression(node: any, ancestors: any[]): void {
      if (!node || typeof node !== "object") {
        return;
      }
      if (node.type === "JSXElement") {
        visit(node, ancestors);
        return;
      }
      if (node.type === "JSXFragment") {
        visitJsxFragment(node, ancestors);
        return;
      }
      if (node.type === "ConditionalExpression") {
        visitJsxInExpression(node.consequent, ancestors);
        visitJsxInExpression(node.alternate, ancestors);
        return;
      }
      if (node.type === "LogicalExpression") {
        visitJsxInExpression(node.left, ancestors);
        visitJsxInExpression(node.right, ancestors);
        return;
      }
      if (node.type === "SequenceExpression") {
        for (const expr of node.expressions ?? []) {
          visitJsxInExpression(expr, ancestors);
        }
        return;
      }
      if (node.type === "ArrayExpression") {
        for (const expr of node.elements ?? []) {
          visitJsxInExpression(expr, ancestors);
        }
        return;
      }
      if (
        node.type === "ParenthesizedExpression" ||
        node.type === "TSAsExpression" ||
        node.type === "TSTypeAssertion" ||
        node.type === "TSNonNullExpression"
      ) {
        visitJsxInExpression(node.expression, ancestors);
      }
    }

    root.find(j.JSXElement).forEach((p: any) => {
      if (j(p).closest(j.JSXElement).size() > 0) {
        return;
      }
      visit(p.node, []);
    });

    // Now that all descendant matching is done, remove the empty ancestor style keys.
    // This allows the matching to work (ancestors still had their keys) while
    // avoiding empty style objects in the final output.
    for (const { call, key } of pendingEmptyKeyRemovals) {
      const originalLength = (call.arguments ?? []).length;
      call.arguments = (call.arguments ?? []).filter(
        (a: any) =>
          !(
            a?.type === "MemberExpression" &&
            a.object?.type === "Identifier" &&
            a.object.name === stylesIdentifier &&
            a.property?.type === "Identifier" &&
            a.property.name === key
          ),
      );
      if ((call.arguments ?? []).length !== originalLength) {
        changed = true;
      }
    }
  }

  // Remove empty style key references from stylex.props(), merger calls, and sx={} attributes
  if (emptyStyleKeys && emptyStyleKeys.size > 0) {
    const isEmptyStyleRef = (a: any): boolean =>
      a?.type === "MemberExpression" &&
      a.object?.type === "Identifier" &&
      a.object.name === stylesIdentifier &&
      a.property?.type === "Identifier" &&
      emptyStyleKeys.has(a.property.name);

    // Clean stylex.props() and merger calls
    root.find(j.CallExpression).forEach((p: any) => {
      const call = p.node;

      if (
        call?.callee?.type === "MemberExpression" &&
        call.callee.object?.type === "Identifier" &&
        call.callee.object.name === "stylex" &&
        call.callee.property?.type === "Identifier" &&
        call.callee.property.name === "props"
      ) {
        const originalLength = (call.arguments ?? []).length;
        call.arguments = (call.arguments ?? []).filter((a: any) => !isEmptyStyleRef(a));
        if (call.arguments.length !== originalLength) {
          changed = true;
        }
        if (call.arguments.length === 0) {
          const parentNode = p.parentPath?.node;
          if (parentNode?.type === "JSXSpreadAttribute") {
            const jsxOpening = p.parentPath?.parentPath?.node;
            if (jsxOpening?.type === "JSXOpeningElement" && Array.isArray(jsxOpening.attributes)) {
              jsxOpening.attributes = jsxOpening.attributes.filter(
                (attr: unknown) => attr !== parentNode,
              );
              changed = true;
            }
          }
        }
      }

      if (call?.callee?.type === "Identifier") {
        const firstArg = call.arguments?.[0];
        if (firstArg?.type === "ArrayExpression") {
          const arr = firstArg;
          const originalLength = (arr.elements ?? []).length;
          arr.elements = (arr.elements ?? []).filter((e: any) => !isEmptyStyleRef(e));
          if (arr.elements.length !== originalLength) {
            changed = true;
          }
        }
        if (isEmptyStyleRef(firstArg)) {
          call.arguments[0] = j.identifier("undefined");
          changed = true;
        }
      }
    });

    // Clean sx={} JSX attributes
    root.find(j.JSXAttribute, { name: { name: "sx" } } as any).forEach((p: any) => {
      const val = p.node.value;
      if (!val || val.type !== "JSXExpressionContainer") {
        return;
      }
      const expr = val.expression;
      if (expr?.type === "ArrayExpression") {
        const orig = (expr.elements ?? []).length;
        expr.elements = (expr.elements ?? []).filter((e: any) => !isEmptyStyleRef(e));
        if (expr.elements.length !== orig) {
          changed = true;
        }
        if (expr.elements.length === 1) {
          val.expression = expr.elements[0];
          changed = true;
        }
        if (expr.elements.length === 0) {
          const opening = p.parentPath?.node;
          if (opening?.type === "JSXOpeningElement" && Array.isArray(opening.attributes)) {
            opening.attributes = opening.attributes.filter((attr: unknown) => attr !== p.node);
            changed = true;
          }
        }
      } else if (isEmptyStyleRef(expr)) {
        const opening = p.parentPath?.node;
        if (opening?.type === "JSXOpeningElement" && Array.isArray(opening.attributes)) {
          opening.attributes = opening.attributes.filter((attr: unknown) => attr !== p.node);
          changed = true;
        }
      }
    });
  }

  // If `@emotion/is-prop-valid` was only used inside removed styled declarations, drop the import.
  root
    .find(j.ImportDeclaration, { source: { value: "@emotion/is-prop-valid" } } as any)
    .forEach((p: any) => {
      const spec = p.node.specifiers?.find((s: any) => s.type === "ImportDefaultSpecifier") as any;
      const local = spec?.local?.type === "Identifier" ? spec.local.name : null;
      if (!local) {
        return;
      }
      const used =
        root
          .find(j.Identifier, { name: local } as any)
          .filter((idPath: any) => j(idPath).closest(j.ImportDeclaration).size() === 0)
          .size() > 0;
      if (!used) {
        j(p).remove();
        changed = true;
      }
    });

  // Drop unused import specifiers (common after removing styled declarations).
  // Keep side-effect imports (no specifiers) as-is.
  root.find(j.ImportDeclaration).forEach((p: any) => {
    // Some codebases intentionally keep `import React ... from "react"` even with automatic JSX runtimes,
    // either for classic runtime compatibility, global React typing, or local conventions.
    // Preserve existing `React` default/namespace imports when requested.
    if (preserveReactImport && (p.node?.source as any)?.value === "react") {
      const hasReactValueBinding = (p.node.specifiers ?? []).some(
        (s: any) =>
          (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
          s.local?.type === "Identifier" &&
          s.local.name === "React",
      );
      if (hasReactValueBinding) {
        return;
      }
    }

    const specs = (p.node.specifiers ?? []) as any[];
    if (specs.length === 0) {
      return;
    }

    const usedOutsideImports = (localName: string): boolean => {
      const isProbablyJsxBindingName = (name: string): boolean => {
        // In JSX, lowercase tag names like `<div />` are treated as intrinsic elements, not scope bindings.
        // We only treat JSX identifiers as usage of an import when they look like component names.
        // (Uppercase is the conventional signal, and matches React/TSX binding semantics.)
        const first = name[0] ?? "";
        return first.toUpperCase() === first && first.toLowerCase() !== first;
      };

      const usedByIdentifier =
        root
          .find(j.Identifier, { name: localName } as any)
          .filter((idPath: any) => {
            if (j(idPath).closest(j.ImportDeclaration).size() > 0) {
              return false;
            }

            const parent = idPath.parent?.node as any;
            // Ignore identifiers used as non-computed member property keys: `obj.foo`
            if (
              parent &&
              (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
              parent.property === idPath.node &&
              parent.computed === false
            ) {
              return false;
            }
            // Ignore identifiers used as object literal keys when not shorthand: `{ foo: 1 }`
            if (
              parent &&
              parent.type === "Property" &&
              parent.key === idPath.node &&
              parent.shorthand !== true
            ) {
              return false;
            }

            return true;
          })
          .size() > 0;

      // JSX element names are `JSXIdentifier`, not `Identifier`, so include those too:
      // - `styled(ExternalComponent)` becomes `<ExternalComponent ... />`
      const usedByJsxIdentifier =
        isProbablyJsxBindingName(localName) &&
        root
          .find(j.JSXIdentifier, { name: localName } as any)
          .filter((jsxPath: any) => {
            // No need for ImportDeclaration guard (JSXIdentifier doesn't appear in imports), but keep it symmetric.
            if (j(jsxPath).closest(j.ImportDeclaration).size() > 0) {
              return false;
            }
            return true;
          })
          .size() > 0;

      return usedByIdentifier || usedByJsxIdentifier;
    };

    // Preserve entire type-only import declarations
    // `import type { ... }` has importKind on the declaration, not the specifiers
    if ((p.node as any).importKind === "type") {
      return;
    }

    const nextSpecs = specs.filter((s: any) => {
      // Preserve type-only import specifiers - they're used for TypeScript types
      // and may not be detectable via standard Identifier lookup
      if (s?.importKind === "type") {
        return true;
      }
      const local =
        s?.local?.type === "Identifier"
          ? s.local.name
          : s?.type === "ImportDefaultSpecifier" && s.local?.type === "Identifier"
            ? s.local.name
            : s?.type === "ImportNamespaceSpecifier" && s.local?.type === "Identifier"
              ? s.local.name
              : null;
      if (!local) {
        return true;
      }
      // If this identifier is being shadowed by a new import (added by the adapter),
      // only drop it when the import source does NOT match the adapter's source for that local.
      if (newImportLocalNames?.has(local)) {
        const sourceValue = (p.node?.source as any)?.value;
        const allowedSources = newImportSourcesByLocal?.get(local);
        if (!allowedSources || !allowedSources.has(sourceValue)) {
          return false;
        }
      }
      return usedOutsideImports(local);
    });

    if (nextSpecs.length !== specs.length) {
      p.node.specifiers = nextSpecs;
      changed = true;
    }
    if ((p.node.specifiers?.length ?? 0) === 0) {
      j(p).remove();
      changed = true;
    }
  });

  // If we already have a value binding named `React` in scope, don't auto-insert `import React from "react";`.
  //
  // NOTE: Avoid relying on a strict matcher like `{ source: { value: "react" } }` here; different printers/parsers
  // can represent the module specifier slightly differently, but the `source.value` string remains stable.
  const hasReactImport =
    root
      .find(j.ImportDeclaration)
      .filter((p: any) => (p.node?.source as any)?.value === "react")
      .filter((p: any) =>
        (p.node.specifiers ?? []).some(
          (s: any) =>
            (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
            s.local?.type === "Identifier" &&
            s.local.name === "React",
        ),
      )
      .size() > 0;
  const usesReactIdent = root.find(j.Identifier, { name: "React" } as any).size() > 0;

  return { changed, needsReactImport: usesReactIdent && !hasReactImport };
}

// --- Non-exported helpers ---

function appendToMapList<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}
