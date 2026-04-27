/**
 * Processes declarations within a single CSS rule.
 * Core concepts: dispatch interpolated declarations and apply static values.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import type { CssRuleIR } from "../css-ir.js";
import type { DeclProcessingState } from "./decl-setup.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { cssValueToJs, normalizeCssContentValue } from "../transform/helpers.js";
import { cssKeyframeNameToIdentifier, expandStaticAnimationShorthand } from "../keyframes.js";
import { handleInterpolatedDeclaration } from "./rule-interpolated-declaration.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import { isIdentifierNode, literalToStaticValue } from "../utilities/jscodeshift-utils.js";

type CommentSource = { leading?: string; trailingLine?: string } | null;

type RuleDeclarationContext = {
  ctx: DeclProcessingState;
  rule: CssRuleIR;
  media: string | undefined;
  pseudos: string[] | null;
  pseudoElement: string | null;
  attrTarget: Record<string, unknown> | null;
  resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  applyResolvedPropValue: (prop: string, value: unknown, commentSource: CommentSource) => void;
};

export function processRuleDeclarations(args: RuleDeclarationContext): void {
  const {
    ctx,
    rule,
    media,
    pseudos,
    pseudoElement,
    attrTarget,
    resolvedSelectorMedia,
    applyResolvedPropValue,
  } = args;
  const { state } = ctx;

  for (const d of rule.declarations) {
    // Dynamic property names (slot placeholders in property position) such as
    // `${CSS_VAR}: 100%;`. Try to resolve every placeholder in the property
    // name to a static string (e.g. via a top-level `const X = "--var"`). If
    // every slot resolves to a CSS-variable-compatible literal, substitute the
    // resolved name and continue processing as a regular declaration. Bail
    // otherwise — emitting the raw `__SC_EXPR_N__` placeholder produces broken
    // StyleX output.
    if (d.property && d.property.includes("__SC_EXPR_")) {
      const resolvedProperty = resolveInterpolatedPropertyName(d.property, ctx);
      if (resolvedProperty === null) {
        ctx.state.bailUnsupported(ctx.decl, "Unsupported interpolation: property");
        break;
      }
      d.property = resolvedProperty;
    }

    if (d.value.kind === "interpolated") {
      handleInterpolatedDeclaration({
        ctx,
        rule,
        d,
        media,
        pseudos,
        pseudoElement,
        attrTarget,
        resolvedSelectorMedia,
        applyResolvedPropValue,
      });
      if (state.bail) {
        break;
      }
      continue;
    }

    // Handle static `animation-name` longhand that references inline @keyframes.
    if (
      d.property === "animation-name" &&
      d.value.kind === "static" &&
      state.keyframesNames.size > 0
    ) {
      const rawName = d.valueRaw.trim();
      if (state.keyframesNames.has(rawName)) {
        const jsName =
          state.inlineKeyframeNameMap?.get(rawName) ?? cssKeyframeNameToIdentifier(rawName);
        const commentSource = {
          leading: (d as any).leadingComment,
          trailingLine: (d as any).trailingLineComment,
        };
        applyResolvedPropValue("animationName", state.j.identifier(jsName), commentSource);
        continue;
      }
    }

    // Handle static `animation` shorthand that references inline @keyframes.
    // Expand to longhand properties with an identifier reference for the name.
    if (d.property === "animation" && d.value.kind === "static" && state.keyframesNames.size > 0) {
      const expanded: Record<string, unknown> = {};
      if (
        expandStaticAnimationShorthand(
          d.valueRaw,
          state.keyframesNames,
          state.j,
          expanded,
          state.inlineKeyframeNameMap,
        )
      ) {
        const commentSource = {
          leading: (d as any).leadingComment,
          trailingLine: (d as any).trailingLineComment,
        };
        let isFirst = true;
        for (const [prop, value] of Object.entries(expanded)) {
          applyResolvedPropValue(prop, value, isFirst ? commentSource : null);
          isFirst = false;
        }
        continue;
      }
    }

    const outs = cssDeclarationToStylexDeclarations(d);
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i]!;
      let value = cssValueToJs(out.value, d.important, out.prop);
      if (out.prop === "content" && typeof value === "string") {
        value = normalizeCssContentValue(value);
      }
      const commentSource =
        i === 0
          ? {
              leading: (d as any).leadingComment,
              trailingLine: (d as any).trailingLineComment,
            }
          : null;
      applyResolvedPropValue(out.prop, value, commentSource);
    }
  }
}

// --- Non-exported helpers ---

/**
 * Attempts to substitute `__SC_EXPR_N__` placeholders in a CSS property name
 * with statically-resolvable string values pulled from the styled component's
 * template expressions. Only succeeds when:
 *   - every placeholder slot resolves to a string literal (directly or via a
 *     top-level `const NAME = "..."` binding in the same file), and
 *   - the resulting property name is a CSS custom property (starts with `--`).
 *
 * Returns the resolved property name on success, or `null` when the property
 * cannot be safely lowered.
 */
