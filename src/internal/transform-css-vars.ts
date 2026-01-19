import type { JSCodeshift } from "jscodeshift";
import type { ImportSpec, ResolveContext, ResolveResult } from "../adapter.js";
import { rewriteCssVarsInString } from "./css-vars.js";

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export function rewriteCssVarsInStyleObject(args: {
  obj: Record<string, unknown>;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  isAstNode: (v: unknown) => boolean;
  resolveValue: (ctx: ResolveContext) => ResolveResult | null;
  addImport: (imp: ImportSpec) => void;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  j: JSCodeshift;
}): void {
  rewriteCssVarsInStyleObjectImpl(args);
}

function rewriteCssVarsInStyleObjectImpl(args: {
  obj: Record<string, unknown>;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  isAstNode: (v: unknown) => boolean;
  resolveValue: (ctx: ResolveContext) => ResolveResult | null;
  addImport: (imp: ImportSpec) => void;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  j: JSCodeshift;
}): void {
  const { obj, definedVars, varsToDrop, isAstNode, resolveValue, addImport, parseExpr, j } = args;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") {
      if (isAstNode(v)) {
        continue;
      }
      rewriteCssVarsInStyleObjectImpl({
        obj: v as Record<string, unknown>,
        definedVars,
        varsToDrop,
        isAstNode,
        resolveValue,
        addImport,
        parseExpr,
        j,
      });
      continue;
    }
    if (typeof v === "string") {
      obj[k] = rewriteCssVarsInString({
        raw: v,
        definedVars,
        varsToDrop,
        resolveValue,
        addImport,
        parseExpr,
        j,
      });
    }
  }
}
