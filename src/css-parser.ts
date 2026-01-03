/**
 * CSS Parser for styled-components template literals
 *
 * Uses stylis (styled-components' CSS parser) to parse CSS from template
 * literals after replacing interpolations with placeholders.
 */

import { compile } from "stylis";
import type { Element } from "stylis";
import type { TemplateLiteral, Expression } from "jscodeshift";

/**
 * Information about an interpolation in the template literal
 */
export interface InterpolationLocation {
  /** Index of the interpolation in the expressions array */
  index: number;
  /** The placeholder string used in the CSS (e.g., "__INTERPOLATION_0__") */
  placeholder: string;
  /** The original expression AST node */
  expression: Expression;
  /** Where the interpolation appears */
  context: InterpolationContext;
}

/**
 * Context of where an interpolation appears in CSS
 */
export interface InterpolationContext {
  /** The CSS property name (camelCase), null if in selector */
  property: string | null;
  /** The full value string with placeholder */
  value: string;
  /** The selector this declaration belongs to */
  selector: string;
  /** True if the interpolation is within a selector */
  isInSelector: boolean;
  /** True if the interpolation is a property name */
  isInPropertyName: boolean;
  /** True if the interpolation spans the entire value */
  isFullValue: boolean;
}

/**
 * Parsed CSS result with interpolation tracking
 */
export interface ParsedCSS {
  /** stylis AST nodes */
  root: Element[];
  /** Interpolation locations mapped by index */
  interpolations: Map<number, InterpolationLocation>;
  /** The CSS string with placeholders */
  cssWithPlaceholders: string;
}

/**
 * CSS declaration with potential interpolations
 */
export interface CSSDeclaration {
  property: string;
  value: string;
  selector: string;
  interpolationIndices: number[];
}

/**
 * CSS rule with declarations
 */
export interface CSSRule {
  selector: string;
  declarations: CSSDeclaration[];
  nestedRules: CSSRule[];
}

const PLACEHOLDER_PREFIX = "__INTERPOLATION_";
const PLACEHOLDER_SUFFIX = "__";
const PLACEHOLDER_REGEX = /__INTERPOLATION_(\d+)__/g;
const PLACEHOLDER_TEST_REGEX = /__INTERPOLATION_(\d+)__/;

/**
 * Clean property names that incorrectly include interpolation placeholders.
 * This can happen when an interpolation is a full CSS declaration on its own line,
 * causing stylis to concatenate it with the next property name.
 *
 * Example: `__INTERPOLATION_0__ textAlign` -> `textAlign` (with interpolation tracked separately)
 */
function cleanPropertyNameWithPlaceholder(property: string): {
  cleanedProperty: string;
  leadingPlaceholderIndices: number[];
} {
  const leadingPlaceholderIndices: number[] = [];

  // Check if property starts with one or more placeholders
  let cleanedProperty = property;
  let match: RegExpExecArray | null;

  // Use a regex to find all placeholders at the start
  const leadingPlaceholderRegex = /^(__INTERPOLATION_(\d+)__\s*)+/;
  const leadingMatch = leadingPlaceholderRegex.exec(property);

  if (leadingMatch) {
    // Extract all placeholder indices from the leading part
    const leadingPart = leadingMatch[0];
    PLACEHOLDER_REGEX.lastIndex = 0;
    while ((match = PLACEHOLDER_REGEX.exec(leadingPart)) !== null) {
      leadingPlaceholderIndices.push(parseInt(match[1]!, 10));
    }
    // Remove the leading placeholders from the property name
    cleanedProperty = property.slice(leadingMatch[0].length).trim();
    // Convert to camelCase if needed
    if (cleanedProperty.includes("-")) {
      cleanedProperty = cssPropertyToCamelCase(cleanedProperty);
    }
  }

  return { cleanedProperty, leadingPlaceholderIndices };
}

/**
 * Create a placeholder string for an interpolation index
 */
export function createPlaceholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
}

/**
 * Extract interpolation indices from a string containing placeholders
 */
export function extractInterpolationIndices(str: string): number[] {
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  while ((match = regex.exec(str)) !== null) {
    indices.push(parseInt(match[1]!, 10));
  }
  return indices;
}

/**
 * Check if a string contains any interpolation placeholders
 */
export function hasInterpolation(str: string): boolean {
  // IMPORTANT: do not use the global regex here; `.test()` would be stateful via `lastIndex`.
  return PLACEHOLDER_TEST_REGEX.test(str);
}

/**
 * Convert template literal quasis and expressions into CSS with placeholders
 */
