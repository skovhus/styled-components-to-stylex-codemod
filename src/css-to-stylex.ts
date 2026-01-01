/**
 * CSS to StyleX Conversion
 *
 * Converts CSS declarations to StyleX object syntax, handling:
 * - Property name conversion (kebab-case to camelCase)
 * - Shorthand expansion (border, margin, padding, etc.)
 * - Pseudo-selectors and media queries
 * - Value normalization
 */

import type { CSSRule, CSSDeclaration } from "./css-parser.js";
import { hasInterpolation, extractInterpolationIndices } from "./css-parser.js";

/**
 * StyleX property value - can be a literal or expression
 */
export type StyleXValue = string | number | null | StyleXObject | StyleXDynamicValue;

/**
 * Dynamic value that needs runtime resolution
 */
export interface StyleXDynamicValue {
  type: "dynamic";
  expression: string;
  interpolationIndices: number[];
}

/**
 * StyleX style object
 */
export interface StyleXObject {
  [key: string]: StyleXValue;
}

/**
 * StyleX create argument - named styles
 */
export interface StyleXStyles {
  [styleName: string]: StyleXObject;
}

/**
 * Properties that should be expanded from shorthands
 */
const EXPAND_SHORTHANDS = new Set([
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
]);

/**
 * Convert a CSS value to a StyleX-compatible value
 */
export function convertValue(value: string, property?: string): StyleXValue {
  const trimmed = value.trim();

  // Check for interpolations - return as dynamic
  if (hasInterpolation(trimmed)) {
    return {
      type: "dynamic",
      expression: trimmed,
      interpolationIndices: extractInterpolationIndices(trimmed),
    };
  }

  // Handle numeric values
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Handle 0 without units
  if (trimmed === "0") {
    return 0;
  }

  // Handle content property - CSS quotes need to be preserved as part of the string value
  // In StyleX, content: '"🔥"' means the value IS the string "🔥" with quotes
  if (property === "content") {
    // If value is already wrapped in CSS quotes, keep the quotes as part of the value
    if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      // Extract the inner content and wrap in double quotes for CSS content
      const inner = trimmed.slice(1, -1);
      // Return the value with embedded quotes: '"🔥"' becomes the JS string "\"🔥\""
      // which when used as content value in StyleX, will render as "🔥" in CSS
      return `"${inner}"`;
    }
    // For special values like none, inherit, etc.
    return trimmed;
  }

  // Return as quoted string (StyleX requires string values to be quoted)
  return trimmed;
}

/**
 * Parse a border shorthand value into components
 */
function parseBorderShorthand(value: string): {
  width?: string;
  style?: string;
  color?: string;
} {
  const parts = value.split(/\s+/);
  const result: { width?: string; style?: string; color?: string } = {};

  const borderStyles = [
    "none",
    "hidden",
    "dotted",
    "dashed",
    "solid",
    "double",
    "groove",
    "ridge",
    "inset",
    "outset",
  ];

  for (const part of parts) {
    if (borderStyles.includes(part)) {
      result.style = part;
    } else if (/^\d/.test(part) || part === "thin" || part === "medium" || part === "thick") {
      result.width = part;
    } else {
      result.color = part;
    }
  }

  return result;
}

/**
 * Parse animation shorthand value
 */
function parseAnimationShorthand(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = value.split(/\s+/);

  const timingFunctions = [
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "linear",
    "step-start",
    "step-end",
  ];
  const directions = ["normal", "reverse", "alternate", "alternate-reverse"];
  const fillModes = ["none", "forwards", "backwards", "both"];
  const playStates = ["running", "paused"];
  const iterationCounts = ["infinite"];

  let foundDuration = false;

  for (const part of parts) {
    if (timingFunctions.includes(part) || part.startsWith("cubic-bezier")) {
      result.animationTimingFunction = part;
    } else if (directions.includes(part)) {
      result.animationDirection = part;
    } else if (fillModes.includes(part)) {
      result.animationFillMode = part;
    } else if (playStates.includes(part)) {
      result.animationPlayState = part;
    } else if (iterationCounts.includes(part) || /^\d+$/.test(part)) {
      result.animationIterationCount = part;
    } else if (/^-?\d+(\.\d+)?(s|ms)$/.test(part)) {
      if (!foundDuration) {
        result.animationDuration = part;
        foundDuration = true;
      } else {
        result.animationDelay = part;
      }
    } else if (hasInterpolation(part)) {
      // Interpolation in animation - likely the keyframes name
      result.animationName = part;
    } else {
      // Assume it's the animation name
      result.animationName = part;
    }
  }

  return result;
}