function resolveInterpolatedPropertyName(
  property: string,
  ctx: DeclProcessingState,
): string | null {
  const { decl, state } = ctx;
  const placeholderRe = new RegExp(PLACEHOLDER_RE.source, "g");
  let failed = false;
  const resolved = property.replace(placeholderRe, (_match, slotIdRaw: string) => {
    const slotId = Number(slotIdRaw);
    const expr = decl.templateExpressions[slotId];
    const value = resolveExpressionToStaticString(expr, state);
    if (value === null) {
      failed = true;
      return "";
    }
    return value;
  });
  if (failed) {
    return null;
  }
  // Only substitute names that look like CSS custom properties to avoid
  // accidentally turning unrelated dynamic patterns (e.g. computed standard
  // property names) into silently mistransformed output.
  if (!resolved.startsWith("--")) {
    return null;
  }
  return resolved;
}

/**
 * Resolves an AST expression to a static string. Handles direct string
 * literals and identifiers bound to:
 *   - a top-level `const NAME = "..."` declaration in the file being
 *     transformed, or
 *   - an imported binding whose source file declares a top-level
 *     `export const NAME = "..."`.
 *
 * Identifiers that are shadowed by an enclosing scope (e.g. a local `const
 * NAME = "..."` inside the function containing the styled template) are not
 * resolved — bailing is safer than substituting the wrong value.
 */
function resolveExpressionToStaticString(
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
  if (state.isIdentifierShadowed(expr, expr.name)) {
    return null;
  }
  const fromImport = resolveImportedConstStringInit(expr.name, state);
  if (fromImport !== null) {
    return fromImport;
  }
  return findTopLevelConstStringInit(expr.name, state);
}

/**
 * Finds a top-level `const <name> = <literal>` declaration in the current file
 * and returns its initializer when it resolves to a static string. Skips
 * non-`const` declarations and declarators whose initializer is not a static
 * literal so we never substitute a value that could change at runtime.
 */
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

/**
 * Resolves an imported identifier to a top-level `export const NAME = "..."`
 * (or `export default "..."`) declared in the source module. Only relative
 * imports resolved by the current file's `importMap` are followed — package
 * imports are skipped because the codemod has no way to verify their values
 * statically. Re-exports (`export { X } from "./other"`, `export * from
 * "./other"`, and locally-`import`ed-then-`export {}`-ed bindings) are
 * followed transitively up to a small depth limit. Returns `null` when the
 * identifier is not imported, the source file cannot be read, or the export
 * is not a string literal.
 */
