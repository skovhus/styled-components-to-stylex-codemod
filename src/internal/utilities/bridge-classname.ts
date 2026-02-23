/**
 * Utilities for generating deterministic bridge classNames and export names.
 * Used when a converted component needs to remain targetable by unconverted
 * styled-components consumers via CSS selectors.
 */

export {
  generateBridgeClassName,
  bridgeExportName,
  bridgeClassVarName,
  getBridgeClassVar,
  extractBridgeComponentNames,
  hasBridgeGlobalSelectorExport,
  GLOBAL_SELECTOR_SUFFIX,
};

/* ── Constants ────────────────────────────────────────────────────────── */

/** Suffix for bridge GlobalSelector exports. */
const GLOBAL_SELECTOR_SUFFIX = "GlobalSelector";

/**
 * Regex matching bridge GlobalSelector export patterns (global for matchAll).
 * Matches both:
 *   - Old format: `export const XGlobalSelector = ".sc2sx-..."`
 *   - New format: `` export const XGlobalSelector = `.${xBridgeClass}` ``
 */
const BRIDGE_EXPORT_RE = /export\s+const\s+(\w+GlobalSelector)\s*=\s*(?:["']\.sc2sx-|`\.\$\{)/g;

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Generate a deterministic, stable CSS class name for a bridge component.
 * The hash is derived from the file path + component name so it's consistent
 * across runs but unique across different components.
 */
function generateBridgeClassName(filePath: string, componentName: string): string {
  const hash = fnv1aHex(`${filePath}:${componentName}`);
  return `sc2sx-${componentName}-${hash}`;
}

/**
 * Generate the export variable name for a bridge component's global selector.
 * E.g., "Foo" → "FooGlobalSelector"
 */
function bridgeExportName(componentName: string): string {
  return `${componentName}${GLOBAL_SELECTOR_SUFFIX}`;
}

/**
 * Extract component names from bridge GlobalSelector exports in source code.
 * Returns the component names (e.g., ["Foo", "Bar"] from "FooGlobalSelector", "BarGlobalSelector").
 */
function extractBridgeComponentNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(BRIDGE_EXPORT_RE)) {
    const fullName = match[1]!;
    const componentName = fullName.slice(0, -GLOBAL_SELECTOR_SUFFIX.length);
    names.push(componentName);
  }
  return names;
}

/**
 * Check if a specific GlobalSelector export exists in the source.
 * Used during prepass to verify a bridge export before treating an import as a bridge.
 *
 * @param source File content to search
 * @param globalSelectorName Full export name (e.g., "FooGlobalSelector")
 * @returns true if the export exists
 */
function hasBridgeGlobalSelectorExport(source: string, globalSelectorName: string): boolean {
  for (const m of source.matchAll(BRIDGE_EXPORT_RE)) {
    if (m[1] === globalSelectorName) {
      return true;
    }
  }
  return false;
}

/**
 * Generate the internal const variable name for the bridge class value.
 * E.g., "Foo" → "fooBridgeClass", "ScrollableDiv" → "scrollableDivBridgeClass"
 */
function bridgeClassVarName(componentName: string): string {
  return `${componentName.charAt(0).toLowerCase()}${componentName.slice(1)}BridgeClass`;
}

/**
 * If a declaration has a bridge className, return the internal const variable
 * name that references it. Returns `undefined` when no bridge is needed.
 */
function getBridgeClassVar(decl: {
  bridgeClassName?: string;
  localName: string;
}): string | undefined {
  return decl.bridgeClassName ? bridgeClassVarName(decl.localName) : undefined;
}

/* ── Non-exported helpers ─────────────────────────────────────────────── */

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
