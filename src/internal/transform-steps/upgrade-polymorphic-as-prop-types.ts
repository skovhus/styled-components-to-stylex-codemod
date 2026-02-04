import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import {
  extractDefaultAsTagFromDestructure,
  isReactElementTypeRef,
} from "../utilities/polymorphic-as-detection.js";

// Standard props that are already in React.ComponentPropsWithRef<C>
const STANDARD_PROPS = new Set(["className", "style", "children", "ref"]);

/**
 * Check if an interface/type only contains standard props (className, style, children, ref).
 * If so, it can be replaced with React.ComponentPropsWithRef<C>.
 */
const typeOnlyHasStandardProps = (root: any, j: any, typeName: string): boolean => {
  // Check interfaces
  const iface = root
    .find(j.TSInterfaceDeclaration, { id: { type: "Identifier", name: typeName } })
    .nodes()[0];
  if (iface) {
    const members = iface.body?.body ?? [];
    if (members.length === 0) {
      return true;
    }
    return members.every((m: any) => {
      if (m?.type !== "TSPropertySignature") {
        return false;
      }
      const key = m.key;
      if (key?.type !== "Identifier") {
        return false;
      }
      return STANDARD_PROPS.has(key.name);
    });
  }

  // Check type aliases
  const typeAlias = root
    .find(j.TSTypeAliasDeclaration, { id: { type: "Identifier", name: typeName } })
    .nodes()[0];
  if (typeAlias) {
    const typeAnn = typeAlias.typeAnnotation;
    if (typeAnn?.type === "TSTypeLiteral") {
      const members = typeAnn.members ?? [];
      if (members.length === 0) {
        return true;
      }
      return members.every((m: any) => {
        if (m?.type !== "TSPropertySignature") {
          return false;
        }
        const key = m.key;
        if (key?.type !== "Identifier") {
          return false;
        }
        return STANDARD_PROPS.has(key.name);
      });
    }
  }

  return false;
};

const rewriteAsPropTypeInTypeNode = (j: any, typeNode: any): { changed: boolean } => {
  let changed = false;
  const visit = (node: any): void => {
    if (!node) {
      return;
    }
    if (node.type === "TSParenthesizedType") {
      visit(node.typeAnnotation);
      return;
    }
    if (node.type === "TSIntersectionType") {
      for (const t of node.types ?? []) {
        visit(t);
      }
      return;
    }
    if (node.type === "TSTypeReference") {
      for (const tp of node.typeParameters?.params ?? []) {
        visit(tp);
      }
      return;
    }
    if (node.type === "TSTypeLiteral") {
      for (const m of node.members ?? []) {
        if (m?.type !== "TSPropertySignature") {
          continue;
        }
        const key = m.key;
        if (key?.type !== "Identifier" || key.name !== "as") {
          continue;
        }
        const memberType = m.typeAnnotation?.typeAnnotation;
        if (isReactElementTypeRef(memberType)) {
          m.typeAnnotation = j.tsTypeAnnotation(j.tsTypeReference(j.identifier("C")));
          m.optional = true;
          changed = true;
        }
      }
      return;
    }
  };
  visit(typeNode);
  return { changed };
};

/**
 * Check if a type annotation is a simple reference to a named type (e.g., `TextProps`).
 * Returns the type name if so, null otherwise.
 */
const getSimpleTypeReferenceName = (typeNode: any): string | null => {
  if (typeNode?.type === "TSTypeReference" && typeNode.typeName?.type === "Identifier") {
    return typeNode.typeName.name;
  }
  return null;
};

/**
 * Check if a type annotation is `SomeType & { as?: React.ElementType }` where SomeType
 * only contains standard props. Returns the type name if so, null otherwise.
 */
