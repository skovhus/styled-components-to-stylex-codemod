/**
 * CSS Shorthand Expansion
 *
 * Handles expansion of CSS shorthand properties to their longhand equivalents
 * since StyleX requires explicit property names.
 */

// ============================================================================
// Shorthand Property Definitions
// ============================================================================

/**
 * Map of shorthand properties to their longhand equivalents
 */
export const SHORTHAND_PROPERTIES: Record<string, string[]> = {
  // Background
  background: ["backgroundColor", "backgroundImage", "backgroundPosition", "backgroundSize", "backgroundRepeat"],
  
  // Border
  border: ["borderWidth", "borderStyle", "borderColor"],
  borderTop: ["borderTopWidth", "borderTopStyle", "borderTopColor"],
  borderRight: ["borderRightWidth", "borderRightStyle", "borderRightColor"],
  borderBottom: ["borderBottomWidth", "borderBottomStyle", "borderBottomColor"],
  borderLeft: ["borderLeftWidth", "borderLeftStyle", "borderLeftColor"],
  borderWidth: ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"],
  borderStyle: ["borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle"],
  borderColor: ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"],
  borderRadius: ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"],
  
  // Margin
  margin: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
  
  // Padding
  padding: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
  
  // Flex
  flex: ["flexGrow", "flexShrink", "flexBasis"],
  
  // Font
  font: ["fontStyle", "fontVariant", "fontWeight", "fontSize", "lineHeight", "fontFamily"],
  
  // Animation
  animation: ["animationName", "animationDuration", "animationTimingFunction", "animationDelay", "animationIterationCount", "animationDirection", "animationFillMode", "animationPlayState"],
  
  // Transition
  transition: ["transitionProperty", "transitionDuration", "transitionTimingFunction", "transitionDelay"],
  
  // Outline
  outline: ["outlineWidth", "outlineStyle", "outlineColor"],
  
  // List
  listStyle: ["listStyleType", "listStylePosition", "listStyleImage"],
  
  // Gap
  gap: ["rowGap", "columnGap"],
  
  // Overflow
  overflow: ["overflowX", "overflowY"],
  
  // Place
  placeContent: ["alignContent", "justifyContent"],
  placeItems: ["alignItems", "justifyItems"],
  placeSelf: ["alignSelf", "justifySelf"],
  
  // Inset
  inset: ["top", "right", "bottom", "left"],
};

/**
 * Check if a property is a shorthand
 */
export function isShorthandProperty(property: string): boolean {
  return property in SHORTHAND_PROPERTIES;
}

/**
 * Get longhand properties for a shorthand
 */
export function getLonghandProperties(shorthand: string): string[] | null {
  return SHORTHAND_PROPERTIES[shorthand] ?? null;
}

// ============================================================================
// Shorthand Expansion
// ============================================================================

/**
 * Border style keywords
 */
const BORDER_STYLES = ["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"];

/**
 * Expand a border shorthand value
 * @example "2px solid red" → { borderWidth: "2px", borderStyle: "solid", borderColor: "red" }
 */
export function expandBorder(value: string): Record<string, string> | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) return null;
  
  let width: string | undefined;
  let style: string | undefined;
  let color: string | undefined;
  
  for (const part of parts) {
    // Width: starts with a digit or is a keyword
    if (/^\d/.test(part) || ["thin", "medium", "thick"].includes(part)) {
      width = part;
    }
    // Style: one of the border style keywords
    else if (BORDER_STYLES.includes(part)) {
      style = part;
    }
    // Color: everything else
    else {
      color = part;
    }
  }
  
  const result: Record<string, string> = {};
  if (width) result.borderWidth = width;
  if (style) result.borderStyle = style;
  if (color) result.borderColor = color;
  
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Expand a margin/padding shorthand value
 * @example "1px 2px 3px 4px" → { marginTop: "1px", marginRight: "2px", marginBottom: "3px", marginLeft: "4px" }
 */