/**
 * Expand a CSS shorthand property into longhand properties
 */
export function expandShorthand(
  property: string,
  value: string,
): Array<{ property: string; value: StyleXValue }> {
  // Don't expand if value has interpolation that spans the whole value
  if (hasInterpolation(value) && !EXPAND_SHORTHANDS.has(property)) {
    return [{ property, value: convertValue(value) }];
  }

  switch (property) {
    case "border":
    case "borderTop":
    case "borderRight":
    case "borderBottom":
    case "borderLeft": {
      const { width, style, color } = parseBorderShorthand(value);
      const prefix = property === "border" ? "border" : property;
      const result: Array<{ property: string; value: StyleXValue }> = [];

      if (width) {
        result.push({
          property: `${prefix}Width`,
          value: convertValue(width),
        });
      }
      if (style) {
        result.push({
          property: `${prefix}Style`,
          value: convertValue(style),
        });
      }
      if (color) {
        result.push({
          property: `${prefix}Color`,
          value: convertValue(color),
        });
      }

      return result.length > 0 ? result : [{ property, value: convertValue(value) }];
    }

    case "margin":
    case "padding": {
      // StyleX supports shorthand values directly as strings
      return [{ property, value: convertValue(value) }];
    }

    case "animation": {
      const parsed = parseAnimationShorthand(value);
      return Object.entries(parsed).map(([prop, val]) => ({
        property: prop,
        value: convertValue(val),
      }));
    }

    case "background": {
      // For simple background values, convert to backgroundColor
      // Complex backgrounds with images, gradients, etc. need special handling
      if (
        !value.includes("url(") &&
        !value.includes("gradient") &&
        !value.includes(",") &&
        !value.includes("/")
      ) {
        return [{ property: "backgroundColor", value: convertValue(value) }];
      }
      return [{ property, value: convertValue(value) }];
    }

    default:
      return [{ property, value: convertValue(value, property) }];
  }
}

/**
 * Normalize a CSS selector for StyleX nested syntax
 */
export function normalizeSelector(selector: string): string | null {
  const trimmed = selector.trim();

  // Root selector
  if (trimmed === "&") {
    return null;
  }

  // Pseudo-selectors: &:hover -> :hover
  if (trimmed.startsWith("&:")) {
    return trimmed.slice(1);
  }

  // Pseudo-elements: &::before -> ::before
  if (trimmed.startsWith("&::")) {
    return trimmed.slice(1);
  }

  // Attribute selectors: &[disabled] -> [disabled]
  if (trimmed.startsWith("&[")) {
    return trimmed.slice(1);
  }

  // Media queries and other at-rules remain as-is
  if (trimmed.startsWith("@")) {
    return trimmed;
  }

  // Other selectors - may not be directly supported by StyleX
  return trimmed;
}

/**
 * Convert CSS declarations to StyleX object
 */
export function declarationsToStyleX(
  declarations: CSSDeclaration[],
  nestedRules: CSSRule[] = [],
): StyleXObject {
  const result: StyleXObject = {};

  // Process declarations
  for (const decl of declarations) {
    const expanded = expandShorthand(decl.property, decl.value);
    for (const { property, value } of expanded) {
      result[property] = value;
    }
  }

  // Process nested rules (pseudo-selectors, media queries, etc.)
  for (const rule of nestedRules) {
    const normalizedSelector = normalizeSelector(rule.selector);
    if (normalizedSelector) {
      const nestedStyles = declarationsToStyleX(rule.declarations, rule.nestedRules);
      result[normalizedSelector] = nestedStyles;
    } else {
      // Merge declarations from nested & selector directly
      const nestedStyles = declarationsToStyleX(rule.declarations, rule.nestedRules);
      Object.assign(result, nestedStyles);
    }
  }

  return result;
}

/**
 * Convert a CSS rule to StyleX format
 */
export function cssRuleToStyleX(rule: CSSRule): StyleXObject {
  return declarationsToStyleX(rule.declarations, rule.nestedRules);
}

/**
 * Check if a StyleX object has any dynamic values
 */
