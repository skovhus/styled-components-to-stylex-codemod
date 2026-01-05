import type { Collection } from "jscodeshift";
import type { DescendantOverride } from "./lower-rules.js";

export function postProcessTransformedAst(args: {
  root: Collection<any>;
  j: any;
  descendantOverrides: DescendantOverride[];
  ancestorSelectorParents: Set<string>;
}): { changed: boolean; needsReactImport: boolean } {
  const { root, j, descendantOverrides, ancestorSelectorParents } = args;
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
    const specs = (p.node.specifiers ?? []) as any[];
    if (specs.length === 0) {
      return;
    }

    const usedOutsideImports = (localName: string): boolean => {
      return (
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
          .size() > 0
      );
    };

    const nextSpecs = specs.filter((s: any) => {
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

  const hasReactImport =
    root
      .find(j.ImportDeclaration, { source: { value: "react" } } as any)
      .find(j.ImportDefaultSpecifier)
      .size() > 0;
  const usesReactIdent = root.find(j.Identifier, { name: "React" } as any).size() > 0;

  return { changed, needsReactImport: usesReactIdent && !hasReactImport };
}
