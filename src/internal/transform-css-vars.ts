import type { JSCodeshift } from "jscodeshift";
import type { Adapter, ImportSpec } from "../adapter.js";
import { rewriteCssVarsInString } from "./css-vars.js";
import { isAstNode } from "./jscodeshift-utils.js";

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export function rewriteCssVarsInStyleObject(args: {
  obj: Record<string, unknown>;
  filePath: string;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  resolveValue: Adapter["resolveValue"];
  addImport: (imp: ImportSpec) => void;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  j: JSCodeshift;
}): void {
  rewriteCssVarsInStyleObjectImpl(args);
}

function rewriteCssVarsInStyleObjectImpl(args: {
  obj: Record<string, unknown>;
  filePath: string;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  resolveValue: Adapter["resolveValue"];
  addImport: (imp: ImportSpec) => void;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  j: JSCodeshift;
}): void {
  const { obj, filePath, definedVars, varsToDrop, resolveValue, addImport, parseExpr, j } = args;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") {
      if (isAstNode(v)) {
        continue;
      }
      rewriteCssVarsInStyleObjectImpl({
        obj: v as Record<string, unknown>,
        filePath,
        definedVars,
        varsToDrop,
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
        filePath,
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
