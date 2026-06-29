/**
 * Helpers for extracting and handling interpolation parts in CSS templates.
 * Core concepts: static prefix/suffix extraction and value wrapping.
 */
import type { StyledDecl } from "../transform-types.js";
import { cssDeclarationToStylexDeclarations, isCssShorthandProperty } from "../css-prop-mapping.js";
import {
  getMemberPathFromIdentifier,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";
import { maybeApplyAuthoredMultilineToExpression } from "../utilities/css-authored-multiline.js";
import { normalizeWhitespace } from "../utilities/string-utils.js";
import { getUseLogicalProperties } from "../css-prop-mapping.js";
import { splitDirectionalProperty } from "../stylex-shorthands.js";
import { addPropComments } from "./comments.js";
import { markProvenSingleTokenValue } from "./utils.js";
import { isDirectionalThemeResult } from "./theme.js";
import { maybeOmitPxUnitFromStylexValue } from "./inline-styles.js";
import {
  isRecognizedCssUnitSuffix,
  startsWithCssValueFunction,
} from "../utilities/stylex-numeric-values.js";

/**
 * Regex matching border-color properties where the border handler already extracted
 * width/style from the value. Reusing `extractStaticParts` on a rewritten declaration
 * would incorrectly re-apply the stale static prefix (e.g., "1px solid ").
 */
const BORDER_COLOR_SKIP_REGEX = /^border(-top|-right|-bottom|-left)?-color$/;

/**
 * Convenience wrapper around `extractStaticParts` that automatically applies the
 * border-color skip guard based on the declaration's property.
 */
export function extractStaticPartsForDecl(d: { property?: string; value: unknown }): {
  prefix: string;
  suffix: string;
} {
  const cssProp = (d.property ?? "").trim();
  return extractStaticParts(d.value, {
    skipForProperty: BORDER_COLOR_SKIP_REGEX,
    property: cssProp,
  });
}

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

export type ResolveImportedValueOptions =
  | boolean
  | { allowCssCalc?: boolean; cssCalcUnit?: string; negate?: boolean };

export function wrapExprWithStaticParts(
  expr: string,
  prefix: string,
  suffix: string,
  cssProperty?: string,
): string {
  if (!prefix && !suffix) {
    return expr;
  }

  // A CSS math/var function (`calc(...)`) is already a complete length, so a
  // trailing unit suffix must not be appended (it would yield invalid CSS like
  // `calc(40px + 8px)px`). This requires knowing the property: custom properties
  // (`--*`) are excluded because their value is an opaque token stream where a
  // trailing token (even after `var()`) may be intentional, and callers that
  // cannot supply the property keep the suffix to stay safe.
  const dropsUnitAfterCssFunction = (content: string): boolean =>
    prefix === "" &&
    cssProperty !== undefined &&
    !cssProperty.startsWith("--") &&
    isRecognizedCssUnitSuffix(suffix) &&
    startsWithCssValueFunction(content);

  // Check if expr is a string literal (matches "..." or '...')
  const stringMatch = expr.match(/^["'](.*)["']$/);
  if (stringMatch) {
    const content = stringMatch[1] ?? "";
    if (dropsUnitAfterCssFunction(content)) {
      return JSON.stringify(content);
    }
    // Combine into a single string literal for cleaner output
    return JSON.stringify(prefix + content + suffix);
  }

  // Check if expr is a numeric literal (e.g., 34, 3.14, -42)
  // This avoids creating template literals like `${34}px` instead of "34px"
  const numericMatch = expr.match(/^-?\d*\.?\d+$/);
  if (numericMatch) {
    return JSON.stringify(prefix + expr + suffix);
  }

  // A template-literal or bare expression source that is already a CSS math/var
  // function (e.g. `calc(${x}px + 8px)`) is kept as-is rather than nested inside
  // another template with the unit appended.
  if (dropsUnitAfterCssFunction(expr.replace(/^`/, ""))) {
    return expr;
  }

  // Use template literal for non-literal expressions
  return `\`${prefix}\${${expr}}${suffix}\``;
}

export function tryHandleInterpolatedStringValue(args: {
  j: any;
  decl: StyledDecl;
  d: any;
  styleObj: Record<string, unknown>;
  resolveCallExpr?: (expr: any) => { resolved: any; imports?: any[] } | null;
  resolveImportedValueExpr?: (
    expr: any,
    options?: ResolveImportedValueOptions,
  ) => { resolved: any; imports?: any[]; skipStaticWrap?: boolean } | { bail: true } | null;
  addImport?: (imp: any) => void;
  resolveThemeValue?: (expr: any, cssProperty?: string) => unknown;
  setStyleValue?: (prop: string, value: unknown) => void;
  numericIdentifiers?: ReadonlySet<string>;
}): boolean {
  const { j, decl, d, styleObj, resolveCallExpr, resolveImportedValueExpr, addImport } = args;
  const setValue = (prop: string, value: unknown): void => {
    if (args.setStyleValue) {
      args.setStyleValue(prop, value);
    } else {
      (styleObj as any)[prop] = value;
    }
  };
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

  // Special-case: margin shorthand `${expr}px 0` → split to directional props (StyleX rules)
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
      const entries = splitDirectionalProperty({
        prop: "margin",
        rawValue: d.valueRaw.trim(),
        important: d.important,
        useLogical: getUseLogicalProperties(),
      });
      if (!entries.length) {
        return false;
      }
      for (const entry of entries) {
        const usesExpr = entry.value.includes(`__SC_EXPR_${slotId}__`);
        setValue(
          entry.prop,
          usesExpr
            ? maybeOmitPxUnitFromStylexValue(j, tl as any, entry.prop, d.important, {
                numericIdentifiers: args.numericIdentifiers,
              })
            : 0,
        );
      }
      return true;
    }
  }

  // If it’s a single-slot (possibly with static around it), emit a TemplateLiteral.
  // But if it's exactly one slot and no static, emit the expression directly (keeps numbers/conditionals as-is).
  const partsOnly = d.value.parts ?? [];
  if (partsOnly.length === 1 && partsOnly[0]?.kind === "slot") {
    const expr = (decl as any).templateExpressions[partsOnly[0].slotId] as any;
    if (!expr) {
      return false;
    }
    // Handle arrow functions with static bodies (e.g., `() => "value"` or `() => \`template\``)
    // These can be simplified to their static value.
    if (expr.type === "ArrowFunctionExpression") {
      const staticValue = literalToStaticValue(expr);
      if (staticValue !== null && typeof staticValue === "string") {
        // Normalize whitespace for multiline template literals used for formatting convenience
        const normalizedValue = normalizeWhitespace(staticValue);
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          setValue(out.prop, normalizedValue);
        }
        return true;
      }
      // Arrow functions with dynamic bodies are handled elsewhere
      return false;
    }
    // Give the dynamic resolution pipeline a chance to resolve call-expressions (e.g. helper lookups).
    if (expr.type === "CallExpression") {
      return false;
    }
    const importedResolved = resolveImportedValueExpr?.(expr);
    if (importedResolved) {
      // Check if the resolver signaled a bail
      if ("bail" in importedResolved) {
        return false;
      }
      const resolved = importedResolved;
      for (const imp of resolved.imports ?? []) {
        addImport?.(imp);
      }
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        setValue(out.prop, resolved.resolved);
      }
      return true;
    }
    const cssProp = (d.property ?? "").trim();
    const themeResolved = args.resolveThemeValue?.(expr, cssProp || undefined);
    // Handle directional theme results: adapter returned separate longhand entries
    if (isDirectionalThemeResult(themeResolved)) {
      for (const entry of themeResolved.__directional) {
        setValue(entry.prop, entry.expr);
      }
      return true;
    }
    const shouldWrapThemeExpr =
      !themeResolved &&
      expr?.type === "MemberExpression" &&
      !!getMemberPathFromIdentifier(expr as any, "theme");
    const wrappedExpr = shouldWrapThemeExpr
      ? (j.templateLiteral(
          [
            j.templateElement({ raw: "", cooked: "" }, false),
            j.templateElement({ raw: "", cooked: "" }, true),
          ],
          [expr as any],
        ) as any)
      : (expr as any);
    const outputs = cssDeclarationToStylexDeclarations(d);
    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i]!;
      setValue(out.prop, themeResolved ?? wrappedExpr);
      // Add leading comment if present (e.g., for inlined static member expressions)
      if (i === 0 && ((d as any).leadingComment || (d as any).leadingLineComment)) {
        addPropComments(styleObj, out.prop, {
          leading: (d as any).leadingComment,
          leadingLine: (d as any).leadingLineComment,
        });
      }
    }
    return true;
  }

  if (
    tryHandleTwoValueShorthandLeadingExpression({
      decl,
      d,
      resolveImportedValueExpr,
      addImport,
      setValue,
    })
  ) {
    return true;
  }

  const tl = buildInterpolatedTemplate({
    j,
    decl,
    cssValue: d.value,
    resolveCallExpr,
    resolveImportedValueExpr,
    addImport,
    multiline: {
      property: (d.property ?? "").trim(),
      stylisValueRaw: d.valueRaw ?? "",
    },
  });
  if (!tl) {
    return false;
  }

  const outputs = cssDeclarationToStylexDeclarations(d);
  for (let i = 0; i < outputs.length; i++) {
    const out = outputs[i]!;
    const emitted = maybeOmitPxUnitFromStylexValue(j, tl as any, out.prop, d.important, {
      numericIdentifiers: args.numericIdentifiers,
    });
    if (emitted !== tl && hasSingleSlotUnitSuffix(d.value)) {
      // The px-omission rewrite only fires for proven-numeric expressions, so a
      // single-slot value with a unit suffix is guaranteed to be one CSS token.
      markProvenSingleTokenValue(emitted);
    }
    setValue(out.prop, emitted);
    // Add leading comment if present (e.g., for inlined static member expressions)
    if (i === 0 && ((d as any).leadingComment || (d as any).leadingLineComment)) {
      addPropComments(styleObj, out.prop, {
        leading: (d as any).leadingComment,
        leadingLine: (d as any).leadingLineComment,
      });
    }
  }
  return true;
}

