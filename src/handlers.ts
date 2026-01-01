/**
 * Built-in Dynamic Node Handlers
 *
 * Default handlers for common styled-components patterns.
 * Users can compose these with their own handlers for customization.
 */

import type { DynamicNodeHandler, DynamicNodeDecision } from "./adapter.js";

/**
 * Handler for static value interpolations
 * Handles: ${variable}, ${object.property}, ${value}
 */
export const staticValueHandler: DynamicNodeHandler = (ctx): DynamicNodeDecision | undefined => {
  if (ctx.type !== "static") return undefined;

  // Return the variable reference directly
  return {
    action: "convert",
    value: ctx.sourceCode,
  };
};

/**
 * Handler for keyframes references
 * Handles: animation: ${rotate} 2s linear
 */
export const keyframesHandler: DynamicNodeHandler = (ctx): DynamicNodeDecision | undefined => {
  if (ctx.type !== "keyframes") return undefined;

  // Return the keyframes identifier reference
  return {
    action: "convert",
    value: ctx.keyframesName ?? ctx.sourceCode,
  };
};

/**
 * Handler for conditional/ternary expressions
 * Handles: ${props => props.$primary ? 'value1' : 'value2'}
 * Generates variant styles or inline ternary
 */
export const conditionalHandler: DynamicNodeHandler = (ctx): DynamicNodeDecision | undefined => {
  if (ctx.type !== "conditional" || !ctx.conditionalBranches) return undefined;

  const { truthy, falsy, propName } = ctx.conditionalBranches;

  // Clean up quoted values
  const cleanTruthy = cleanValue(truthy);
  const cleanFalsy = cleanValue(falsy);

  if (!propName) {
    // Can't determine prop name, but we can still convert to an inline ternary
    // This preserves the conditional logic for manual review
    return {
      action: "convert",
      value: `${cleanFalsy}`, // Use the falsy value as default
    };
  }

  // Generate variant styles
  const variantName = propNameToVariantName(propName);

  return {
    action: "variant",
    baseValue: cleanFalsy,
    variants: [
      {
        name: variantName,
        styles: ctx.cssProperty ? { [ctx.cssProperty]: cleanTruthy } : {},
      },
    ],
    propName,
  };
};

/**
 * Handler for logical expressions (short-circuit evaluation)
 * Handles: ${props => props.$upsideDown && 'transform: rotate(180deg);'}
 */
export const logicalHandler: DynamicNodeHandler = (ctx): DynamicNodeDecision | undefined => {
  if (ctx.type !== "logical" || !ctx.logicalInfo) return undefined;

  const { propName, value } = ctx.logicalInfo;

  if (!propName) {
    return {
      action: "bail",
      reason: `Cannot extract prop name from logical expression: ${ctx.logicalInfo.condition}`,
    };
  }

  // Clean up the value (might be CSS declarations string)
  const cleanedValue = cleanValue(value);

  // Generate variant styles
  const variantName = propNameToVariantName(propName);

  // If the value contains CSS declarations (multiple properties)
  if (cleanedValue.includes(":") && !ctx.cssProperty) {
    // This is a CSS snippet, need special handling
    return {
      action: "variant",
      baseValue: "",
      variants: [
        {
          name: variantName,
          styles: parseCSSSnippet(cleanedValue),
        },
      ],
      propName,
    };
  }

  return {
    action: "variant",
    baseValue: "",
    variants: [
      {
        name: variantName,
        styles: ctx.cssProperty ? { [ctx.cssProperty]: cleanedValue } : {},
      },
    ],
    propName,
  };
};

/**
 * Handler for theme access patterns
 * Handles: ${props => props.theme.colors.primary}
 */
export const themeAccessHandler: DynamicNodeHandler = (ctx): DynamicNodeDecision | undefined => {
  if (ctx.type !== "prop-access" || !ctx.isThemeAccess || !ctx.propPath) {
    return undefined;
  }

  // Extract theme path (skip 'props' and 'theme')
  const themePath = ctx.propPath.filter((p) => p !== "props" && p !== "theme" && p !== "p");

  if (themePath.length === 0) {
    return {
      action: "bail",
      reason: `Cannot extract theme path from: ${ctx.sourceCode}`,
    };
  }

  // Generate CSS variable reference
  const varName = themePath.join("-");

  return {
    action: "convert",
    value: `'var(--${varName})'`,
  };
};

