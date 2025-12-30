/**
 * Adapter Interface
 *
 * Allows customizing how styled-components values are transformed to StyleX.
 * Users can provide their own adapter implementation via the CLI --adapter option.
 */

export interface AdapterContext {
  /** The original value path, e.g., "colors.primary" or "spacing.md" */
  path: string;
  /** The default/fallback value if available */
  defaultValue?: string;
  /** The type of value being transformed */
  valueType: "theme" | "helper" | "interpolation";
}

export interface Adapter {
  /**
   * Transform a value reference to StyleX-compatible code.
   * @param context - The context about the value being transformed
   * @returns StyleX-compatible value (string literal, variable reference, or expression)
   */
  transformValue(context: AdapterContext): string;

  /**
   * Generate any required imports for the transformed code.
   * @returns Array of import statements to add to the file
   */
  getImports(): string[];

  /**
   * Generate any required module-level declarations.
   * @returns Array of declaration statements (e.g., defineVars calls)
   */
  getDeclarations(): string[];
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
  getImports() {
    return [];
  },
  getDeclarations() {
    return [];
  },
};
