/**
 * Step: detect cascade conflicts when styled(ImportedComponent) wraps a component
 * whose file contains internal styled-components. With StyleX's atomic CSS, the
 * override may lose depending on class insertion order — bail with a clear warning.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import {
  fileExports,
  getReExportedSourceName,
  resolveBarrelReExportBinding,
} from "../prepass/extract-external-interface.js";
import { CASCADE_CONFLICT_WARNING } from "../logger.js";
import { isRelativeSpecifier, toRealPath } from "../utilities/path-utils.js";

type ModuleResolver = (fromFile: string, specifier: string) => string | undefined;

interface ImportDefinition {
  path: string;
  importedName: string;
}

interface ReExportPath {
  path: string;
  importedName: string;
}

interface StyledDefinitionFile {
  path: string;
  names: Set<string>;
}

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
  const transformedComponents = ctx.options.crossFileInfo?.transformedComponents;
  // In partial-migration mode, `markPartialImportedComponentRoots` in lower-rules
  // marks every `styled(ImportedComponent)` decl as skipped before lowering. Honor
  // the same policy here so the cascade-conflict check doesn't bail the whole file
  // for a decl that will be left as styled-components anyway.
  const skipImportedRoots =
    ctx.options.allowPartialMigration === true && ctx.options.transformMode !== "leavesOnly";

  // Build lookup of locally defined styled-component names for exclusion
  const localStyledNames = new Set(styledDecls.map((d) => d.localName));
  let foundCascadeConflict = false;

  for (const decl of styledDecls) {
    if (decl.skipTransform) {
      continue;
    }
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

    if (skipImportedRoots) {
      continue;
    }

    const importedPath = importEntry.source.value;
    const definition = resolveImportedDefinition(ctx, importedPath, importEntry.importedName) ?? {
      path: importedPath,
      importedName: importEntry.importedName,
    };

    if (
      transformedComponents &&
      transformedComponentExists(
        transformedComponents,
        definition.path,
        definition.importedName,
        definition.importedName === "default",
      )
    ) {
      continue;
    }

    // Leaves-only mode: wrapping another leaf styled component from this transform run
    // is safe — both sides become StyleX; skip the conservative imported-styled bail.
    // Import paths omit extensions while prepass keys use resolved files — probe extensions.
    if (ctx.options.transformMode === "leavesOnly" && ctx.options.globalLeafKeys?.size) {
      if (
        globalLeafKeyExists(
          ctx.options.globalLeafKeys,
          definition.path,
          definition.importedName,
          definition.importedName === "default",
        )
      ) {
        continue;
      }
    }

    // Check if the imported file contains styled-components.
    // Prefer prepass data when available, but fall back to direct file scan if the
    // prepass map misses the path (e.g., file outside the configured prepass set).
    const styledDefinitions =
      (styledDefFiles && resolveStyledDefFile(definition.path, styledDefFiles)) ||
      scanFileForStyledDefs(definition.path, definition.importedName, ctx.options.resolveModule);

    if (!styledDefinitions) {
      continue;
    }

    if (
      transformedComponents &&
      transformedComponentsHasPath(transformedComponents, styledDefinitions.path) &&
      !bindingDependsOnStyledDefinitions(
        styledDefinitions.path,
        definition.importedName,
        definition.importedName === "default",
        styledDefinitions.names,
      )
    ) {
      continue;
    }

    // The base component's file uses styled-components. Whether the import is a
    // direct styled export or a regular component wrapping internal styled-components,
    // its CSS is unlayered and the StyleX classes emitted on the wrapper would lose
    // to it once StyleX is placed in a CSS layer — bail.
    ctx.warnings.push({
      severity: "warning",
      type: CASCADE_CONFLICT_WARNING,
      loc: decl.loc,
      context: {
        component: decl.localName,
        base: baseIdent,
        importedPath,
        definitionPath: styledDefinitions.path,
      },
    });
    foundCascadeConflict = true;
  }

  if (foundCascadeConflict) {
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}

// --- Non-exported helpers ---

function resolveImportedDefinition(
  ctx: TransformContext,
  importedPath: string,
  importedName: string,
): ImportDefinition | null {
  const resolve = ctx.options.resolveModule;
  if (!resolve) {
    return null;
  }
  const resolved = resolveBarrelReExportBinding(
    pathResolve(importedPath),
    importedName,
    (specifier, fromFile) => resolve(fromFile, specifier) ?? null,
    readResolvedFile,
  );
  return resolved ? { path: resolved.filePath, importedName: resolved.exportedName } : null;
}

/** Common TypeScript/JavaScript file extensions to try when matching import paths to styledDefFiles keys. */
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