export function expandBoxModel(
  property: "margin" | "padding",
  value: string,
): Record<string, string> {
  const parts = value.trim().split(/\s+/);
  const prefix = property;
  
  let top: string;
  let right: string;
  let bottom: string;
  let left: string;
  
  switch (parts.length) {
    case 1:
      // All sides same
      top = parts[0] ?? "0";
      right = bottom = left = top;
      break;
    case 2:
      // top/bottom, left/right
      top = parts[0] ?? "0";
      right = parts[1] ?? "0";
      bottom = top;
      left = right;
      break;
    case 3:
      // top, left/right, bottom
      top = parts[0] ?? "0";
      right = parts[1] ?? "0";
      bottom = parts[2] ?? "0";
      left = right;
      break;
    case 4:
      // top, right, bottom, left
      top = parts[0] ?? "0";
      right = parts[1] ?? "0";
      bottom = parts[2] ?? "0";
      left = parts[3] ?? "0";
      break;
    default:
      // Fallback to first value
      top = right = bottom = left = parts[0] ?? "0";
  }
  
  return {
    [`${prefix}Top`]: top,
    [`${prefix}Right`]: right,
    [`${prefix}Bottom`]: bottom,
    [`${prefix}Left`]: left,
  };
}

/**
 * Expand a border-radius shorthand value
 */
export function expandBorderRadius(value: string): Record<string, string> {
  // Handle horizontal / vertical syntax
  const splitValue = value.split("/").map(s => s.trim());
  const horizontal = splitValue[0] ?? value;
  const vertical = splitValue[1];
  
  if (vertical) {
    // Complex case: different horizontal and vertical radii
    // For now, just use the horizontal values
    const expanded = expandBoxModel("padding", horizontal);
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(expanded)) {
      const newKey = key
        .replace("paddingTop", "borderTopLeftRadius")
        .replace("paddingRight", "borderTopRightRadius")
        .replace("paddingBottom", "borderBottomRightRadius")
        .replace("paddingLeft", "borderBottomLeftRadius");
      result[newKey] = val;
    }
    return result;
  }
  
  const parts = horizontal.trim().split(/\s+/);
  
  let tl: string;
  let tr: string;
  let br: string;
  let bl: string;
  
  switch (parts.length) {
    case 1:
      tl = parts[0] ?? "0";
      tr = br = bl = tl;
      break;
    case 2:
      tl = parts[0] ?? "0";
      tr = parts[1] ?? "0";
      br = tl;
      bl = tr;
      break;
    case 3:
      tl = parts[0] ?? "0";
      tr = parts[1] ?? "0";
      br = parts[2] ?? "0";
      bl = tr;
      break;
    case 4:
      tl = parts[0] ?? "0";
      tr = parts[1] ?? "0";
      br = parts[2] ?? "0";
      bl = parts[3] ?? "0";
      break;
    default:
      tl = tr = br = bl = parts[0] ?? "0";
  }
  
  return {
    borderTopLeftRadius: tl,
    borderTopRightRadius: tr,
    borderBottomRightRadius: br,
    borderBottomLeftRadius: bl,
  };
}

/**
 * Expand an animation shorthand value
 */
export function expandAnimation(value: string): Record<string, string> {
  // Animation shorthand is complex: name duration timing-function delay iteration-count direction fill-mode play-state
  // This is a simplified parser that handles common cases
  
  const parts = value.trim().split(/\s+/);
  const result: Record<string, string> = {};
  
  // Timing functions
  const timingFunctions = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"];
  // Directions
  const directions = ["normal", "reverse", "alternate", "alternate-reverse"];
  // Fill modes
  const fillModes = ["none", "forwards", "backwards", "both"];
  // Play states
  const playStates = ["running", "paused"];
  // Iteration keywords
  const iterationKeywords = ["infinite"];
  
  let durationFound = false;
  
  for (const part of parts) {
    // Duration/delay: time values
    if (/^\d/.test(part) && part.endsWith("s")) {
      if (!durationFound) {
        result.animationDuration = part;
        durationFound = true;
      } else {
        result.animationDelay = part;
      }
    }
    // Timing function
    else if (timingFunctions.includes(part) || part.startsWith("cubic-bezier") || part.startsWith("steps")) {
      result.animationTimingFunction = part;
    }
    // Iteration count
    else if (iterationKeywords.includes(part) || /^\d+$/.test(part)) {
      result.animationIterationCount = part;
    }
    // Direction
    else if (directions.includes(part)) {
      result.animationDirection = part;
    }
    // Fill mode
    else if (fillModes.includes(part)) {
      result.animationFillMode = part;
    }
    // Play state
    else if (playStates.includes(part)) {
      result.animationPlayState = part;
    }
    // Animation name (identifier)
    else if (!result.animationName) {
      result.animationName = part;
    }
  }
  
  return result;
}

