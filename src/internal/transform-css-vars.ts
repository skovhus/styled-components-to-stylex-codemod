import { rewriteCssVarsInString } from "./css-vars.js";

export function rewriteCssVarsInStyleObject(args: {
  obj: Record<string, unknown>;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  isAstNode: (v: unknown) => boolean;
  resolveValue: (ctx: any) => any;
  addImport: (imp: any) => void;
  parseExpr: (exprSource: string) => any;
  j: any;
}): void {
  rewriteCssVarsInStyleObjectImpl(args);
}

function rewriteCssVarsInStyleObjectImpl(args: {
  obj: Record<string, unknown>;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  isAstNode: (v: unknown) => boolean;
  resolveValue: (ctx: any) => any;
  addImport: (imp: any) => void;
  parseExpr: (exprSource: string) => any;
  j: any;
}): void {
  const { obj, definedVars, varsToDrop, isAstNode, resolveValue, addImport, parseExpr, j } = args;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") {
      if (isAstNode(v)) {
        continue;
      }
      rewriteCssVarsInStyleObjectImpl({
        obj: v as any,
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
      (obj as any)[k] = rewriteCssVarsInString({
        raw: v,
        definedVars,
        varsToDrop,
        resolveValue,
        addImport,
        parseExpr,
        j,
      }) as any;
    }
  }
}
