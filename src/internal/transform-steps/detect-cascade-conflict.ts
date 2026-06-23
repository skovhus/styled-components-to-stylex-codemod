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
import { createPrepassParser, type AstNode } from "../prepass/prepass-parser.js";
import {
  buildImportMapFromNodes,
  walkForImportsAndTemplates,
} from "../prepass/scan-cross-file-selectors.js";
import { collectStylexExportNames } from "../prepass/stylex-component-exports.js";
import {
  exportedBindingDependsOnLocalNames,
  localNamesForExport,
} from "../prepass/component-styled-dependencies.js";
import { CASCADE_CONFLICT_WARNING } from "../logger.js";
import { isRelativeSpecifier, toRealPath } from "../utilities/path-utils.js";
import { isStylexImportSource } from "../utilities/stylex-import-source.js";

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
  const skipImportedRoots = ctx.options.allowPartialMigration === true;

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
    const baseImportLocalName = rootLocalName(baseIdent);
    // For `styled(Imported.Member)` the import resolves the root binding, but the
    // wrapped component is the static member. Carry the member path into dependency
    // checks so a clean root cannot mask a styled-dependent member.
    const baseMemberPath = baseIdent.split(".").slice(1);

    // Skip if the base is a locally defined styled-component (delegation handles it)
    if (localStyledNames.has(baseIdent) || localStyledNames.has(baseImportLocalName)) {
      continue;
    }

    // Check if the base is an imported component
    const importEntry = importMap.get(baseImportLocalName);
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

    // Check if the imported file contains styled-components.
    // Prefer prepass data when available, but fall back to direct file scan if the
    // prepass map misses the path (e.g., file outside the configured prepass set).
    const styledDefinitions =
      (styledDefFiles && resolveStyledDefFile(definition.path, styledDefFiles)) ||
      scanFileForStyledDefs(definition.path, definition.importedName, ctx.options.resolveModule);

    if (
      transformedComponents &&
      transformedComponentExists(
        transformedComponents,
        definition.path,
        definition.importedName,
        definition.importedName === "default",
      ) &&
      bindingIsIndependentOfRemainingStyledDefinitions(ctx, {
        sourcePath: definition.path,
        bindingName: definition.importedName,
        memberPath: baseMemberPath,
        styledDefinitions: styledDefinitions
          ? {
              ...styledDefinitions,
              names: unconvertedStyledDefinitionNames(styledDefinitions, transformedComponents),
            }
          : undefined,
      })
    ) {
      continue;
    }

    if (!styledDefinitions) {
      if (
        bindingIsIndependentOfRemainingStyledDefinitions(ctx, {
          sourcePath: definition.path,
          bindingName: definition.importedName,
          memberPath: baseMemberPath,
          styledDefinitions: undefined,
        })
      ) {
        continue;
      }
    } else if (
      transformedComponents &&
      transformedComponentsHasPath(transformedComponents, styledDefinitions.path) &&
      bindingIsIndependentOfRemainingStyledDefinitions(ctx, {
        sourcePath: styledDefinitions.path,
        bindingName: definition.importedName,
        memberPath: baseMemberPath,
        styledDefinitions: {
          ...styledDefinitions,
          names: unconvertedStyledDefinitionNames(styledDefinitions, transformedComponents),
        },
      })
    ) {
      continue;
    }

    if (
      styledDefinitions &&
      canSkipCascadeForStylexExport(ctx, styledDefinitions, definition.importedName, baseMemberPath)
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
        definitionPath: styledDefinitions?.path ?? definition.path,
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

/**
 * Import sources the codemod itself emits into transformed files (the adapter's
 * style-merger helper). These never carry styled-component exports.
 */
function generatedImportSources(ctx: TransformContext): ReadonlySet<string> {
  const sources = new Set<string>();
  const mergerSource = ctx.adapter.styleMerger?.importSource?.value;
  if (typeof mergerSource === "string" && mergerSource.length > 0) {
    sources.add(mergerSource);
  }
  return sources;
}

function rootLocalName(componentName: string): string {
  return componentName.split(".")[0] ?? componentName;
}

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
  return transformedNamesForPath(transformedComponents, filePath) !== undefined;
}