export function templateToCSSWithPlaceholders(
  quasis: TemplateLiteral["quasis"],
  expressions: Expression[],
): string {
  let css = "";
  for (let i = 0; i < quasis.length; i++) {
    css += quasis[i]!.value.cooked ?? quasis[i]!.value.raw;
    if (i < expressions.length) {
      css += createPlaceholder(i);
    }
  }
  return css;
}

/**
 * Parse CSS from a styled-components template literal
 */
export function parseStyledCSS(
  quasis: TemplateLiteral["quasis"],
  expressions: Expression[],
): ParsedCSS {
  const cssWithPlaceholders = templateToCSSWithPlaceholders(quasis, expressions);
  const interpolations = new Map<number, InterpolationLocation>();
  let root: Element[];
  try {
    root = compile(cssWithPlaceholders);
  } catch {
    root = [];
    // Track all expressions as unknown interpolations
    for (let i = 0; i < expressions.length; i++) {
      interpolations.set(i, {
        index: i,
        placeholder: createPlaceholder(i),
        expression: expressions[i]!,
        context: {
          property: null,
          value: cssWithPlaceholders,
          selector: "&",
          isInSelector: false,
          isInPropertyName: false,
          isFullValue: true,
        },
      });
    }
    return { root, interpolations, cssWithPlaceholders };
  }

  // Walk stylis AST to find interpolation contexts
  walkStylis(root, "&", (ctx) => {
    if (ctx.kind === "decl") {
      // Property name placeholders
      for (const idx of extractInterpolationIndices(ctx.propertyRaw)) {
        interpolations.set(idx, {
          index: idx,
          placeholder: createPlaceholder(idx),
          expression: expressions[idx]!,
          context: {
            property: null,
            value: ctx.propertyRaw,
            selector: ctx.selector,
            isInSelector: false,
            isInPropertyName: true,
            isFullValue: ctx.propertyRaw.trim() === createPlaceholder(idx),
          },
        });
      }

      // Value placeholders
      for (const idx of extractInterpolationIndices(ctx.valueRaw)) {
        if (!interpolations.has(idx)) {
          interpolations.set(idx, {
            index: idx,
            placeholder: createPlaceholder(idx),
            expression: expressions[idx]!,
            context: {
              property: cssPropertyToCamelCase(ctx.propertyRaw),
              value: ctx.valueRaw,
              selector: ctx.selector,
              isInSelector: false,
              isInPropertyName: false,
              isFullValue: ctx.valueRaw.trim() === createPlaceholder(idx),
            },
          });
        }
      }
    } else if (ctx.kind === "selector") {
      for (const idx of extractInterpolationIndices(ctx.selector)) {
        if (!interpolations.has(idx)) {
          interpolations.set(idx, {
            index: idx,
            placeholder: createPlaceholder(idx),
            expression: expressions[idx]!,
            context: {
              property: null,
              value: ctx.selector,
              selector: ctx.selector,
              isInSelector: true,
              isInPropertyName: false,
              isFullValue: false,
            },
          });
        }
      }
    }
  });

  return { root, interpolations, cssWithPlaceholders };
}

/**
 * Convert kebab-case CSS property to camelCase
 */
