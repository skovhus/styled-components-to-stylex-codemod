/**
 * Processes declarations within a single CSS rule.
 * Core concepts: dispatch interpolated declarations and apply static values.
 */
import { readFileSync } from "node:fs";
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
 * statically. Returns `null` when the identifier is not imported, the source
 * file cannot be read, or the export is not a string literal.
 */
function resolveImportedConstStringInit(
  localName: string,
  state: DeclProcessingState["state"],
): string | null {
  const importEntry = state.importMap.get(localName);
  if (!importEntry || importEntry.source.kind !== "absolutePath") {
    return null;
  }
  const program = parseImportedSource(importEntry.source.value, state);
  if (!program) {
    return null;
  }
  return findExportedStringConst(program, importEntry.importedName, state);
}

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
 * Returns the string-literal value of `<program>`'s top-level
 * `export const <exportedName> = "..."` or `export default "..."`. Anything
 * more complex than a literal initializer is rejected — we only follow
 * exports that are unambiguously static.
 */
function findExportedStringConst(
  program: ParsedProgram,
  exportedName: string,
  state: DeclProcessingState["state"],
): string | null {
  if (exportedName === "default") {
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

  let resolved: string | null = null;
  program.find(state.j.ExportNamedDeclaration).forEach((p) => {
    if (resolved !== null) {
      return;
    }
    const decl = p.node.declaration;
    if (decl?.type !== "VariableDeclaration" || decl.kind !== "const") {
      return;
    }
    resolved = findConstDeclaratorString(decl.declarations, exportedName);
  });
  return resolved;
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
