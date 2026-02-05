/**
 * CSS text parsing utilities for the built-in handler system.
 * Core concepts: CSS declaration block parsing, shorthand expansion, and template literal AST construction.
 */
import type { API, JSCodeshift, TemplateLiteral } from "jscodeshift";
import {
  cssDeclarationToStylexDeclarations,
  cssPropertyToStylexProp,
  parseInterpolatedBorderStaticParts,
} from "../css-prop-mapping.js";
import { escapeRegex } from "../utilities/string-utils.js";
import type { ExpressionKind } from "./types.js";

// --- Exports (public API for other builtin-handler modules) ---

export function styleFromSingleDeclaration(
  property: string,
  value: string | number,
): Record<string, unknown> {
  const valueRaw = typeof value === "number" ? String(value) : value;
  const decl = {
    property,
    value: { kind: "static" as const, value: valueRaw },
    important: false,
    valueRaw,
  };
  const style: Record<string, unknown> = {};
  for (const out of cssDeclarationToStylexDeclarations(decl)) {
    // Keep numbers as numbers if the source literal was numeric (e.g. opacity: 1)
    style[out.prop] = typeof value === "number" ? value : coerceStaticCss(out.value);
  }
  return style;
}

export function parseCssDeclarationBlock(cssText: string): Record<string, unknown> | null {
  // Very small parser for blocks like `transform: rotate(180deg); color: red;`
  // This is intentionally conservative: only supports static values.
  const chunks = cssText
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return null;
  }

  const style: Record<string, unknown> = {};
  for (const chunk of chunks) {
    const m = chunk.match(/^([^:]+):([\s\S]+)$/);
    if (!m || !m[1] || !m[2]) {
      return null;
    }
    const property = m[1].trim();
    const valueRaw = m[2].trim();
    const decl = {
      property,
      value: { kind: "static" as const, value: valueRaw },
      important: false,
      valueRaw,
    };
    for (const out of cssDeclarationToStylexDeclarations(decl)) {
      style[out.prop] = coerceStaticCss(out.value);
    }
  }
  return style;
}

function coerceStaticCss(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const v = value as { kind?: string; value?: unknown };
  if (v.kind === "static" && typeof v.value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(v.value)) {
      return Number(v.value);
    }
    return v.value;
  }
  return value;
}

/**
 * Parses a CSS declaration block where values may contain template expressions.
 * Input: "box-shadow: inset 0 0 0 1px ${$colors.primaryColor};"
 *
 * Returns the style object with property names mapped to their values.
 * Values containing ${...} are stored as template literal AST nodes.
 *
 * IMPORTANT - StyleX Shorthand Handling:
 * StyleX does NOT support CSS shorthand properties like `border`. They must be expanded
 * to longhand properties (borderWidth, borderStyle, borderColor). This function handles
 * border expansion via `expandBorderShorthandWithTemplateExpr`. When adding support for
 * new shorthand properties, follow the same pattern:
 * 1. Check for the shorthand property
 * 2. Use helpers from css-prop-mapping.ts (e.g., parseInterpolatedBorderStaticParts)
 * 3. Return expanded longhand properties
 *
 * @see cssDeclarationToStylexDeclarations in css-prop-mapping.ts for the authoritative
 *      list of shorthand properties that need expansion.
 */
export function parseCssDeclarationBlockWithTemplateExpr(
  cssText: string,
  api: API,
): { styleObj: Record<string, unknown>; hasTemplateValues: boolean } | null {
  const j = api.jscodeshift;
  const chunks = cssText
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return null;
  }

  const styleObj: Record<string, unknown> = {};
  let hasTemplateValues = false;

  for (const chunk of chunks) {
    const m = chunk.match(/^([^:]+):([\s\S]+)$/);
    if (!m || !m[1] || !m[2]) {
      return null;
    }
    const property = m[1].trim();
    const valueRaw = m[2].trim();

    // Check if value contains template expressions
    if (valueRaw.includes("${")) {
      hasTemplateValues = true;

      // Handle border shorthands specially - expand to longhand properties
      const borderMatch = property.match(/^border(-top|-right|-bottom|-left)?$/);
      if (borderMatch) {
        const expanded = expandBorderShorthandWithTemplateExpr(property, valueRaw, j);
        if (!expanded) {
          return null;
        }
        Object.assign(styleObj, expanded);
        continue;
      }

      // Bail on other shorthand properties with template expressions
      // StyleX doesn't support shorthands, and we can't safely expand these without
      // knowing the runtime value (e.g., margin: ${spacing} could be 1-4 values)
      if (isUnsupportedShorthandForTemplateExpr(property)) {
        return null;
      }

      // For non-shorthand properties, build a template literal AST node
      const templateAst = parseValueAsTemplateLiteral(valueRaw, j);
      if (!templateAst) {
        return null;
      }
      // Map CSS property to StyleX property
      const stylexProp = cssPropertyToStylexProp(property);
      styleObj[stylexProp] = templateAst;
    } else {
      // Static value - use existing logic
      const decl = {
        property,
        value: { kind: "static" as const, value: valueRaw },
        important: false,
        valueRaw,
      };
      for (const out of cssDeclarationToStylexDeclarations(decl)) {
        styleObj[out.prop] = coerceStaticCss(out.value);
      }
    }
  }

  return { styleObj, hasTemplateValues };
}

