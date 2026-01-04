/**
 * CSS to StyleX Conversion
 *
 * Converts CSS declarations to StyleX object syntax, handling:
 * - Property name conversion (kebab-case to camelCase)
 * - Shorthand expansion (border, margin, padding, etc.)
 * - Pseudo-selectors and media queries
 * - Value normalization
 * - CSS variable resolution via adapter
 */

import type { CSSRule, CSSDeclaration } from "./css-parser.js";
import { hasInterpolation, extractInterpolationIndices } from "./css-parser.js";
import type { Adapter } from "./adapter.js";
import { TEMPLATE_LITERAL_PREFIX, VAR_REF_PREFIX } from "./builtin-handlers.js";

/**
 * Context for CSS value conversion (adapter + import collection)
 */
export interface ConversionContext {
  adapter?: Adapter;
  /** Collects imports added during conversion */
  collectedImports?: Set<string>;
}

/**
 * Parse CSS var() references from a value
 * Returns array of { name, fallback, fullMatch, start, end }
 */
export function parseCssVarReferences(
  value: string,
): Array<{ name: string; fallback?: string; fullMatch: string; start: number; end: number }> {
  const results: Array<{
    name: string;
    fallback?: string;
    fullMatch: string;
    start: number;
    end: number;
  }> = [];

  // Match var(--name) or var(--name, fallback)
  // Handles nested var() in fallback by counting parens
  let i = 0;
  while (i < value.length) {
    const varStart = value.indexOf("var(--", i);
    if (varStart === -1) break;

    // Find matching closing paren
    let parenCount = 1;
    let j = varStart + 4; // After "var("
    while (j < value.length && parenCount > 0) {
      if (value[j] === "(") parenCount++;
      else if (value[j] === ")") parenCount--;
      j++;
    }

    if (parenCount === 0) {
      const fullMatch = value.slice(varStart, j);
      const inner = value.slice(varStart + 4, j - 1); // Content inside var(...)

      // Split by first comma (for fallback)
      const commaIdx = inner.indexOf(",");
      let name: string;
      let fallback: string | undefined;

      if (commaIdx !== -1) {
        name = inner.slice(0, commaIdx).trim().replace(/^--/, "");
        fallback = inner.slice(commaIdx + 1).trim();
      } else {
        name = inner.trim().replace(/^--/, "");
      }

      // With `exactOptionalPropertyTypes`, we must omit the optional field entirely
      // rather than setting it to `undefined`.
      if (fallback !== undefined) {
        results.push({ name, fallback, fullMatch, start: varStart, end: j });
      } else {
        results.push({ name, fullMatch, start: varStart, end: j });
      }
    }

    i = j;
  }

  return results;
}

/**
 * Resolve CSS var() references in a value using the adapter
 * Returns { resolved: string, imports: string[], wasResolved: boolean, isTemplateLiteral: boolean }
 */
export function resolveCssVariables(
  value: string,
  ctx: ConversionContext,
): { resolved: string; imports: string[]; wasResolved: boolean; isTemplateLiteral: boolean } {
  if (!ctx.adapter?.resolveCssVariable) {
    return { resolved: value, imports: [], wasResolved: false, isTemplateLiteral: false };
  }

  const refs = parseCssVarReferences(value);
  if (refs.length === 0) {
    return { resolved: value, imports: [], wasResolved: false, isTemplateLiteral: false };
  }

  const allImports: string[] = [];
  const resolutions: Array<{ start: number; end: number; code: string }> = [];

  // Collect all resolutions
  for (const ref of refs) {
    const resolution = ctx.adapter.resolveCssVariable(ref.name, ref.fallback);
    if (resolution) {
      resolutions.push({ start: ref.start, end: ref.end, code: resolution.code });
      if (resolution.imports) {
        allImports.push(...resolution.imports);
      }
    }
  }

  if (resolutions.length === 0) {
    return { resolved: value, imports: [], wasResolved: false, isTemplateLiteral: false };
  }

  // Check if the entire value is just a single var() reference
  const isSingleFullValue =
    resolutions.length === 1 && resolutions[0]!.start === 0 && resolutions[0]!.end === value.length;

  if (isSingleFullValue) {
    // Single var(), return as identifier/member expression
    return {
      resolved: resolutions[0]!.code,
      imports: allImports,
      wasResolved: true,
      isTemplateLiteral: false,
    };
  }

  // Multiple vars or mixed content - create template literal
  // Process in reverse order to preserve indices
  let result = value;
  for (let i = resolutions.length - 1; i >= 0; i--) {
    const res = resolutions[i]!;
    // Wrap the resolved code in ${} for template literal
    result = result.slice(0, res.start) + "${" + res.code + "}" + result.slice(res.end);
  }

  return {
    resolved: result,
    imports: allImports,
    wasResolved: true,
    isTemplateLiteral: true,
  };
}

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
  "animation",
]);