const getStandardPropsTypeInIntersection = (root: any, j: any, typeNode: any): string | null => {
  if (typeNode?.type !== "TSIntersectionType") {
    return null;
  }
  const types: any[] = typeNode.types ?? [];
  if (types.length !== 2) {
    return null;
  }
  // Find which one is the type reference and which is the { as?: ... } literal
  let typeRefName: string | null = null;
  let hasAsLiteral = false;

  for (const t of types) {
    const refName = getSimpleTypeReferenceName(t);
    if (refName) {
      typeRefName = refName;
      continue;
    }
    if (t?.type === "TSTypeLiteral") {
      const members = t.members ?? [];
      const onlyHasAs =
        members.length === 1 &&
        members[0]?.type === "TSPropertySignature" &&
        members[0].key?.type === "Identifier" &&
        members[0].key.name === "as";
      if (onlyHasAs) {
        hasAsLiteral = true;
      }
    }
  }

  if (typeRefName && hasAsLiteral && typeOnlyHasStandardProps(root, j, typeRefName)) {
    return typeRefName;
  }
  return null;
};

/**
 * Upgrade function components typed like:
 *   function X(props: SomeProps & { as?: React.ElementType }) { const { as: Component = "tag" } = props; ... }
 *
 * to:
 *   function X<C extends React.ElementType = "tag">(props: SomeProps & { as?: C }) { ... }
 *
 * Special case: if SomeProps only contains standard props (className, style, children, ref),
 * replace the entire type with React.ComponentPropsWithRef<C> & { as?: C } and remove the unused type.
 *
 * This is intentionally narrow and only changes typings (no runtime semantics).
 */
export function upgradePolymorphicAsPropTypesStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;

  // Track types that should be removed because they only had standard props
  const typesToRemove = new Set<string>();

  const processFunction = (fn: any, firstParam: any) => {
    if (!fn?.params?.length) {
      return;
    }
    if (fn.typeParameters) {
      return;
    }
    const defaultTag = extractDefaultAsTagFromDestructure(fn);
    if (!defaultTag) {
      return;
    }
    const typeAnn = firstParam?.typeAnnotation?.typeAnnotation;
    if (!typeAnn) {
      return;
    }

    // Check if we can simplify the type (e.g., TextProps & { as?: ... } -> React.ComponentPropsWithRef<C> & { as?: C })
    const standardPropsType = getStandardPropsTypeInIntersection(root, j, typeAnn);
    if (standardPropsType) {
      // Replace entire type annotation with React.ComponentPropsWithRef<C> & { as?: C }
      const newType = j(`
        function _(props: React.ComponentPropsWithRef<C> & { as?: C }) {}
      `).get().node.program.body[0].params[0].typeAnnotation;
      firstParam.typeAnnotation = newType;
      typesToRemove.add(standardPropsType);

      // Attach <C extends React.ElementType = "tag">
      fn.typeParameters = j(
        `function _<C extends React.ElementType = "${defaultTag}">() { return null }`,
      ).get().node.program.body[0].typeParameters;
      return;
    }

    // Standard case: just rewrite as?: React.ElementType to as?: C
    const { changed } = rewriteAsPropTypeInTypeNode(j, typeAnn);
    if (!changed) {
      return;
    }
    // Attach <C extends React.ElementType = "tag">
    fn.typeParameters = j(
      `function _<C extends React.ElementType = "${defaultTag}">() { return null }`,
    ).get().node.program.body[0].typeParameters;
  };

  // Function declarations
  root.find(j.FunctionDeclaration).forEach((p: any) => {
    const fn: any = p.node;
    const firstParam: any = fn?.params?.[0];
    processFunction(fn, firstParam);
  });

  // Function expressions / arrow functions assigned to const
  root.find(j.VariableDeclarator).forEach((p: any) => {
    const init: any = p.node?.init;
    if (!init) {
      return;
    }
    if (init.type !== "FunctionExpression" && init.type !== "ArrowFunctionExpression") {
      return;
    }
    const firstParam: any = init.params?.[0];
    processFunction(init, firstParam);
  });

  // Remove unused type declarations
  for (const typeName of typesToRemove) {
    root.find(j.TSInterfaceDeclaration, { id: { type: "Identifier", name: typeName } }).remove();
    root.find(j.TSTypeAliasDeclaration, { id: { type: "Identifier", name: typeName } }).remove();
  }

  return CONTINUE;
}
