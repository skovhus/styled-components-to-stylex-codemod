/**
 * Post-transform consumer patching for transient prop renames.
 *
 * When a component (e.g., `CollapseArrowIcon`) is converted from styled-components
 * to a plain function, its `$`-prefixed props are renamed (e.g., `$isOpen` → `isOpen`).
 * Unconverted consumer files that use `<CollapseArrowIcon $isOpen={...} />` must be
 * patched to use the new prop names.
 */
import { readFileSync } from "node:fs";
import { escapeRegex } from "./utilities/string-utils.js";

/* ── Public types ─────────────────────────────────────────────────────── */

interface TransientPropConsumerEntry {
  /** Local name of the component in the consumer file */
  localComponentName: string;
  /** Map of original $-prefixed prop names to their renamed versions */
  renames: Record<string, string>;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Scan a consumer file's imports to find which renamed components it uses.
 * Returns entries for components that are imported from the target file.
 *
 * `exportName` is checked against both named imports (`import { X }`)
 * and default imports (`import X`). Aliased imports are handled:
 * `import { CollapseArrowIcon as Arrow }` returns `localComponentName: "Arrow"`.
 */
export function findImportedRenamedComponents(
  consumerSource: string,
  targetImportSources: ReadonlySet<string>,
  componentRenames: ReadonlyArray<{ exportName: string; renames: Record<string, string> }>,
): TransientPropConsumerEntry[] {
  const entries: TransientPropConsumerEntry[] = [];

  for (const { exportName, renames } of componentRenames) {
    const localName = findLocalImportName(consumerSource, targetImportSources, exportName);
    if (localName) {
      entries.push({ localComponentName: localName, renames });
    }
  }

  return entries;
}

/**
 * Patch source code: rename `$prop` → `prop` in JSX attributes
 * for the given components.
 *
 * Returns the patched source or `null` if no changes were made.
 */
export function patchSourceTransientProps(
  source: string,
  entries: readonly TransientPropConsumerEntry[],
): string | null {
  if (entries.length === 0) {
    return null;
  }

  let modified = source;

  for (const { localComponentName, renames } of entries) {
    modified = patchJsxTransientProps(modified, localComponentName, renames);
  }

  return modified !== source ? modified : null;
}

/**
 * Patch a single consumer file: rename `$prop` → `prop` in JSX attributes
 * for the given components.
 *
 * Returns the patched source or `null` if no changes were made.
 */
export function patchConsumerTransientProps(
  filePath: string,
  entries: readonly TransientPropConsumerEntry[],
): string | null {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  return patchSourceTransientProps(source, entries);
}

/* ── Non-exported helpers ─────────────────────────────────────────────── */

/**
 * Find the local name for an imported component.
 * Checks named imports (`import { X }`, `import { X as Y }`),
 * default imports (`import X`), and namespace re-exports.
 */
function findLocalImportName(
  source: string,
  targetImportSources: ReadonlySet<string>,
  exportName: string,
): string | null {
  const importRegex =
    /import\s+(type\s+)?(?:({[^}]+})|(\w+)(?:\s*,\s*({[^}]+}))?)\s+from\s+["']([^"']+)["']/g;

  for (const match of source.matchAll(importRegex)) {
    const isTypeOnly = !!match[1];
    if (isTypeOnly) {
      continue;
    }
    const importSource = match[5];
    if (!importSource || !targetImportSources.has(importSource)) {
      continue;
    }

    const defaultImport = match[3];
    const namedImports = match[2] ?? match[4];

    if (exportName === "default" && defaultImport) {
      return defaultImport;
    }

    if (namedImports) {
      const specifierRegex = new RegExp(
        `\\b${escapeRegex(exportName)}\\s+as\\s+(\\w+)|\\b(${escapeRegex(exportName)})\\b`,
        "g",
      );
      for (const specMatch of namedImports.matchAll(specifierRegex)) {
        const aliased = specMatch[1];
        const direct = specMatch[2];
        if (aliased) {
          return aliased;
        }
        if (direct) {
          return direct;
        }
      }
    }
  }

  return null;
}

/**
 * Rename `$prop` → `prop` in JSX attributes for a specific component.
 * Matches `<ComponentName ... $propName=` and `<ComponentName ... $propName>`
 * (shorthand boolean).
 */
function patchJsxTransientProps(
  source: string,
  componentName: string,
  renames: Record<string, string>,
): string {
  let result = source;

  for (const [original, renamed] of Object.entries(renames)) {
    const escapedComponent = escapeRegex(componentName);
    const escapedProp = escapeRegex(original);

    // Match $prop as a JSX attribute inside a <ComponentName ...> tag.
    // Uses non-greedy [^<>]*? to avoid consuming the prop itself,
    // and a lookahead for whitespace or =/>  to confirm it's a full attribute name.
    const tagRegex = new RegExp(
      `(<${escapedComponent}\\b[^<>]*?\\s)${escapedProp}(?=[\\s=/>])`,
      "g",
    );

    result = result.replace(tagRegex, `$1${renamed}`);
  }

  return result;
}
