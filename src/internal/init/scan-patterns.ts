/**
 * Pattern scanner for the `runInit` command.
 *
 * Scans styled-components source files to detect which adapter hooks
 * (resolveValue, resolveCall, resolveSelector, etc.) the user will need.
 * Uses @babel/parser + manual AST walk for speed (same approach as prepass).
 */
import { readFileSync } from "node:fs";
import {
  createPrepassParser,
  type AstNode,
  type PrepassParserName,
} from "../prepass/prepass-parser.js";
import {
  buildImportMapFromNodes,
  findStyledImportNameFromNodes,
  walkForImportsAndTemplates,
} from "../prepass/scan-cross-file-selectors.js";
import { isSelectorContext } from "../utilities/selector-context-heuristic.js";

/* ── Public types ─────────────────────────────────────────────────────── */

export interface ScannedPatterns {
  /** Unique theme paths found (e.g. "color.labelBase", "spacing.sm") */
  themePaths: Set<string>;
  /** Unique theme path prefixes (e.g. "color", "spacing") — first segment of each path */
  themeRoots: Set<string>;
  /** Whether indexed theme lookups like `theme.color[prop]` were found */
  hasIndexedThemeLookup: boolean;
  /** CSS variable names found in `var(--name)` */
  cssVariables: Set<string>;
  /** Imported helper functions called inside template interpolations:
   *  Map<localName, { source, importedName }> */
  helperCalls: Map<string, { source: string; importedName: string }>;
  /** Imported identifiers used as selectors (bare `${Component}` in selector context):
   *  Map<localName, { source, importedName }> */
  selectorInterpolations: Map<string, { source: string; importedName: string }>;
  /** Imported components wrapped with styled(): Map<localName, { source, importedName }> */
  styledWrappers: Map<string, { source: string; importedName: string }>;
  /** Whether `useTheme` (or aliased) is imported from styled-components */
  hasUseTheme: boolean;
  /** Total files scanned */
  filesScanned: number;
  /** Files that contain styled-components usage */
  filesWithStyledComponents: number;
}

/* ── Public API ───────────────────────────────────────────────────────── */

export function scanPatterns(
  files: readonly string[],
  parserName?: PrepassParserName,
): ScannedPatterns {
  const result: ScannedPatterns = {
    themePaths: new Set(),
    themeRoots: new Set(),
    hasIndexedThemeLookup: false,
    cssVariables: new Set(),
    helperCalls: new Map(),
    selectorInterpolations: new Map(),
    styledWrappers: new Map(),
    hasUseTheme: false,
    filesScanned: 0,
    filesWithStyledComponents: 0,
  };

  const parser = createPrepassParser(parserName);

  for (const filePath of files) {
    result.filesScanned++;
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    // Quick pre-filter: skip files without styled-components
    if (!source.includes("styled-components")) {
      continue;
    }

    let ast: AstNode;
    try {
      ast = parser.parse(source) as AstNode;
    } catch {
      continue;
    }

    const imports: AstNode[] = [];
    const templates: AstNode[] = [];
    walkForImportsAndTemplates(ast, imports, templates);

    const styledName = findStyledImportNameFromNodes(imports);
    if (!styledName) {
      continue;
    }

    result.filesWithStyledComponents++;
    const importMap = buildImportMapFromNodes(imports);

    // Detect useTheme import
    for (const [, entry] of importMap) {
      if (entry.source === "styled-components" && entry.importedName === "useTheme") {
        result.hasUseTheme = true;
      }
    }

    // Scan templates for patterns
    for (const tmpl of templates) {
      if (!isStyledTaggedTemplate(tmpl, styledName)) {
        continue;
      }

      scanTemplateForThemePaths(tmpl, result);
      scanTemplateForCssVariables(tmpl, result);
      scanTemplateForInterpolations(tmpl, importMap, styledName, result);
      scanForStyledWrappers(tmpl, styledName, importMap, result);
    }
  }

  return result;
}

/* ── Template scanning helpers ────────────────────────────────────────── */

/** Check if a TaggedTemplateExpression is styled.X`...` or styled(C)`...` */
function isStyledTaggedTemplate(tmpl: AstNode, styledName: string): boolean {
  return isStyledTag(tmpl.tag as AstNode | undefined, styledName);
}

/** Recursively check if a tag node is a styled-components tag. */
function isStyledTag(tag: AstNode | undefined, styledName: string): boolean {
  if (!tag) {
    return false;
  }
  // styled.div
  if (tag.type === "MemberExpression") {
    const obj = tag.object as AstNode | undefined;
    if (obj?.type === "Identifier" && obj.name === styledName) {
      return true;
    }
    // Recurse: the object may be styled(C) or another call
    return isStyledTag(obj, styledName);
  }
  // styled(Component) or styled.div.attrs(...) or styled(C).attrs(...)
  if (tag.type === "CallExpression") {
    const callee = tag.callee as AstNode | undefined;
    if (callee?.type === "Identifier" && callee.name === styledName) {
      return true;
    }
    // .attrs(...) chain — recurse on callee
    return isStyledTag(callee, styledName);
  }
  return false;
}

