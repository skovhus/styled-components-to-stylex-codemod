/**
 * Post-transform consumer patching for global selector bridges.
 *
 * After the target component is transformed and gets a bridge className,
 * patch unconverted consumer files to:
 *   1. Import the bridge's GlobalSelector variable from the target module
 *   2. Replace `${Component}` selector references with `${ComponentGlobalSelector}`
 */
import { readFileSync } from "node:fs";
import type { BridgeComponentResult } from "./transform-types.js";
import type { CrossFileSelectorUsage } from "./prepass/scan-cross-file-selectors.js";
import { isSelectorContext } from "./utilities/selector-context-heuristic.js";
interface ConsumerReplacement {
  /** Local name of the imported component in the consumer file */
  localName: string;
  /** Import source specifier (e.g. "./lib/collapse-arrow-icon") */
  importSource: string;
  /** The exported GlobalSelector variable name (e.g. "CollapseArrowIconGlobalSelector") */
  globalSelectorVarName: string;
  /** The original imported name ("default" or named) */
  importedName: string;
}

/**
 * Build a mapping from consumer file paths to their required replacements,
 * cross-referencing prepass selector usages with successful bridge results.
 */
export function buildConsumerReplacements(
  selectorUsages: Map<string, CrossFileSelectorUsage[]>,
  bridgeResults: Map<string, BridgeComponentResult[]>,
): Map<string, ConsumerReplacement[]> {
  const consumerReplacements = new Map<string, ConsumerReplacement[]>();

  // Build a lookup: targetPath:componentName → BridgeComponentResult
  // Also index by exportName (e.g. "default") for default-imported components
  const bridgeLookup = new Map<string, BridgeComponentResult>();
  for (const [targetPath, results] of bridgeResults) {
    for (const result of results) {
      bridgeLookup.set(`${targetPath}:${result.componentName}`, result);
      if (result.exportName && result.exportName !== result.componentName) {
        bridgeLookup.set(`${targetPath}:${result.exportName}`, result);
      }
    }
  }

  for (const [consumerPath, usages] of selectorUsages) {
    for (const usage of usages) {
      // Only patch unconverted consumers
      if (usage.consumerIsTransformed) {
        continue;
      }

      const bridge = bridgeLookup.get(`${usage.resolvedPath}:${usage.importedName}`);
      if (!bridge) {
        continue; // Target bailed or wasn't transformed
      }

      let replacements = consumerReplacements.get(consumerPath);
      if (!replacements) {
        replacements = [];
        consumerReplacements.set(consumerPath, replacements);
      }
      replacements.push({
        localName: usage.localName,
        importSource: usage.importSource,
        globalSelectorVarName: bridge.globalSelectorVarName,
        importedName: usage.importedName,
      });
    }
  }

  return consumerReplacements;
}

/**
 * Patch a single consumer file:
 *   1. Add import for each GlobalSelector variable
 *   2. Replace `${Component}` in styled template selectors with `${ComponentGlobalSelector}`
 *
 * Returns the patched source or null if no changes were made.
 */
export function patchConsumerFile(
  filePath: string,
  replacements: ConsumerReplacement[],
): string | null {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  if (replacements.length === 0) {
    return null;
  }

  // Group replacements by import source for efficient import merging
  const bySource = new Map<string, ConsumerReplacement[]>();
  for (const r of replacements) {
    let list = bySource.get(r.importSource);
    if (!list) {
      list = [];
      bySource.set(r.importSource, list);
    }
    list.push(r);
  }

  let modified = source;

  // Step 1: Add imports for GlobalSelector variables
  for (const [importSource, reps] of bySource) {
    const varNames = reps.map((r) => r.globalSelectorVarName);

    // Check if there's already an import from this source
    const importRegex = new RegExp(
      `(import\\s+(?:(?:\\{[^}]*\\}|[^;{]+)\\s+from\\s+['"]${escapeRegExp(importSource)}['"])\\s*;?)`,
    );
    const existingImport = modified.match(importRegex);

    if (existingImport) {
      // Try to merge into existing named import
      const namedImportRegex = new RegExp(
        `(import\\s+(?:[\\w$]+\\s*,\\s*)?\\{)([^}]*)(\\}\\s+from\\s+['"]${escapeRegExp(importSource)}['"]\\s*;?)`,
      );
      const namedMatch = modified.match(namedImportRegex);
      if (namedMatch) {
        const existingNames = namedMatch[2]!;
        const newNames = varNames.filter((name) => !hasExactImportName(existingNames, name));
        if (newNames.length > 0) {
          const separator = existingNames.trimEnd().endsWith(",") ? " " : ", ";
          modified = modified.replace(
            namedImportRegex,
            `$1${existingNames.trimEnd()}${separator}${newNames.join(", ")} $3`,
          );
        }
      } else {
        // Default-only import, add a new import statement after it
        const newImport = `import { ${varNames.join(", ")} } from "${importSource}";`;
        modified = modified.replace(importRegex, `$1\n${newImport}`);
      }
    } else {
      // No existing import from this source, add new import after last import
      const newImport = `import { ${varNames.join(", ")} } from "${importSource}";`;
      const lastImportIdx = modified.lastIndexOf("\nimport ");
      if (lastImportIdx !== -1) {
        // Find the actual end of the import statement (may span multiple lines)
        const importEnd = findImportEnd(modified, lastImportIdx + 1);
        modified = modified.slice(0, importEnd) + "\n" + newImport + modified.slice(importEnd);
      } else {
        // No imports at all, add at top
        modified = newImport + "\n" + modified;
      }
    }
  }

  // Step 2: Replace ${Component} in template literals with ${ComponentGlobalSelector}
  // Only replace in selector context (not value context)
  for (const r of replacements) {
    // Replace bare identifier references in template expressions: ${Foo} → ${FooGlobalSelector}
    // We need to be careful to only replace in selector contexts within styled template literals.
    // A simple approach: replace `${localName}` with `${globalSelectorVarName}` when followed
    // by selector-like patterns (whitespace + `{`, `:hover`, etc.)
    const templateExprRegex = new RegExp(`(\\$\\{\\s*)${escapeRegExp(r.localName)}(\\s*\\})`, "g");

    // For each match, check if it's in a selector context by examining surrounding text
    modified = modified.replace(templateExprRegex, (match, prefix, suffix, offset) => {
      // Check if this is inside a tagged template literal
      if (isInStyledTemplateSelectorContext(modified, offset, match.length)) {
        return `${prefix}${r.globalSelectorVarName}${suffix}`;
      }
      return match;
    });
  }

  return modified !== source ? modified : null;
}

// --- Non-exported helpers ---

/** Find the end position of an import statement starting at startIdx (handles multi-line imports). */
function findImportEnd(source: string, startIdx: number): number {
  const semiIdx = source.indexOf(";", startIdx);
  if (semiIdx === -1) {
    return source.indexOf("\n", startIdx);
  }
  return semiIdx + 1;
}

/** Check if a template expression at the given position is in a CSS selector context. */
function isInStyledTemplateSelectorContext(
  source: string,
  offset: number,
  length: number,
): boolean {
  const after = source.slice(offset + length).trimStart();
  const before = source.slice(Math.max(0, offset - 200), offset).trimEnd();
  return isSelectorContext(before, after);
}

/** Check if a name appears as a distinct identifier in an import specifier list string. */
function hasExactImportName(importSpecifiers: string, name: string): boolean {
  const re = new RegExp(`(?:^|[^A-Za-z0-9_$])${escapeRegExp(name)}(?:$|[^A-Za-z0-9_$])`);
  return re.test(importSpecifiers);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
