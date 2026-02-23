/**
 * Prepass: scan files for cross-file styled-component selector usage.
 *
 * Detects patterns like:
 *   import { Icon } from "./icon";
 *   const Btn = styled(Button)` ${Icon} { ... } `;
 *
 * Returns a CrossFileInfo map describing which components are used as
 * selectors across file boundaries, enabling marker-based override wiring.
 *
 * Uses @babel/parser directly (with tokens disabled) and a manual AST walk
 * for speed — avoids recast/jscodeshift Collection overhead since this is a
 * read-only scan. Regex pre-filters skip files without styled-components or
 * bare `${Identifier}` template expressions.
 */
import { readFileSync } from "node:fs";
import { relative, resolve as pathResolve } from "node:path";
import { createPrepassParser, type AstNode, type PrepassParserName } from "./prepass-parser.js";
import type { ModuleResolver } from "./resolve-imports.js";
import type { CrossFileSelectorUsage as CoreUsage } from "../transform-types.js";
import { addToSetMap } from "../utilities/collection-utils.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import { isSelectorContext } from "../utilities/selector-context-heuristic.js";

/* ── Public types ─────────────────────────────────────────────────────── */

/** Extends the core CrossFileSelectorUsage with prepass-specific fields. */
export interface CrossFileSelectorUsage extends CoreUsage {
  /** Absolute path of the consumer file */
  consumerPath: string;
  /** Whether the consumer is in the `files` set (both consumer and target are transformed) */
  consumerIsTransformed: boolean;
}

