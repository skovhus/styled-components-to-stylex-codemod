/**
 * Resolves an imported binding to a top-level string-literal `export const`
 * (or `export default`) in another module, following relative-path imports
 * and re-export chains. Used when the codemod needs to substitute an
 * identifier inside a CSS template (e.g. `${VAR}: 100%;`) with its static
 * string value at transform time.
 *
 * Only string literals are honored — anything more complex than a literal
 * initializer yields `null`, so callers can bail safely. Re-export chains
 * (`export { X } from "./other"`, `export * from "./other"`, and same-file
 * `import + export {}`) are walked transitively up to a small depth limit
 * with a per-resolution visit set to guard against cycles.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import type { DeclProcessingState } from "./decl-setup.js";
import { literalToStaticValue } from "../utilities/jscodeshift-utils.js";
import { isRelativeSpecifier } from "../utilities/path-utils.js";

export function resolveImportedConstStringInit(
  localName: string,
  state: DeclProcessingState["state"],
): string | null {
  const importEntry = state.importMap.get(localName);
  if (!importEntry || importEntry.source.kind !== "absolutePath") {
    return null;
  }
  return resolveExportFromFile(
    importEntry.source.value,
    importEntry.importedName,
    state,
    new Set(),
  );
}

/**
 * Searches a list of `VariableDeclarator`s for one named `<name>` and returns
 * its initializer when it resolves to a static string literal. Exported so
 * it can also be used by the in-file resolver in
 * `process-rule-declarations.ts`.
 */
export function findConstDeclaratorString(declarations: unknown[], name: string): string | null {
  for (const declarator of declarations) {
    if (
      !declarator ||
      typeof declarator !== "object" ||
      (declarator as { type?: string }).type !== "VariableDeclarator"
    ) {
      continue;
    }
    const d = declarator as {
      id?: { type?: string; name?: string };
      init?: unknown;
    };
    if (d.id?.type !== "Identifier" || d.id.name !== name) {
      continue;
    }
    const value = literalToStaticValue(d.init);
    return typeof value === "string" ? value : null;
  }
  return null;
}

// --- Non-exported helpers ---

/**
 * Maximum number of files we will traverse following re-exports for a single
 * resolution. Shields the codemod against cyclic or pathologically deep
 * barrel chains while comfortably covering realistic re-export depths (a
 * package's `index.ts` re-exporting a sub-folder's `index.ts`).
 */
const MAX_REEXPORT_DEPTH = 8;

const MODULE_FILE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".cts", ".mjs", ".cjs"];

type ParsedProgram = ReturnType<DeclProcessingState["state"]["api"]["jscodeshift"]>;

/**
 * Per-state cache of parsed imported files so that multiple template slots
 * referencing the same module within one transform parse the file once.
 * Stores `null` for files that couldn't be read or parsed so unreadable
 * imports don't retry on every hit. Keyed weakly by the state object so the
 * cache is naturally released alongside the transform.
 */
const PARSED_IMPORT_CACHES = new WeakMap<object, Map<string, ParsedProgram | null>>();

/**
 * Reads, parses, and resolves an exported string literal from the file at
 * `<filePath>`. Handles direct `export const <name> = "..."` /
 * `export default "..."` declarations and follows re-exports of the form
 * `export { <name> } from "./other"`, `export { <name> as <other> } from`,
 * `export * from "./other"`, and same-file `import { <name> } from "./other";
 * export { <name> };`. The `visited` set is keyed by `<absolutePath>:<name>`
 * to avoid revisiting the same export pair through different barrel paths,
 * and `MAX_REEXPORT_DEPTH` shields against pathological chains.
 */
function resolveExportFromFile(
  filePath: string,
  exportedName: string,
  state: DeclProcessingState["state"],
  visited: Set<string>,
): string | null {
  if (visited.size >= MAX_REEXPORT_DEPTH) {
    return null;
  }
  const visitKey = `${filePath}\0${exportedName}`;
  if (visited.has(visitKey)) {
    return null;
  }
  visited.add(visitKey);

  const program = parseImportedSource(filePath, state);
  if (!program) {
    return null;
  }
  return findExportedStringConst(program, exportedName, filePath, state, visited);
}

/**
 * Reads and parses an imported source file with the same `tsx` parser used by
 * the transform. The `importMap` stores the original specifier resolved
 * relative to the source directory but does not probe extensions, so we try
 * the exact path first and then common module extensions.
 */
