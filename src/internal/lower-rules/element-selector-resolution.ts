/**
 * Element-selector resolution for nested element selectors (e.g. `& > button`).
 *
 * Parses element-selector patterns, checks bail conditions (exported parent,
 * ambiguous targets, dynamic children, pseudo collisions), and resolves the
 * targeted child declaration and pseudo info.
 */
import type { JSCodeshift } from "jscodeshift";
import type { DeclProcessingState } from "./decl-setup.js";
import type { StyledDecl } from "../transform-types.js";
import { parseElementSelectorPattern } from "../selectors.js";

export type ElementSelectorBailReason =
  | "bail-exported"
  | "bail-ambiguous"
  | "bail-dynamic"
  | "bail-combined-pseudo"
  | "bail-plain-intrinsic"
  | "bail-pseudo-collision";

export const ELEMENT_BAIL_WARNING_MAP: Record<
  ElementSelectorBailReason,
  import("../logger.js").WarningType
> = {
  "bail-exported": "Unsupported selector: element selector on exported component",
  "bail-ambiguous": "Unsupported selector: ambiguous element selector",
  "bail-dynamic": "Unsupported selector: element selector with dynamic children",
  "bail-combined-pseudo":
    "Unsupported selector: element selector with combined ancestor and child pseudos",
  "bail-plain-intrinsic": "Unsupported selector: element selector with plain intrinsic children",
  "bail-pseudo-collision": "Unsupported selector: element selector pseudo collision",
};

/**
 * Orchestrates element selector resolution. Parses the selector, checks for bail
 * conditions (exported parent, ambiguous targets, dynamic children), and returns
 * the resolved child declaration + pseudo info, a bail reason, or null if not an
 * element selector pattern.
 */
export function resolveElementSelectorTarget(
  selector: string,
  parentDecl: StyledDecl,
  root: DeclProcessingState["state"]["root"],
  j: JSCodeshift,
):
  | {
      tagName: string;
      ancestorPseudo: string | null;
      childPseudo: string | null;
      directOnly: boolean;
    }
  | ElementSelectorBailReason
  | null {
  const parsed = parseElementSelectorPattern(selector);
  if (!parsed) {
    return null;
  }
  const { tagName, ancestorPseudo, childPseudo, directOnly } = parsed;

  // Bail if both ancestor and child pseudos are present (e.g., `&:focus > button:disabled`)
  // — cannot represent both in a single StyleX override
  if (ancestorPseudo && childPseudo) {
    return "bail-combined-pseudo";
  }

  // Bail if the parent component is exported — can't verify external usage
  if (isComponentExported(parentDecl.localName, root, j)) {
    return "bail-exported";
  }

  return { tagName, ancestorPseudo, childPseudo, directOnly };
}

export function hasDynamicJsxChildren(
  componentName: string,
  root: DeclProcessingState["state"]["root"],
  j: JSCodeshift,
): boolean {
  let hasDynamic = false;
  root
    .find(j.JSXElement, {
      openingElement: {
        name: { type: "JSXIdentifier", name: componentName },
      },
    } as any)
    .forEach((path) => {
      if (hasDynamic) {
        return;
      }
      for (const child of path.node.children ?? []) {
        if (child.type === "JSXExpressionContainer") {
          if (child.expression.type === "JSXEmptyExpression") {
            continue;
          }
          hasDynamic = true;
          return;
        }
      }
    });
  return hasDynamic;
}

export function hasLocalElementPseudoCollision(
  overrides: NonNullable<StyledDecl["localElementOverrides"]>,
  tagName: string,
  ancestorPseudo: string | null,
  childPseudo: string | null,
): boolean {
  const nextPseudo = childPseudo ?? ancestorPseudo;
  if (!nextPseudo) {
    return false;
  }
  return overrides.some((override) => {
    if (override.tagName !== tagName) {
      return false;
    }
    const existingPseudo = override.childPseudo ?? override.ancestorPseudo;
    return existingPseudo === nextPseudo && override.childPseudo !== childPseudo;
  });
}

// --- Non-exported helpers ---

/**
 * Checks whether a component is exported from the file (named, default, or re-export).
 */
function isComponentExported(
  name: string,
  root: DeclProcessingState["state"]["root"],
  j: JSCodeshift,
): boolean {
  // `export const X = ...` or `export function X ...`
  const namedExport = root.find(j.ExportNamedDeclaration).filter((path) => {
    const decl = path.node.declaration;
    if (decl?.type === "VariableDeclaration") {
      return decl.declarations.some((d: any) => d.id?.type === "Identifier" && d.id.name === name);
    }
    if (decl?.type === "FunctionDeclaration" && (decl as any).id?.name === name) {
      return true;
    }
    // `export { X }` re-exports
    if (!decl && path.node.specifiers) {
      return path.node.specifiers.some(
        (s: any) => s.local?.name === name || s.exported?.name === name,
      );
    }
    return false;
  });
  if (namedExport.size() > 0) {
    return true;
  }

  // `export default X`
  const defaultExport = root.find(j.ExportDefaultDeclaration).filter((path) => {
    const decl = path.node.declaration;
    return decl?.type === "Identifier" && (decl as any).name === name;
  });
  return defaultExport.size() > 0;
}
