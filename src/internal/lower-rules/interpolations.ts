import type { StyledDecl } from "../transform-types.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";

export function extractStaticParts(
  cssValue: any,
  options?: { skipForProperty?: RegExp; property?: string },
): { prefix: string; suffix: string } {
  // Skip for specific properties (e.g., border-color where expansion already handled width/style)
  if (options?.skipForProperty && options?.property) {
    if (options.skipForProperty.test(options.property)) {
      return { prefix: "", suffix: "" };
    }
  }

  if (!cssValue || cssValue.kind !== "interpolated") {
    return { prefix: "", suffix: "" };
  }

  const parts: any[] = cssValue.parts ?? [];
  const slotParts = parts.filter((p: any) => p?.kind === "slot");

  // Only handle single-slot interpolations
  if (slotParts.length !== 1) {
    return { prefix: "", suffix: "" };
  }

  let prefix = "";
  let suffix = "";
  let foundSlot = false;

  for (const part of parts) {
    if (part?.kind === "slot") {
      foundSlot = true;
      continue;
    }
    if (part?.kind === "static") {
      if (foundSlot) {
        suffix += part.value ?? "";
      } else {
        prefix += part.value ?? "";
      }
    }
  }

  return { prefix, suffix };
}

export function wrapExprWithStaticParts(expr: string, prefix: string, suffix: string): string {
  if (!prefix && !suffix) {
    return expr;
  }

  // Check if expr is a string literal (matches "..." or '...')
  const stringMatch = expr.match(/^["'](.*)["']$/);
  if (stringMatch) {
    // Combine into a single string literal for cleaner output
    return JSON.stringify(prefix + stringMatch[1] + suffix);
  }

  // Use template literal for non-literal expressions
  return `\`${prefix}\${${expr}}${suffix}\``;
}

export function buildInterpolatedTemplate(args: {
  j: any;
  decl: StyledDecl;
  cssValue: any;
}): unknown {
  const { j, decl, cssValue } = args;
  // Build a JS TemplateLiteral from CssValue parts when it’s basically string interpolation,
  // e.g. `${spacing}px`, `${spacing / 2}px 0`, `1px solid ${theme.colors.secondary}` (handled elsewhere).
  if (!cssValue || cssValue.kind !== "interpolated") {
    return null;
  }
  const parts = cssValue.parts ?? [];
  const exprs: any[] = [];
  const quasis: any[] = [];
  let q = "";
  for (const part of parts) {
    if (part.kind === "static") {
      q += part.value;
      continue;
    }
    if (part.kind === "slot") {
      quasis.push(j.templateElement({ raw: q, cooked: q }, false));
      q = "";
      const expr = (decl as any).templateExpressions[part.slotId] as any;
      // Only inline non-function expressions.
      if (!expr || expr.type === "ArrowFunctionExpression") {
        return null;
      }
      exprs.push(expr);
      continue;
    }
  }
  quasis.push(j.templateElement({ raw: q, cooked: q }, true));
  return j.templateLiteral(quasis, exprs);
}

export function tryHandleInterpolatedStringValue(args: {
  j: any;
  decl: StyledDecl;
  d: any;
  styleObj: Record<string, unknown>;
}): boolean {
  const { j, decl, d, styleObj } = args;
  // Handle common “string interpolation” cases:
  //  - background: ${dynamicColor}
  //  - padding: ${spacing}px
  //  - font-size: ${fontSize}px
  //  - line-height: ${lineHeight}
  if (d.value.kind !== "interpolated") {
    return false;
  }
  if (!d.property) {
    return false;
  }

  // Special-case: margin shorthand `${expr}px 0` → marginTop/Right/Bottom/Left
  if ((d.property ?? "").trim() === "margin" && typeof d.valueRaw === "string") {
    const m = d.valueRaw.trim().match(/^__SC_EXPR_(\d+)__(px)?\s+0$/);
    if (m) {
      const slotId = Number(m[1]);
      const expr = (decl as any).templateExpressions[slotId] as any;
      if (!expr || expr.type === "ArrowFunctionExpression") {
        return false;
      }
      const unit = m[2] ?? "";
      const tl = j.templateLiteral(
        [
          j.templateElement({ raw: "", cooked: "" }, false),
          j.templateElement({ raw: `${unit}`, cooked: `${unit}` }, true),
        ],
        [expr],
      );
      (styleObj as any).marginTop = tl as any;
      (styleObj as any).marginRight = 0;
      (styleObj as any).marginBottom = tl as any;
      (styleObj as any).marginLeft = 0;
      return true;
    }
  }

  // If it’s a single-slot (possibly with static around it), emit a TemplateLiteral.
  // But if it's exactly one slot and no static, emit the expression directly (keeps numbers/conditionals as-is).
  const partsOnly = d.value.parts ?? [];
  if (partsOnly.length === 1 && partsOnly[0]?.kind === "slot") {
    const expr = (decl as any).templateExpressions[partsOnly[0].slotId] as any;
    if (!expr || expr.type === "ArrowFunctionExpression") {
      return false;
    }
    // Give the dynamic resolution pipeline a chance to resolve call-expressions (e.g. helper lookups).
    if (expr.type === "CallExpression") {
      return false;
    }
    for (const out of cssDeclarationToStylexDeclarations(d)) {
      (styleObj as any)[out.prop] = expr as any;
    }
    return true;
  }

  const tl = buildInterpolatedTemplate({ j, decl, cssValue: d.value });
  if (!tl) {
    return false;
  }

  for (const out of cssDeclarationToStylexDeclarations(d)) {
    (styleObj as any)[out.prop] = tl as any;
  }
  return true;
}
