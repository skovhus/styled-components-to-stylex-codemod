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
import type { DeclProcessingState } from "./decl-setup.js";
import { createModuleResolver, type ModuleResolver } from "../prepass/resolve-imports.js";
import {
  identifierName,
  isIdentifierNode,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";
import { isRelativeSpecifier } from "../utilities/path-utils.js";

export function resolveExpressionToStaticString(
  expr: unknown,
  state: DeclProcessingState["state"],
): string | null {
  const direct = literalToStaticValue(expr);
  if (typeof direct === "string") {
    return direct;
  }
  if (!isIdentifierNode(expr)) {
    return null;
  }
  const scoped = resolveScopedConstStringInit(expr, state);
  if (scoped?.kind === "found") {
    return scoped.value;
  }
  if (scoped?.kind === "blocked") {
    return null;
  }
  if (state.isIdentifierShadowed(expr, expr.name)) {
    return null;
  }
  const fromImport = resolveImportedConstStringInit(expr.name, state);
  if (fromImport !== null) {
    return fromImport;
  }
  return findTopLevelConstStringInit(expr.name, state);
}

function resolveImportedConstStringInit(
  localName: string,
  state: DeclProcessingState["state"],
): string | null {
  const importEntry = state.importMap.get(localName);
  if (!importEntry || importEntry.source.kind !== "absolutePath") {
    return null;
  }
  // `importMap` stores `pathResolve(currentDir, originalSpecifier)` without
  // probing extensions or index files. Re-run real module resolution from
  // the importing file so directory barrels (`./lib/foo` →
  // `./lib/foo/index.ts`) and TypeScript's extension precedence are honored.
  const resolved = resolveModulePath(state, state.filePath, importEntry.source.value);
  if (resolved === null) {
    return null;
  }
  return resolveExportFromFile(resolved, importEntry.importedName, state, new Set());
}

/**
 * Searches a list of `VariableDeclarator`s for one named `<name>` and returns
 * its initializer when it resolves to a static string literal. Exported so
 * it can also be used by the in-file resolver in
 * `process-rule-declarations.ts`.
 */
function findConstDeclaratorString(declarations: unknown[], name: string): string | null {
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

type ParsedProgram = ReturnType<DeclProcessingState["state"]["api"]["jscodeshift"]>;

type AstPathLike = {
  node: object;
  parentPath?: AstPathLike | null;
};

type ScopedStringResolution = { kind: "found"; value: string } | { kind: "blocked" } | null;

/**
 * Per-state cached module resolver. Configured to prefer `.ts` over `.tsx`
 * (and to probe `index.*`) when an import omits the extension, matching how
 * TypeScript resolves `import "./foo"` and avoiding silent mistransforms
 * when both `foo.ts` and `foo.tsx` exist. Cached on `state` because
 * constructing the underlying `ResolverFactory` is non-trivial.
 */
const MODULE_RESOLVERS = new WeakMap<object, ModuleResolver>();

const RESOLVER_CONFIG = {
  // `.ts` before `.tsx` so a `foo.ts` neighbor wins over a `foo.tsx` neighbor
  // for extensionless imports — we are looking up string-literal constants,
  // which conventionally live in `.ts` files.
  extensions: [".ts", ".tsx", ".jsx", ".js", ".mts", ".cts", ".mjs", ".cjs"],
  conditionNames: ["import", "types", "default"],
  mainFields: ["module", "main"],
  extensionAlias: {
    ".js": [".ts", ".tsx", ".js"],
    ".jsx": [".tsx", ".jsx"],
    ".ts": [".ts", ".tsx"],
  },
  tsconfig: "auto" as const,
};

function resolveModulePath(
  state: DeclProcessingState["state"],
  fromFile: string,
  specifier: string,
): string | null {
  let resolver = MODULE_RESOLVERS.get(state);
  if (!resolver) {
    resolver = createModuleResolver(RESOLVER_CONFIG);
    MODULE_RESOLVERS.set(state, resolver);
  }
  return resolver.resolve(fromFile, specifier) ?? null;
}

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
 * Reads and parses a fully-resolved imported source file with the same `tsx`
 * parser used by the transform. The path passed in is expected to be the
 * output of `oxc-resolver` (extension- and index-resolved), so this function
 * does not probe additional candidates — that responsibility lives in
 * `resolveModulePath`.
 */
function parseImportedSource(
  resolvedPath: string,
  state: DeclProcessingState["state"],
): ParsedProgram | null {
  let cache = PARSED_IMPORT_CACHES.get(state);
  if (!cache) {
    cache = new Map();
    PARSED_IMPORT_CACHES.set(state, cache);
  }
  const memo = cache.get(resolvedPath);
  if (memo !== undefined) {
    return memo;
  }

  let source: string;
  try {
    source = readFileSync(resolvedPath, "utf-8");
  } catch {
    cache.set(resolvedPath, null);
    return null;
  }

  let program: ParsedProgram | null = null;
  try {
    program = state.api.jscodeshift.withParser("tsx")(source);
  } catch {
    program = null;
  }
  cache.set(resolvedPath, program);
  return program;
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
 * Looks for a top-level `export const <name> = "..."` in this program, OR an
 * `export { <name> };` (no `from`) statement paired with a top-level
 * `const <local> = "..."` declaration in the same file. Skips
 * `export { ... } from "..."` (handled by the re-export path) and any
 * non-`const` variable declarations.
 */
function findDirectNamedExportString(
  program: ParsedProgram,
  exportedName: string,
  state: DeclProcessingState["state"],
): string | null {
  // 1. `export const <name> = "..."` (declaration form)
  const fromDeclaration = findFirst(program.find(state.j.ExportNamedDeclaration), (p) => {
    const decl = p.node.declaration;
    if (decl?.type !== "VariableDeclaration" || decl.kind !== "const") {
      return null;
    }
    return findConstDeclaratorString(decl.declarations, exportedName);
  });
  if (fromDeclaration !== null) {
    return fromDeclaration;
  }

  // 2. `export { <name> };` (specifier form, no `from`) paired with a
  //    top-level `const <localName> = "..."` declaration.
  const localBinding = findLocalBindingForReExport(program, exportedName, state);
  if (localBinding === null) {
    return null;
  }
  return findTopLevelLocalConstString(program, localBinding, state);
}

/**
 * Finds a top-level `const <name> = "..."` declaration that is NOT part of an
 * `export` statement. Used to resolve the local-binding side of an
 * `export { X };` re-export pair.
 */
function findTopLevelLocalConstString(
  program: ParsedProgram,
  name: string,
  state: DeclProcessingState["state"],
): string | null {
  return findFirst(
    program
      .find(state.j.VariableDeclaration, { kind: "const" } as { kind: "const" })
      .filter((p) => {
        const parentType = (p.parent?.node as { type?: string } | undefined)?.type;
        return parentType === "Program";
      }),
    (p) => findConstDeclaratorString(p.node.declarations, name),
  );
}

function findTopLevelConstStringInit(
  name: string,
  state: DeclProcessingState["state"],
): string | null {
  const { root, j } = state;
  let resolved: string | null = null;
  root
    .find(j.VariableDeclaration, { kind: "const" } as { kind: "const" })
    .filter((p) => {
      const parentType = (p.parent?.node as { type?: string } | undefined)?.type;
      return parentType === "Program" || parentType === "ExportNamedDeclaration";
    })
    .forEach((p) => {
      if (resolved !== null) {
        return;
      }
      const found = findConstDeclaratorString(p.node.declarations, name);
      if (found !== null) {
        resolved = found;
      }
    });
  return resolved;
}

function resolveScopedConstStringInit(
  expr: { name: string },
  state: DeclProcessingState["state"],
): ScopedStringResolution {
  const identPath = findIdentifierPath(expr, state);
  const exprStart = getNodeStart(expr);
  if (!identPath || exprStart === null) {
    return null;
  }

  const ancestorScopes = getAncestorScopeNodes(identPath);
  let best: { start: number; value: string | null } | null = null;

  state.root.find(state.j.VariableDeclarator).forEach((p) => {
    const declarator = p.node as {
      id?: { type?: string; name?: string };
      init?: unknown;
    };
    if (declarator.id?.type !== "Identifier" || declarator.id.name !== expr.name) {
      return;
    }

    const start = getNodeStart(declarator);
    if (start === null || start >= exprStart) {
      return;
    }

    const path = p as AstPathLike;
    const scopeNode = getDeclarationScopeNode(path, getVariableDeclarationKind(path));
    if (!scopeNode || !ancestorScopes.has(scopeNode)) {
      return;
    }
    if (isProgramNode(scopeNode) || hasInnerBindingBetween(identPath, scopeNode, expr.name)) {
      return;
    }

    const value =
      getVariableDeclarationKind(path) === "const" ? literalToStaticValue(declarator.init) : null;
    const candidate = { start, value: typeof value === "string" ? value : null };
    if (!best || candidate.start > best.start) {
      best = candidate;
    }
  });

  const resolved = best as { start: number; value: string | null } | null;
  if (!resolved) {
    return null;
  }
  return resolved.value === null ? { kind: "blocked" } : { kind: "found", value: resolved.value };
}

function findIdentifierPath(expr: object, state: DeclProcessingState["state"]): AstPathLike | null {
  const paths = state.root
    .find(state.j.Identifier)
    .filter((p) => p.node === expr)
    .paths();
  return (paths[0] as AstPathLike | undefined) ?? null;
}

function getNodeStart(node: unknown): number | null {
  const start = (node as { start?: unknown }).start;
  return typeof start === "number" ? start : null;
}

function getAncestorScopeNodes(path: AstPathLike): Set<object> {
  const scopes = new Set<object>();
  let cur: AstPathLike | null | undefined = path;
  while (cur) {
    if (isScopeNode(cur.node)) {
      scopes.add(cur.node);
    }
    cur = cur.parentPath ?? null;
  }
  return scopes;
}

function getDeclarationScopeNode(path: AstPathLike, declarationKind: string | null): object | null {
  const declarationParent = path.parentPath?.parentPath;
  if (declarationKind !== "var" && declarationParent && isLoopNode(declarationParent.node)) {
    return declarationParent.node;
  }

  let cur: AstPathLike | null | undefined = path.parentPath;
  while (cur) {
    if (declarationKind === "var" && isFunctionOrProgramNode(cur.node)) {
      return cur.node;
    }
    if (declarationKind !== "var" && isLoopNode(cur.node)) {
      return cur.node;
    }
    if (declarationKind !== "var" && isScopeNode(cur.node)) {
      return cur.node;
    }
    cur = cur.parentPath ?? null;
  }
  return null;
}

function hasInnerBindingBetween(
  identPath: AstPathLike,
  outerScopeNode: object,
  name: string,
): boolean {
  let cur: AstPathLike | null | undefined = identPath.parentPath;
  while (cur && cur.node !== outerScopeNode) {
    if (isFunctionNode(cur.node) && functionDeclaresName(cur.node, name)) {
      return true;
    }
    if (isCatchClauseNode(cur.node) && catchClauseDeclaresName(cur.node, name)) {
      return true;
    }
    if (isBlockStatementNode(cur.node) && blockDeclaresName(cur.node, name)) {
      return true;
    }
    if (isSwitchStatementNode(cur.node) && switchStatementDeclaresName(cur.node, name)) {
      return true;
    }
    if (isLoopNode(cur.node) && loopDeclaresName(cur.node, name)) {
      return true;
    }
    cur = cur.parentPath ?? null;
  }
  return false;
}

function functionDeclaresName(node: object, name: string): boolean {
  const fn = node as { id?: unknown; params?: unknown[] };
  const ids = new Set<string>();
  collectPatternIdentifiers(fn.id, ids);
  for (const param of fn.params ?? []) {
    collectPatternIdentifiers(param, ids);
  }
  collectFunctionVarBindings(node, ids);
  return ids.has(name);
}

function collectFunctionVarBindings(node: object, out: Set<string>): void {
  const visit = (current: unknown, isRoot = false): void => {
    if (!current || typeof current !== "object") {
      return;
    }
    if (Array.isArray(current)) {
      for (const child of current) {
        visit(child);
      }
      return;
    }

    if (!isRoot && isFunctionNode(current)) {
      return;
    }

    const astNode = current as {
      type?: string;
      kind?: string;
      declarations?: Array<{ id?: unknown }>;
      [key: string]: unknown;
    };
    if (astNode.type === "VariableDeclaration" && astNode.kind === "var") {
      for (const declarator of astNode.declarations ?? []) {
        collectPatternIdentifiers(declarator.id, out);
      }
      return;
    }

    for (const key of Object.keys(astNode)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      visit(astNode[key]);
    }
  };
  visit(node, true);
}

function catchClauseDeclaresName(node: object, name: string): boolean {
  const catchClause = node as { param?: unknown };
  const ids = new Set<string>();
  collectPatternIdentifiers(catchClause.param, ids);
  return ids.has(name);
}

function blockDeclaresName(node: object, name: string): boolean {
  const block = node as { body?: unknown[] };
  for (const statement of block.body ?? []) {
    if (!statement || typeof statement !== "object") {
      continue;
    }
    const stmt = statement as {
      type?: string;
      kind?: string;
      declarations?: Array<{ id?: unknown }>;
      id?: unknown;
    };
    if (stmt.type === "VariableDeclaration" && (stmt.kind === "let" || stmt.kind === "const")) {
      for (const declarator of stmt.declarations ?? []) {
        const ids = new Set<string>();
        collectPatternIdentifiers(declarator.id, ids);
        if (ids.has(name)) {
          return true;
        }
      }
    }
    if (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") {
      const ids = new Set<string>();
      collectPatternIdentifiers(stmt.id, ids);
      if (ids.has(name)) {
        return true;
      }
    }
  }
  return false;
}

function switchStatementDeclaresName(node: object, name: string): boolean {
  const switchStatement = node as { cases?: Array<{ consequent?: unknown[] }> };
  for (const switchCase of switchStatement.cases ?? []) {
    if (blockDeclaresName({ body: switchCase.consequent ?? [] }, name)) {
      return true;
    }
  }
  return false;
}

function loopDeclaresName(node: object, name: string): boolean {
  const loop = node as { init?: unknown; left?: unknown };
  const binding = loop.init ?? loop.left;
  if (!binding || typeof binding !== "object") {
    return false;
  }
  const declaration = binding as {
    type?: string;
    kind?: string;
    declarations?: Array<{ id?: unknown }>;
  };
  if (
    declaration.type !== "VariableDeclaration" ||
    (declaration.kind !== "let" && declaration.kind !== "const")
  ) {
    return false;
  }
  for (const declarator of declaration.declarations ?? []) {
    const ids = new Set<string>();
    collectPatternIdentifiers(declarator.id, ids);
    if (ids.has(name)) {
      return true;
    }
  }
  return false;
}

function collectPatternIdentifiers(pattern: unknown, out: Set<string>): void {
  if (!pattern || typeof pattern !== "object") {
    return;
  }
  const node = pattern as {
    type?: string;
    name?: string;
    argument?: unknown;
    left?: unknown;
    value?: unknown;
    properties?: unknown[];
    elements?: unknown[];
    parameter?: unknown;
  };
  switch (node.type) {
    case "Identifier":
      if (node.name) {
        out.add(node.name);
      }
      return;
    case "RestElement":
      collectPatternIdentifiers(node.argument, out);
      return;
    case "AssignmentPattern":
      collectPatternIdentifiers(node.left, out);
      return;
    case "ObjectPattern":
      for (const prop of node.properties ?? []) {
        const property = prop as { type?: string; argument?: unknown; value?: unknown } | null;
        collectPatternIdentifiers(
          property?.type === "RestElement" ? property.argument : property?.value,
          out,
        );
      }
      return;
    case "ArrayPattern":
      for (const element of node.elements ?? []) {
        collectPatternIdentifiers(element, out);
      }
      return;
    case "TSParameterProperty":
      collectPatternIdentifiers(node.parameter, out);
      return;
    default:
      return;
  }
}

function getVariableDeclarationKind(path: AstPathLike): string | null {
  const parentNode = path.parentPath?.node as { type?: string; kind?: unknown } | undefined;
  return parentNode?.type === "VariableDeclaration" && typeof parentNode.kind === "string"
    ? parentNode.kind
    : null;
}

function isScopeNode(node: unknown): boolean {
  return isProgramNode(node) || isBlockStatementNode(node);
}

function isProgramNode(node: unknown): boolean {
  return (node as { type?: unknown }).type === "Program";
}

function isFunctionOrProgramNode(node: unknown): boolean {
  return isProgramNode(node) || isFunctionNode(node);
}

function isFunctionNode(node: unknown): node is object {
  const type = (node as { type?: unknown }).type;
  return (
    type === "FunctionDeclaration" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression"
  );
}

function isCatchClauseNode(node: unknown): node is object {
  return (node as { type?: unknown }).type === "CatchClause";
}

function isBlockStatementNode(node: unknown): node is object {
  return (node as { type?: unknown }).type === "BlockStatement";
}

function isSwitchStatementNode(node: unknown): node is object {
  return (node as { type?: unknown }).type === "SwitchStatement";
}

function isLoopNode(node: unknown): node is object {
  const type = (node as { type?: unknown }).type;
  return type === "ForStatement" || type === "ForInStatement" || type === "ForOfStatement";
}

/**
 * Tries to follow re-exports for `<exportedName>` from `<program>`:
 *   - `export { exportedName } from "./other"` (direct)
 *   - `export { Original as exportedName } from "./other"` (aliased)
 *   - `import { Original } from "./other"; export { Original as exportedName };`
 *   - `export * from "./other"` (probed when no direct match)
 *
 * Each candidate specifier is resolved with the shared module resolver
 * relative to `<programPath>`, so directory barrels (`./lib/foo` →
 * `./lib/foo/index.ts`) and TypeScript's extension precedence are honored.
 * Star exports are tried last so direct matches always win.
 */
function followReExports(
  program: ParsedProgram,
  exportedName: string,
  programPath: string,
  state: DeclProcessingState["state"],
  visited: Set<string>,
): string | null {
  const resolveTarget = (specifier: string, originalName: string): string | null => {
    const targetPath = resolveModulePath(state, programPath, specifier);
    if (targetPath === null) {
      return null;
    }
    return resolveExportFromFile(targetPath, originalName, state, visited);
  };

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
