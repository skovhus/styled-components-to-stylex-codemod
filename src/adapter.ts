/**
 * Adapter Interface
 *
 * Allows customizing how styled-components values are transformed to StyleX.
 * Users can provide their own adapter implementation via the CLI --adapter option.
 *
 * The adapter also serves as the plugin system for handling dynamic nodes,
 * giving users full control over how interpolations are converted.
 */

import type { Expression } from "jscodeshift";
import type { InterpolationType, ConditionalBranches, LogicalInfo } from "./interpolation.js";

/**
 * Context for simple value transformation
 */
export interface AdapterContext {
  /** The original value path, e.g., "colors.primary" or "spacing.md" */
  path: string;
  /** The default/fallback value if available */
  defaultValue?: string;
  /** The type of value being transformed */
  valueType: "theme" | "helper" | "interpolation";
}

/**
 * Rich context provided to handlers for dynamic nodes
 */
export interface DynamicNodeContext {
  // Interpolation details
  /** The classified interpolation type */
  type: InterpolationType;
  /** Index of this interpolation in the template literal */
  index: number;

  // CSS context - where this interpolation appears
  /** The CSS property name (camelCase), null if in selector */
  cssProperty: string | null;
  /** The raw value string with placeholder */
  cssValue: string;
  /** The selector this declaration belongs to */
  selector: string;
  /** True if the interpolation is within a selector */
  isInSelector: boolean;
  /** True if the interpolation is a property name */
  isInPropertyName: boolean;
  /** True if the interpolation spans the entire value */
  isFullValue: boolean;

  // Source context
  /** Path to the source file */
  filePath: string;
  /** Name of the styled component being transformed */
  componentName: string;
  /** The original expression as source code */
  sourceCode: string;

  // Semantic analysis (when available)
  /** Extracted prop path for prop-access types, e.g., ['theme', 'colors', 'primary'] */
  propPath: string[] | undefined;
  /** Whether this accesses theme */
  isThemeAccess: boolean | undefined;
  /** Conditional branch info for conditional types */
  conditionalBranches: ConditionalBranches | undefined;
  /** Logical expression info for logical types */
  logicalInfo: LogicalInfo | undefined;
  /** For helpers, the function name */
  helperName: string | undefined;
  /** For keyframes, the keyframes identifier name */
  keyframesName: string | undefined;

  // AST access for advanced manipulation
  /** The original expression AST node */
  expression: Expression;
}

/**
 * Variant style definition for conditional patterns
 */
export interface VariantStyle {
  /** The variant name (will become a style key) */
  name: string;
  /** The style properties for this variant */
  styles: Record<string, string | number>;
}

/**
 * Decision returned by a dynamic node handler
 */
export type DynamicNodeDecision =
  | {
      /** Convert the interpolation to a static StyleX value */
      action: "convert";
      /** The StyleX-compatible value */
      value: string | number;
      /** Additional imports needed */
      imports?: string[];
    }
  | {
      /** Rewrite the expression to a different form */
      action: "rewrite";
      /** The new expression code */
      code: string;
      /** Additional imports needed */
      imports?: string[];
    }
  | {
      /** Skip transformation with a warning */
      action: "bail";
      /** Reason for bailing */
      reason: string;
    }
  | {
      /** Generate variant styles for conditional values */
      action: "variant";
      /** The base (default) value */
      baseValue: string | number;
      /** Variant definitions */
      variants: VariantStyle[];
      /** The prop name that controls the variant */
      propName: string;
    }
  | {
      /** Generate a dynamic style function */
      action: "dynamic-fn";
      /** Parameter name for the function */
      paramName: string;
      /** Parameter type (TypeScript) */
      paramType?: string;
      /** The dynamic value expression using the parameter */
      valueExpression: string;
    };

/**
 * Handler function for dynamic nodes
 */
export type DynamicNodeHandler = (context: DynamicNodeContext) => DynamicNodeDecision | undefined;

/**
 * Fallback behavior when no handler claims a node
 */
