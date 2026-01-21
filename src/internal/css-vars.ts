import type { JSCodeshift } from "jscodeshift";
import type { Adapter, ImportSpec } from "../adapter.js";

export function rewriteCssVarsInString(args: {
  raw: string;
  filePath: string;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  resolveValue: Adapter["resolveValue"];
  addImport: (imp: ImportSpec) => void;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  j: JSCodeshift;
}): unknown {
  return rewriteCssVarsInStringImpl(args);
}

type VarCall = {
  start: number;
  end: number;
  name: string;
  fallback?: string;
};

function findCssVarCalls(raw: string): VarCall[] {
  const out: VarCall[] = [];
  let i = 0;
  while (i < raw.length) {
    const idx = raw.indexOf("var(", i);
    if (idx === -1) {
      break;
    }
    const jIdx = idx + 4; // after "var("
    // Find matching ')'
    let depth = 1;
    let end = -1;
    for (let k = jIdx; k < raw.length; k++) {
      const ch = raw[k]!;
      if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = k + 1; // exclusive
          break;
        }
      }
    }
    if (end === -1) {
      i = idx + 4;
      continue;
    }

    // Parse inside `var( ... )` conservatively.
    const inside = raw.slice(jIdx, end - 1);
    let p = 0;
    while (p < inside.length && /\s/.test(inside[p]!)) {
      p++;
    }
    const nameStart = p;
    while (p < inside.length && !/\s/.test(inside[p]!) && inside[p] !== "," && inside[p] !== ")") {
      p++;
    }
    const name = inside.slice(nameStart, p).trim();
    if (!name.startsWith("--")) {
      i = end;
      continue;
    }
    while (p < inside.length && /\s/.test(inside[p]!)) {
      p++;
    }
    let fallback: string | undefined;
    if (inside[p] === ",") {
      fallback = inside
        .slice(p + 1)
        .trim()
        // normalize trailing commas/spaces (shouldn’t occur, but keep defensive)
        .replace(/,\s*$/, "");
    }
    out.push({ start: idx, end, name, ...(fallback ? { fallback } : {}) });
    i = end;
  }
  return out;
}

function rewriteCssVarsInStringImpl(args: {
  raw: string;
  filePath: string;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  resolveValue: Adapter["resolveValue"];
  addImport: (imp: ImportSpec) => void;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  j: JSCodeshift;
}): unknown {
  const { raw, filePath, definedVars, varsToDrop, resolveValue, addImport, parseExpr, j } = args;

  const calls = findCssVarCalls(raw);
  if (calls.length === 0) {
    return raw;
  }

  const segments: Array<{ kind: "text"; value: string } | { kind: "expr"; expr: ExpressionKind }> =
    [];

  let last = 0;
  for (const c of calls) {
    if (c.start > last) {
      segments.push({ kind: "text", value: raw.slice(last, c.start) });
    }
    const definedValue = definedVars.get(c.name);
    const res = resolveValue({
      kind: "cssVariable",
      name: c.name,
      filePath,
      ...(c.fallback ? { fallback: c.fallback } : {}),
      ...(definedValue ? { definedValue } : {}),
    });
    if (!res) {
      segments.push({ kind: "text", value: raw.slice(c.start, c.end) });
    } else {
      for (const imp of res.imports ?? []) {
        addImport(imp);
      }
      const exprAst = parseExpr(res.expr);
      if (!exprAst) {
        // If we can’t parse the expression, don’t risk emitting broken AST—keep original.
        segments.push({ kind: "text", value: raw.slice(c.start, c.end) });
      } else {
        if ("dropDefinition" in res && res.dropDefinition) {
          varsToDrop.add(c.name);
        }
        segments.push({ kind: "expr", expr: exprAst });
      }
    }
    last = c.end;
  }
  if (last < raw.length) {
    segments.push({ kind: "text", value: raw.slice(last) });
  }

  const exprCount = segments.filter((s) => s.kind === "expr").length;
  if (exprCount === 0) {
    return raw;
  }

  // If it’s exactly one expression and the rest is empty text, return the expr AST directly.
  const [s0, s1, s2] = segments;
  if (segments.length === 1 && s0?.kind === "expr") {
    return s0.expr;
  }
  if (
    segments.length === 3 &&
    s0?.kind === "text" &&
    s1?.kind === "expr" &&
    s2?.kind === "text" &&
    s0.value === "" &&
    s2.value === ""
  ) {
    return s1.expr;
  }

  // Build a TemplateLiteral: `${expr} ...`
  const exprs: ExpressionKind[] = [];
  const quasis: Array<ReturnType<JSCodeshift["templateElement"]>> = [];
  let q = "";
  for (const seg of segments) {
    if (seg.kind === "text") {
      q += seg.value;
    } else {
      quasis.push(j.templateElement({ raw: q, cooked: q }, false));
      exprs.push(seg.expr);
      q = "";
    }
  }
  quasis.push(j.templateElement({ raw: q, cooked: q }, true));
  return j.templateLiteral(quasis, exprs);
}

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
