import type { StyledDecl } from "../transform-types.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";

export function tryHandleAnimation(args: {
  j: any;
  decl: StyledDecl;
  d: any;
  keyframesNames: Set<string>;
  styleObj: Record<string, unknown>;
}): boolean {
  const { j, decl, d, keyframesNames, styleObj } = args;
  // Handle keyframes-based animation declarations before handler pipeline.
  if (!keyframesNames.size) {
    return false;
  }
  const prop = (d.property ?? "").trim();
  if (!prop) {
    return false;
  }

  const stylexProp = cssDeclarationToStylexDeclarations(d)[0]?.prop;
  if (!stylexProp) {
    return false;
  }

  const getKeyframeFromSlot = (slotId: number): string | null => {
    const expr = (decl as any).templateExpressions[slotId] as any;
    if (expr?.type === "Identifier" && keyframesNames.has(expr.name)) {
      return expr.name;
    }
    return null;
  };

  const splitTopLevelCommas = (s: string): string[] => {
    const out: string[] = [];
    let buf = "";
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "(") {
        depth++;
      }
      if (ch === ")") {
        depth = Math.max(0, depth - 1);
      }
      if (ch === "," && depth === 0) {
        out.push(buf);
        buf = "";
        continue;
      }
      buf += ch;
    }
    out.push(buf);
    return out.map((x) => x.trim()).filter(Boolean);
  };

  const buildCommaTemplate = (
    names: Array<{ kind: "ident"; name: string } | { kind: "text"; value: string }>,
  ) => {
    // Prefer template literal for identifier keyframes: `${a}, ${b}`
    const exprs: any[] = [];
    const quasis: any[] = [];
    let q = "";
    for (let i = 0; i < names.length; i++) {
      const n = names[i]!;
      if (i > 0) {
        q += ", ";
      }
      if (n.kind === "ident") {
        quasis.push(j.templateElement({ raw: q, cooked: q }, false));
        exprs.push(j.identifier(n.name));
        q = "";
      } else {
        q += n.value;
      }
    }
    quasis.push(j.templateElement({ raw: q, cooked: q }, true));
    return j.templateLiteral(quasis, exprs);
  };

  // animation-name: ${kf}
  if (stylexProp === "animationName" && d.value.kind === "interpolated") {
    const slot = d.value.parts.find((p: any) => p.kind === "slot");
    if (!slot) {
      return false;
    }
    const kf = getKeyframeFromSlot(slot.slotId);
    if (!kf) {
      return false;
    }
    (styleObj as any).animationName = j.identifier(kf) as any;
    return true;
  }

  // animation: ${kf} 2s linear infinite; or with commas
  if (prop === "animation" && typeof d.valueRaw === "string") {
    const segments = splitTopLevelCommas(d.valueRaw);
    if (!segments.length) {
      return false;
    }

    const animNames: Array<{ kind: "ident"; name: string } | { kind: "text"; value: string }> = [];
    const durations: string[] = [];
    const timings: string[] = [];
    const delays: string[] = [];
    const iterations: string[] = [];

    for (const seg of segments) {
      const tokens = seg.split(/\s+/).filter(Boolean);
      if (!tokens.length) {
        return false;
      }

      const nameTok = tokens.shift()!;
      const m = nameTok.match(/^__SC_EXPR_(\d+)__$/);
      if (!m) {
        return false;
      }
      const kf = getKeyframeFromSlot(Number(m[1]));
      if (!kf) {
        return false;
      }
      animNames.push({ kind: "ident", name: kf });

      // Remaining tokens
      const timeTokens = tokens.filter((t) => /^(?:\d+|\d*\.\d+)(ms|s)$/.test(t));
      if (timeTokens[0]) {
        durations.push(timeTokens[0]);
      }
      if (timeTokens[1]) {
        delays.push(timeTokens[1]);
      }

      const timing = tokens.find(
        (t) =>
          t === "linear" ||
          t === "ease" ||
          t === "ease-in" ||
          t === "ease-out" ||
          t === "ease-in-out" ||
          t.startsWith("cubic-bezier(") ||
          t.startsWith("steps("),
      );
      if (timing) {
        timings.push(timing);
      }

      const iter = tokens.find((t) => t === "infinite" || /^\d+$/.test(t));
      if (iter) {
        iterations.push(iter);
      }
    }

    if (animNames.length === 1 && animNames[0]!.kind === "ident") {
      (styleObj as any).animationName = j.identifier(animNames[0]!.name) as any;
    } else {
      (styleObj as any).animationName = buildCommaTemplate(animNames) as any;
    }
    if (durations.length) {
      (styleObj as any).animationDuration = durations.join(", ");
    }
    if (timings.length) {
      (styleObj as any).animationTimingFunction = timings.join(", ");
    }
    if (delays.length) {
      (styleObj as any).animationDelay = delays.join(", ");
    }
    if (iterations.length) {
      (styleObj as any).animationIterationCount = iterations.join(", ");
    }
    return true;
  }

  return false;
}
