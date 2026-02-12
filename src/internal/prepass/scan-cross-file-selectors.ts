/**
 * Prepass: scan files for cross-file styled-component selector usage.
 *
 * Detects patterns like:
 *   import { Icon } from "./icon";
 *   const Btn = styled(Button)` ${Icon} { ... } `;
 *
 * Returns a CrossFileInfo map describing which components are used as
 * selectors across file boundaries, enabling marker-based override wiring.
 */
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import jscodeshift from "jscodeshift";
import type { ModuleResolver } from "./resolve-imports.js";

/* ── Public types ─────────────────────────────────────────────────────── */

export interface CrossFileSelectorUsage {
  /** Local name in the consumer file (e.g. "CollapseArrowIcon") */
  localName: string;
  /** Raw import specifier (e.g. "./lib/collapse-arrow-icon") */
  importSource: string;
  /** Imported binding name ("default" for default imports, otherwise named) */
  importedName: string;
  /** Absolute path of the target module */
  resolvedPath: string;
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
  const allFiles = [...new Set([...filesToTransform, ...consumerPaths])].map((f) => pathResolve(f));

  const selectorUsages = new Map<string, CrossFileSelectorUsage[]>();
  const componentsNeedingStyleAcceptance = new Map<string, Set<string>>();
  const componentsNeedingBridge = new Map<string, Set<string>>();

  for (const filePath of allFiles) {
    const usages = scanFile(filePath, transformSet, resolver);
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
): CrossFileSelectorUsage[] {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  // Quick bail: skip files that don't use styled-components
  if (!source.includes("styled")) {
    return [];
  }

  const j = jscodeshift.withParser("tsx");
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

  // Step 4: Match selector locals to imports and resolve paths
  const usages: CrossFileSelectorUsage[] = [];
  for (const localName of selectorLocals) {
    const imp = importMap.get(localName);
    if (!imp) {
      continue; // Not an import — same-file component, skip
    }

    // Skip styled-components itself
    if (imp.source === "styled-components") {
      continue;
    }

    const resolvedPath = resolver.resolve(filePath, imp.source);
    if (!resolvedPath) {
      continue; // Unresolvable — skip gracefully
    }

    // Skip self-references (shouldn't happen, but defensive)
    if (pathResolve(resolvedPath) === pathResolve(filePath)) {
      continue;
    }

    usages.push({
      localName,
      importSource: imp.source,
      importedName: imp.importedName,
      resolvedPath: pathResolve(resolvedPath),
      consumerPath: pathResolve(filePath),
      consumerIsTransformed: transformSet.has(pathResolve(filePath)),
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
      if (specifier.type === "ImportDefaultSpecifier" && specifier.local) {
        map.set(specifier.local.name, { source, importedName: "default" });
      } else if (specifier.type === "ImportSpecifier" && specifier.local) {
        const importedName =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : String(specifier.imported.value);
        map.set(specifier.local.name, { source, importedName });
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
      if (spec.type === "ImportDefaultSpecifier" && spec.local) {
        styledName = spec.local.name;
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
 * selector (i.e. it's used alone as a placeholder in the CSS, like
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

      // A component-as-selector usage: the placeholder appears in a selector
      // context. Heuristic: it's followed (possibly with whitespace) by `{` or
      // preceded by `&:pseudo ` / `& ` patterns, and it's NOT inside a property value.
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
 * Selector context indicators:
 * - Followed by `{` (possibly with whitespace): `__SC_EXPR_0__ { ... }`
 * - Preceded by `&:pseudo `: `&:hover __SC_EXPR_0__ { ... }`
 * - At the start of a rule block or after a closing `}`
 *
 * Value context indicators:
 * - After `:` (property value): `color: __SC_EXPR_0__`
 */
function isPlaceholderInSelectorContext(rawCss: string, pos: number, length: number): boolean {
  // Look at what follows the placeholder
  const after = rawCss.slice(pos + length).trimStart();
  const followedByBrace = after.startsWith("{");

  // Look at what precedes the placeholder
  const before = rawCss.slice(0, pos).trimEnd();

  // If preceded by `:` with no `{` or `}` between, it's a value context
  const lastSemiOrBrace = Math.max(
    before.lastIndexOf(";"),
    before.lastIndexOf("{"),
    before.lastIndexOf("}"),
  );
  const lastColon = before.lastIndexOf(":");
  if (lastColon > lastSemiOrBrace) {
    // There's a `:` after the last statement boundary — likely a value context.
    // But `:hover`, `:focus` etc. are pseudo-selectors, not values.
    const colonContext = before.slice(lastColon).trim();
    // If the colon context starts with a pseudo keyword, it's still a selector
    if (!/^:[a-z-]+/i.test(colonContext)) {
      return false;
    }
  }

  // If followed by `{`, it's definitely a selector
  if (followedByBrace) {
    return true;
  }

  // If preceded by `&` or `& ` pattern and not in a value, likely a selector
  // e.g., `&:hover __SC_EXPR_0__` — the expr appears after a pseudo but
  // is followed by more CSS before a `{`
  const afterUpToBrace = after.split("{")[0] ?? "";
  const afterUpToSemi = after.split(";")[0] ?? "";
  // If there's a `{` coming soon and no `:` between, still a selector context
  if (afterUpToBrace.length < afterUpToSemi.length && !afterUpToBrace.includes(":")) {
    return true;
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
