/**
 * Utilities for generating deterministic bridge classNames and export names.
 * Used when a converted component needs to remain targetable by unconverted
 * styled-components consumers via CSS selectors.
 */
/**
 * Simple FNV-1a hash producing an 8-char hex string.
 * Not cryptographic — just deterministic and collision-resistant enough
 * for generating stable CSS class names. Works in both Node.js and browsers.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime (32-bit)
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Generate a deterministic, stable CSS class name for a bridge component.
 * The hash is derived from the file path + component name so it's consistent
 * across runs but unique across different components.
 */
export function generateBridgeClassName(filePath: string, componentName: string): string {
  const hash = fnv1aHex(`${filePath}:${componentName}`);
  return `sc2sx-${componentName}-${hash}`;
}

/**
 * Generate the export variable name for a bridge component's global selector.
 * E.g., "Foo" → "FooGlobalSelector"
 */
export function bridgeExportName(componentName: string): string {
  return `${componentName}GlobalSelector`;
}