// --- Non-exported helpers ---

/**
 * Expands a border shorthand with template expressions into longhand properties.
 * Input: property="border", value="1px solid ${$colors.primaryColor}"
 * Output: { borderWidth: "1px", borderStyle: "solid", borderColor: <TemplateLiteral AST> }
 */
function expandBorderShorthandWithTemplateExpr(
  property: string,
  valueRaw: string,
  j: API["jscodeshift"],
): Record<string, unknown> | null {
  // Extract direction from property (e.g., "border-top" -> "Top")
  const borderMatch = property.match(/^border(-top|-right|-bottom|-left)?$/);
  if (!borderMatch) {
    return null;
  }
  const directionRaw = borderMatch[1] ?? "";
  const direction = directionRaw
    ? directionRaw.slice(1).charAt(0).toUpperCase() + directionRaw.slice(2)
    : "";

  const widthProp = `border${direction}Width`;
  const styleProp = `border${direction}Style`;
  const colorProp = `border${direction}Color`;

  // Extract static parts (prefix/suffix) around template expressions
  // For "1px solid ${color}", prefix="1px solid ", suffix=""
  const regex = /\$\{([^}]+)\}/g;
  let match;
  let prefix = "";
  let suffix = "";
  const expressions: Array<{ text: string; start: number; end: number }> = [];

  let lastIndex = 0;
  while ((match = regex.exec(valueRaw)) !== null) {
    if (expressions.length === 0) {
      prefix = valueRaw.slice(0, match.index);
    }
    expressions.push({
      text: (match[1] ?? "").trim(),
      start: match.index,
      end: regex.lastIndex,
    });
    lastIndex = regex.lastIndex;
  }
  suffix = valueRaw.slice(lastIndex);

  // Use existing helper to parse static parts
  const borderParts = parseInterpolatedBorderStaticParts({ prop: property, prefix, suffix });
  if (!borderParts) {
    // If we can't parse, bail
    return null;
  }

  const result: Record<string, unknown> = {};

  // Add static width/style if present
  if (borderParts.width) {
    result[widthProp] = borderParts.width;
  }
  if (borderParts.style) {
    result[styleProp] = borderParts.style;
  }

  // Build template literal for color (the dynamic part)
  // If there are expressions but no static prefix/suffix for them, the whole value is the color
  if (expressions.length > 0) {
    const colorTemplateAst = parseValueAsTemplateLiteralForColor(valueRaw, prefix, suffix, j);
    if (colorTemplateAst) {
      result[colorProp] = colorTemplateAst;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Builds a template literal AST for the color portion of a border value.
 * For "1px solid ${color}", returns just the template literal for "${color}".
 */
function parseValueAsTemplateLiteralForColor(
  fullValue: string,
  prefix: string,
  suffix: string,
  j: JSCodeshift,
): TemplateLiteral | null {
  // The color part is the value minus the static prefix/suffix (width/style tokens)
  // For simple cases like "1px solid ${color}", the color is just "${color}"
  // For "${color}" alone, return just that

  // Parse out expressions from fullValue, keeping only what's between prefix and suffix
  const regex = /\$\{([^}]+)\}/g;
  const quasis: Array<{ raw: string; cooked: string }> = [];
  const expressions: ExpressionKind[] = [];

  // Find where the prefix ends and extract remaining value
  const prefixTokens = prefix.trim().split(/\s+/).filter(Boolean);
  const fullTokens = fullValue.split(/\s+/);

  // Find the start of the dynamic part
  let dynamicStart = 0;
  for (let i = 0; i < prefixTokens.length && i < fullTokens.length; i++) {
    const fullToken = fullTokens[i];
    if (fullToken && fullToken === prefixTokens[i]) {
      dynamicStart += fullToken.length + 1; // +1 for space
    }
  }

  // Escape suffix for safe use in regex (handles special chars like $, ., etc.)
  const escapedSuffix = escapeRegex(suffix.trim());
  const dynamicPart = fullValue
    .slice(dynamicStart)
    .replace(new RegExp(`${escapedSuffix}$`), "")
    .trim();

  // Parse the dynamic part into template literal
  let lastIndex = 0;
  let match;
  regex.lastIndex = 0;

  while ((match = regex.exec(dynamicPart)) !== null) {
    const beforeExpr = dynamicPart.slice(lastIndex, match.index);
    quasis.push({ raw: beforeExpr, cooked: beforeExpr });

    const exprText = (match[1] ?? "").trim();
    const exprAst = parseSimpleExpression(exprText, j);
    if (!exprAst) {
      return null;
    }
    expressions.push(exprAst);
    lastIndex = regex.lastIndex;
  }

  const afterLast = dynamicPart.slice(lastIndex);
  quasis.push({ raw: afterLast, cooked: afterLast });

  if (expressions.length === 0) {
    return null;
  }

  const quasisAst = quasis.map((q, i) =>
    j.templateElement({ raw: q.raw, cooked: q.cooked }, i === quasis.length - 1),
  );

  return j.templateLiteral(quasisAst, expressions);
}

/**
 * Parses a value string containing ${...} expressions into a template literal AST.
 * Input: "inset 0 0 0 1px ${$colors.primaryColor}"
 * Output: TemplateLiteral AST node
 *
 * Note: Only handles simple dot-notation member expressions (e.g., "$colors.primaryColor").
 * More complex expressions (computed properties, function calls) are not supported and will
 * cause this function to return null.
 */
function parseValueAsTemplateLiteral(value: string, j: JSCodeshift): TemplateLiteral | null {
  // Split by ${...} patterns
  const regex = /\$\{([^}]+)\}/g;
  const quasis: Array<{ raw: string; cooked: string }> = [];
  const expressions: ExpressionKind[] = [];

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(value)) !== null) {
    // Add the static part before this expression
    const raw = value.slice(lastIndex, match.index);
    quasis.push({ raw, cooked: raw });

    // Add the expression (as an identifier for now - will be parsed later if needed)
    const exprText = (match[1] ?? "").trim();
    // Parse the expression text into AST
    // For simple cases like "$colors.primaryColor", create a member expression
    const exprAst = parseSimpleExpression(exprText, j);
    if (!exprAst) {
      return null;
    }
    expressions.push(exprAst);

    lastIndex = regex.lastIndex;
  }

  // Add the final static part
  const finalRaw = value.slice(lastIndex);
  quasis.push({ raw: finalRaw, cooked: finalRaw });

  // Build template literal AST
  const quasisAst = quasis.map((q, i) =>
    j.templateElement({ raw: q.raw, cooked: q.cooked }, i === quasis.length - 1),
  );

  return j.templateLiteral(quasisAst, expressions);
}

