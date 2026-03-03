/**
 * Post-transform consumer patching for `as` → `forwardedAs`.
 *
 * When a component (e.g., `Flex`) is converted from styled-components to StyleX,
 * unconverted consumer files that wrap it with `styled(Flex)` break when using
 * the `as` prop — styled-components intercepts `as` and replaces `Flex` entirely,
 * losing all StyleX styles.
 *
 * `forwardedAs` tells styled-components to pass the prop through to the wrapped
 * component's own `as` prop, preserving StyleX styles.
 */
import { readFileSync, realpathSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { escapeRegex } from "./utilities/string-utils.js";

/* ── Public types ─────────────────────────────────────────────────────── */

interface ForwardedAsConsumerEntry {
  localStyledName: string;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Filter prepass consumers to exclude files that were actually transformed.
 * Returns a map of consumer paths → entries to patch.
 */
export function buildForwardedAsReplacements(
  prepassConsumers: ReadonlyMap<string, readonly ForwardedAsConsumerEntry[]>,
  transformedFiles: ReadonlySet<string>,
): Map<string, ForwardedAsConsumerEntry[]> {
  const result = new Map<string, ForwardedAsConsumerEntry[]>();

  for (const [consumerPath, entries] of prepassConsumers) {
    // Skip consumers that were actually transformed (they no longer use styled-components)
    if (transformedFiles.has(toRealPath(consumerPath))) {
      continue;
    }

    if (entries.length > 0) {
      result.set(consumerPath, [...entries]);
    }
  }

  return result;
}

/**
 * Patch a single consumer file: replace `as` with `forwardedAs` in JSX props
 * and `.attrs()` calls for the given styled wrapper components.
 *
 * Returns the patched source or `null` if no changes were made.
 */
export function patchConsumerForwardedAs(
  filePath: string,
  entries: readonly ForwardedAsConsumerEntry[],
): string | null {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  if (entries.length === 0) {
    return null;
  }

  let modified = source;

  for (const { localStyledName } of entries) {
    modified = patchJsxAsProp(modified, localStyledName);
    modified = patchAttrsAsProp(modified, localStyledName);
  }

  return modified !== source ? modified : null;
}

/* ── Non-exported helpers ─────────────────────────────────────────────── */

/**
 * Replace `as=` with `forwardedAs=` in JSX tags for the given component name.
 * Handles both `as="span"` and `as={expr}` forms.
 * Skips tags that already contain `forwardedAs`.
 */
function patchJsxAsProp(source: string, componentName: string): string {
  // Match JSX open tags: `<ComponentName ...as=`
  // [^<>]* avoids crossing tag boundaries
  const tagRegex = new RegExp(`(<${escapeRegex(componentName)}\\b[^<>]*)\\bas(\\s*[={])`, "g");

  return source.replace(tagRegex, (match, before: string, after: string) => {
    // Skip if `forwardedAs` already present in this tag
    if (before.includes("forwardedAs") || match.includes("forwardedAs")) {
      return match;
    }
    return `${before}forwardedAs${after}`;
  });
}

/**
 * Replace `as:` with `forwardedAs:` in `.attrs({...})` calls on the styled
 * declaration for the given component name.
 * Skips attrs blocks that already contain `forwardedAs`.
 */
function patchAttrsAsProp(source: string, componentName: string): string {
  // Match: `const ComponentName ... .attrs( ... as: ... )`
  const attrsRegex = new RegExp(
    `(const\\s+${escapeRegex(componentName)}\\b[^;]*\\.attrs\\s*\\([^)]*?)\\bas(\\s*:)`,
    "g",
  );

  return source.replace(attrsRegex, (match, before: string, after: string) => {
    // Skip if `forwardedAs` already present in the attrs block
    if (before.includes("forwardedAs")) {
      return match;
    }
    return `${before}forwardedAs${after}`;
  });
}

/** Resolve symlinks so paths match the keys in transformedFiles. */
function toRealPath(filePath: string): string {
  const resolved = pathResolve(filePath);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}
