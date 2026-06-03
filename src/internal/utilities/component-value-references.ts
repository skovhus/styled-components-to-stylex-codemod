/**
 * Detects when a styled-component binding is referenced "as a value" — i.e. anywhere other than as
 * its own declaration or a JSX tag. Such references (passing the component to `innerElementType`,
 * `as`, an HOC, assigning it to an alias, etc.) mean a caller we cannot observe may render the
 * component with arbitrary props, so optimizations relying on exhaustive local observation must bail.
 */
import type { JSCodeshift } from "jscodeshift";

/**
 * True when this Identifier path is a non-JSX value reference to a styled component (not its
 * declaration, not a JSX tag, not a `styled(...)` extension or tagged-template tag).
 */
export function isNonJsxStyledValueReferencePath(
  path: any,
  styledDefaultImport: string | undefined,
): boolean {
  const parent = path.parentPath?.node;
  // The styled component declaration itself — but `const Alias = StyledComponent` IS a value use.
  if (parent?.type === "VariableDeclarator" && parent.id === path.node) {
    return false;
  }
  // JSX element names (handled by inline substitution).
  if (parent?.type === "JSXOpeningElement" || parent?.type === "JSXClosingElement") {
    return false;
  }
  // JSX member expressions like <Styled.Component />.
  if (parent?.type === "JSXMemberExpression" && (parent as any).object === path.node) {
    return false;
  }
  // styled(Component) / styled(Component)`...` extensions.
  if (parent?.type === "CallExpression") {
    const callee = (parent as any).callee;
    if (callee?.type === "Identifier" && callee.name === styledDefaultImport) {
      return false;
    }
    if (
      callee?.type === "MemberExpression" &&
      callee.object?.type === "CallExpression" &&
      callee.object.callee?.type === "Identifier" &&
      callee.object.callee.name === styledDefaultImport
    ) {
      return false;
    }
  }
  // TaggedTemplateExpression tags and styled(Component)`...` calls.
  if (parent?.type === "TaggedTemplateExpression") {
    return false;
  }
  if (
    parent?.type === "CallExpression" &&
    path.parentPath?.parentPath?.node?.type === "TaggedTemplateExpression"
  ) {
    return false;
  }
  // Template literal interpolations (e.g., ${Link}:hover &).
  if (parent?.type === "TemplateLiteral") {
    return false;
  }
  return true;
}

/** Returns the subset of `names` that appear as a non-JSX value reference anywhere in the file. */
export function componentsReferencedAsValue(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  names: ReadonlySet<string>,
  styledDefaultImport: string | undefined,
): Set<string> {
  const referenced = new Set<string>();
  if (names.size === 0) {
    return referenced;
  }
  root.find(j.Identifier).forEach((path) => {
    const name = (path.node as { name?: string }).name;
    if (
      name &&
      names.has(name) &&
      !referenced.has(name) &&
      isNonJsxStyledValueReferencePath(path, styledDefaultImport)
    ) {
      referenced.add(name);
    }
  });
  return referenced;
}