function componentExportExists(
  componentsByFile: ReadonlyMap<string, ReadonlySet<string>> | undefined,
  importedPath: string,
  bindingName: string,
): boolean {
  if (!componentsByFile) {
    return componentExportExistsByDirectScan(importedPath, bindingName);
  }
  for (const candidate of pathCandidates(importedPath)) {
    const componentNames =
      componentsByFile.get(candidate) ?? componentsByFile.get(toRealPath(candidate));
    if (componentNames?.has(bindingName)) {
      return true;
    }
  }
  return componentExportExistsByDirectScan(importedPath, bindingName);
}

function componentExportExistsByDirectScan(importedPath: string, bindingName: string): boolean {
  for (const candidate of pathCandidates(importedPath)) {
    const source = tryReadFile(candidate);
    if (source && collectStylexExportNames(source).has(bindingName)) {
      return true;
    }
  }
  return false;
}

function canSkipCascadeForStylexExport(
  ctx: TransformContext,
  styledDefinitions: StyledDefinitionFile,
  bindingName: string,
  memberPath: readonly string[],
): boolean {
  return (
    componentExportExists(
      ctx.options.crossFileInfo?.stylexComponentFiles,
      styledDefinitions.path,
      bindingName,
    ) && bindingIsIndependentOfStyledDefinitions(ctx, styledDefinitions, bindingName, memberPath)
  );
}

function bindingIsIndependentOfStyledDefinitions(
  ctx: TransformContext,
  styledDefinitions: StyledDefinitionFile,
  bindingName: string,
  memberPath: readonly string[],
): boolean {
  if (bindingDependsOnStyledDefinitions(styledDefinitions, bindingName, memberPath)) {
    return false;
  }
  return !bindingDependsOnImportedStyledDefinitions({
    bindingName,
    memberPath,
    sourcePath: styledDefinitions.path,
    styledDefFiles: ctx.options.crossFileInfo?.styledDefFiles,
    stylexComponentFiles: ctx.options.crossFileInfo?.stylexComponentFiles,
    resolveModule: ctx.options.resolveModule,
    ignoredImportSources: generatedImportSources(ctx),
  });
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
    for (const localName of localNamesForExport(source, bindingName, allowDefaultFallback)) {
      if (transformedNames.has(localName)) {
        return true;
      }
    }
  }
  return false;
}

function unconvertedStyledDefinitionNames(
  styledDefinitions: StyledDefinitionFile,
  transformedComponents: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const transformedNames = transformedNamesForPath(transformedComponents, styledDefinitions.path);
  return new Set([...styledDefinitions.names].filter((name) => !transformedNames?.has(name)));
}

function transformedNamesForPath(
  transformedComponents: ReadonlyMap<string, ReadonlySet<string>>,
  filePath: string,
): ReadonlySet<string> | undefined {
  for (const candidate of pathCandidates(filePath)) {
    const transformedNames =
      transformedComponents.get(candidate) ?? transformedComponents.get(toRealPath(candidate));
    if (transformedNames) {
      return transformedNames;
    }
  }
  return undefined;
}

function bindingDependsOnStyledDefinitions(
  styledDefinitions: StyledDefinitionFile,
  bindingName: string,
  memberPath: readonly string[] = [],
): boolean {
  if (styledDefinitions.names.size === 0) {
    return false;
  }
  const source = tryReadFile(styledDefinitions.path);
  return source
    ? exportedBindingDependsOnLocalNames({
        source,
        exportedName: bindingName,
        includeDefault: bindingName === "default",
        localNames: styledDefinitions.names,
        memberPath,
      })
    : true;
}