function parseImportedSource(
  importedPath: string,
  state: DeclProcessingState["state"],
): ParsedProgram | null {
  let cache = PARSED_IMPORT_CACHES.get(state);
  if (!cache) {
    cache = new Map();
    PARSED_IMPORT_CACHES.set(state, cache);
  }
  const memo = cache.get(importedPath);
  if (memo !== undefined) {
    return memo;
  }

  const source = readSourceWithExtensionFallback(importedPath);
  if (source === null) {
    cache.set(importedPath, null);
    return null;
  }
  let program: ParsedProgram | null = null;
  try {
    program = state.api.jscodeshift.withParser("tsx")(source);
  } catch {
    program = null;
  }
  cache.set(importedPath, program);
  return program;
}

function readSourceWithExtensionFallback(importedPath: string): string | null {
  const candidates = [importedPath, ...MODULE_FILE_EXTENSIONS.map((ext) => importedPath + ext)];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf-8");
    } catch {
      // Try next candidate
    }
  }
  return null;
}

/**
 * Returns the string-literal value of `<program>`'s top-level
 * `export const <exportedName> = "..."` or `export default "..."`, following
 * re-export chains. Anything more complex than a literal initializer is
 * rejected — we only follow exports that are unambiguously static.
 */
function findExportedStringConst(
  program: ParsedProgram,
  exportedName: string,
  programPath: string,
  state: DeclProcessingState["state"],
  visited: Set<string>,
): string | null {
  if (exportedName === "default") {
    return findDefaultExportedString(program, state);
  }

  const direct = findDirectNamedExportString(program, exportedName, state);
  if (direct !== null) {
    return direct;
  }

  return followReExports(program, exportedName, programPath, state, visited);
}

function findDefaultExportedString(
  program: ParsedProgram,
  state: DeclProcessingState["state"],
): string | null {
  return findFirst(program.find(state.j.ExportDefaultDeclaration), (p) => {
    const value = literalToStaticValue(p.node.declaration);
    return typeof value === "string" ? value : null;
  });
}

/**
 * Looks for a top-level `export const <name> = "..."` in this program. Skips
 * `export { ... } from "..."` (handled by the re-export path) and any
 * non-`const` variable declarations.
 */
function findDirectNamedExportString(
  program: ParsedProgram,
  exportedName: string,
  state: DeclProcessingState["state"],
): string | null {
  return findFirst(program.find(state.j.ExportNamedDeclaration), (p) => {
    const decl = p.node.declaration;
    if (decl?.type !== "VariableDeclaration" || decl.kind !== "const") {
      return null;
    }
    return findConstDeclaratorString(decl.declarations, exportedName);
  });
}

/**
 * Tries to follow re-exports for `<exportedName>` from `<program>`:
 *   - `export { exportedName } from "./other"` (direct)
 *   - `export { Original as exportedName } from "./other"` (aliased)
 *   - `import { Original } from "./other"; export { Original as exportedName };`
 *   - `export * from "./other"` (probed when no direct match)
 *
 * Each candidate's specifier is resolved relative to `<programPath>`'s
 * directory, mirroring how `transform-import-map.ts` handles relative
 * imports. Star exports are tried last so direct matches always win.
 */
function followReExports(
  program: ParsedProgram,
  exportedName: string,
  programPath: string,
  state: DeclProcessingState["state"],
  visited: Set<string>,
): string | null {
  const programDir = dirname(programPath);
  const resolveTarget = (specifier: string, originalName: string): string | null =>
    resolveExportFromFile(pathResolve(programDir, specifier), originalName, state, visited);

  for (const entry of collectNamedReExports(program, state)) {
    if (entry.localExportedAs !== exportedName) {
      continue;
    }
    const result = resolveTarget(entry.specifier, entry.originalName);
    if (result !== null) {
      return result;
    }
  }

  const localReExport = findLocalImportReExport(program, exportedName, state);
  if (localReExport) {
    const result = resolveTarget(localReExport.specifier, localReExport.originalName);
    if (result !== null) {
      return result;
    }
  }

  for (const specifier of collectStarReExports(program, state)) {
    const result = resolveTarget(specifier, exportedName);
    if (result !== null) {
      return result;
    }
  }

  return null;
}

interface NamedReExport {
  /** The name as exported by this module. */
  localExportedAs: string;
  /** The name as exported by the source module (`Foo` in `Foo as Bar`). */
  originalName: string;
  /** The original specifier as written in source. */
  specifier: string;
}

interface ExportSpecifierNode {
  type: string;
  exported?: { type?: string; name?: string };
  local?: { type?: string; name?: string };
}