export interface CrossFileInfo {
  /** Consumer file → its cross-file selector usages */
  selectorUsages: Map<string, CrossFileSelectorUsage[]>;
  /** Target file → exported component names needing marker sidecar (both consumer and target are transformed) */
  componentsNeedingMarkerSidecar: Map<string, Set<string>>;
  /** Target file → exported component names needing global selector bridge className (consumer is not transformed) */
  componentsNeedingGlobalSelectorBridge: Map<string, Set<string>>;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Scan files and build cross-file selector information.
 *
 * @param filesToTransform  Absolute paths of files being transformed
 * @param consumerPaths     Additional absolute paths to scan for selector usage (but not transform)
 * @param resolver          Module resolver instance
 * @param parserName        Parser to use (matches jscodeshift's parser option)
 */
export function scanCrossFileSelectors(
  filesToTransform: readonly string[],
  consumerPaths: readonly string[],
  resolver: ModuleResolver,
  parserName?: PrepassParserName,
): CrossFileInfo {
  const transformSet = new Set(filesToTransform.map((f) => pathResolve(f)));
  const allFiles = deduplicateAndResolve(filesToTransform, consumerPaths);

  const selectorUsages = new Map<string, CrossFileSelectorUsage[]>();
  const componentsNeedingMarkerSidecar = new Map<string, Set<string>>();
  const componentsNeedingGlobalSelectorBridge = new Map<string, Set<string>>();

  // Create the parser once, reuse for all files (avoids per-file setup cost)
  const parser = createPrepassParser(parserName);
  const cachedReadFile = createCachedFileReader();

  for (const filePath of allFiles) {
    const usages = scanFile(filePath, transformSet, resolver, parser, cachedReadFile);
    if (usages.length === 0) {
      continue;
    }

    selectorUsages.set(filePath, usages);

    for (const usage of usages) {
      // Bridge usages reference already-converted files; the consumer handles marker
      // generation via the forward selector handler — no sidecar/bridge needed on target.
      if (usage.bridgeComponentName) {
        continue;
      }
      if (usage.consumerIsTransformed) {
        addToSetMap(componentsNeedingMarkerSidecar, usage.resolvedPath, usage.importedName);
      } else {
        addToSetMap(componentsNeedingGlobalSelectorBridge, usage.resolvedPath, usage.importedName);
      }
    }
  }

  const result = {
    selectorUsages,
    componentsNeedingMarkerSidecar,
    componentsNeedingGlobalSelectorBridge,
  };

  if (process.env.DEBUG_CODEMOD) {
    logCrossFileDebug(allFiles, result);
  }

  return result;
}

/* ── Exported constants (used by run-prepass.ts) ─────────────────────── */

/**
 * Pre-filter: matches any bare `${Identifier}` template expression.
 * Used to skip files that only contain arrow functions or member expressions
 * in template literals (e.g. `${props => ...}`, `${theme.color}`).
 */
export const BARE_TEMPLATE_IDENTIFIER_RE = /\$\{\s*[a-zA-Z_$][\w$]*\s*\}/;

/* ── Bridge GlobalSelector detection ─────────────────────────────────── */

/** Regex matching `export const XGlobalSelector = ".sc2sx-` pattern (global for matchAll). */
const BRIDGE_EXPORT_RE = /export\s+const\s+(\w+GlobalSelector)\s*=\s*["']\.sc2sx-/g;

/**
 * Detect whether an imported name is a bridge GlobalSelector from an
 * already-converted StyleX file.
 *
 * Detection criteria (hybrid fast + safe):
 * 1. Variable name ends with "GlobalSelector" AND the stripped name starts uppercase
 * 2. Target file contains "@stylexjs/stylex" (string check, no parse)
 * 3. Target file has a matching `export const XGlobalSelector = ".sc2sx-"` pattern
 *
 * @returns The stripped component name (e.g., "CollapseArrowIcon" for
 *   "CollapseArrowIconGlobalSelector"), or null if not a bridge.
 */
export function detectBridgeGlobalSelector(
  importedName: string,
  resolvedPath: string,
  readFile: (path: string) => string,
): string | null {
  // Check 1: name ends with "GlobalSelector" and stripped name starts uppercase
  if (!importedName.endsWith("GlobalSelector")) {
    return null;
  }
  const stripped = importedName.slice(0, -"GlobalSelector".length);
  if (!stripped || !/^[A-Z]/.test(stripped)) {
    return null;
  }

  // Check 2 & 3: target file contains StyleX and matching export
  const content = readFile(resolvedPath);
  if (!content || !content.includes("@stylexjs/stylex")) {
    return null;
  }
  let found = false;
  for (const m of content.matchAll(BRIDGE_EXPORT_RE)) {
    if (m[1] === importedName) {
      found = true;
      break;
    }
  }
  if (!found) {
    return null;
  }

  return stripped;
}

type ImportEntry = { source: string; importedName: string };

/**
 * If `importedName` is a bridge GlobalSelector, populate bridge fields on `usage`
 * and find the corresponding component import from the same source.
 */
export function applyBridgeFields(
  usage: CrossFileSelectorUsage | CoreUsage,
  importedName: string,
  localName: string,
  resolvedPath: string,
  importMap: ReadonlyMap<string, ImportEntry>,
  readFile: (path: string) => string,
): void {
  const bridgeName = detectBridgeGlobalSelector(importedName, resolvedPath, readFile);
  if (!bridgeName) {
    return;
  }
  usage.bridgeComponentName = bridgeName;
  // Find the actual component import from the same source
  const imp = importMap.get(localName);
  if (!imp) {
    return;
  }
  for (const [otherLocal, otherImp] of importMap) {
    if (otherImp.source === imp.source && otherLocal !== localName) {
      // Default imports always match — a module has one default export, which is the component.
      // Named imports match by exported name.
      if (otherImp.importedName === "default" || otherImp.importedName === bridgeName) {
        usage.bridgeComponentLocalName = otherLocal;
        break;
      }
    }
  }
}

/* ── File scanner ─────────────────────────────────────────────────────── */

/** Global version for matchAll/replace operations */
const PLACEHOLDER_RE_G = new RegExp(PLACEHOLDER_RE.source, "g");

/** Create a cached file reader scoped to a single scan invocation. */
function createCachedFileReader(): (path: string) => string {
  const cache = new Map<string, string>();
  return (filePath: string): string => {
    const cached = cache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const content = readFileSync(filePath, "utf-8");
      cache.set(filePath, content);
      return content;
    } catch {
      cache.set(filePath, "");
      return "";
    }
  };
}

function scanFile(
  filePath: string,
  transformSet: ReadonlySet<string>,
  resolver: ModuleResolver,
  parser: ReturnType<typeof createPrepassParser>,
  readFile: (path: string) => string,
): CrossFileSelectorUsage[] {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  // Quick bail: skip files that don't use styled-components
  if (!source.includes("styled-components")) {
    return [];
  }

  // Quick bail: skip files without any bare `${Identifier}` template expression.
  // Component selectors are always bare identifiers (e.g. `${Text}`, `${highlight}`).
  // This avoids expensive AST parsing for files that only use arrow functions
  // (`${props => ...}`) or member expressions (`${theme.color}`) in templates.
  if (!BARE_TEMPLATE_IDENTIFIER_RE.test(source)) {
    return [];
  }

  let ast: AstNode;
  try {
    ast = parser.parse(source) as AstNode;
  } catch {
    return [];
  }

  const program = (ast.program ?? ast) as AstNode;

  // Step 1: Collect imports and tagged template expressions in a single walk
  const importNodes: AstNode[] = [];
  const taggedTemplateNodes: AstNode[] = [];
  walkForImportsAndTemplates(program, importNodes, taggedTemplateNodes);

  // Step 2: Build import map (localName → { source, importedName })
  const importMap = buildImportMapFromNodes(importNodes);
  if (importMap.size === 0) {
    return [];
  }

  // Step 3: Find the styled default import name
  const styledImportName = findStyledImportNameFromNodes(importNodes);
  if (!styledImportName) {
    return [];
  }

  // Step 4: Find template expressions used as selectors
  const selectorLocals = findComponentSelectorLocalsFromNodes(
    taggedTemplateNodes,
    styledImportName,
  );
  if (selectorLocals.size === 0) {
    return [];
  }

  // Step 5: Resolve import specifiers to absolute paths
  const consumerIsTransformed = transformSet.has(filePath);
  const usages: CrossFileSelectorUsage[] = [];
  for (const localName of selectorLocals) {
    const imp = importMap.get(localName);
    if (!imp || imp.source === "styled-components") {
      continue;
    }

    const resolvedPath = resolver.resolve(filePath, imp.source);
    if (!resolvedPath || pathResolve(resolvedPath) === filePath) {
      continue;
    }

    const absResolved = pathResolve(resolvedPath);
    const usage: CrossFileSelectorUsage = {
      localName,
      importSource: imp.source,
      importedName: imp.importedName,
      resolvedPath: absResolved,
      consumerPath: filePath,
      consumerIsTransformed,
    };

    // Check if this is a bridge GlobalSelector from an already-converted StyleX file
    applyBridgeFields(usage, imp.importedName, localName, absResolved, importMap, readFile);

    usages.push(usage);
  }

  return usages;
}

/* ── AST walk & helpers ──────────────────────────────────────────────── */

/**
 * Walk the AST collecting ImportDeclaration and TaggedTemplateExpression nodes.
 *
 * Uses a targeted recursive walk — only descends into node types that can
 * contain these targets (skips type annotations, comments, etc.).
 */
export function walkForImportsAndTemplates(
  node: unknown,
  imports: AstNode[],
  templates: AstNode[],
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as AstNode;
  if (n.type === "ImportDeclaration") {
    imports.push(n);
    return; // No need to descend into import declarations
  }
  if (n.type === "TaggedTemplateExpression") {
    templates.push(n);
    return; // No need to descend further
  }
  for (const key of Object.keys(n)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }
    const val = n[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        walkForImportsAndTemplates(child, imports, templates);
      }
    } else if (val && typeof val === "object" && (val as AstNode).type) {
      walkForImportsAndTemplates(val, imports, templates);
    }
  }
}