/** Extract theme paths from arrow functions inside template expressions. */
function scanTemplateForThemePaths(tmpl: AstNode, result: ScannedPatterns): void {
  const quasi = tmpl.quasi as AstNode | undefined;
  const expressions = (quasi?.expressions as AstNode[] | undefined) ?? [];

  for (const expr of expressions) {
    // Arrow functions: (props) => props.theme.X.Y or ({ theme }) => theme.X.Y
    if (expr.type !== "ArrowFunctionExpression") {
      continue;
    }
    const body = expr.body as AstNode | undefined;
    if (!body) {
      continue;
    }

    // Find the theme parameter name
    const themeName = findThemeParamName(expr);
    if (!themeName) {
      continue;
    }

    // Walk the body for member expressions starting with the theme name
    walkForThemePaths(body, themeName, result);
  }
}

/** Determine the theme param name from an arrow function's parameters. */
function findThemeParamName(arrowFn: AstNode): string | undefined {
  const params = arrowFn.params as AstNode[] | undefined;
  if (!params?.length) {
    return undefined;
  }
  const param = params[0];
  if (!param) {
    return undefined;
  }

  // (props) => props.theme.X → look for props.theme member access
  if (param.type === "Identifier") {
    return param.name as string;
  }

  // ({ theme }) => theme.X → destructured theme
  if (param.type === "ObjectPattern") {
    const properties = param.properties as AstNode[] | undefined;
    for (const prop of properties ?? []) {
      if (prop.type === "ObjectProperty" || prop.type === "Property") {
        const key = prop.key as AstNode | undefined;
        if (key?.type === "Identifier" && key.name === "theme") {
          const value = prop.value as AstNode | undefined;
          if (value?.type === "Identifier") {
            return `__destructured_theme__:${value.name as string}`;
          }
        }
      }
    }
  }
  return undefined;
}

/** Recursively walk an expression tree to find theme member access paths. */
function walkForThemePaths(node: AstNode, themeRef: string, result: ScannedPatterns): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (node.type === "MemberExpression") {
    const path = extractThemeMemberPath(node, themeRef);
    if (path) {
      result.themePaths.add(path);
      const root = path.split(".")[0];
      if (root) {
        result.themeRoots.add(root);
      }
      // Check for indexed lookup: theme.color[prop]
      if (node.computed) {
        result.hasIndexedThemeLookup = true;
      }
      return;
    }
  }

  // Check for indexed lookup in the middle of a chain
  if (node.type === "MemberExpression" && node.computed) {
    const objPath = extractThemeMemberPath(node.object as AstNode, themeRef);
    if (objPath) {
      result.hasIndexedThemeLookup = true;
      result.themePaths.add(objPath);
      const root = objPath.split(".")[0];
      if (root) {
        result.themeRoots.add(root);
      }
      return;
    }
  }

  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === "object" && (child as AstNode).type) {
          walkForThemePaths(child as AstNode, themeRef, result);
        }
      }
    } else if (val && typeof val === "object" && (val as AstNode).type) {
      walkForThemePaths(val as AstNode, themeRef, result);
    }
  }
}

/**
 * Extract a theme path from a MemberExpression chain.
 * Given `props.theme.color.labelBase` with themeRef="props",
 * returns "color.labelBase".
 * Given `theme.color.labelBase` with themeRef="__destructured_theme__:theme",
 * returns "color.labelBase".
 */
function extractThemeMemberPath(node: AstNode, themeRef: string): string | undefined {
  const parts: string[] = [];
  let current: AstNode | undefined = node;

  while (current?.type === "MemberExpression") {
    if (current.computed) {
      // computed property like [x] — stop collecting static path
      // but still check the object part
      current = current.object as AstNode | undefined;
      continue;
    }
    const prop = current.property as AstNode | undefined;
    if (prop?.type === "Identifier") {
      parts.unshift(prop.name as string);
    }
    current = current.object as AstNode | undefined;
  }

  if (current?.type !== "Identifier") {
    return undefined;
  }

  const identName = current.name as string;

  if (themeRef.startsWith("__destructured_theme__:")) {
    // Destructured: ({ theme }) => theme.X.Y
    const destructuredName = themeRef.slice("__destructured_theme__:".length);
    if (identName === destructuredName && parts.length > 0) {
      return parts.join(".");
    }
  } else {
    // Props pattern: (props) => props.theme.X.Y
    if (identName === themeRef && parts[0] === "theme" && parts.length > 1) {
      return parts.slice(1).join(".");
    }
  }
  return undefined;
}