function bindingIsIndependentOfRemainingStyledDefinitions(
  ctx: TransformContext,
  args: {
    sourcePath: string;
    bindingName: string;
    memberPath: readonly string[];
    styledDefinitions: StyledDefinitionFile | undefined;
  },
): boolean {
  if (
    args.styledDefinitions &&
    bindingDependsOnStyledDefinitions(args.styledDefinitions, args.bindingName, args.memberPath)
  ) {
    return false;
  }
  if (!args.styledDefinitions && args.memberPath.length === 0) {
    return true;
  }
  if (!args.styledDefinitions && !tryReadFile(args.sourcePath)) {
    return true;
  }
  return !bindingDependsOnImportedStyledDefinitions({
    bindingName: args.bindingName,
    memberPath: args.memberPath,
    sourcePath: args.sourcePath,
    styledDefFiles: ctx.options.crossFileInfo?.styledDefFiles,
    stylexComponentFiles: ctx.options.crossFileInfo?.stylexComponentFiles,
    resolveModule: ctx.options.resolveModule,
    ignoredImportSources: generatedImportSources(ctx),
  });
}

function bindingDependsOnImportedStyledDefinitions(args: {
  sourcePath: string;
  bindingName: string;
  memberPath?: readonly string[];
  styledDefFiles: Map<string, Set<string>> | undefined;
  stylexComponentFiles: Map<string, Set<string>> | undefined;
  resolveModule: ModuleResolver | undefined;
  ignoredImportSources?: ReadonlySet<string>;
  visited?: Set<string>;
}): boolean {
  const visitKey = `${args.sourcePath}:${args.bindingName}`;
  if (args.visited?.has(visitKey)) {
    return true;
  }
  const visited = new Set(args.visited);
  visited.add(visitKey);
  const source = tryReadFile(args.sourcePath);
  if (!source) {
    return true;
  }
  const importedStyledNames = collectImportedStyledLocalNames({ ...args, visited });
  if (!importedStyledNames) {
    return true;
  }
  return (
    importedStyledNames.size > 0 &&
    exportedBindingDependsOnLocalNames({
      source,
      exportedName: args.bindingName,
      includeDefault: args.bindingName === "default",
      localNames: importedStyledNames,
      memberPath: args.memberPath ?? [],
    })
  );
}

function collectImportedStyledLocalNames(args: {
  sourcePath: string;
  bindingName: string;
  memberPath?: readonly string[];
  styledDefFiles: Map<string, Set<string>> | undefined;
  stylexComponentFiles: Map<string, Set<string>> | undefined;
  resolveModule: ModuleResolver | undefined;
  ignoredImportSources?: ReadonlySet<string>;
  visited: Set<string>;
}): Set<string> | null {
  const source = tryReadFile(args.sourcePath);
  const program = source ? parseProgram(source) : null;
  if (!source || !program) {
    return null;
  }

  const importNodes: AstNode[] = [];
  walkForImportsAndTemplates(program, importNodes, []);
  const importMap = buildImportMapFromNodes(importNodes);
  const importedStyledNames = new Set<string>();

  for (const [localName, importEntry] of importMap) {
    // Codemod-generated imports (style merger helper) and StyleX token modules
    // never carry styled-component exports — skipping them keeps the
    // unresolvable-relative-import fallback below from flagging them.
    if (
      args.ignoredImportSources?.has(importEntry.source) ||
      isStylexImportSource(importEntry.source)
    ) {
      continue;
    }
    if (!args.resolveModule) {
      if (isRelativeSpecifier(importEntry.source)) {
        importedStyledNames.add(localName);
      }
      continue;
    }
    const resolvedPath = args.resolveModule(args.sourcePath, importEntry.source);
    if (!resolvedPath) {
      if (isRelativeSpecifier(importEntry.source)) {
        importedStyledNames.add(localName);
      }
      continue;
    }
    const styledDefinitions =
      (args.styledDefFiles && resolveStyledDefFile(resolvedPath, args.styledDefFiles)) ||
      scanFileForStyledDefs(resolvedPath, importEntry.importedName, args.resolveModule);
    const memberPath = exportedMemberReferencesImportedRoot({
      source,
      bindingName: args.bindingName,
      memberPath: args.memberPath ?? [],
      localName,
    })
      ? args.memberPath
      : undefined;
    recordImportedStyledNameIfNeeded(importedStyledNames, localName, {
      bindingName: importEntry.importedName,
      memberPath,
      styledDefinitions,
      styledDefFiles: args.styledDefFiles,
      stylexComponentFiles: args.stylexComponentFiles,
      resolveModule: args.resolveModule,
      ignoredImportSources: args.ignoredImportSources,
      visited: args.visited,
    });
  }

  return importedStyledNames;
}