/**
 * Expand a flex shorthand value
 */
export function expandFlex(value: string): Record<string, string> {
  const parts = value.trim().split(/\s+/);
  
  // Handle keywords
  if (parts.length === 1) {
    if (parts[0] === "none") {
      return { flexGrow: "0", flexShrink: "0", flexBasis: "auto" };
    }
    if (parts[0] === "auto") {
      return { flexGrow: "1", flexShrink: "1", flexBasis: "auto" };
    }
    if (parts[0] === "initial") {
      return { flexGrow: "0", flexShrink: "1", flexBasis: "auto" };
    }
    // Single number = flex-grow
    if (/^\d+$/.test(parts[0]!)) {
      return { flexGrow: parts[0]!, flexShrink: "1", flexBasis: "0" };
    }
    // Single length = flex-basis
    return { flexGrow: "1", flexShrink: "1", flexBasis: parts[0]! };
  }
  
  if (parts.length === 2) {
    // Two values: flex-grow flex-shrink OR flex-grow flex-basis
    if (/^\d+$/.test(parts[1]!)) {
      return { flexGrow: parts[0]!, flexShrink: parts[1]!, flexBasis: "0" };
    }
    return { flexGrow: parts[0]!, flexShrink: "1", flexBasis: parts[1]! };
  }
  
  if (parts.length === 3) {
    return { flexGrow: parts[0]!, flexShrink: parts[1]!, flexBasis: parts[2]! };
  }
  
  return { flexGrow: "1", flexShrink: "1", flexBasis: "auto" };
}

/**
 * Expand a gap shorthand value
 */
export function expandGap(value: string): Record<string, string> {
  const parts = value.trim().split(/\s+/);
  
  if (parts.length === 1) {
    return { rowGap: parts[0]!, columnGap: parts[0]! };
  }
  
  return { rowGap: parts[0]!, columnGap: parts[1]! };
}

/**
 * Expand an overflow shorthand value
 */
export function expandOverflow(value: string): Record<string, string> {
  const parts = value.trim().split(/\s+/);
  
  if (parts.length === 1) {
    return { overflowX: parts[0]!, overflowY: parts[0]! };
  }
  
  return { overflowX: parts[0]!, overflowY: parts[1]! };
}

// ============================================================================
// Main Expansion Function
// ============================================================================

/**
 * Expand a shorthand property to its longhand equivalents
 * Returns null if expansion is not needed or not possible
 */
export function expandShorthand(
  property: string,
  value: string,
): Record<string, string> | null {
  switch (property) {
    case "border":
    case "borderTop":
    case "borderRight":
    case "borderBottom":
    case "borderLeft":
      return expandBorder(value);
    
    case "margin":
    case "padding":
      return expandBoxModel(property, value);
    
    case "borderRadius":
      return expandBorderRadius(value);
    
    case "animation":
      return expandAnimation(value);
    
    case "flex":
      return expandFlex(value);
    
    case "gap":
      return expandGap(value);
    
    case "overflow":
      return expandOverflow(value);
    
    case "background":
      // Background is complex; for simple cases, just use backgroundColor
      if (!value.includes("url") && !value.includes("gradient")) {
        return { backgroundColor: value };
      }
      return null;
    
    default:
      return null;
  }
}

// ============================================================================
// Property Name Conversion
// ============================================================================

/**
 * Convert kebab-case to camelCase
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to kebab-case
 */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Normalize a CSS property name to StyleX format (camelCase)
 */
export function normalizePropertyName(property: string): string {
  // Handle vendor prefixes
  if (property.startsWith("-webkit-")) {
    return "webkit" + kebabToCamel(property.slice(8)).replace(/^./, c => c.toUpperCase());
  }
  if (property.startsWith("-moz-")) {
    return "moz" + kebabToCamel(property.slice(5)).replace(/^./, c => c.toUpperCase());
  }
  if (property.startsWith("-ms-")) {
    return "ms" + kebabToCamel(property.slice(4)).replace(/^./, c => c.toUpperCase());
  }
  
  return kebabToCamel(property);
}
