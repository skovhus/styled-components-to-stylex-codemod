/**
 * JSX child/whitespace helpers for the rewrite-jsx step: adjacent-sibling
 * detection for `+` selectors, inline text whitespace preservation, and the
 * React/custom-component predicates those rely on.
 */
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import {
  findContainingJsxChildrenOwner,
  isJsxEmptyExpressionContainer,
  isJsxTextChild,
  type JsxPath,
} from "../utilities/jsx-children.js";

export function hasPreviousStaticSiblingWithName(path: JsxPath, componentName: string): boolean {
  const currentNode = path.node;
  const parentNode = findContainingJsxChildrenOwner(path);

  if (!parentNode?.children) {
    return false;
  }

  const siblings = parentNode.children;
  const currentIndex = siblings.indexOf(currentNode);
  if (currentIndex <= 0) {
    return false;
  }

  type AdjacentSiblingNode =
    | { type: "JSXText"; value: string }
    | { type: "JSXExpressionContainer"; expression?: { type?: string; value?: unknown } }
    | {
        type: "JSXElement";
        openingElement?: {
          name?: { type?: string; name?: string };
          __styledComponentLocalName?: string;
        };
      }
    | { type?: string };
  const isJsxTextSibling = (
    sibling: AdjacentSiblingNode,
  ): sibling is Extract<AdjacentSiblingNode, { type: "JSXText" }> => sibling.type === "JSXText";
  const isJsxElementSibling = (
    sibling: AdjacentSiblingNode,
  ): sibling is Extract<AdjacentSiblingNode, { type: "JSXElement" }> =>
    sibling.type === "JSXElement";
  const isJsxExpressionContainerSibling = (
    sibling: AdjacentSiblingNode,
  ): sibling is Extract<AdjacentSiblingNode, { type: "JSXExpressionContainer" }> =>
    sibling.type === "JSXExpressionContainer";

  for (let i = currentIndex - 1; i >= 0; i--) {
    const sibling = siblings[i] as AdjacentSiblingNode | undefined;
    if (!sibling) {
      continue;
    }
    if (isJsxTextSibling(sibling)) {
      continue;
    }
    if (isJsxExpressionContainerSibling(sibling)) {
      const expression = sibling.expression;
      if (
        expression?.type === "Literal" ||
        expression?.type === "StringLiteral" ||
        expression?.type === "TemplateLiteral"
      ) {
        continue;
      }
      return false;
    }
    if (!isJsxElementSibling(sibling)) {
      return false;
    }
    const originalStyledName = sibling.openingElement?.__styledComponentLocalName;
    if (originalStyledName) {
      return originalStyledName === componentName;
    }
    const siblingName = sibling.openingElement?.name;
    return siblingName?.type === "JSXIdentifier" && siblingName.name === componentName;
  }

  return false;
}

export function preserveInlineJsxTextWhitespace(
  ctx: TransformContext,
  path: JsxPath,
  styledDecls: StyledDecl[],
): void {
  const { j } = ctx;
  const parentNode = findContainingJsxChildrenOwner(path);
  const children = parentNode?.children;
  if (!children || isCustomComponentJsxElement(ctx, parentNode, styledDecls)) {
    return;
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!isJsxTextChild(child)) {
      continue;
    }
    if (!child.value.trim()) {
      if (
        /^[ \t]+$/.test(child.value) &&
        hasRenderableJsxSibling(children, i - 1, -1) &&
        hasRenderableJsxSibling(children, i + 1, 1)
      ) {
        children.splice(i, 1, createJsxSpaceExpression(j, child.value));
      }
      continue;
    }

    // Recast can drop inline edge spaces when a multiline JSX parent is reprinted.
    const leading = child.value.match(/^[ \t]+(?=\S)/)?.[0];
    if (leading && hasRenderableJsxSibling(children, i - 1, -1)) {
      child.value = child.value.slice(leading.length);
      children.splice(i, 0, createJsxSpaceExpression(j, leading));
      i++;
    }

    const trailing = child.value.match(/\S([ \t]+)$/)?.[1];
    if (trailing && hasRenderableJsxSibling(children, i + 1, 1)) {
      child.value = child.value.slice(0, -trailing.length);
      children.splice(i + 1, 0, createJsxSpaceExpression(j, trailing));
      i++;
    }
  }
}