/**
 * Handler for prop access that generates dynamic style functions
 * Handles: ${props => props.$padding}
 */
export const propAccessHandler: DynamicNodeHandler = (ctx): DynamicNodeDecision | undefined => {
  if (ctx.type !== "prop-access" || ctx.isThemeAccess) {
    return undefined;
  }

  if (!ctx.propPath || ctx.propPath.length === 0) {
    return {
      action: "bail",
      reason: `Cannot extract prop path from: ${ctx.sourceCode}`,
    };
  }

  // Get the prop name (last element, after 'props' or 'p')
  const propName = ctx.propPath[ctx.propPath.length - 1];
  if (!propName) {
    return {
      action: "bail",
      reason: `Empty prop path in: ${ctx.sourceCode}`,
    };
  }

  // Generate a dynamic style function
  return {
    action: "dynamic-fn",
    paramName: cleanPropName(propName),
    paramType: "string",
    valueExpression: cleanPropName(propName),
  };
};

/**
 * Handler for helper function calls
 * Handles: ${helperFn()}, ${css`...`}
 */
export const helperHandler: DynamicNodeHandler = (ctx): DynamicNodeDecision | undefined => {
  if (ctx.type !== "helper") return undefined;

  // For CSS helpers that return style snippets, we can try to inline them
  // The user may need to create a corresponding StyleX helper
  if (ctx.helperName === "css") {
    // css`` tagged template - inline the helper reference
    return {
      action: "convert",
      value: ctx.sourceCode,
    };
  }

  // For helper function calls, preserve them (they may be CSS snippet helpers)
  // These can be spreaded in StyleX
  return {
    action: "convert",
    value: ctx.sourceCode,
  };
};

/**
 * Handler for component selectors
 * Handles: ${OtherComponent}:hover &
 */
export const componentSelectorHandler: DynamicNodeHandler = (
  ctx,
): DynamicNodeDecision | undefined => {
  if (ctx.type !== "component") return undefined;

  // Component selectors in styled-components (e.g., ${Link}:hover &)
  // are used for parent-based styling. In StyleX, this needs to be
  // refactored to use a different approach (e.g., data attributes).
  // For now, we preserve the reference but won't generate a warning
  // unless it's actually used in a selector context.
  if (ctx.isInSelector) {
    // Only bail if actually in a selector - this truly can't be converted
    return {
      action: "bail",
      reason: `Component selector ${ctx.sourceCode} in selector is not supported in StyleX. Manual refactor required.`,
    };
  }

  // If component reference is in a value context, just preserve it
  return {
    action: "convert",
    value: ctx.sourceCode,
  };
};

/**
 * All default handlers in priority order
 */
export const defaultHandlers: DynamicNodeHandler[] = [
  staticValueHandler,
  keyframesHandler,
  conditionalHandler,
  logicalHandler,
  themeAccessHandler,
  propAccessHandler,
  helperHandler,
  componentSelectorHandler,
];

// Helper functions

/**
 * Clean up a value string (remove quotes, trim)
 */
function cleanValue(value: string): string {
  let cleaned = value.trim();

  // Remove surrounding quotes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove template literal backticks
  if (cleaned.startsWith("`") && cleaned.endsWith("`")) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned.trim();
}

/**
 * Convert a prop name to a variant style name
 * $primary -> Primary, $isActive -> IsActive
 */
function propNameToVariantName(propName: string): string {
  // Remove $ prefix if present
  const cleanName = propName.startsWith("$") ? propName.slice(1) : propName;

  // Capitalize first letter
  return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
}

/**
 * Clean a prop name (remove $ prefix)
 */
function cleanPropName(propName: string): string {
  return propName.startsWith("$") ? propName.slice(1) : propName;
}

/**
 * Parse a CSS snippet string into style object
 */
function parseCSSSnippet(css: string): Record<string, string | number> {
  const styles: Record<string, string | number> = {};

  // Split by semicolons
  const declarations = css.split(";").filter((d) => d.trim());

  for (const decl of declarations) {
    const colonIndex = decl.indexOf(":");
    if (colonIndex === -1) continue;

    const prop = decl.slice(0, colonIndex).trim();
    const value = decl.slice(colonIndex + 1).trim();

    // Convert kebab-case to camelCase
    const camelProp = prop.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

    // Try to parse numeric values
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && value === String(numValue)) {
      styles[camelProp] = numValue;
    } else {
      styles[camelProp] = value;
    }
  }

  return styles;
}