export function cssPropertyToCamelCase(prop: string): string {
  // Preserve CSS custom properties (--name) as-is
  if (prop.startsWith("--")) {
    return prop;
  }

  // Handle vendor prefixes (-webkit-, -moz-, etc.)
  if (prop.startsWith("-")) {
    const withoutPrefix = prop.slice(1);
    const parts = withoutPrefix.split("-");
    return parts
      .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
  }

  return prop.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Convert camelCase to kebab-case
 */
export function camelCaseToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Extract CSS declarations from a parsed CSS root
 */
export function extractDeclarations(root: Element[]): CSSRule[] {
  const mainRule: CSSRule = { selector: "&", declarations: [], nestedRules: [] };

  for (const node of root) {
    if (!node) continue;
    if (node.type === "decl") {
      const parsed = parseStylisDeclaration(String(node.value ?? ""));
      if (!parsed) continue;
      // Clean property name if it has leading interpolation placeholders
      const { cleanedProperty, leadingPlaceholderIndices } = cleanPropertyNameWithPlaceholder(
        cssPropertyToCamelCase(parsed.property),
      );
      // Skip if property becomes empty or only whitespace after cleaning
      if (!cleanedProperty) continue;
      mainRule.declarations.push({
        property: cleanedProperty,
        value: parsed.value,
        selector: "&",
        interpolationIndices: [
          ...leadingPlaceholderIndices,
          ...extractInterpolationIndices(parsed.value),
        ],
      });
      continue;
    }
    if (node.type === "rule") {
      const selector = normalizeStylisSelector(String(node.value ?? ""));
      mainRule.nestedRules.push(extractStylisRule(node, selector));
      continue;
    }
    if (typeof node.type === "string" && node.type.startsWith("@")) {
      mainRule.nestedRules.push(extractStylisAtRule(node));
      continue;
    }
  }

  return [mainRule];
}

function extractStylisRule(node: Element, selector: string): CSSRule {
  const result: CSSRule = { selector, declarations: [], nestedRules: [] };
  const children = Array.isArray(node.children) ? (node.children as Element[]) : [];

  for (const child of children) {
    if (!child) continue;
    if (child.type === "decl") {
      const parsed = parseStylisDeclaration(String(child.value ?? ""));
      if (!parsed) continue;
      // Clean property name if it has leading interpolation placeholders
      const { cleanedProperty, leadingPlaceholderIndices } = cleanPropertyNameWithPlaceholder(
        cssPropertyToCamelCase(parsed.property),
      );
      // Skip if property becomes empty after cleaning
      if (!cleanedProperty) continue;
      result.declarations.push({
        property: cleanedProperty,
        value: parsed.value,
        selector,
        interpolationIndices: [
          ...leadingPlaceholderIndices,
          ...extractInterpolationIndices(parsed.value),
        ],
      });
    } else if (child.type === "rule") {
      const sel = normalizeStylisSelector(String(child.value ?? ""));
      result.nestedRules.push(extractStylisRule(child, sel));
    } else if (typeof child.type === "string" && child.type.startsWith("@")) {
      result.nestedRules.push(extractStylisAtRule(child));
    }
  }

  return result;
}

function extractStylisAtRule(node: Element): CSSRule {
  const selector = String(node.value ?? node.type);
  const result: CSSRule = { selector, declarations: [], nestedRules: [] };
  const children = Array.isArray(node.children) ? (node.children as Element[]) : [];

  for (const child of children) {
    if (!child) continue;
    if (child.type === "decl") {
      const parsed = parseStylisDeclaration(String(child.value ?? ""));
      if (!parsed) continue;
      // Clean property name if it has leading interpolation placeholders
      const { cleanedProperty, leadingPlaceholderIndices } = cleanPropertyNameWithPlaceholder(
        cssPropertyToCamelCase(parsed.property),
      );
      // Skip if property becomes empty after cleaning
      if (!cleanedProperty) continue;
      result.declarations.push({
        property: cleanedProperty,
        value: parsed.value,
        selector,
        interpolationIndices: [
          ...leadingPlaceholderIndices,
          ...extractInterpolationIndices(parsed.value),
        ],
      });
    } else if (child.type === "rule") {
      const sel = normalizeStylisSelector(String(child.value ?? ""));
      result.nestedRules.push(extractStylisRule(child, sel));
    } else if (typeof child.type === "string" && child.type.startsWith("@")) {
      result.nestedRules.push(extractStylisAtRule(child));
    }
  }

  return result;
}

function normalizeStylisSelector(raw: string): string {
  // stylis uses `\f` internally to represent nesting boundaries.
  return raw.replaceAll("\f", "");
}

function parseStylisDeclaration(declValue: string): { property: string; value: string } | null {
  // stylis decl value looks like "color:red;" or "border:2px solid red;"
  const trimmed = declValue.trim();
  const match = trimmed.match(/^([^:]+):([\s\S]+?);?$/);
  if (!match) return null;
  return { property: match[1]!.trim(), value: match[2]!.trim() };
}

type StylisWalkContext =
  | { kind: "decl"; selector: string; propertyRaw: string; valueRaw: string }
  | { kind: "selector"; selector: string };

function walkStylis(
  nodes: Element[],
  selector: string,
  visit: (ctx: StylisWalkContext) => void,
): void {
  for (const node of nodes) {
    if (!node) continue;
    if (node.type === "decl") {
      const parsed = parseStylisDeclaration(String(node.value ?? ""));
      if (parsed) {
        visit({ kind: "decl", selector, propertyRaw: parsed.property, valueRaw: parsed.value });
      }
      continue;
    }
    if (node.type === "rule") {
      const sel = normalizeStylisSelector(String(node.value ?? ""));
      visit({ kind: "selector", selector: sel });
      if (Array.isArray(node.children)) {
        walkStylis(node.children as Element[], sel, visit);
      }
      continue;
    }
    if (typeof node.type === "string" && node.type.startsWith("@")) {
      // Stay on the current selector for context; at-rules don't change selector.
      if (Array.isArray(node.children)) {
        walkStylis(node.children as Element[], selector, visit);
      }
      continue;
    }
    if (Array.isArray(node.children)) {
      walkStylis(node.children as Element[], selector, visit);
    }
  }
}