/** Build a map of localName → import info from raw ImportDeclaration nodes. */
export function buildImportMapFromNodes(importNodes: AstNode[]): Map<string, ImportEntry> {
  const map = new Map<string, ImportEntry>();

  for (const node of importNodes) {
    const sourceValue = (node.source as AstNode | undefined)?.value;
    if (typeof sourceValue !== "string") {
      continue;
    }

    const specifiers = node.specifiers as AstNode[] | undefined;
    if (!specifiers) {
      continue;
    }

    for (const spec of specifiers) {
      const localName = getNodeName(spec.local as AstNode | undefined);
      if (!localName) {
        continue;
      }

      if (spec.type === "ImportDefaultSpecifier") {
        map.set(localName, { source: sourceValue, importedName: "default" });
      } else if (spec.type === "ImportSpecifier") {
        const importedName = getNodeName(spec.imported as AstNode | undefined) ?? localName;
        map.set(localName, { source: sourceValue, importedName });
      }
    }
  }

  return map;
}

/** Find the local name for the styled-components default import. */
export function findStyledImportNameFromNodes(importNodes: AstNode[]): string | undefined {
  for (const node of importNodes) {
    const sourceValue = (node.source as AstNode | undefined)?.value;
    if (sourceValue !== "styled-components") {
      continue;
    }
    const specifiers = node.specifiers as AstNode[] | undefined;
    if (!specifiers) {
      continue;
    }
    for (const spec of specifiers) {
      if (spec.type === "ImportDefaultSpecifier") {
        const name = getNodeName(spec.local as AstNode | undefined);
        if (name) {
          return name;
        }
      }
    }
  }
  return undefined;
}

/**
 * Find local names of imported components used as selectors inside
 * styled-components template literals.
 */
