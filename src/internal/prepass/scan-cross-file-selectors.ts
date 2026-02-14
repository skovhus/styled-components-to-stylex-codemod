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
 * Uses jscodeshift AST parsing for correctness (handles multi-line imports,
 * comments, aliased imports, etc.). The quick-bail on "styled-components"
 * substring avoids parsing files that don't use styled-components at all.
 */
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import jscodeshift from "jscodeshift";
import type { ModuleResolver } from "./resolve-imports.js";
import type { CrossFileSelectorUsage as CoreUsage } from "../transform-types.js";

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
 */
export function scanCrossFileSelectors(
  filesToTransform: readonly string[],
  consumerPaths: readonly string[],
  resolver: ModuleResolver,
): CrossFileInfo {
  const transformSet = new Set(filesToTransform.map((f) => pathResolve(f)));
  const allFiles = deduplicateAndResolve(filesToTransform, consumerPaths);

  const selectorUsages = new Map<string, CrossFileSelectorUsage[]>();
  const componentsNeedingStyleAcceptance = new Map<string, Set<string>>();
  const componentsNeedingBridge = new Map<string, Set<string>>();

  // Create the parser once, reuse for all files
  const j = jscodeshift.withParser("tsx");

  for (const filePath of allFiles) {
    const usages = scanFile(filePath, transformSet, resolver, j);
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

  return { selectorUsages, componentsNeedingStyleAcceptance, componentsNeedingBridge };
}

/* ── File scanner ─────────────────────────────────────────────────────── */

/** Placeholder pattern used by styled-components template parsing */
const PLACEHOLDER_RE = /__SC_EXPR_(\d+)__/g;

function scanFile(
  filePath: string,
  transformSet: ReadonlySet<string>,
  resolver: ModuleResolver,
  j: ReturnType<typeof jscodeshift.withParser>,
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

  let root: ReturnType<typeof j>;
  try {
    root = j(source);
  } catch {
    return [];
  }

  // Step 1: Build import map (localName → { source, importedName })
  const importMap = buildImportMap(root, j);
  if (importMap.size === 0) {
    return [];
  }

  // Step 2: Find the styled default import name
  const styledImportName = findStyledImportName(root, j);
  if (!styledImportName) {
    return [];
  }

  // Step 3: Find template expressions used as selectors
  const selectorLocals = findComponentSelectorLocals(root, j, styledImportName);
  if (selectorLocals.size === 0) {
    return [];
  }

  // Step 4: Resolve import specifiers to absolute paths
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

/* ── AST helpers ──────────────────────────────────────────────────────── */

type ImportEntry = { source: string; importedName: string };

/** Build a map of localName → import info for all import declarations. */
function buildImportMap(
  root: ReturnType<typeof jscodeshift>,
  j: typeof jscodeshift,
): Map<string, ImportEntry> {
  const map = new Map<string, ImportEntry>();

  root.find(j.ImportDeclaration).forEach((path) => {
    const source = path.node.source.value;
    if (typeof source !== "string") {
      return;
    }

    for (const specifier of path.node.specifiers ?? []) {
      const localName = getIdentifierName(specifier.local);
      if (!localName) {
        continue;
      }

      if (specifier.type === "ImportDefaultSpecifier") {
        map.set(localName, { source, importedName: "default" });
      } else if (specifier.type === "ImportSpecifier") {
        const importedName = getIdentifierName(specifier.imported) ?? localName;
        map.set(localName, { source, importedName });
      }
    }
  });

  return map;
}

/** Find the local name for the styled-components default import. */
function findStyledImportName(
  root: ReturnType<typeof jscodeshift>,
  j: typeof jscodeshift,
): string | undefined {
  let styledName: string | undefined;

  root.find(j.ImportDeclaration).forEach((path) => {
    if (path.node.source.value !== "styled-components") {
      return;
    }
    for (const spec of path.node.specifiers ?? []) {
      if (spec.type === "ImportDefaultSpecifier") {
        const name = getIdentifierName(spec.local);
        if (name) {
          styledName = name;
        }
      }
    }
  });

  return styledName;
}

/**
 * Find local names of imported components used as selectors inside
 * styled-components template literals.
 *
 * Detects `${Identifier}` expressions inside tagged templates where the
 * tag is a styled-components call, and the expression is used as a CSS
 * selector (i.e. the placeholder appears in a selector context like
 * `__SC_EXPR_0__ { ... }` or `&:hover __SC_EXPR_0__ { ... }`).
 */
function findComponentSelectorLocals(
  root: ReturnType<typeof jscodeshift>,
  j: typeof jscodeshift,
  styledImportName: string,
): Set<string> {
  const selectorLocals = new Set<string>();

  root.find(j.TaggedTemplateExpression).forEach((path) => {
    if (!isStyledTag(path.node.tag, styledImportName)) {
      return;
    }

    const template = path.node.quasi;
    const expressions = template.expressions;

    // Reconstruct the raw CSS with placeholders
    const rawParts: string[] = [];
    for (let i = 0; i < template.quasis.length; i++) {
      rawParts.push(template.quasis[i]!.value.raw);
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
        if (expr && expr.type === "Identifier") {
          selectorLocals.add(expr.name);
        }
      }
    }
  });

  return selectorLocals;
}

/**
 * Check whether a styled-components tag expression is a styled call.
 * Matches: styled.div, styled(X), styled.div.attrs(...), styled(X).withConfig(...), etc.
 */
function isStyledTag(tag: unknown, styledName: string): boolean {
  const node = tag as Record<string, unknown>;
  if (!node || typeof node !== "object") {
    return false;
  }

  // styled.div
  if (
    node.type === "MemberExpression" &&
    (node.object as Record<string, unknown>)?.type === "Identifier" &&
    (node.object as Record<string, unknown>)?.name === styledName
  ) {
    return true;
  }

  // styled(X)
  if (
    node.type === "CallExpression" &&
    (node.callee as Record<string, unknown>)?.type === "Identifier" &&
    (node.callee as Record<string, unknown>)?.name === styledName
  ) {
    return true;
  }

  // styled.div.attrs(...) / styled(X).withConfig(...)
  if (node.type === "CallExpression" && node.callee) {
    const callee = node.callee as Record<string, unknown>;
    if (callee.type === "MemberExpression" && callee.object) {
      return isStyledTag(callee.object, styledName);
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

/* ── Utilities ────────────────────────────────────────────────────────── */

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

/** Safely extract the name string from an AST identifier-like node. */
function getIdentifierName(node: unknown): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  const n = node as { type?: string; name?: string };
  if (n.type === "Identifier" && typeof n.name === "string") {
    return n.name;
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