/** Regex matching styled-component definitions: `const Name = styled.tag` or `const Name = styled(Component)` */
const STYLED_DEF_RE = /const\s+([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled[.(]/g;

/** Whether `${resolvedDefFile}:${binding}` is in the leaves-only prepass key set. */
function globalLeafKeyExists(
  keys: ReadonlySet<string>,
  importedPath: string,
  bindingName: string,
  allowDefaultFallback: boolean,
): boolean {
  const candidates = [
    importedPath,
    ...EXTENSIONS.map((ext) => importedPath + ext),
    ...EXTENSIONS.map((ext) => pathResolve(importedPath, `index${ext}`)),
  ];
  for (const c of candidates) {
    const key = `${toRealPath(c)}:${bindingName}`;
    if (keys.has(key)) {
      return true;
    }
    if (allowDefaultFallback) {
      const source = tryReadFile(c);
      const defaultName = source ? findDefaultExportedLocalName(source) : undefined;
      if (defaultName && keys.has(`${toRealPath(c)}:${defaultName}`)) {
        return true;
      }
      const reExportSpecifier = source ? findDefaultReExportSpecifier(source) : undefined;
      if (reExportSpecifier && defaultReExportLeafKeyExists(keys, c, reExportSpecifier)) {
        return true;
      }
    }
  }
  return false;
}

function findDefaultExportedLocalName(source: string): string | undefined {
  return (
    source.match(/\bexport\s+default\s+([A-Z][A-Za-z0-9]*)\b/)?.[1] ??
    source.match(/\bexport\s*\{[^}]*\b([A-Z][A-Za-z0-9]*)\s+as\s+default\b[^}]*\}/)?.[1]
  );
}

function findDefaultReExportSpecifier(source: string): string | undefined {
  return source.match(/\bexport\s*\{\s*default\s*\}\s*from\s*["']([^"']+)["']/)?.[1];
}

function defaultReExportLeafKeyExists(
  keys: ReadonlySet<string>,
  barrelPath: string,
  specifier: string,
): boolean {
  const basePath = pathResolve(dirname(barrelPath), specifier);
  const candidates = [basePath, ...EXTENSIONS.map((ext) => basePath + ext)];
  for (const candidate of candidates) {
    const source = tryReadFile(candidate);
    const defaultName = source ? findDefaultExportedLocalName(source) : undefined;
    if (defaultName && keys.has(`${toRealPath(candidate)}:${defaultName}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve an import path to a styledDefFiles entry. The importMap stores resolved
 * absolute paths (without extension when the import omits it), while styledDefFiles
 * keys include the full extension. Try exact match first, then with common extensions.
 */
function resolveStyledDefFile(
  importedPath: string,
  styledDefFiles: Map<string, Set<string>>,
): StyledDefinitionFile | undefined {
  const exact = styledDefFiles.get(importedPath);
  if (exact) {
    return { path: importedPath, names: exact };
  }
  for (const ext of EXTENSIONS) {
    const pathWithExtension = importedPath + ext;
    const withExt = styledDefFiles.get(pathWithExtension);
    if (withExt) {
      return { path: pathWithExtension, names: withExt };
    }
  }
  return undefined;
}

function pathCandidates(filePath: string): string[] {
  const resolved = pathResolve(filePath);
  return [resolved, ...EXTENSIONS.map((ext) => resolved + ext)];
}

function transformedComponentsHasPath(
  transformedComponents: ReadonlyMap<string, ReadonlySet<string>>,
  filePath: string,
): boolean {
  return pathCandidates(filePath).some(
    (candidate) =>
      transformedComponents.has(candidate) || transformedComponents.has(toRealPath(candidate)),
  );
}

function transformedComponentExists(
  transformedComponents: ReadonlyMap<string, ReadonlySet<string>>,
  importedPath: string,
  bindingName: string,
  allowDefaultFallback: boolean,
): boolean {
  for (const candidate of pathCandidates(importedPath)) {
    const transformedNames =
      transformedComponents.get(candidate) ?? transformedComponents.get(toRealPath(candidate));
    if (!transformedNames) {
      continue;
    }
    if (transformedNames.has(bindingName)) {
      return true;
    }
    const source = tryReadFile(candidate);
    if (!source) {
      continue;
    }
    for (const localName of exportedLocalNameCandidates(
      source,
      bindingName,
      allowDefaultFallback,
    )) {
      if (transformedNames.has(localName)) {
        return true;
      }
    }
  }
  return false;
}

function exportedLocalNameCandidates(
  source: string,
  exportedName: string,
  includeDefault: boolean,
): string[] {
  const candidates = new Set<string>();
  if (exportedName !== "default") {
    candidates.add(exportedName);
  }

  const exportBlockRe = /export\s*\{([^}]+)\}/g;
  for (const match of source.matchAll(exportBlockRe)) {
    const localName = getReExportedSourceName(match[1] ?? "", exportedName);
    if (localName) {
      candidates.add(localName);
    }
  }

  if (includeDefault) {
    const defaultName = findDefaultExportedLocalName(source);
    if (defaultName) {
      candidates.add(defaultName);
    }
  }

  return [...candidates];
}

function bindingDependsOnStyledDefinitions(
  importedPath: string,
  bindingName: string,
  allowDefaultFallback: boolean,
  styledDefinitionNames: ReadonlySet<string>,
): boolean {
  const source = tryReadFile(importedPath);
  if (!source) {
    return true;
  }
  const localNames = exportedLocalNameCandidates(source, bindingName, allowDefaultFallback);
  if (localNames.length === 0) {
    return true;
  }
  for (const localName of localNames) {
    if (styledDefinitionNames.has(localName)) {
      return true;
    }
    const body = readComponentBody(source, localName);
    if (!body || referencesAnyName(body, styledDefinitionNames)) {
      return true;
    }
  }
  return false;
}

function readComponentBody(source: string, localName: string): string | undefined {
  return readFunctionBody(source, localName) ?? readArrowFunctionBody(source, localName);
}

function readFunctionBody(source: string, localName: string): string | undefined {
  const match = source.match(
    new RegExp(`\\bfunction\\s+${escapeRegex(localName)}(?:\\s*<[^>]+>)?\\s*\\(`),
  );
  if (match?.index === undefined) {
    return undefined;
  }
  const openParen = match.index + match[0].lastIndexOf("(");
  const closeParen = readBalancedDelimiterEnd(source, openParen, "(", ")");
  if (closeParen === undefined) {
    return undefined;
  }
  const openBrace = source.indexOf("{", closeParen + 1);
  return openBrace === -1 ? undefined : readBalancedBlock(source, openBrace);
}

function readArrowFunctionBody(source: string, localName: string): string | undefined {
  const match = source.match(
    new RegExp(`\\b(?:const|let|var)\\s+${escapeRegex(localName)}\\b[^=]*=\\s*`),
  );
  if (match?.index === undefined) {
    return undefined;
  }
  const start = match.index + match[0].length;
  const arrow = source.indexOf("=>", start);
  if (arrow === -1) {
    return undefined;
  }
  const bodyStart = skipWhitespace(source, arrow + 2);
  if (source[bodyStart] === "{") {
    return readBalancedBlock(source, bodyStart);
  }
  const semicolon = source.indexOf(";", bodyStart);
  return semicolon === -1 ? source.slice(bodyStart) : source.slice(bodyStart, semicolon);
}

function readBalancedBlock(source: string, openBrace: number): string | undefined {
  const closeBrace = readBalancedDelimiterEnd(source, openBrace, "{", "}");
  return closeBrace === undefined ? undefined : source.slice(openBrace + 1, closeBrace);
}

function readBalancedDelimiterEnd(
  source: string,
  openIndex: number,
  open: string,
  close: string,
): number | undefined {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === open) {
      depth += 1;
      continue;
    }
    if (ch !== close) {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return i;
    }
  }
  return undefined;
}

function skipWhitespace(source: string, index: number): number {
  let next = index;
  while (next < source.length && /\s/.test(source[next] ?? "")) {
    next += 1;
  }
  return next;
}

function referencesAnyName(source: string, names: ReadonlySet<string>): boolean {
  return [...names].some((name) => new RegExp(`\\b${escapeRegex(name)}\\b`).test(source));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fallback: read an imported file and scan for styled-component definitions.
 * Used when styledDefFiles is not available (single-file mode, tests without prepass).
 */
function scanFileForStyledDefs(
  importedPath: string,
  importedName?: string,
  resolveModule?: ModuleResolver,
  visited = new Set<string>(),
): StyledDefinitionFile | undefined {
  const file = tryReadFileWithPath(importedPath);
  if (!file || visited.has(file.path)) {
    return undefined;
  }
  visited.add(file.path);

  const source = file.source;
  const names = new Set<string>();
  if (source.includes("styled-components")) {
    STYLED_DEF_RE.lastIndex = 0;
    for (const m of source.matchAll(STYLED_DEF_RE)) {
      if (m[1]) {
        names.add(m[1]);
      }
    }
  }

  if (names.size > 0) {
    return { path: file.path, names };
  }

  if (!importedName) {
    return undefined;
  }

  for (const reExport of reExportPaths(source, file.path, importedName, resolveModule)) {
    const nested = scanFileForStyledDefs(
      reExport.path,
      reExport.importedName,
      resolveModule,
      visited,
    );
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/**
 * Try reading a file at the given path, with extension fallback.
 * Import paths may lack extensions; tries exact match then common extensions.
 */
function tryReadFile(importedPath: string): string | undefined {
  return tryReadFileWithPath(importedPath)?.source;
}

function tryReadFileWithPath(importedPath: string): { path: string; source: string } | undefined {
  for (const candidate of pathCandidates(importedPath)) {
    try {
      return { path: toRealPath(candidate), source: readFileSync(candidate, "utf-8") };
    } catch {
      // Try next candidate
    }
  }
  return undefined;
}

function reExportPaths(
  source: string,
  filePath: string,
  importedName: string,
  resolveModule?: ModuleResolver,
): ReExportPath[] {
  const paths: ReExportPath[] = [];

  const namedRe = /export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(namedRe)) {
    const specifiers = match[1] ?? "";
    const specifier = match[2];
    if (!specifier) {
      continue;
    }
    const nextImportedName = getReExportedSourceName(specifiers, importedName);
    if (!nextImportedName) {
      continue;
    }
    const resolved = resolveReExportSpecifier(filePath, specifier, resolveModule);
    if (resolved) {
      paths.push({ path: resolved, importedName: nextImportedName });
    }
  }

  const starRe = /export\s*\*\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(starRe)) {
    const specifier = match[1];
    if (!specifier || importedName === "default") {
      continue;
    }
    const resolved = resolveReExportSpecifier(filePath, specifier, resolveModule);
    if (resolved && fileExportsNameThroughReExports(resolved, importedName, resolveModule)) {
      paths.push({ path: resolved, importedName });
    }
  }

  return paths;
}

function resolveReExportSpecifier(
  fromFile: string,
  specifier: string,
  resolveModule?: ModuleResolver,
): string | undefined {
  if (isRelativeSpecifier(specifier)) {
    return pathResolve(dirname(fromFile), specifier);
  }
  return resolveModule?.(fromFile, specifier);
}

function fileExportsNameThroughReExports(
  importedPath: string,
  importedName: string,
  resolveModule?: ModuleResolver,
  visited = new Set<string>(),
): boolean {
  const file = tryReadFileWithPath(importedPath);
  if (!file || visited.has(file.path)) {
    return false;
  }
  visited.add(file.path);

  if (fileExports(file.source, importedName)) {
    return true;
  }

  const namedRe = /export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of file.source.matchAll(namedRe)) {
    const specifiers = match[1] ?? "";
    const specifier = match[2];
    if (!specifier || !getReExportedSourceName(specifiers, importedName)) {
      continue;
    }
    const resolved = resolveReExportSpecifier(file.path, specifier, resolveModule);
    if (resolved) {
      return true;
    }
  }

  const starRe = /export\s*\*\s*from\s*["']([^"']+)["']/g;
  for (const match of file.source.matchAll(starRe)) {
    const specifier = match[1];
    if (!specifier) {
      continue;
    }
    const resolved = resolveReExportSpecifier(file.path, specifier, resolveModule);
    if (
      resolved &&
      fileExportsNameThroughReExports(resolved, importedName, resolveModule, visited)
    ) {
      return true;
    }
  }
  return false;
}

function readResolvedFile(importedPath: string): string {
  const source = tryReadFile(importedPath);
  if (source === undefined) {
    throw new Error(`Unable to read ${importedPath}`);
  }
  return source;
}
