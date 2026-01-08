import type { Collection } from "jscodeshift";
import type { DescendantOverride } from "./lower-rules.js";

export function postProcessTransformedAst(args: {
  root: Collection<any>;
  j: any;
  descendantOverrides: DescendantOverride[];
  ancestorSelectorParents: Set<string>;
  preserveReactImport?: boolean;
}): { changed: boolean; needsReactImport: boolean } {
  const { root, j, descendantOverrides, ancestorSelectorParents, preserveReactImport } = args;
  let changed = false;

  // Clean up empty variable declarations (e.g. `const X;`)
  root.find(j.VariableDeclaration).forEach((p: any) => {
    if (p.node.declarations.length === 0) {
      j(p).remove();
      changed = true;
    }
  });

  // Apply descendant override styles that rely on `stylex.when.ancestor()`:
  // - Add `stylex.defaultMarker()` to ancestor elements.
  // - Add override style keys to descendant elements' `stylex.props(...)` calls.
  if (descendantOverrides.length > 0) {
    // IMPORTANT: Do not reuse the same AST node instance across multiple insertion points.
    // Recast/jscodeshift expect a tree (no shared references); reuse can corrupt printing.
    const makeDefaultMarkerCall = () =>
      j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("defaultMarker")),
        [],
      );

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

    const hasStyleKeyArg = (call: any, key: string): boolean => {
      return (call.arguments ?? []).some(
        (a: any) =>
          a?.type === "MemberExpression" &&
          a.object?.type === "Identifier" &&
          a.object.name === "styles" &&
          a.property?.type === "Identifier" &&
          a.property.name === key,
      );
    };

    const hasDefaultMarker = (call: any): boolean => {
      return (call.arguments ?? []).some(
        (a: any) =>
          a?.type === "CallExpression" &&
          a.callee?.type === "MemberExpression" &&
          a.callee.object?.type === "Identifier" &&
          a.callee.object.name === "stylex" &&
          a.callee.property?.type === "Identifier" &&
          a.callee.property.name === "defaultMarker",
      );
    };

    const overridesByChild = new Map<string, DescendantOverride[]>();
    for (const o of descendantOverrides) {
      overridesByChild.set(o.childStyleKey, [...(overridesByChild.get(o.childStyleKey) ?? []), o]);
    }

    const visit = (node: any, ancestors: any[]) => {
      if (!node || node.type !== "JSXElement") {
        return;
      }
      const opening = node.openingElement;
      const attrs = (opening.attributes ?? []) as any[];
      const call = getStylexPropsCallFromAttrs(attrs);

      if (call) {
        for (const parentKey of ancestorSelectorParents) {
          if (hasStyleKeyArg(call, parentKey) && !hasDefaultMarker(call)) {
            call.arguments = [...(call.arguments ?? []), makeDefaultMarkerCall()];
            changed = true;
          }
        }
      }

      if (call) {
        for (const [childKey, list] of overridesByChild.entries()) {
          if (!hasStyleKeyArg(call, childKey)) {
            continue;
          }
          for (const o of list) {
            const matched = ancestors.some(
              (a: any) => a?.call && hasStyleKeyArg(a.call, o.parentStyleKey),
            );
            if (!matched) {
              continue;
            }
            if (hasStyleKeyArg(call, o.overrideStyleKey)) {
              continue;
            }
            const overrideArg = j.memberExpression(
              j.identifier("styles"),
              j.identifier(o.overrideStyleKey),
            );
            call.arguments = [...(call.arguments ?? []), overrideArg];
            changed = true;
          }
        }
      }

      const nextAncestors = [...ancestors, { call }];
      for (const c of node.children ?? []) {
        if (c?.type === "JSXElement") {
          visit(c, nextAncestors);
        }
      }
    };

    root.find(j.JSXElement).forEach((p: any) => {
      if (j(p).closest(j.JSXElement).size() > 1) {
        return;
      }
      visit(p.node, []);
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