function exportedMemberReferencesImportedRoot(args: {
  source: string;
  bindingName: string;
  memberPath: readonly string[];
  localName: string;
}): boolean {
  if (args.memberPath.length === 0) {
    return false;
  }
  return exportedBindingDependsOnLocalNames({
    source: args.source,
    exportedName: args.bindingName,
    includeDefault: args.bindingName === "default",
    localNames: new Set([args.localName]),
    memberPath: args.memberPath,
  });
}

function recordImportedStyledNameIfNeeded(
  importedStyledNames: Set<string>,
  localName: string,
  args: {
    bindingName: string;
    memberPath?: readonly string[];
    styledDefinitions: StyledDefinitionFile | undefined;
    styledDefFiles: Map<string, Set<string>> | undefined;
    stylexComponentFiles: Map<string, Set<string>> | undefined;
    resolveModule: ModuleResolver | undefined;
    ignoredImportSources?: ReadonlySet<string>;
    visited: Set<string>;
  },
): void {
  if (importedBindingShouldCountAsStyled(args)) {
    importedStyledNames.add(localName);
  }
}

function importedBindingShouldCountAsStyled(args: {
  bindingName: string;
  memberPath?: readonly string[];
  styledDefinitions: StyledDefinitionFile | undefined;
  styledDefFiles: Map<string, Set<string>> | undefined;
  stylexComponentFiles: Map<string, Set<string>> | undefined;
  resolveModule: ModuleResolver | undefined;
  ignoredImportSources?: ReadonlySet<string>;
  visited: Set<string>;
}): boolean {
  return (
    !!args.styledDefinitions &&
    !importedBindingIsIndependentStylex({
      bindingName: args.bindingName,
      memberPath: args.memberPath,
      styledDefinitions: args.styledDefinitions,
      styledDefFiles: args.styledDefFiles,
      stylexComponentFiles: args.stylexComponentFiles,
      resolveModule: args.resolveModule,
      ignoredImportSources: args.ignoredImportSources,
      visited: args.visited,
    })
  );
}

function importedBindingIsIndependentStylex(args: {
  bindingName: string;
  memberPath?: readonly string[];
  styledDefinitions: StyledDefinitionFile;
  styledDefFiles: Map<string, Set<string>> | undefined;
  stylexComponentFiles: Map<string, Set<string>> | undefined;
  resolveModule: ModuleResolver | undefined;
  ignoredImportSources?: ReadonlySet<string>;
  visited: Set<string>;
}): boolean {
  return (
    componentExportExists(
      args.stylexComponentFiles,
      args.styledDefinitions.path,
      args.bindingName,
    ) &&
    !bindingDependsOnStyledDefinitions(
      args.styledDefinitions,
      args.bindingName,
      args.memberPath ?? [],
    ) &&
    !bindingDependsOnImportedStyledDefinitions({
      bindingName: args.bindingName,
      memberPath: args.memberPath,
      sourcePath: args.styledDefinitions.path,
      styledDefFiles: args.styledDefFiles,
      stylexComponentFiles: args.stylexComponentFiles,
      resolveModule: args.resolveModule,
      ignoredImportSources: args.ignoredImportSources,
      visited: args.visited,
    })
  );
}

function parseProgram(source: string): AstNode | null {
  for (const parserName of ["tsx", "babel"] as const) {
    try {
      const ast = createPrepassParser(parserName).parse(source) as AstNode;
      return ((ast as { program?: AstNode }).program ?? ast) as AstNode;
    } catch {
      // Try the next parser before falling back to conservative behavior.
    }
  }
  return null;
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
