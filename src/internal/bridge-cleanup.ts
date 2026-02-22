/**
 * Post-transform cleanup of stale bridge artifacts.
 *
 * When consumers are later transformed (switching from bridge to marker path),
 * the target files may retain stale bridge artifacts from previous runs:
 *   1. `export const FooGlobalSelector = ".sc2sx-Foo-..."` declarations
 *   2. The `sc2sx-Foo-...` bridge className on the element
 *
 * This module detects and removes these stale artifacts.
 */
import { bridgeExportName } from "./utilities/bridge-classname.js";
import { escapeRegex } from "./utilities/string-utils.js";

export { detectBridgeExports, findStaleBridgeComponents, removeStaleBridgeArtifacts };

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Regex matching bridge GlobalSelector export statements. */
const BRIDGE_EXPORT_RE =
  /export\s+const\s+(\w+)GlobalSelector\s*=\s*"\.sc2sx-\w+-[0-9a-f]{8}"\s*;/g;

/**
 * Scan source code for existing bridge GlobalSelector exports.
 * Returns the component names that have bridge artifacts (e.g. "Foo" from "FooGlobalSelector").
 */
function detectBridgeExports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(BRIDGE_EXPORT_RE)) {
    names.push(match[1]!);
  }
  return names;
}

/**
 * Determine which bridge components in a file are stale.
 *
 * A bridge is stale when its component is NOT in the still-needed set
 * from `componentsNeedingGlobalSelectorBridge`.
 *
 * Handles the "default" entry: the prepass stores `"default"` for
 * default-exported components, while the bridge export uses the actual
 * local name. We resolve this by scanning the source for `export default`.
 */
function findStaleBridgeComponents(
  existingBridgeComponents: string[],
  stillNeeded: Set<string> | undefined,
  source: string,
): string[] {
  if (!stillNeeded || stillNeeded.size === 0) {
    return existingBridgeComponents;
  }
  return existingBridgeComponents.filter((name) => !isBridgeStillNeeded(name, stillNeeded, source));
}

// ---------------------------------------------------------------------------
// Removal
// ---------------------------------------------------------------------------

/**
 * Remove stale bridge artifacts from a source file.
 * Returns the cleaned source, or `null` if no changes were made.
 *
 * Removes per stale component:
 *   1. The `export const FooGlobalSelector = "..."` declaration (+ JSDoc comment)
 *   2. The `"sc2sx-Foo-<hash>"` bridge className from className expressions
 *
 * Then simplifies className expressions that became trivial.
 */
function removeStaleBridgeArtifacts(source: string, staleComponentNames: string[]): string | null {
  if (staleComponentNames.length === 0) {
    return null;
  }

  let modified = source;

  for (const name of staleComponentNames) {
    const varName = bridgeExportName(name);
    modified = removeGlobalSelectorExport(modified, varName);
    modified = removeBridgeClassName(modified, name);
  }

  modified = simplifyClassNameExpressions(modified);

  return modified !== source ? modified : null;
}

// ---------------------------------------------------------------------------
// Non-exported helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a bridge component is still needed, accounting for the
 * "default" entry that the prepass uses for default-exported components.
 */
function isBridgeStillNeeded(
  componentName: string,
  stillNeeded: Set<string>,
  source: string,
): boolean {
  if (stillNeeded.has(componentName)) {
    return true;
  }
  if (stillNeeded.has("default")) {
    const defaultName = resolveDefaultExportName(source);
    return defaultName === componentName;
  }
  return false;
}

/**
 * Extract the component name from `export default ComponentName`.
 */
function resolveDefaultExportName(source: string): string | undefined {
  const match = source.match(/export\s+default\s+(\w+)/);
  return match?.[1];
}

/**
 * Remove `export const FooGlobalSelector = ".sc2sx-...";` and its
 * preceding `@deprecated` JSDoc comment (if present).
 */
function removeGlobalSelectorExport(source: string, varName: string): string {
  // Try with JSDoc comment first (the common case)
  const jsdocAndExportRe = new RegExp(
    `(?:\\n\\s*)?/\\*\\*[\\s\\S]*?@deprecated[\\s\\S]*?\\*/\\s*\\nexport\\s+const\\s+${escapeRegex(varName)}\\s*=\\s*"[^"]*"\\s*;`,
  );
  const result = source.replace(jsdocAndExportRe, "");
  if (result !== source) {
    return result;
  }

  // Fallback: export without JSDoc
  const exportOnlyRe = new RegExp(
    `\\nexport\\s+const\\s+${escapeRegex(varName)}\\s*=\\s*"[^"]*"\\s*;`,
  );
  return source.replace(exportOnlyRe, "");
}

/**
 * Remove `"sc2sx-ComponentName-<hash>"` from className array literals.
 *
 * Handles:
 *   `["sc2sx-Foo-abc12345", sx.className]` → `[sx.className]`
 *   `["sc2sx-Foo-abc12345", sx.className, className]` → `[sx.className, className]`
 */
function removeBridgeClassName(source: string, componentName: string): string {
  // Remove the bridge className string + trailing comma from arrays
  const arrayItemRe = new RegExp(`"sc2sx-${escapeRegex(componentName)}-[0-9a-f]{8}",\\s*`, "g");
  let modified = source.replace(arrayItemRe, "");

  // Handle standalone className attribute: className={"sc2sx-Foo-hash"} or className="sc2sx-Foo-hash"
  // When bridge is the only className value, remove the attribute entirely.
  const attrExprRe = new RegExp(
    `\\s*className=\\{?"sc2sx-${escapeRegex(componentName)}-[0-9a-f]{8}"\\}?`,
    "g",
  );
  modified = modified.replace(attrExprRe, "");

  return modified;
}

/**
 * Simplify className expressions that became trivial after bridge removal.
 *
 * `className={[sx.className].filter(Boolean).join(" ")}` → no longer needed
 * when `{...sx}` already spreads the className. However, removing the attribute
 * requires knowing about the surrounding JSX which is fragile with regex.
 *
 * Instead we simplify to `className={sx.className}` which is functionally
 * equivalent and will be cleaned up by formatters/linters.
 */
function simplifyClassNameExpressions(source: string): string {
  return source.replace(/\[sx\.className\]\.filter\(Boolean\)\.join\(" "\)/g, "sx.className");
}
