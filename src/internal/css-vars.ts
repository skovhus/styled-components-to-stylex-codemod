import type { ResolveContext, ResolveResult } from "../adapter.js";

export type VarCall = {
  start: number;
  end: number;
  name: string;
  fallback?: string;
};

export function findCssVarCalls(raw: string): VarCall[] {
  const out: VarCall[] = [];
  let i = 0;
  while (i < raw.length) {
    const idx = raw.indexOf("var(", i);
    if (idx === -1) break;
    const jIdx = idx + 4; // after "var("
    // Find matching ')'
    let depth = 1;
    let end = -1;
    for (let k = jIdx; k < raw.length; k++) {
      const ch = raw[k]!;
      if (ch === "(") depth++;
      else if (ch === ")") {
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
    while (p < inside.length && /\s/.test(inside[p]!)) p++;
    const nameStart = p;
    while (p < inside.length && !/\s/.test(inside[p]!) && inside[p] !== "," && inside[p] !== ")")
      p++;
    const name = inside.slice(nameStart, p).trim();
    if (!name.startsWith("--")) {
      i = end;
      continue;
    }
    while (p < inside.length && /\s/.test(inside[p]!)) p++;
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

export function rewriteCssVarsInString(args: {
  raw: string;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  resolveValue: (context: ResolveContext) => ResolveResult | null;
  addImport: (imp: string) => void;
  parseExpr: (exprSource: string) => unknown;
  j: any;
}): unknown {
  const { raw, definedVars, varsToDrop, resolveValue, addImport, parseExpr, j } = args;

  const calls = findCssVarCalls(raw);
  if (calls.length === 0) return raw;

  const segments: Array<{ kind: "text"; value: string } | { kind: "expr"; expr: any }> = [];

  let last = 0;
  for (const c of calls) {
    if (c.start > last) {
      segments.push({ kind: "text", value: raw.slice(last, c.start) });
    }
    const definedValue = definedVars.get(c.name);
    const res = resolveValue({
      kind: "cssVariable",
      name: c.name,
      ...(c.fallback ? { fallback: c.fallback } : {}),
      ...(definedValue ? { definedValue } : {}),
    });
    if (!res) {
      segments.push({ kind: "text", value: raw.slice(c.start, c.end) });
    } else {
      for (const imp of res.imports ?? []) addImport(imp);
      const exprAst = parseExpr(res.expr);
      if (!exprAst) {
        // If we can’t parse the expression, don’t risk emitting broken AST—keep original.
        segments.push({ kind: "text", value: raw.slice(c.start, c.end) });
      } else {
        if (res.dropDefinition) varsToDrop.add(c.name);
        segments.push({ kind: "expr", expr: exprAst });
      }
    }
    last = c.end;
  }
  if (last < raw.length) segments.push({ kind: "text", value: raw.slice(last) });

  const exprCount = segments.filter((s) => s.kind === "expr").length;
  if (exprCount === 0) return raw;

  // If it’s exactly one expression and the rest is empty text, return the expr AST directly.
  if (segments.length === 1 && segments[0]!.kind === "expr" && (segments[0] as any).expr) {
    return (segments[0] as any).expr;
  }
  if (
    segments.length === 3 &&
    segments[0]!.kind === "text" &&
    segments[1]!.kind === "expr" &&
    segments[2]!.kind === "text" &&
    (segments[0] as any).value === "" &&
    (segments[2] as any).value === ""
  ) {
    return (segments[1] as any).expr;
  }

  // Build a TemplateLiteral: `${expr} ...`
  const exprs: any[] = [];
  const quasis: any[] = [];
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