function tryHandleTwoValueShorthandLeadingExpression(args: {
  decl: StyledDecl;
  d: any;
  resolveImportedValueExpr?: (
    expr: any,
    options?: ResolveImportedValueOptions,
  ) => { resolved: any; imports?: any[]; skipStaticWrap?: boolean } | { bail: true } | null;
  addImport?: (imp: any) => void;
  setValue: (prop: string, value: unknown) => void;
}): boolean {
  const { decl, d, resolveImportedValueExpr, addImport, setValue } = args;
  const prop = (d.property ?? "").trim();
  if (prop !== "padding" && prop !== "margin") {
    return false;
  }
  if (!resolveImportedValueExpr || d.value?.kind !== "interpolated") {
    return false;
  }
  const parts = d.value.parts ?? [];
  if (parts.length !== 2 || parts[0]?.kind !== "slot" || parts[1]?.kind !== "static") {
    return false;
  }
  const slotId = parts[0].slotId;
  if (slotId === undefined) {
    return false;
  }
  const suffix = parts[1].value ?? "";
  const suffixMatch = suffix.match(/^([a-zA-Z%]+)\s+(.+)$/);
  if (!suffixMatch) {
    return false;
  }
  const expr = (decl as any).templateExpressions[slotId] as any;
  if (!expr || expr.type === "ArrowFunctionExpression") {
    return false;
  }
  const resolved = resolveImportedValueExpr(expr, {
    allowCssCalc: true,
    cssCalcUnit: suffixMatch[1],
  });
  if (!resolved || "bail" in resolved || !resolved.skipStaticWrap) {
    return false;
  }
  const entries = splitDirectionalProperty({
    prop,
    rawValue: (d.valueRaw ?? "").trim(),
    important: d.important,
    useLogical: getUseLogicalProperties(),
  });
  if (!entries.length) {
    return false;
  }
  for (const imp of resolved.imports ?? []) {
    addImport?.(imp);
  }
  const placeholder = `__SC_EXPR_${slotId}__`;
  for (const entry of entries) {
    if (!entry.value.includes(placeholder)) {
      setValue(entry.prop, normalizeWhitespace(entry.value));
      continue;
    }
    // A unit-bearing expression (token/calc) already incorporates the authored
    // unit, so emit the resolved node directly (the suffix kept in entry.value
    // is intentionally dropped). A bare unitless literal does NOT carry it, so
    // inline its value in place of the placeholder to preserve the unit suffix
    // (e.g. `padding: ${space()}rem 12px` resolving to `8` must stay `8rem`).
    if (resolvedValueCarriesUnit(resolved.resolved)) {
      setValue(entry.prop, resolved.resolved);
      continue;
    }
    const literalValue = literalToStaticValue(resolved.resolved);
    if (literalValue === null || typeof literalValue === "boolean") {
      return false;
    }
    setValue(
      entry.prop,
      normalizeWhitespace(entry.value.replace(placeholder, String(literalValue))),
    );
  }
  return true;
}

