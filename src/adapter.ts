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
  /**
   * For prop-accessor helper calls like:
   *   ${(props) => getColor(props.$variant)}
   *
   * The extracted member-path for the first argument (if available).
   */
  helperCallArgPropPath?: string[];
  /**
   * If the helper function is a simple ternary helper (analyzed by the transformer),
   * this carries the extracted info for use by handlers.
   */
  helperTernary?: {
    helperName: string;
    paramName: string;
    comparisonValue: string;
    truthy: string;
    falsy: string;
  };
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
  /** Optional comparison value for wrapper generation (e.g., "large" from size === "large") */
  comparisonValue?: string;
  /** Optional comparison operator for wrapper generation */
  comparisonOperator?: "===" | "!==";
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
      /**
       * Back-compat: comparison value applied to all variants if variant.comparisonValue isn't set.
       * Prefer setting comparisonValue/operator on each VariantStyle.
       */
      comparisonValue?: string;
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
      /** Optional fallback value for the base style (for || patterns) */
      fallbackValue?: string | number;
      /** Original prop name for wrapper generation (e.g., "color" for props.color || default) */
      originalPropName?: string;
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
  | "throw"; // Fail the transform

/**
 * Result from resolving a CSS variable
 */
export interface CssVariableResolution {
  /** The code to use in place of var(--name) */
  code: string;
  /** Additional imports needed */
  imports?: string[];
}

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

  /**
   * Resolve a CSS variable reference to StyleX-compatible code.
   * Called when encountering var(--name) or var(--name, fallback) in CSS values.
   * Return undefined to keep the original var() syntax.
   * @param name - The CSS variable name without -- prefix (e.g., "color-primary")
   * @param fallback - Optional fallback value from var(--name, fallback)
   * @returns Resolution with code and imports, or undefined to keep original
   */
  resolveCssVariable?(name: string, fallback?: string): CssVariableResolution | undefined;

  /**
   * Resolve a theme path to StyleX-compatible code.
   * Called for props.theme.x.y access patterns.
   * Return undefined to use default handling.
   * @param pathParts - The path parts after "theme" (e.g., ["colors", "primary"])
   * @returns Resolution with code and imports, or undefined for default handling
   */
  resolveThemePath?(pathParts: string[]): CssVariableResolution | undefined;
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