function isCustomComponentJsxElement(
  ctx: TransformContext,
  parentNode: {
    type?: string;
    openingElement?: { name?: unknown };
  },
  styledDecls: StyledDecl[],
): boolean {
  const parentName = parentNode.openingElement?.name;
  if (isReactFragmentJsxName(ctx, parentName)) {
    return false;
  }
  if (isInlineStyledParent(parentName, styledDecls)) {
    return false;
  }
  if (isCustomElementJsxName(parentName)) {
    return true;
  }
  if (isJsxIdentifierName(parentName)) {
    return !parentName.name || !/^[a-z]/.test(parentName.name);
  }
  return parentNode.type === "JSXElement";
}

function isInlineStyledParent(name: unknown, styledDecls: StyledDecl[]): boolean {
  if (!isJsxIdentifierName(name)) {
    return false;
  }
  return styledDecls.some(
    (decl) =>
      decl.localName === name.name &&
      decl.base.kind === "intrinsic" &&
      !decl.skipTransform &&
      !decl.needsWrapperComponent &&
      !decl.isCssHelper,
  );
}

function isReactFragmentJsxName(ctx: TransformContext, name: unknown): boolean {
  if (isJsxIdentifierName(name)) {
    const importInfo = ctx.importMap?.get(name.name);
    return importInfo?.importedName === "Fragment" && isReactImportSource(importInfo.source);
  }
  if (!isJsxMemberExpressionName(name)) {
    return false;
  }
  return (
    isJsxIdentifierName(name.object) &&
    isReactNamespaceBinding(ctx, name.object.name) &&
    isJsxIdentifierName(name.property) &&
    name.property.name === "Fragment"
  );
}

function isReactImportSource(source: unknown): boolean {
  return (
    typeof source === "object" &&
    source !== null &&
    (source as { kind?: unknown; value?: unknown }).kind === "specifier" &&
    (source as { value?: unknown }).value === "react"
  );
}

function isReactNamespaceBinding(ctx: TransformContext, localName: string): boolean {
  const { root, j } = ctx;
  return (
    root
      .find(j.ImportDeclaration)
      .filter((path) => (path.node.source as { value?: unknown })?.value === "react")
      .filter((path) =>
        (path.node.specifiers ?? []).some(
          (specifier) =>
            (specifier.type === "ImportDefaultSpecifier" ||
              specifier.type === "ImportNamespaceSpecifier") &&
            specifier.local?.type === "Identifier" &&
            specifier.local.name === localName,
        ),
      )
      .size() > 0
  );
}

function isCustomElementJsxName(name: unknown): boolean {
  return isJsxIdentifierName(name) && name.name.includes("-");
}

function isJsxIdentifierName(name: unknown): name is { type: "JSXIdentifier"; name: string } {
  return (
    typeof name === "object" &&
    name !== null &&
    (name as { type?: unknown }).type === "JSXIdentifier" &&
    typeof (name as { name?: unknown }).name === "string"
  );
}

function isJsxMemberExpressionName(
  name: unknown,
): name is { type: "JSXMemberExpression"; object: unknown; property: unknown } {
  return (
    typeof name === "object" &&
    name !== null &&
    (name as { type?: unknown }).type === "JSXMemberExpression"
  );
}

function hasRenderableJsxSibling(children: unknown[], startIndex: number, step: 1 | -1): boolean {
  for (let i = startIndex; i >= 0 && i < children.length; i += step) {
    const sibling = children[i];
    if (isJsxTextChild(sibling)) {
      if (sibling.value.trim()) {
        return true;
      }
      continue;
    }
    if (isJsxEmptyExpressionContainer(sibling)) {
      continue;
    }
    if (sibling) {
      return true;
    }
  }
  return false;
}

function createJsxSpaceExpression(
  j: TransformContext["j"]["jscodeshift"],
  value: string,
): ReturnType<TransformContext["j"]["jscodeshift"]["jsxExpressionContainer"]> {
  return j.jsxExpressionContainer(j.literal(value));
}