function buildInterpolatedTemplate(args: {
  j: any;
  decl: StyledDecl;
  cssValue: any;
  resolveCallExpr?: (expr: any) => { resolved: any; imports?: any[] } | null;
  resolveImportedValueExpr?: (
    expr: any,
    options?: ResolveImportedValueOptions,
  ) => { resolved: any; imports?: any[]; skipStaticWrap?: boolean } | { bail: true } | null;
  addImport?: (imp: any) => void;
  multiline?: { property: string; stylisValueRaw: string };
}): unknown {
  const { j, decl, cssValue, resolveCallExpr, resolveImportedValueExpr, addImport, multiline } =
    args;
  // Build a JS TemplateLiteral from CssValue parts when it's basically string interpolation,
  // e.g. `${spacing}px`, `${spacing / 2}px 0`, `1px solid ${theme.color.secondary}` (handled elsewhere).
  if (!cssValue || cssValue.kind !== "interpolated") {
    return null;
  }
  const parts = cssValue.parts ?? [];
  const exprs: any[] = [];
  let fullStaticValue = "";
  let allStatic = true;
  const quasis: any[] = [];
  let q = "";
  let staticPrefixToConsume = "";
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    if (part.kind === "static") {
      const rawValue = part.value ?? "";
      const value =
        staticPrefixToConsume && rawValue.startsWith(staticPrefixToConsume)
          ? rawValue.slice(staticPrefixToConsume.length)
          : rawValue;
      staticPrefixToConsume = "";
      q += value;
      fullStaticValue += value;
      continue;
    }
    if (part.kind === "slot") {
      const expr = (decl as any).templateExpressions[part.slotId] as any;
      // Only inline non-function expressions.
      if (!expr || expr.type === "ArrowFunctionExpression") {
        return null;
      }
      const adjacentUnit = getAdjacentUnitAfterParts(parts, partIndex);
      const negateResolvedUnit = Boolean(adjacentUnit && q.endsWith("-"));
      // Try to resolve CallExpressions through the adapter (e.g., helper function lookups)
      if (expr.type === "CallExpression" && resolveCallExpr && !adjacentUnit) {
        const resolved = resolveCallExpr(expr);
        if (resolved) {
          if (hasAdjacentUnitInParts(parts, partIndex)) {
            return null;
          }
          // If resolved to a string literal, inline it directly into the static text
          if (
            resolved.resolved?.type === "StringLiteral" ||
            (resolved.resolved?.type === "Literal" && typeof resolved.resolved.value === "string")
          ) {
            const strValue = resolved.resolved.value;
            q += strValue;
            fullStaticValue += strValue;
            // Add any required imports
            for (const imp of resolved.imports ?? []) {
              addImport?.(imp);
            }
            continue;
          }
          // Otherwise, use the resolved expression AST
          allStatic = false;
          for (const imp of resolved.imports ?? []) {
            addImport?.(imp);
          }
          q = appendExpressionToTemplate(j, quasis, exprs, q, resolved.resolved);
          continue;
        }
      }
      const importedResolved = resolveImportedValueExpr?.(
        expr,
        adjacentUnit
          ? { allowCssCalc: true, cssCalcUnit: adjacentUnit, negate: negateResolvedUnit }
          : undefined,
      );
      if (importedResolved) {
        // Check if the resolver signaled a bail
        if ("bail" in importedResolved) {
          return null;
        }
        const resolved = importedResolved;
        if (
          resolved.skipStaticWrap &&
          hasSingleSlotUnitSuffix(cssValue) &&
          !isCssShorthandProperty((multiline?.property ?? "").trim())
        ) {
          for (const imp of resolved.imports ?? []) {
            addImport?.(imp);
          }
          return resolved.resolved;
        }
        if (hasAdjacentUnitInParts(parts, partIndex) && !hasSingleSlotUnitSuffix(cssValue)) {
          if (!adjacentUnit || !resolved.skipStaticWrap) {
            return null;
          }
          // Only fold away (consume) the adjacent unit suffix when the resolved
          // value already carries the unit — a token expression or unit-bearing
          // string built from the requested `cssCalcUnit`. A bare number or
          // unitless string literal does NOT carry it, so stripping the suffix
          // would silently drop the unit (e.g. `${space()}px` resolving to `8`
          // must stay `8px`, not become `8`/`${8}`).
          if (resolvedValueCarriesUnit(resolved.resolved)) {
            staticPrefixToConsume = adjacentUnit;
            if (negateResolvedUnit) {
              q = q.slice(0, -1);
            }
          }
        }
        if (
          resolved.resolved?.type === "StringLiteral" ||
          (resolved.resolved?.type === "Literal" && typeof resolved.resolved.value === "string")
        ) {
          const strValue = resolved.resolved.value;
          q += strValue;
          fullStaticValue += strValue;
          for (const imp of resolved.imports ?? []) {
            addImport?.(imp);
          }
          continue;
        }
        allStatic = false;
        for (const imp of resolved.imports ?? []) {
          addImport?.(imp);
        }
        q = appendExpressionToTemplate(j, quasis, exprs, q, resolved.resolved);
        continue;
      }
      // Handle literals (string/number) by inlining them as static text
      const literalValue = literalToStaticValue(expr);
      if (literalValue !== null && typeof literalValue !== "boolean") {
        const strValue = String(literalValue);
        q += strValue;
        fullStaticValue += strValue;
        continue;
      }
      quasis.push(j.templateElement({ raw: q, cooked: q }, false));
      q = "";
      allStatic = false;
      exprs.push(expr);
      continue;
    }
  }
  // If all expressions were resolved to static strings, return a plain string instead of template literal
  if (allStatic) {
    return fullStaticValue;
  }
  quasis.push(j.templateElement({ raw: q, cooked: q }, true));
  const templateLiteral = j.templateLiteral(quasis, exprs);
  if (!multiline) {
    return templateLiteral;
  }
  return maybeApplyAuthoredMultilineToExpression(j, templateLiteral, {
    rawCss: decl.rawCss,
    property: multiline.property,
    stylisValueRaw: multiline.stylisValueRaw,
  });
}