function resolveImportedConstStringInit(
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
 * Reads, parses, and resolves an exported string literal from the file at
 * `<filePath>`. Handles direct `export const <name> = "..."` /
 * `export default "..."` declarations and follows re-exports of the form
 * `export { <name> } from "./other"`, `export { <name> as <other> } from`,
 * `export * from "./other"`, and same-file `import { <name> } from "./other";
 * export { <name> };`. The `visited` set is keyed by `<absolutePath>:<name>`
 * to avoid revisiting the same export pair through different barrel paths,
 * and the `MAX_REEXPORT_DEPTH` cap shields against pathological chains.
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
  let resolved: string | null = null;
  program.find(state.j.ExportDefaultDeclaration).forEach((p) => {
    if (resolved !== null) {
      return;
    }
    const value = literalToStaticValue(p.node.declaration);
    if (typeof value === "string") {
      resolved = value;
    }
  });
  return resolved;
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
  let resolved: string | null = null;
  program.find(state.j.ExportNamedDeclaration).forEach((p) => {
    if (resolved !== null) {
      return;
    }
    const decl = p.node.declaration;
    if (decl?.type !== "VariableDeclaration" || decl.kind !== "const") {
      return;
    }
    const found = findConstDeclaratorString(decl.declarations, exportedName);
    if (found !== null) {
      resolved = found;
    }
  });
  return resolved;
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

  const reExports = collectNamedReExports(program, state);
  for (const entry of reExports) {
    if (entry.localExportedAs !== exportedName) {
      continue;
    }
    const targetPath = pathResolve(programDir, entry.specifier);
    const result = resolveExportFromFile(targetPath, entry.originalName, state, visited);
    if (result !== null) {
      return result;
    }
  }

  // Locally imported and then re-exported: `import { X } from "./a"; export { X };`
  const localReExport = findLocalImportReExport(program, exportedName, state);
  if (localReExport) {
    const targetPath = pathResolve(programDir, localReExport.specifier);
    const result = resolveExportFromFile(targetPath, localReExport.originalName, state, visited);
    if (result !== null) {
      return result;
    }
  }

  // `export * from "./other"` — probed last so explicit names win.
  for (const specifier of collectStarReExports(program, state)) {
    const targetPath = pathResolve(programDir, specifier);
    const result = resolveExportFromFile(targetPath, exportedName, state, visited);
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

function collectNamedReExports(
  program: ParsedProgram,
  state: DeclProcessingState["state"],
): NamedReExport[] {
  const out: NamedReExport[] = [];
  program.find(state.j.ExportNamedDeclaration).forEach((p) => {
    const node = p.node as {
      source?: { value?: unknown };
      specifiers?: Array<{
        type: string;
        exported?: { type?: string; name?: string };
        local?: { type?: string; name?: string };
      }>;
    };
    const specifierValue = node.source?.value;
    if (typeof specifierValue !== "string" || !isRelativeSpecifier(specifierValue)) {
      return;
    }
    for (const spec of node.specifiers ?? []) {
      if (spec.type !== "ExportSpecifier") {
        continue;
      }
      const localExportedAs = spec.exported?.type === "Identifier" ? spec.exported.name : undefined;
      const originalName = spec.local?.type === "Identifier" ? spec.local.name : localExportedAs;
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
 * Finds the `import { <originalName> } from "./other"` paired with an
 * `export { <originalName> as <exportedName> }` (or unaliased) statement in
 * the same file. Returns the resolved-relative specifier and the original
 * name on the source side, or `null` if no such pair exists.
 */
function findLocalImportReExport(
  program: ParsedProgram,
  exportedName: string,
  state: DeclProcessingState["state"],
): { specifier: string; originalName: string } | null {
  let localBinding: string | null = null;
  program.find(state.j.ExportNamedDeclaration).forEach((p) => {
    if (localBinding !== null) {
      return;
    }
    const node = p.node as {
      source?: unknown;
      specifiers?: Array<{
        type: string;
        exported?: { type?: string; name?: string };
        local?: { type?: string; name?: string };
      }>;
    };
    if (node.source) {
      // `export { X } from "..."` is handled elsewhere
      return;
    }
    for (const spec of node.specifiers ?? []) {
      if (spec.type !== "ExportSpecifier") {
        continue;
      }
      if (spec.exported?.type === "Identifier" && spec.exported.name === exportedName) {
        const localName =
          spec.local?.type === "Identifier" && spec.local.name
            ? spec.local.name
            : spec.exported.name;
        if (localName) {
          localBinding = localName;
        }
        return;
      }
    }
  });
  if (!localBinding) {
    return null;
  }

  let result: { specifier: string; originalName: string } | null = null;
  program.find(state.j.ImportDeclaration).forEach((p) => {
    if (result !== null) {
      return;
    }
    const node = p.node as {
      source?: { value?: unknown };
      specifiers?: Array<{
        type: string;
        local?: { type?: string; name?: string };
        imported?: { type?: string; name?: string };
      }>;
    };
    const specifierValue = node.source?.value;
    if (typeof specifierValue !== "string" || !isRelativeSpecifier(specifierValue)) {
      return;
    }
    for (const spec of node.specifiers ?? []) {
      if (spec.local?.type !== "Identifier" || spec.local.name !== localBinding) {
        continue;
      }
      if (spec.type === "ImportDefaultSpecifier") {
        result = { specifier: specifierValue, originalName: "default" };
        return;
      }
      if (spec.type === "ImportSpecifier") {
        const importedName =
          spec.imported?.type === "Identifier" && spec.imported.name
            ? spec.imported.name
            : spec.local.name;
        result = { specifier: specifierValue, originalName: importedName };
        return;
      }
    }
  });
  return result;
}

function isRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith(".\\") ||
    specifier.startsWith("..\\")
  );
}

/**
 * Searches a list of `VariableDeclarator`s for one named `<name>` and returns
 * its initializer when it resolves to a static string literal. Returns `null`
 * when no matching declarator is found or its initializer is not a literal.
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
