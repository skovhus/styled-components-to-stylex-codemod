/**
 * Step: detect cascade conflicts when styled(ImportedComponent) wraps a component
 * whose file contains internal styled-components. With StyleX's atomic CSS, the
 * override may lose depending on class insertion order — bail with a clear warning.
 */
import { readFileSync } from "node:fs";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";

export function detectCascadeConflictStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls;
  if (!styledDecls || styledDecls.length === 0) {
    return CONTINUE;
  }

  const importMap = ctx.importMap;
  if (!importMap) {
    return CONTINUE;
  }

  const styledDefFiles = ctx.options.crossFileInfo?.styledDefFiles;

  // Build lookup of locally defined styled-component names for exclusion
  const localStyledNames = new Set(styledDecls.map((d) => d.localName));

  for (const decl of styledDecls) {
    if (decl.base.kind !== "component") {
      continue;
    }

    const baseIdent = decl.base.ident;

    // Skip if the base is a locally defined styled-component (delegation handles it)
    if (localStyledNames.has(baseIdent)) {
      continue;
    }

    // Check if the base is an imported component
    const importEntry = importMap.get(baseIdent);
    if (!importEntry || importEntry.source.kind !== "absolutePath") {
      continue;
    }

    const importedPath = importEntry.source.value;

    // Check if the imported file contains styled-components.
    // Prefer prepass data when available, but fall back to direct file scan if the
    // prepass map misses the path (e.g., file outside the configured prepass set).
    const styledNames =
      (styledDefFiles && resolveStyledDefFile(importedPath, styledDefFiles)) ||
      scanFileForStyledDefs(importedPath);

    if (!styledNames) {
      continue;
    }

    // If the imported name IS one of the styled-component definitions in that file,
    // it's a direct styled export — delegation handles this case
    if (styledNames.has(importEntry.importedName) || styledNames.has(baseIdent)) {
      continue;
    }

    // The import is a function component that wraps internal styled-components — bail
    ctx.warnings.push({
      severity: "warning",
      type: "styled(ImportedComponent) wraps a component whose file contains internal styled-components — convert the base component's file first to avoid CSS cascade conflicts",
      loc: decl.loc,
      context: { component: decl.localName, base: baseIdent },
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}

// --- Non-exported helpers ---

/** Common TypeScript/JavaScript file extensions to try when matching import paths to styledDefFiles keys. */
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

/** Regex matching styled-component definitions: `const Name = styled.tag` or `const Name = styled(Component)` */
const STYLED_DEF_RE = /const\s+([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled[.(]/g;

/**
 * Resolve an import path to a styledDefFiles entry. The importMap stores resolved
 * absolute paths (without extension when the import omits it), while styledDefFiles
 * keys include the full extension. Try exact match first, then with common extensions.
 */
function resolveStyledDefFile(
  importedPath: string,
  styledDefFiles: Map<string, Set<string>>,
): Set<string> | undefined {
  const exact = styledDefFiles.get(importedPath);
  if (exact) {
    return exact;
  }
  for (const ext of EXTENSIONS) {
    const withExt = styledDefFiles.get(importedPath + ext);
    if (withExt) {
      return withExt;
    }
  }
  return undefined;
}

/**
 * Fallback: read an imported file and scan for styled-component definitions.
 * Used when styledDefFiles is not available (single-file mode, tests without prepass).
 */
function scanFileForStyledDefs(importedPath: string): Set<string> | undefined {
  const source = tryReadFile(importedPath);
  if (!source || !source.includes("styled-components")) {
    return undefined;
  }

  const names = new Set<string>();
  STYLED_DEF_RE.lastIndex = 0;
  for (const m of source.matchAll(STYLED_DEF_RE)) {
    if (m[1]) {
      names.add(m[1]);
    }
  }

  return names.size > 0 ? names : undefined;
}

/**
 * Try reading a file at the given path, with extension fallback.
 * Import paths may lack extensions; tries exact match then common extensions.
 */
function tryReadFile(importedPath: string): string | undefined {
  const candidates = [importedPath, ...EXTENSIONS.map((ext) => importedPath + ext)];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf-8");
    } catch {
      // Try next candidate
    }
  }
  return undefined;
}