/** Scan template quasi strings for CSS variable usage: var(--name). */
function scanTemplateForCssVariables(tmpl: AstNode, result: ScannedPatterns): void {
  const quasi = tmpl.quasi as AstNode | undefined;
  const quasis = (quasi?.quasis as AstNode[] | undefined) ?? [];
  const CSS_VAR_RE = /var\(\s*(--[\w-]+)/g;

  for (const q of quasis) {
    const raw = (q.value as Record<string, unknown> | undefined)?.raw;
    if (typeof raw !== "string") {
      continue;
    }
    let m: RegExpExecArray | null;
    while ((m = CSS_VAR_RE.exec(raw)) !== null) {
      const varName = m[1];
      if (varName) {
        result.cssVariables.add(varName);
      }
    }
  }
}

/**
 * Scan template interpolations for:
 * - Helper function calls: `${helperFn(args)}`
 * - Selector interpolations: `${Component}` in selector context
 */
function scanTemplateForInterpolations(
  tmpl: AstNode,
  importMap: Map<string, { source: string; importedName: string }>,
  styledName: string,
  result: ScannedPatterns,
): void {
  const quasi = tmpl.quasi as AstNode | undefined;
  const expressions = (quasi?.expressions as AstNode[] | undefined) ?? [];
  const quasis = (quasi?.quasis as AstNode[] | undefined) ?? [];

  for (let i = 0; i < expressions.length; i++) {
    const expr = expressions[i];
    if (!expr) {
      continue;
    }

    // Helper function calls: ${fn(args)} or ${obj.method(args)}
    if (expr.type === "CallExpression") {
      const calleeName = getCalleeImportName(expr, importMap, styledName);
      if (calleeName) {
        const entry = importMap.get(calleeName);
        if (entry && entry.source !== "styled-components") {
          result.helperCalls.set(calleeName, entry);
        }
      }
    }

    // Selector interpolations: bare ${Identifier} in selector context
    if (expr.type === "Identifier") {
      const name = expr.name as string;
      if (name === styledName) {
        continue;
      }
      const entry = importMap.get(name);
      if (!entry || entry.source === "styled-components") {
        continue;
      }
      // Check if it's in selector context using surrounding quasis
      const before = getQuasiRaw(quasis[i]);
      const after = getQuasiRaw(quasis[i + 1]);
      if (before !== undefined && after !== undefined && isSelectorContext(before, after)) {
        result.selectorInterpolations.set(name, entry);
      }
    }

    // Member expression in interpolation: ${obj.prop} — might be a selector
    if (expr.type === "MemberExpression" && !expr.computed) {
      const obj = expr.object as AstNode | undefined;
      if (obj?.type === "Identifier") {
        const name = obj.name as string;
        const entry = importMap.get(name);
        if (entry && entry.source !== "styled-components") {
          const before = getQuasiRaw(quasis[i]);
          const after = getQuasiRaw(quasis[i + 1]);
          if (before !== undefined && after !== undefined && isSelectorContext(before, after)) {
            result.selectorInterpolations.set(name, entry);
          }
        }
      }
    }
  }
}

/** Detect styled(ImportedComponent) wrappers. */
function scanForStyledWrappers(
  tmpl: AstNode,
  styledName: string,
  importMap: Map<string, { source: string; importedName: string }>,
  result: ScannedPatterns,
): void {
  const tag = tmpl.tag as AstNode | undefined;
  const callee = getStyledCallArg(tag, styledName);
  if (!callee) {
    return;
  }
  if (callee.type === "Identifier") {
    const name = callee.name as string;
    const entry = importMap.get(name);
    if (entry && entry.source !== "styled-components") {
      result.styledWrappers.set(name, entry);
    }
  }
}

/* ── Low-level helpers ────────────────────────────────────────────────── */

/** Get the argument of styled(X) from a tag expression (handles .attrs() chain). */
function getStyledCallArg(tag: AstNode | undefined, styledName: string): AstNode | undefined {
  if (!tag) {
    return undefined;
  }
  if (tag.type === "CallExpression") {
    const callee = tag.callee as AstNode | undefined;
    if (callee?.type === "Identifier" && callee.name === styledName) {
      const args = tag.arguments as AstNode[] | undefined;
      return args?.[0];
    }
    // .attrs() chain: styled(C).attrs(...)`...`
    if (callee?.type === "MemberExpression") {
      const obj = callee.object as AstNode | undefined;
      return getStyledCallArg(obj, styledName);
    }
  }
  return undefined;
}

/** Get the imported name for a call expression's callee. */
function getCalleeImportName(
  expr: AstNode,
  importMap: Map<string, { source: string; importedName: string }>,
  styledName: string,
): string | undefined {
  const callee = expr.callee as AstNode | undefined;
  if (!callee) {
    return undefined;
  }
  if (callee.type === "Identifier") {
    const name = callee.name as string;
    if (name === styledName) {
      return undefined;
    }
    if (importMap.has(name)) {
      return name;
    }
  }
  // obj.method() — check if obj is imported
  if (callee.type === "MemberExpression") {
    const obj = callee.object as AstNode | undefined;
    if (obj?.type === "Identifier") {
      const name = obj.name as string;
      if (importMap.has(name)) {
        return name;
      }
    }
  }
  return undefined;
}

function getQuasiRaw(quasi: AstNode | undefined): string | undefined {
  if (!quasi) {
    return undefined;
  }
  const raw = (quasi.value as Record<string, unknown> | undefined)?.raw;
  return typeof raw === "string" ? raw : undefined;
}
