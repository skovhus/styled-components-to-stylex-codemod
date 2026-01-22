import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";

import type { Adapter, ImportSpec } from "../../adapter.js";
import { getFunctionBodyExpr, getMemberPathFromIdentifier } from "../jscodeshift-utils.js";

export function createThemeResolvers(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  filePath: string;
  resolveValue: Adapter["resolveValue"];
  parseExpr: (exprSource: string) => any;
  resolverImports: Map<string, ImportSpec>;
}): {
  hasLocalThemeBinding: boolean;
  resolveThemeValue: (expr: any) => unknown;
  resolveThemeValueFromFn: (expr: any) => unknown;
} {
  const { root, j, filePath, resolveValue, parseExpr, resolverImports } = args;

  const hasLocalThemeBinding = (() => {
    let found = false;
    root.find(j.VariableDeclarator, { id: { type: "Identifier", name: "theme" } }).forEach(() => {
      found = true;
    });
    root.find(j.FunctionDeclaration, { id: { type: "Identifier", name: "theme" } }).forEach(() => {
      found = true;
    });
    root.find(j.ImportSpecifier, { local: { name: "theme" } } as any).forEach(() => {
      found = true;
    });
    root.find(j.ImportDefaultSpecifier, { local: { name: "theme" } } as any).forEach(() => {
      found = true;
    });
    root.find(j.ImportNamespaceSpecifier, { local: { name: "theme" } } as any).forEach(() => {
      found = true;
    });
    return found;
  })();

  const resolveThemeValue = (expr: any): unknown => {
    if (hasLocalThemeBinding) {
      return null;
    }
    if (!expr || typeof expr !== "object") {
      return null;
    }
    const parts = getMemberPathFromIdentifier(expr, "theme");
    if (!parts || !parts.length) {
      return null;
    }
    const resolved = resolveValue({ kind: "theme", path: parts.join("."), filePath });
    if (!resolved) {
      return null;
    }
    for (const imp of resolved.imports ?? []) {
      resolverImports.set(JSON.stringify(imp), imp);
    }
    return parseExpr(resolved.expr);
  };

  const resolveThemeValueFromFn = (expr: any): unknown => {
    if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
      return null;
    }
    const bodyExpr = getFunctionBodyExpr(expr);
    if (!bodyExpr) {
      return null;
    }
    const direct = resolveThemeValue(bodyExpr);
    if (direct) {
      return direct;
    }
    const paramName =
      expr.params?.[0]?.type === "Identifier" ? (expr.params[0].name as string) : null;
    const unwrap = (node: any): any => {
      let cur = node;
      while (cur) {
        if (cur.type === "ParenthesizedExpression") {
          cur = cur.expression;
          continue;
        }
        if (cur.type === "TSAsExpression" || cur.type === "TSNonNullExpression") {
          cur = cur.expression;
          continue;
        }
        if (cur.type === "ChainExpression") {
          cur = cur.expression;
          continue;
        }
        break;
      }
      return cur;
    };
    const unwrapped = unwrap(bodyExpr);
    if (
      !unwrapped ||
      (unwrapped.type !== "MemberExpression" && unwrapped.type !== "OptionalMemberExpression")
    ) {
      return null;
    }
    let themePath: string | null = null;
    const directPath = getMemberPathFromIdentifier(unwrapped as any, "theme");
    if (directPath && directPath.length > 0) {
      themePath = directPath.join(".");
    } else if (paramName) {
      const paramPath = getMemberPathFromIdentifier(unwrapped as any, paramName);
      if (paramPath && paramPath[0] === "theme") {
        themePath = paramPath.slice(1).join(".");
      }
    }
    if (!themePath) {
      return null;
    }
    const resolved = resolveValue({ kind: "theme", path: themePath, filePath });
    if (!resolved) {
      return null;
    }
    for (const imp of resolved.imports ?? []) {
      resolverImports.set(JSON.stringify(imp), imp);
    }
    return parseExpr(resolved.expr);
  };

  return { hasLocalThemeBinding, resolveThemeValue, resolveThemeValueFromFn };
}
