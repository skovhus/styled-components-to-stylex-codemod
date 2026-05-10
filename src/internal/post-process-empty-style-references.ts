/**
 * Removes references to empty style objects after JSX/style emission.
 * Core concepts: stylex.props cleanup, merger call cleanup, and sx attribute cleanup.
 */
import type { Collection } from "jscodeshift";

export function cleanupEmptyStyleReferences(args: {
  root: Collection<any>;
  j: any;
  emptyStyleKeys?: Set<string>;
  stylesIdentifier: string;
}): boolean {
  const { root, j, emptyStyleKeys, stylesIdentifier } = args;
  if (!emptyStyleKeys || emptyStyleKeys.size === 0) {
    return false;
  }

  let changed = false;
  const isEmptyStyleRef = (a: any): boolean =>
    a?.type === "MemberExpression" &&
    a.object?.type === "Identifier" &&
    a.object.name === stylesIdentifier &&
    a.property?.type === "Identifier" &&
    emptyStyleKeys.has(a.property.name);

  // Clean stylex.props() and merger calls.
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

  // Clean sx={} JSX attributes.
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

  return changed;
}