export type FallbackBehavior =
  | "bail" // Skip with warning (default)
  | "inline-comment" // Insert TODO comment in output
  | "throw"; // Fail the transform

/**
 * Adapter interface for customizing the transform
 */
export interface Adapter {
  /**
   * Transform a simple value reference to StyleX-compatible code.
   * Called for theme accessors and simple interpolations.
   * @param context - The context about the value being transformed
   * @returns StyleX-compatible value (string literal, variable reference, or expression)
   */
  transformValue(context: AdapterContext): string;

  /**
   * Handle a dynamic interpolation node.
   * Called for each ${...} expression in template literals.
   * Return undefined to delegate to the handlers array or use default handling.
   * @param context - Rich context about the dynamic node
   * @returns A decision object, or undefined to delegate
   */
  handleDynamicNode?(context: DynamicNodeContext): DynamicNodeDecision | undefined;

  /**
   * Additional handlers to try after handleDynamicNode.
   * Handlers are called in order; first non-undefined response wins.
   */
  handlers?: DynamicNodeHandler[];

  /**
   * What to do when no handler claims the node.
   * - 'bail': Skip with warning (default)
   * - 'inline-comment': Insert TODO comment in output
   * - 'throw': Fail the transform
   */
  fallbackBehavior?: FallbackBehavior;

  /**
   * Generate imports to add to the file.
   * @returns Array of import statements to add to the file
   */
  getImports(): string[];

  /**
   * Generate module-level declarations.
   * @returns Array of declaration statements (e.g., defineVars calls)
   */
  getDeclarations(): string[];
}

/**
 * Execute the handler chain for a dynamic node
 */
export function executeDynamicNodeHandlers(
  context: DynamicNodeContext,
  adapter: Adapter,
): DynamicNodeDecision | undefined {
  // First try the adapter's main handler
  if (adapter.handleDynamicNode) {
    const decision = adapter.handleDynamicNode(context);
    if (decision !== undefined) {
      return decision;
    }
  }

  // Then try the handlers array
  if (adapter.handlers) {
    for (const handler of adapter.handlers) {
      const decision = handler(context);
      if (decision !== undefined) {
        return decision;
      }
    }
  }

  return undefined;
}

/**
 * Get the fallback decision when no handler claims a node
 */
export function getFallbackDecision(
  context: DynamicNodeContext,
  behavior: FallbackBehavior = "bail",
): DynamicNodeDecision {
  switch (behavior) {
    case "bail":
      return {
        action: "bail",
        reason: `No handler for ${context.type} interpolation: ${context.sourceCode}`,
      };
    case "inline-comment":
      return {
        action: "rewrite",
        code: `/* TODO: Convert interpolation: ${context.sourceCode} */ null`,
      };
    case "throw":
      throw new Error(
        `No handler for ${context.type} interpolation in ${context.componentName}: ${context.sourceCode}`,
      );
  }
}

/**
 * Default adapter: Uses CSS custom properties with fallbacks.
 * Generates: `color: 'var(--colors-primary, #BF4F74)'`
 */
export const defaultAdapter: Adapter = {
  transformValue({ path, defaultValue }) {
    const varName = path.replace(/\./g, "-");
    if (defaultValue) {
      return `'var(--${varName}, ${defaultValue})'`;
    }
    return `'var(--${varName})'`;
  },

  handlers: [],
  fallbackBehavior: "bail",

  getImports() {
    return [];
  },

  getDeclarations() {
    return [];
  },
};

/**
 * Create an adapter with custom handlers
 */
export function createAdapter(options: Partial<Adapter>): Adapter {
  return {
    ...defaultAdapter,
    ...options,
    handlers: options.handlers ?? defaultAdapter.handlers ?? [],
  };
}

// =============================================================================
// Built-in Dynamic Node Handlers
//
// Default handlers for common styled-components patterns.
// Users can compose these with their own handlers for customization.
// =============================================================================

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

// Handler helper functions

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