interface ImportSpecifierNode {
  type: string;
  local?: { type?: string; name?: string };
  imported?: { type?: string; name?: string };
}

function collectNamedReExports(
  program: ParsedProgram,
  state: DeclProcessingState["state"],
): NamedReExport[] {
  const out: NamedReExport[] = [];
  program.find(state.j.ExportNamedDeclaration).forEach((p) => {
    const node = p.node as {
      source?: { value?: unknown };
      specifiers?: ExportSpecifierNode[];
    };
    const specifierValue = node.source?.value;
    if (typeof specifierValue !== "string" || !isRelativeSpecifier(specifierValue)) {
      return;
    }
    for (const spec of node.specifiers ?? []) {
      if (spec.type !== "ExportSpecifier") {
        continue;
      }
      const localExportedAs = identifierName(spec.exported);
      const originalName = identifierName(spec.local) ?? localExportedAs;
      if (!localExportedAs || !originalName) {
        continue;
      }
      out.push({ localExportedAs, originalName, specifier: specifierValue });
    }
  });
  return out;
}

function collectStarReExports(
  program: ParsedProgram,
  state: DeclProcessingState["state"],
): string[] {
  const out: string[] = [];
  program.find(state.j.ExportAllDeclaration).forEach((p) => {
    const value = (p.node as { source?: { value?: unknown } }).source?.value;
    if (typeof value === "string" && isRelativeSpecifier(value)) {
      out.push(value);
    }
  });
  return out;
}

/**
 * Finds an `import { <originalName> } from "./other"` paired with an
 * `export { <originalName> as <exportedName> }` (or unaliased) statement in
 * the same file. Returns the relative specifier and the original name on the
 * source side, or `null` if no such pair exists.
 */
function findLocalImportReExport(
  program: ParsedProgram,
  exportedName: string,
  state: DeclProcessingState["state"],
): { specifier: string; originalName: string } | null {
  const localBinding = findLocalBindingForReExport(program, exportedName, state);
  if (!localBinding) {
    return null;
  }
  return findImportTargetForBinding(program, localBinding, state);
}

function findLocalBindingForReExport(
  program: ParsedProgram,
  exportedName: string,
  state: DeclProcessingState["state"],
): string | null {
  return findFirst(program.find(state.j.ExportNamedDeclaration), (p) => {
    const node = p.node as {
      source?: unknown;
      specifiers?: ExportSpecifierNode[];
    };
    if (node.source) {
      // `export { X } from "..."` — handled by collectNamedReExports
      return null;
    }
    for (const spec of node.specifiers ?? []) {
      if (spec.type !== "ExportSpecifier") {
        continue;
      }
      if (identifierName(spec.exported) !== exportedName) {
        continue;
      }
      return identifierName(spec.local) ?? identifierName(spec.exported) ?? null;
    }
    return null;
  });
}

function findImportTargetForBinding(
  program: ParsedProgram,
  localBinding: string,
  state: DeclProcessingState["state"],
): { specifier: string; originalName: string } | null {
  return findFirst(program.find(state.j.ImportDeclaration), (p) => {
    const node = p.node as {
      source?: { value?: unknown };
      specifiers?: ImportSpecifierNode[];
    };
    const specifierValue = node.source?.value;
    if (typeof specifierValue !== "string" || !isRelativeSpecifier(specifierValue)) {
      return null;
    }
    for (const spec of node.specifiers ?? []) {
      const localName = identifierName(spec.local);
      if (localName !== localBinding) {
        continue;
      }
      if (spec.type === "ImportDefaultSpecifier") {
        return { specifier: specifierValue, originalName: "default" };
      }
      if (spec.type === "ImportSpecifier") {
        return {
          specifier: specifierValue,
          originalName: identifierName(spec.imported) ?? localName,
        };
      }
    }
    return null;
  });
}

function identifierName(node: { type?: string; name?: string } | undefined): string | undefined {
  return node?.type === "Identifier" && node.name ? node.name : undefined;
}

/**
 * Returns the first non-null result of `predicate` over `collection`, or
 * `null` if no path produces one. Encapsulates the early-exit short-circuit
 * pattern that recurs across the export/import lookups in this file.
 */
function findFirst<TPath, TResult>(
  collection: { forEach(callback: (path: TPath) => void): unknown },
  predicate: (path: TPath) => TResult | null,
): TResult | null {
  let result: TResult | null = null;
  collection.forEach((p) => {
    if (result !== null) {
      return;
    }
    const candidate = predicate(p);
    if (candidate !== null) {
      result = candidate;
    }
  });
  return result;
}
