/**
 * Import resolution and shadowing detection utilities.
 * Core concepts: local binding inspection and safe identifier generation.
 */
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";
import type { ImportSource } from "../../adapter.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  type AstPath,
  type IdentifierNode,
  getDeclaratorId,
  isAstPath,
  isCallExpressionNode,
  isFunctionNode,
  isIdentifierNode,
} from "../utilities/jscodeshift-utils.js";

export const buildSafeIndexedParamName = (
  preferred: string,
  containerExpr: ExpressionKind | null,
): string => {
  if (!isValidIdentifierName(preferred)) {
    return "propValue";
  }
  if (
    containerExpr?.type === "Identifier" &&
    (containerExpr as { name?: string }).name === preferred
  ) {
    return `${preferred}Value`;
  }
  return preferred;
};

export const createImportResolver = (args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  importMap: Map<string, { importedName: string; source: ImportSource }>;
}) => {
  const { root, j, importMap } = args;
  const shadowedIdentCache = new WeakMap<object, boolean>();

  const isLoopNode = (node: unknown): boolean => {
    if (!node || typeof node !== "object") {
      return false;
    }
    const type = (node as { type?: string }).type;
    return type === "ForStatement" || type === "ForInStatement" || type === "ForOfStatement";
  };

  const collectPatternIdentifiers = (pattern: any, out: Set<string>): void => {
    if (!pattern || typeof pattern !== "object") {
      return;
    }
    switch (pattern.type) {
      case "Identifier":
        out.add(pattern.name);
        return;
      case "RestElement":
        collectPatternIdentifiers(pattern.argument, out);
        return;
      case "AssignmentPattern":
        collectPatternIdentifiers(pattern.left, out);
        return;
      case "ObjectPattern":
        for (const prop of pattern.properties ?? []) {
          if (!prop) {
            continue;
          }
          if (prop.type === "RestElement") {
            collectPatternIdentifiers(prop.argument, out);
          } else {
            collectPatternIdentifiers(prop.value ?? prop.argument, out);
          }
        }
        return;
      case "ArrayPattern":
        for (const elem of pattern.elements ?? []) {
          collectPatternIdentifiers(elem, out);
        }
        return;
      case "TSParameterProperty":
        collectPatternIdentifiers(pattern.parameter, out);
        return;
      default:
        return;
    }
  };

  const findIdentifierPath = (identNode: unknown): AstPath | null => {
    if (!identNode || typeof identNode !== "object") {
      return null;
    }
    const paths = root
      .find(j.Identifier)
      .filter((p) => p.node === identNode)
      .paths();
    const first = paths[0] ?? null;
    return first && isAstPath(first) ? first : null;
  };

  const getNearestFunctionNode = (path: AstPath | null): ASTNode | null => {
    let cur: AstPath | null | undefined = path;
    while (cur) {
      if (isFunctionNode(cur.node)) {
        return cur.node;
      }
      cur = cur.parentPath ?? null;
    }
    return null;
  };

  const functionHasVarBinding = (fn: any, name: string): boolean => {
    const body = fn?.body;
    if (!body || typeof body !== "object") {
      return false;
    }
    let found = false;
    j(body)
      .find(j.VariableDeclaration, { kind: "var" })
      .forEach((p) => {
        if (found) {
          return;
        }
        const nearestFn = getNearestFunctionNode(p);
        if (nearestFn !== fn) {
          return;
        }
        for (const decl of p.node.declarations ?? []) {
          const ids = new Set<string>();
          const declId = getDeclaratorId(decl);
          if (!declId) {
            continue;
          }
          collectPatternIdentifiers(declId, ids);
          if (ids.has(name)) {
            found = true;
            return;
          }
        }
      });
    return found;
  };

  const blockDeclaresName = (block: any, name: string): boolean => {
    const body = block?.body ?? [];
    for (const stmt of body) {
      if (!stmt || typeof stmt !== "object") {
        continue;
      }
      if (stmt.type === "VariableDeclaration" && (stmt.kind === "let" || stmt.kind === "const")) {
        for (const decl of stmt.declarations ?? []) {
          const ids = new Set<string>();
          collectPatternIdentifiers(decl.id, ids);
          if (ids.has(name)) {
            return true;
          }
        }
      } else if (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") {
        if (stmt.id?.type === "Identifier" && stmt.id.name === name) {
          return true;
        }
      }
    }
    return false;
  };

  const functionDeclaresName = (fn: any, name: string): boolean => {
    if (fn?.id?.type === "Identifier" && fn.id.name === name) {
      return true;
    }
    for (const param of fn?.params ?? []) {
      const ids = new Set<string>();
      collectPatternIdentifiers(param, ids);
      if (ids.has(name)) {
        return true;
      }
    }
    return functionHasVarBinding(fn, name);
  };

  const loopDeclaresName = (node: any, name: string): boolean => {
    const init = node?.init ?? node?.left;
    if (!init || typeof init !== "object") {
      return false;
    }
    if (init.type === "VariableDeclaration" && (init.kind === "let" || init.kind === "const")) {
      for (const decl of init.declarations ?? []) {
        const ids = new Set<string>();
        collectPatternIdentifiers(decl.id, ids);
        if (ids.has(name)) {
          return true;
        }
      }
    }
    return false;
  };

  const isIdentifierShadowed = (identNode: any, name: string): boolean => {
    if (!identNode || typeof identNode !== "object") {
      return true;
    }
    const cached = shadowedIdentCache.get(identNode);
    if (cached !== undefined) {
      return cached;
    }
    const path = findIdentifierPath(identNode);
    if (!path) {
      // If the identifier isn't in the root AST (e.g. synthetic nodes), we can't prove shadowing.
      // Treat as not shadowed so adapter-driven resolution can still apply.
      shadowedIdentCache.set(identNode, false);
      return false;
    }
    let cur: any = path;
    while (cur) {
      const node = cur.node;
      if (isFunctionNode(node) && functionDeclaresName(node, name)) {
        shadowedIdentCache.set(identNode, true);
        return true;
      }
      if (node?.type === "BlockStatement" && blockDeclaresName(node, name)) {
        shadowedIdentCache.set(identNode, true);
        return true;
      }
      if (node?.type === "CatchClause") {
        const ids = new Set<string>();
        collectPatternIdentifiers(node.param, ids);
        if (ids.has(name)) {
          shadowedIdentCache.set(identNode, true);
          return true;
        }
      }
      if (isLoopNode(node) && loopDeclaresName(node, name)) {
        shadowedIdentCache.set(identNode, true);
        return true;
      }
      cur = cur.parentPath;
    }
    shadowedIdentCache.set(identNode, false);
    return false;
  };

  const getCallCalleeIdentifier = (expr: unknown, localName: string): IdentifierNode | null => {
    if (!isCallExpressionNode(expr)) {
      return null;
    }
    const callee = expr.callee;
    if (isIdentifierNode(callee) && callee.name === localName) {
      return callee;
    }
    if (isCallExpressionNode(callee)) {
      const innerCallee = callee.callee;
      if (isIdentifierNode(innerCallee) && innerCallee.name === localName) {
        return innerCallee;
      }
    }
    return null;
  };

  const resolveImportForIdent = (localName: string, identNode?: object | null) => {
    if (identNode && isIdentifierShadowed(identNode, localName)) {
      return null;
    }
    const v = importMap.get(localName);
    return v ? v : null;
  };

  const resolveImportForExpr = (expr: unknown, localName: string) => {
    const calleeIdent = getCallCalleeIdentifier(expr, localName);
    if (!calleeIdent) {
      return null;
    }
    return resolveImportForIdent(localName, calleeIdent);
  };

  const resolveImportInScope = (localName: string, identNode?: unknown) => {
    if (identNode && typeof identNode === "object") {
      return resolveImportForIdent(localName, identNode);
    }
    return resolveImportForIdent(localName, null);
  };

  return {
    resolveImportInScope,
    resolveImportForExpr,
  };
};

const isValidIdentifierName = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
