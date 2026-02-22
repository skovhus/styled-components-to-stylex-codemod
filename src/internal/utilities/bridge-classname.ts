/**
 * Utilities for generating deterministic bridge classNames and export names.
 * Used when a converted component needs to remain targetable by unconverted
 * styled-components consumers via CSS selectors.
 */
import { createHash } from "node:crypto";

/**
 * Generate a deterministic, stable CSS class name for a bridge component.
 * The hash is derived from the file path + component name so it's consistent
 * across runs but unique across different components.
 */
export function generateBridgeClassName(filePath: string, componentName: string): string {
  const hash = createHash("sha256")
    .update(`${filePath}:${componentName}`)
    .digest("hex")
    .slice(0, 8);
  return `sc2sx-${componentName}-${hash}`;
}

/**
 * Generate the export variable name for a bridge component's global selector.
 * E.g., "Foo" → "FooGlobalSelector"
 */
export function bridgeExportName(componentName: string): string {
  return `${componentName}GlobalSelector`;
}