export function findComponentSelectorLocalsFromNodes(
  templateNodes: AstNode[],
  styledImportName: string,
): Set<string> {
  const selectorLocals = new Set<string>();

  for (const node of templateNodes) {
    if (!isStyledTag(node.tag as AstNode, styledImportName)) {
      continue;
    }

    const quasi = node.quasi as AstNode | undefined;
    if (!quasi) {
      continue;
    }

    const quasis = quasi.quasis as AstNode[] | undefined;
    const expressions = quasi.expressions as AstNode[] | undefined;
    if (!quasis || !expressions) {
      continue;
    }

    // Reconstruct the raw CSS with placeholders
    const rawParts: string[] = [];
    for (let i = 0; i < quasis.length; i++) {
      const value = quasis[i]?.value as { raw?: string } | undefined;
      rawParts.push(value?.raw ?? "");
      if (i < expressions.length) {
        rawParts.push(`__SC_EXPR_${i}__`);
      }
    }
    const rawCss = rawParts.join("");

    // Find placeholders used as selectors (not as values)
    for (const match of rawCss.matchAll(PLACEHOLDER_RE_G)) {
      const exprIndex = Number(match[1]);
      const pos = match.index;

      if (isPlaceholderInSelectorContext(rawCss, pos, match[0].length)) {
        const expr = expressions[exprIndex];
        if (expr?.type === "Identifier" && typeof expr.name === "string") {
          selectorLocals.add(expr.name);
        }
      }
    }
  }

  return selectorLocals;
}

/**
 * Check whether a styled-components tag expression is a styled call.
 * Matches: styled.div, styled(X), styled.div.attrs(...), styled(X).withConfig(...), etc.
 */
function isStyledTag(tag: AstNode | undefined, styledName: string): boolean {
  if (!tag || typeof tag !== "object") {
    return false;
  }

  // styled.div
  if (tag.type === "MemberExpression") {
    const obj = tag.object as AstNode | undefined;
    if (obj?.type === "Identifier" && obj.name === styledName) {
      return true;
    }
  }

  // styled(X)
  if (tag.type === "CallExpression") {
    const callee = tag.callee as AstNode | undefined;
    if (callee?.type === "Identifier" && callee.name === styledName) {
      return true;
    }
    // styled.div.attrs(...) / styled(X).withConfig(...)
    if (callee?.type === "MemberExpression" && callee.object) {
      return isStyledTag(callee.object as AstNode, styledName);
    }
  }

  return false;
}

/** Check if a placeholder at the given position is in a CSS selector context. */
function isPlaceholderInSelectorContext(rawCss: string, pos: number, length: number): boolean {
  const after = rawCss.slice(pos + length).trimStart();
  const before = rawCss.slice(0, pos).trimEnd();
  // Replace placeholders in `before` with a valid CSS identifier so that
  // `&:__SC_EXPR_N__` is recognized as a pseudo-selector (like `&:hover`)
  // rather than a property-value colon context.
  return isSelectorContext(before.replace(PLACEHOLDER_RE_G, "hover"), after);
}

/* ── Debug logging ────────────────────────────────────────────────────── */

function logCrossFileDebug(scannedFiles: string[], info: CrossFileInfo): void {
  const cwd = process.cwd();
  const rel = (p: string): string => relative(cwd, p);

  const lines: string[] = ["[DEBUG_CODEMOD] Cross-file selector prepass:"];
  lines.push(`  Scanned ${scannedFiles.length} file(s)`);

  if (info.selectorUsages.size === 0) {
    lines.push("  No cross-file selector usages found.");
  } else {
    lines.push(`  Found cross-file selector usages in ${info.selectorUsages.size} file(s):`);
    for (const [consumer, usages] of info.selectorUsages) {
      for (const u of usages) {
        lines.push(
          `    ${rel(consumer)} → ${u.importedName} (from ${rel(u.resolvedPath)}, transformed=${u.consumerIsTransformed})`,
        );
      }
    }
  }

  if (info.componentsNeedingMarkerSidecar.size > 0) {
    lines.push("  Components needing marker sidecar (both consumer and target transformed):");
    for (const [file, names] of info.componentsNeedingMarkerSidecar) {
      lines.push(`    ${rel(file)}: ${[...names].join(", ")}`);
    }
  }

  if (info.componentsNeedingGlobalSelectorBridge.size > 0) {
    lines.push("  Components needing global selector bridge className (consumer not transformed):");
    for (const [file, names] of info.componentsNeedingGlobalSelectorBridge) {
      lines.push(`    ${rel(file)}: ${[...names].join(", ")}`);
    }
  }

  process.stderr.write(lines.join("\n") + "\n");
}

/* ── Utilities ────────────────────────────────────────────────────────── */

/** Safely extract the name string from an AST identifier-like node. */
function getNodeName(node: AstNode | undefined): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }
  return undefined;
}

/** Deduplicate and resolve two file lists into a single array of absolute paths. */
export function deduplicateAndResolve(
  filesToTransform: readonly string[],
  consumerPaths: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const f of filesToTransform) {
    const abs = pathResolve(f);
    if (!seen.has(abs)) {
      seen.add(abs);
      result.push(abs);
    }
  }
  for (const f of consumerPaths) {
    const abs = pathResolve(f);
    if (!seen.has(abs)) {
      seen.add(abs);
      result.push(abs);
    }
  }
  return result;
}