/**
 * Properties where we rename the key even if the value is dynamic
 */
const SIMPLE_RENAMES: Record<string, string> = {
  background: "backgroundColor",
};

/**
 * Normalize a CSS property name for StyleX (apply simple renames)
 */
export function normalizePropertyName(property: string): string {
  return SIMPLE_RENAMES[property] ?? property;
}

/**
 * Convert a CSS value to a StyleX-compatible value
 * @param value - The CSS value to convert
 * @param property - Optional CSS property name for context
 * @param ctx - Optional conversion context with adapter for CSS variable resolution
 */
export function convertValue(
  value: string,
  property?: string,
  ctx?: ConversionContext,
): StyleXValue {
  // Strip !important - StyleX doesn't support it
  let trimmed = stripImportant(value).trim();

  // Resolve CSS variables if adapter is provided
  if (ctx?.adapter?.resolveCssVariable && trimmed.includes("var(--")) {
    const { resolved, imports, wasResolved, isTemplateLiteral } = resolveCssVariables(trimmed, ctx);
    if (wasResolved) {
      // Collect imports
      if (ctx.collectedImports && imports.length > 0) {
        for (const imp of imports) {
          ctx.collectedImports.add(imp);
        }
      }
      if (isTemplateLiteral) {
        // Multiple vars or mixed content - mark as template literal
        return TEMPLATE_LITERAL_PREFIX + resolved;
      } else {
        // Single var() that spans the entire value - mark as variable reference
        return VAR_REF_PREFIX + resolved;
      }
    }
  }

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
/**
 * Split a CSS value by whitespace but preserve var() and other functions
 */
function splitCssValue(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if (/\s/.test(char) && parenDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseBorderShorthand(value: string): {
  width?: string;
  style?: string;
  color?: string;
} {
  // Strip !important first (it should already be stripped, but be safe)
  const cleanValue = stripImportant(value);
  // Use smart split that preserves var() and other functions
  const parts = splitCssValue(cleanValue);
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
 * Parse a single animation layer
 */
function parseSingleAnimationLayer(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = value.trim().split(/\s+/);

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
 * Parse animation shorthand value - handles multiple comma-separated layers
 */
function parseAnimationShorthand(value: string): Record<string, string> {
  // Split by comma, preserving parentheses content
  const layers = splitCssValue(value.replace(/,\s*/g, " , ")).reduce<string[]>((acc, part) => {
    if (part === ",") {
      acc.push("");
    } else {
      if (acc.length === 0) acc.push("");
      acc[acc.length - 1] = (acc[acc.length - 1] + " " + part).trim();
    }
    return acc;
  }, []);

  if (layers.length === 1) {
    // Single animation layer
    return parseSingleAnimationLayer(layers[0]!);
  }

  // Multiple animation layers - parse each and combine
  const parsedLayers = layers.filter(Boolean).map(parseSingleAnimationLayer);

  const result: Record<string, string> = {};

  // Combine each property from all layers
  const allProperties = new Set(parsedLayers.flatMap((l) => Object.keys(l)));

  for (const prop of allProperties) {
    const values = parsedLayers.map((l) => l[prop] || "");
    // For animationName with interpolations, create a template literal
    if (prop === "animationName" && values.some((v) => hasInterpolation(v))) {
      // Create template literal format: ${fadeIn}, ${slideIn}
      result[prop] = values
        .map((v) => {
          if (hasInterpolation(v)) {
            // Already has interpolation syntax
            return "${" + v.replace(/__INTERPOLATION_(\d+)__/g, "$1") + "}";
          }
          return v;
        })
        .join(", ");
    } else {
      result[prop] = values.filter(Boolean).join(", ");
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
  ctx?: ConversionContext,
): Array<{ property: string; value: StyleXValue }> {
  // Don't expand if value has interpolation that spans the whole value
  if (hasInterpolation(value) && !EXPAND_SHORTHANDS.has(property)) {
    // Still apply simple renames even for dynamic values
    const renamedProperty = SIMPLE_RENAMES[property] ?? property;
    return [{ property: renamedProperty, value: convertValue(value, undefined, ctx) }];
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

      // When style is "none", we need to explicitly set width to 0 to reset the border
      if (style === "none" && !width) {
        result.push({
          property: `${prefix}Width`,
          value: 0,
        });
      } else if (width) {
        result.push({
          property: `${prefix}Width`,
          value: convertValue(width, undefined, ctx),
        });
      }
      if (style) {
        result.push({
          property: `${prefix}Style`,
          value: convertValue(style, undefined, ctx),
        });
      }
      if (color) {
        result.push({
          property: `${prefix}Color`,
          value: convertValue(color, undefined, ctx),
        });
      }

      return result.length > 0
        ? result
        : [{ property, value: convertValue(value, undefined, ctx) }];
    }

    case "margin":
    case "padding": {
      // StyleX supports shorthand values directly as strings
      // When value contains interpolation, keep as shorthand to let interpolation handler process it
      return [{ property, value: convertValue(value, undefined, ctx) }];
    }

    case "animation": {
      const parsed = parseAnimationShorthand(value);
      return Object.entries(parsed).map(([prop, val]) => ({
        property: prop,
        value: convertValue(val, undefined, ctx),
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
        return [{ property: "backgroundColor", value: convertValue(value, undefined, ctx) }];
      }
      return [{ property, value: convertValue(value, undefined, ctx) }];
    }

    default:
      return [{ property, value: convertValue(value, property, ctx) }];
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
  ctx?: ConversionContext,
): StyleXObject {
  const result: StyleXObject = {};

  // Process declarations
  for (const decl of declarations) {
    // Skip CSS custom property declarations (--name: value)
    // These are local CSS variables that StyleX doesn't support in stylex.create()
    // They should be handled via defineVars in a separate .stylex.ts file
    if (decl.property.startsWith("--")) {
      continue;
    }
    const expanded = expandShorthand(decl.property, decl.value, ctx);
    for (const { property, value } of expanded) {
      result[property] = value;
    }
  }

  // Process nested rules (pseudo-selectors, media queries, etc.)
  for (const rule of nestedRules) {
    const normalizedSelector = normalizeSelector(rule.selector);
    if (normalizedSelector) {
      const nestedStyles = declarationsToStyleX(rule.declarations, rule.nestedRules, ctx);
      result[normalizedSelector] = nestedStyles;
    } else {
      // Merge declarations from nested & selector directly
      const nestedStyles = declarationsToStyleX(rule.declarations, rule.nestedRules, ctx);
      Object.assign(result, nestedStyles);
    }
  }

  return result;
}

/**
 * Convert a CSS rule to StyleX format
 */
export function cssRuleToStyleX(rule: CSSRule, ctx?: ConversionContext): StyleXObject {
  return declarationsToStyleX(rule.declarations, rule.nestedRules, ctx);
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
 * Check if a key is a media query (should become property-level conditional)
 */
function isMediaQuery(key: string): boolean {
  return key.startsWith("@media");
}

/**
 * Check if a key is an at-rule that should stay nested (not media queries)
 */
function isAtRule(key: string): boolean {
  // Media queries should be property-level conditionals, not nested
  if (isMediaQuery(key)) return false;
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
  const conditionalBlocks: Array<{ selector: string; styles: StyleXObject }> = [];
  const nestedBlocks: Array<{ key: string; value: StyleXObject }> = [];

  // First pass: separate base properties from pseudo-classes, media queries, and pseudo-elements
  for (const [key, value] of Object.entries(styles)) {
    if ((isPseudoClass(key) || isMediaQuery(key)) && typeof value === "object" && value !== null) {
      // Pseudo-classes and media queries will be merged into property-level conditionals
      conditionalBlocks.push({ selector: key, styles: value as StyleXObject });
    } else if (
      (isPseudoElement(key) || isAtRule(key)) &&
      typeof value === "object" &&
      value !== null
    ) {
      // Pseudo-elements and non-media at-rules stay nested - collect for later
      nestedBlocks.push({ key, value: value as StyleXObject });
    } else {
      result[key] = value;
    }
  }

  // Second pass: merge conditional blocks into property-level format
  for (const { selector, styles: condStyles } of conditionalBlocks) {
    for (const [prop, condValue] of Object.entries(condStyles)) {
      // Skip nested selectors (handle them recursively)
      if (isPseudoClass(prop) || isPseudoElement(prop) || isAtRule(prop) || isMediaQuery(prop)) {
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

  // Third pass: add nested blocks (pseudo-elements, at-rules) at the end
  for (const { key, value } of nestedBlocks) {
    result[key] = value;
  }

  return result;
}