// Determines whether a resolved interpolation value already carries a CSS unit,
// so an adjacent unit suffix in the source (e.g. the `px` in `${helper()}px`)
// can be safely folded away. Token/calc expressions built from the requested
// `cssCalcUnit` carry it; bare numbers and unitless strings do not.
function resolvedValueCarriesUnit(node: any): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const isNumericLiteral =
    node.type === "NumericLiteral" || (node.type === "Literal" && typeof node.value === "number");
  if (isNumericLiteral) {
    return false;
  }
  const isStringLiteral =
    node.type === "StringLiteral" || (node.type === "Literal" && typeof node.value === "string");
  if (isStringLiteral) {
    // A unit-bearing string ends with an alphabetic unit or `%` (e.g. "8px");
    // a purely numeric string (e.g. "8") does not and must keep the suffix.
    return /[a-zA-Z%]$/.test(String(node.value));
  }
  // Any other expression (token member access, calc template, etc.) was built
  // with the requested unit and already incorporates it.
  return true;
}

// Recognized CSS length/percentage/fraction units. Used so that ordinary
// trailing text after a slot (e.g. `icons` in `url(${asset()}icons/x.svg)`) is
// not misclassified as a unit suffix and folded/consumed.
const CSS_UNIT_PATTERN =
  /^(?:px|rem|em|ex|ch|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cqw|cqh|cqi|cqb|cqmin|cqmax|cm|mm|q|in|pt|pc|fr|%)$/i;

