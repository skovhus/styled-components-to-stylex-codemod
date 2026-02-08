/**
 * Utilities for wrapper delegation and component usage checks.
 * Core concepts: JSX usage detection and wrapper propagation.
 */
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";

/**
 * Checks if a component name is used in JSX within the given AST root.
 */
export function isComponentUsedInJsx(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  name: string,
): boolean {
  const hasMemberExpressionUsage =
    root
      .find(j.JSXMemberExpression)
      .filter((p) => {
        let obj: any = p.node.object;
        while (obj?.type === "JSXMemberExpression") {
          obj = obj.object;
        }
        return obj?.type === "JSXIdentifier" && obj.name === name;
      })
      .size() > 0;

  return (
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name } },
      })
      .size() > 0 ||
    root.find(j.JSXOpeningElement, { name: { type: "JSXIdentifier", name } }).size() > 0 ||
    hasMemberExpressionUsage
  );
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
