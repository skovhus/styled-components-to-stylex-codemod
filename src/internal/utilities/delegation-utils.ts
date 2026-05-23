/**
 * Utilities for wrapper delegation and component usage checks.
 * Core concepts: JSX usage detection and wrapper propagation.
 */
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { getRootJsxIdentifierName } from "./jscodeshift-utils.js";

/**
 * Returns true if a StyledDecl's styleFnFromProps entries can be handled by the
 * inline JSX rewrite path without a wrapper function. Checks that entries use
 * simple identity prop access (no callArg transforms), are always-condition,
 * and no other dynamic features require wrapper prop destructuring.
 */
export function hasInlineableStyleFnOnly(decl: StyledDecl): boolean {
  const styleFnEntries = decl.styleFnFromProps ?? [];
  if (styleFnEntries.length === 0) {
    return false;
  }
  if (styleFnEntries.some((sf) => sf.jsxProp === "__props")) {
    return false;
  }
  if (styleFnEntries.some((sf) => sf.condition !== "always")) {
    return false;
  }
  if (styleFnEntries.some((sf) => sf.callArg)) {
    return false;
  }
  if (decl.shouldForwardPropFromWithConfig) {
    return false;
  }
  if (decl.needsUseThemeHook?.length) {
    return false;
  }
  if (Object.keys(decl.variantStyleKeys ?? {}).length > 0) {
    return false;
  }
  if (decl.enumVariant) {
    return false;
  }
  if (decl.inlineStyleProps?.length) {
    return false;
  }
  if ((decl.attrsInfo?.conditionalAttrs?.length ?? 0) > 0) {
    return false;
  }
  if ((decl.attrsInfo?.defaultAttrs?.length ?? 0) > 0) {
    return false;
  }
  if ((decl.attrsInfo?.invertedBoolAttrs?.length ?? 0) > 0) {
    return false;
  }
  return true;
}

/**
 * Returns true when `shouldForwardProp` must be preserved by a wrapper boundary.
 * Resolver-added drops for inlined base components are applied directly during JSX rewrite.
 */
export function needsShouldForwardPropWrapper(decl: StyledDecl): boolean {
  const resolverOnlyShouldForwardProp =
    !!decl.inlinedBaseComponent && !decl.shouldForwardPropFromWithConfig;
  return !!decl.shouldForwardProp && !resolverOnlyShouldForwardProp;
}

/**
 * Returns true if any JSX usage of a component has spread attributes
 * (e.g., `<Comp {...props} />`). The inline path can only consume explicit
 * JSX attributes, so spreads require a wrapper for prop extraction.
 */
export function hasSpreadInJsx(root: Collection<ASTNode>, j: JSCodeshift, name: string): boolean {
  let found = false;
  const checkOpening = (opening: { attributes?: Array<{ type?: string }> }) => {
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
  root
    .find(j.JSXElement, {
      openingElement: { name: { type: "JSXIdentifier", name } },
    } as object)
    .forEach((p) =>
      checkOpening(p.node.openingElement as { attributes?: Array<{ type?: string }> }),
    );
  root
    .find(j.JSXSelfClosingElement, {
      name: { type: "JSXIdentifier", name },
    } as object)
    .forEach((p) => checkOpening(p.node as { attributes?: Array<{ type?: string }> }));
  return found;
}

/**
 * Checks if a component name is used in JSX within the given AST root.
 */
function isComponentUsedInJsx(root: Collection<ASTNode>, j: JSCodeshift, name: string): boolean {
  return countComponentJsxUsages(root, j, name) > 0;
}

/**
 * Counts JSX usages for a component (e.g. `<Comp />`, `<Comp>...</Comp>`, `<Comp.Slot />`).
 */
export function countComponentJsxUsages(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  name: string,
): number {
  let usageCount = 0;

  root.find(j.JSXElement).forEach((p) => {
    if (getRootJsxIdentifierName(p.node.openingElement?.name) === name) {
      usageCount += 1;
    }
  });

  root.find(j.JSXSelfClosingElement).forEach((p) => {
    const selfClosing = p.node as { name?: unknown };
    if (getRootJsxIdentifierName(selfClosing.name) === name) {
      usageCount += 1;
    }
  });

  return usageCount;
}

/**
 * Propagates `needsWrapperComponent` transitively through styled component chains.
 *
 * When a styled component C extends B (via `styled(B)`), and C needs a wrapper
 * (e.g., because it receives className/style props in JSX), then B also needs
 * a wrapper so that C's wrapper can render `<B>`. This requirement propagates
 * transitively through chains of any depth.
 *
 * Uses fixpoint iteration: repeats until no more flags are changed.
 *
 * @param args.root - The jscodeshift AST root
 * @param args.j - The jscodeshift instance
 * @param args.styledDecls - Array of styled component declarations
 * @param args.declByLocal - Map from local name to styled declaration
 */
export function propagateDelegationWrapperRequirements(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  styledDecls: StyledDecl[];
  declByLocal: Map<string, StyledDecl>;
}): void {
  const { root, j, styledDecls, declByLocal } = args;

  let changed = true;
  while (changed) {
    changed = false;
    for (const decl of styledDecls) {
      if (decl.isCssHelper) {
        continue;
      }
      if (decl.base.kind === "component") {
        const baseDecl = declByLocal.get(decl.base.ident);
        if (!baseDecl) {
          continue;
        }
        // If the base component is used in JSX AND this component needs a wrapper,
        // the base component also needs a wrapper for delegation to work.
        const baseUsedInJsx = isComponentUsedInJsx(root, j, decl.base.ident);
        const shouldDelegate = baseUsedInJsx && decl.needsWrapperComponent;
        if (shouldDelegate && !baseDecl.needsWrapperComponent) {
          baseDecl.needsWrapperComponent = true;
          changed = true;
        }
      }
    }
  }
}
