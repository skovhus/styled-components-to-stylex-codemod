/**
 * CSS Extractor
 *
 * Extracts CSS from styled-components template literals while tracking
 * interpolation positions for later processing.
 */

import type { ASTNode } from "jscodeshift";

// Use jscodeshift's AST types which are compatible with @babel/types
type Expression = ASTNode;

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace t {
  export type Expression = ASTNode;
  export type TemplateLiteral = {
    type: "TemplateLiteral";
    quasis: Array<{
      value: { cooked: string | null; raw: string };
      loc?: { start: { line: number; column: number } };
    }>;
    expressions: ASTNode[];
  };
}

// ============================================================================
// Types
// ============================================================================

/**
 * Context hint inferred from surrounding CSS
 */
export type InterpolationContextHint =
  | "value" // After a colon, likely a property value
  | "selector" // Inside a selector context
  | "property" // Before a colon, likely a custom property
  | "full-rule" // Entire CSS rule (like ${truncate})
  | "unknown";

/**
 * Information about a single interpolation
 */
export interface InterpolationInfo {
  /** The placeholder ID in the extracted CSS */
  id: string;
  /** The original expression */
  expression: Expression;
  /** Position in the original template literal */
  position: { start: number; end: number };
  /** Context hint from surrounding CSS */
  contextHint: InterpolationContextHint;
  /** Index in the expressions array */
  index: number;
}

/**
 * Source map entry for error reporting
 */
export interface SourceMapEntry {
  /** Position in extracted CSS */
  cssPosition: number;
  /** Line in original source */
  originalLine: number;
  /** Column in original source */
  originalColumn: number;
}

/**
 * Result of CSS extraction
 */
export interface ExtractedCSS {
  /** CSS with placeholders for interpolations */
  css: string;
  /** Map of placeholder ID to interpolation info */
  interpolations: Map<string, InterpolationInfo>;
  /** Source map entries for error reporting */
  sourceMap: SourceMapEntry[];
  /** Original file path */
  filePath: string;
}

// ============================================================================
// Extraction Logic
// ============================================================================

/**
 * Extract CSS from a template literal, replacing expressions with placeholders
 *
 * @example
 * Input:  styled.div`color: ${props => props.theme.primary}; &:hover { color: red; }`
 * Output: { css: "color: __INTERP_0__; &:hover { color: red; }", interpolations: {...} }
 */
export function extractCSS(
  templateLiteral: t.TemplateLiteral,
  filePath: string,
): ExtractedCSS {
  const quasis = templateLiteral.quasis;
  const expressions = templateLiteral.expressions;
  const interpolations = new Map<string, InterpolationInfo>();
  const sourceMap: SourceMapEntry[] = [];

  let css = "";
  let cssPosition = 0;

  for (let i = 0; i < quasis.length; i++) {
    const quasi = quasis[i]!;
    const quasiValue = quasi.value.cooked ?? quasi.value.raw;

    // Track source map for this quasi
    if (quasi.loc) {
      sourceMap.push({
        cssPosition,
        originalLine: quasi.loc.start.line,
        originalColumn: quasi.loc.start.column,
      });
    }

    css += quasiValue;
    cssPosition += quasiValue.length;

    // Process interpolation if there is one
    if (i < expressions.length) {
      const expr = expressions[i]!;
      const id = `__INTERP_${i}__`;
      const nextQuasi = quasis[i + 1]?.value.raw ?? "";
      const contextHint = inferContextFromSurrounding(css, nextQuasi);

      interpolations.set(id, {
        id,
        expression: expr as t.Expression,
        position: { start: cssPosition, end: cssPosition + id.length },
        contextHint,
        index: i,
      });

      css += id;
      cssPosition += id.length;
    }
  }

  return { css, interpolations, sourceMap, filePath };
}

/**
 * Infer the context of an interpolation from surrounding CSS text
 */
function inferContextFromSurrounding(
  before: string,
  after: string,
): InterpolationContextHint {
  const trimmedBefore = before.trimEnd();
  const trimmedAfter = after.trimStart();

  // Full rule interpolation: starts at beginning of block or after semicolon/brace
  // and the interpolation is followed by more CSS or end of block
  if (
    (trimmedBefore === "" ||
      trimmedBefore.endsWith("{") ||
      trimmedBefore.endsWith(";")) &&
    (trimmedAfter === "" ||
      trimmedAfter.startsWith(";") ||
      /^[\s\n]*[a-z-]+\s*:/i.test(trimmedAfter) ||
      trimmedAfter.startsWith("}"))
  ) {
    return "full-rule";
  }

  // After a colon → likely a value
  if (trimmedBefore.endsWith(":")) {
    return "value";
  }

  // Before a colon → likely a property (custom property)
  if (trimmedAfter.startsWith(":")) {
    return "property";
  }

  // Inside a selector context (after & or at start of nested block)
  if (/&\s*$/.test(trimmedBefore) || /\{[^}]*$/.test(trimmedBefore) === false) {
    // Check if we're in a selector position
    const lastBrace = trimmedBefore.lastIndexOf("{");
    const lastSemicolon = trimmedBefore.lastIndexOf(";");
    if (lastBrace > lastSemicolon) {
      return "selector";
    }
  }

  return "unknown";
}

/**
 * Check if a string contains an interpolation placeholder
 */
export function hasInterpolation(str: string): boolean {
  return /__INTERP_\d+__/.test(str);
}

/**
 * Extract all interpolation IDs from a string
 */
export function getInterpolationIds(str: string): string[] {
  const matches = str.match(/__INTERP_\d+__/g);
  return matches ?? [];
}

/**
 * Replace interpolation placeholders with actual values
 */
export function replaceInterpolations(
  str: string,
  replacer: (id: string, info: InterpolationInfo) => string,
  interpolations: Map<string, InterpolationInfo>,
): string {
  return str.replace(/__INTERP_\d+__/g, (match) => {
    const info = interpolations.get(match);
    if (!info) return match;
    return replacer(match, info);
  });
}

// ============================================================================
// Keyframes Extraction
// ============================================================================

/**
 * Extract CSS from a keyframes template literal
 */
export function extractKeyframesCSS(
  templateLiteral: t.TemplateLiteral,
  filePath: string,
): ExtractedCSS {
  // Keyframes are simpler - they typically don't have dynamic values
  // but we still need to handle the case where they might
  return extractCSS(templateLiteral, filePath);
}

// ============================================================================
// CSS Helper Extraction
// ============================================================================

/**
 * Extract CSS from a css`` helper template literal
 */
export function extractCSSHelperCSS(
  templateLiteral: t.TemplateLiteral,
  filePath: string,
): ExtractedCSS {
  // CSS helpers can have interpolations just like styled components
  return extractCSS(templateLiteral, filePath);
}