export function hasDynamicValues(styles: StyleXObject): boolean {
  for (const value of Object.values(styles)) {
    if (typeof value === "object" && value !== null) {
      if ("type" in value && value.type === "dynamic") {
        return true;
      }
      if (hasDynamicValues(value as StyleXObject)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get all interpolation indices from a StyleX object
 */
export function getInterpolationIndices(styles: StyleXObject): Set<number> {
  const indices = new Set<number>();

  function traverse(obj: StyleXObject) {
    for (const value of Object.values(obj)) {
      if (typeof value === "object" && value !== null) {
        if ("type" in value && value.type === "dynamic") {
          const dynamicValue = value as StyleXDynamicValue;
          for (const idx of dynamicValue.interpolationIndices) {
            indices.add(idx);
          }
        } else {
          traverse(value as StyleXObject);
        }
      }
    }
  }

  traverse(styles);
  return indices;
}

/**
 * Remove !important from a value (StyleX doesn't support it)
 */
export function stripImportant(value: string): string {
  return value.replace(/\s*!important\s*/gi, "").trim();
}

/**
 * Check if a key is a pseudo-class (can use property-level conditionals)
 * Pseudo-classes: :hover, :focus, :active, etc.
 * Does NOT include pseudo-elements: ::before, ::after, ::placeholder
 */
function isPseudoClass(key: string): boolean {
  return key.startsWith(":") && !key.startsWith("::");
}

/**
 * Check if a key is a pseudo-element (should stay nested)
 * Pseudo-elements: ::before, ::after, ::placeholder, etc.
 */
function isPseudoElement(key: string): boolean {
  return key.startsWith("::");
}

/**
 * Check if a key is a media query or other at-rule (should stay nested)
 */
function isAtRule(key: string): boolean {
  return key.startsWith("@");
}

/**
 * Convert nested pseudo-selector format to property-level conditionals
 *
 * Input:
 * {
 *   color: "blue",
 *   ":hover": { color: "red" },
 *   "::before": { content: '"🔥"' }
 * }
 *
 * Output:
 * {
 *   color: { default: "blue", ":hover": "red" },
 *   "::before": { content: '"🔥"' }
 * }
 *
 * Note: Pseudo-elements (::before, ::after) stay as nested objects.
 * Only pseudo-classes (:hover, :focus) become property-level conditionals.
 */
export function toPropertyLevelConditionals(styles: StyleXObject): StyleXObject {
  const result: StyleXObject = {};
  const pseudoClasses: Array<{ selector: string; styles: StyleXObject }> = [];

  // First pass: separate base properties from pseudo-classes and pseudo-elements
  for (const [key, value] of Object.entries(styles)) {
    if (isPseudoClass(key) && typeof value === "object" && value !== null) {
      // Pseudo-classes will be merged into property-level conditionals
      pseudoClasses.push({ selector: key, styles: value as StyleXObject });
    } else if (
      (isPseudoElement(key) || isAtRule(key)) &&
      typeof value === "object" &&
      value !== null
    ) {
      // Pseudo-elements and at-rules stay nested
      result[key] = value;
    } else {
      result[key] = value;
    }
  }

  // If no pseudo-classes, return as-is
  if (pseudoClasses.length === 0) {
    return result;
  }

  // Second pass: merge pseudo-classes into property-level format
  for (const { selector, styles: condStyles } of pseudoClasses) {
    for (const [prop, condValue] of Object.entries(condStyles)) {
      // Skip nested selectors (handle them recursively)
      if (isPseudoClass(prop) || isPseudoElement(prop) || isAtRule(prop)) {
        // Keep nested selectors
        if (!result[selector]) {
          result[selector] = {};
        }
        (result[selector] as StyleXObject)[prop] = condValue;
        continue;
      }

      const baseValue = result[prop];

      if (baseValue === undefined) {
        // Property only exists in the conditional - use null as default
        result[prop] = {
          default: null,
          [selector]: condValue,
        };
      } else if (typeof baseValue === "object" && baseValue !== null && "default" in baseValue) {
        // Already a conditional object - add this selector
        (baseValue as StyleXObject)[selector] = condValue;
      } else {
        // Convert to conditional object
        result[prop] = {
          default: baseValue,
          [selector]: condValue,
        };
      }
    }
  }

  return result;
}