function getAdjacentUnitAfterParts(parts: any[], slotIndex: number): string | null {
  const after = parts[slotIndex + 1]?.kind === "static" ? (parts[slotIndex + 1]?.value ?? "") : "";
  const candidate = after.match(/^([a-zA-Z%]+)/)?.[1];
  return candidate && CSS_UNIT_PATTERN.test(candidate) ? candidate : null;
}

function appendExpressionToTemplate(
  j: any,
  quasis: any[],
  expressions: any[],
  currentQuasi: string,
  expression: any,
): string {
  if (expression?.type !== "TemplateLiteral") {
    quasis.push(j.templateElement({ raw: currentQuasi, cooked: currentQuasi }, false));
    expressions.push(expression);
    return "";
  }

  const nestedQuasis = expression.quasis ?? [];
  const nestedExpressions = expression.expressions ?? [];
  currentQuasi += nestedQuasis[0]?.value?.raw ?? nestedQuasis[0]?.value?.cooked ?? "";
  for (let index = 0; index < nestedExpressions.length; index++) {
    quasis.push(j.templateElement({ raw: currentQuasi, cooked: currentQuasi }, false));
    expressions.push(nestedExpressions[index]);
    currentQuasi =
      nestedQuasis[index + 1]?.value?.raw ?? nestedQuasis[index + 1]?.value?.cooked ?? "";
  }
  return currentQuasi;
}

function hasAdjacentUnitInParts(parts: any[], slotIndex: number): boolean {
  const before = parts[slotIndex - 1]?.kind === "static" ? (parts[slotIndex - 1]?.value ?? "") : "";
  const after = parts[slotIndex + 1]?.kind === "static" ? (parts[slotIndex + 1]?.value ?? "") : "";
  return /[a-zA-Z%]$/.test(before) || /^[a-zA-Z%]/.test(after);
}

function hasSingleSlotUnitSuffix(cssValue: any): boolean {
  const parts = cssValue?.parts ?? [];
  const slotCount = parts.filter((part: any) => part?.kind === "slot").length;
  let prefix = "";
  let suffix = "";
  let foundSlot = false;
  for (const part of parts) {
    if (part?.kind === "slot") {
      foundSlot = true;
      continue;
    }
    if (part?.kind !== "static") {
      continue;
    }
    if (foundSlot) {
      suffix += part.value ?? "";
    } else {
      prefix += part.value ?? "";
    }
  }
  return slotCount === 1 && prefix === "" && suffix !== "" && /^-?(?:[a-zA-Z%]+)$/.test(suffix);
}