/**
 * Parses a simple expression string into AST.
 * Supports: identifiers and dot-notation member expressions like "$colors.primaryColor".
 *
 * Does NOT support:
 * - Computed properties: obj["key"]
 * - Function calls: fn()
 * - Operators: a + b
 */
function parseSimpleExpression(exprText: string, j: JSCodeshift): ExpressionKind | null {
  // Handle member expression like "$colors.primaryColor"
  const parts = exprText.split(".");
  if (parts.length === 0 || !parts[0]) {
    return null;
  }

  let ast: ExpressionKind = j.identifier(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part) {
      ast = j.memberExpression(ast, j.identifier(part));
    }
  }

  return ast;
}

/**
 * CSS shorthand properties that cannot be safely expanded when they contain template expressions.
 * StyleX doesn't support shorthands, and we can't determine how to expand these without
 * knowing the runtime value.
 *
 * Examples of why we bail:
 * - `margin: ${spacing}` - could be 1-4 values, can't know which directions
 * - `padding: ${p}` - same issue
 * - `background: ${bg}` - could be color or image, can't determine at compile time
 */
const UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR = new Set([
  "margin",
  "padding",
  "background",
  "scroll-margin",
]);

function isUnsupportedShorthandForTemplateExpr(property: string): boolean {
  return UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has(property);
}
