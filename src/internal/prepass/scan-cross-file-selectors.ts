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
import { resolve as pathResolve } from "node:path";
import { createPrepassParser, type AstNode, type PrepassParserName } from "./prepass-parser.js";
import type { ModuleResolver } from "./resolve-imports.js";
import type { CrossFileSelectorUsage as CoreUsage } from "../transform-types.js";
import { addToSetMap } from "../utilities/collection-utils.js";

/* ── Public types ─────────────────────────────────────────────────────── */

/** Extends the core CrossFileSelectorUsage with prepass-specific fields. */
export interface CrossFileSelectorUsage extends CoreUsage {
  /** Absolute path of the consumer file */
  consumerPath: string;
  /** Whether the consumer is in the `files` set (Scenario A) */
  consumerIsTransformed: boolean;
}

export interface CrossFileInfo {
  /** Consumer file → its cross-file selector usages */
  selectorUsages: Map<string, CrossFileSelectorUsage[]>;
  /** Target file → set of exported component names that need style acceptance (Scenario A) */
  componentsNeedingStyleAcceptance: Map<string, Set<string>>;
  /** Target file → set of exported component names that need bridge className (Scenario B) */
  componentsNeedingBridge: Map<string, Set<string>>;
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
  const componentsNeedingStyleAcceptance = new Map<string, Set<string>>();
  const componentsNeedingBridge = new Map<string, Set<string>>();

  // Create the parser once, reuse for all files (avoids per-file setup cost)
  const parser = createPrepassParser(parserName);

  for (const filePath of allFiles) {
    const usages = scanFile(filePath, transformSet, resolver, parser);
    if (usages.length === 0) {
      continue;
    }

    selectorUsages.set(filePath, usages);

    for (const usage of usages) {
      if (usage.consumerIsTransformed) {
        addToSetMap(componentsNeedingStyleAcceptance, usage.resolvedPath, usage.importedName);
      } else {
        addToSetMap(componentsNeedingBridge, usage.resolvedPath, usage.importedName);
      }
    }
  }

  const result = { selectorUsages, componentsNeedingStyleAcceptance, componentsNeedingBridge };

  if (process.env.DEBUG_CODEMOD) {
    logCrossFileDebug(allFiles, result);
  }

  return result;
}

/* ── File scanner ─────────────────────────────────────────────────────── */

/**
 * Pre-filter: matches any bare `${Identifier}` template expression.
 * Used to skip files that only contain arrow functions or member expressions
 * in template literals (e.g. `${props => ...}`, `${theme.color}`).
 */
const BARE_TEMPLATE_IDENTIFIER_RE = /\$\{\s*[a-zA-Z_$][\w$]*\s*\}/;

/** Placeholder pattern used by styled-components template parsing */
const PLACEHOLDER_RE = /__SC_EXPR_(\d+)__/g;

function scanFile(
  filePath: string,
  transformSet: ReadonlySet<string>,
  resolver: ModuleResolver,
  parser: ReturnType<typeof createPrepassParser>,
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

    usages.push({
      localName,
      importSource: imp.source,
      importedName: imp.importedName,
      resolvedPath: pathResolve(resolvedPath),
      consumerPath: filePath,
      consumerIsTransformed,
    });
  }

  return usages;
}

/* ── AST walk & helpers ──────────────────────────────────────────────── */

/**
 * Walk the AST collecting ImportDeclaration and TaggedTemplateExpression nodes.
 *
 * Uses a targeted recursive walk — only descends into node types that can
 * contain these targets (skips into type annotations, etc.).
 */
function walkForImportsAndTemplates(node: unknown, imports: AstNode[], templates: AstNode[]): void {
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

type ImportEntry = { source: string; importedName: string };

/** Build a map of localName → import info from raw ImportDeclaration nodes. */
function buildImportMapFromNodes(importNodes: AstNode[]): Map<string, ImportEntry> {
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
function findStyledImportNameFromNodes(importNodes: AstNode[]): string | undefined {
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
function findComponentSelectorLocalsFromNodes(
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
    for (const match of rawCss.matchAll(PLACEHOLDER_RE)) {
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

/**
 * Determine if a placeholder at the given position is in a CSS selector context
 * rather than a property value context.
 *
 * Selector context: followed by `{`, or preceded by `&:pseudo ` and followed by `{` eventually.
 * Value context: after `:` with no intervening `{`, `}`, or `;`.
 */
function isPlaceholderInSelectorContext(rawCss: string, pos: number, length: number): boolean {
  const after = rawCss.slice(pos + length).trimStart();
  const before = rawCss.slice(0, pos).trimEnd();

  // If preceded by `:` with no `{`, `}`, or `;` between, it's a value context
  // (but `:hover`, `:focus` etc. are pseudo-selectors, not values)
  const lastSemiOrBrace = Math.max(
    before.lastIndexOf(";"),
    before.lastIndexOf("{"),
    before.lastIndexOf("}"),
  );
  const lastColon = before.lastIndexOf(":");
  if (lastColon > lastSemiOrBrace) {
    const colonContext = before.slice(lastColon).trim();
    if (!/^:[a-z-]+/i.test(colonContext)) {
      return false;
    }
  }

  // Followed by `{` → definitely a selector
  if (after.startsWith("{")) {
    return true;
  }

  // A `{` appears before the next `;` → likely a selector context.
  // Reject if there's a value-separator colon (`:` followed by whitespace),
  // but allow pseudo-selector colons (`:hover`, `::before`, `:nth-child()`).
  const afterUpToBrace = after.split("{")[0] ?? "";
  const afterUpToSemi = after.split(";")[0] ?? "";
  if (afterUpToBrace.length < afterUpToSemi.length) {
    const hasValueSeparatorColon = /:\s|:$/.test(afterUpToBrace);
    if (!hasValueSeparatorColon) {
      return true;
    }
  }

  return false;
}

/* ── Debug logging ────────────────────────────────────────────────────── */

function logCrossFileDebug(scannedFiles: string[], info: CrossFileInfo): void {
  const lines: string[] = ["[DEBUG_CODEMOD] Cross-file selector prepass:"];
  lines.push(`  Scanned ${scannedFiles.length} file(s)`);

  if (info.selectorUsages.size === 0) {
    lines.push("  No cross-file selector usages found.");
  } else {
    lines.push(`  Found cross-file selector usages in ${info.selectorUsages.size} file(s):`);
    for (const [consumer, usages] of info.selectorUsages) {
      for (const u of usages) {
        lines.push(
          `    ${consumer} → ${u.importedName} (from ${u.resolvedPath}, transformed=${u.consumerIsTransformed})`,
        );
      }
    }
  }

  if (info.componentsNeedingStyleAcceptance.size > 0) {
    lines.push("  Components needing style acceptance (Scenario A):");
    for (const [file, names] of info.componentsNeedingStyleAcceptance) {
      lines.push(`    ${file}: ${[...names].join(", ")}`);
    }
  }

  if (info.componentsNeedingBridge.size > 0) {
    lines.push("  Components needing bridge className (Scenario B):");
    for (const [file, names] of info.componentsNeedingBridge) {
      lines.push(`    ${file}: ${[...names].join(", ")}`);
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
function deduplicateAndResolve(
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
