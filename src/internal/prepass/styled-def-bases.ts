/**
 * Extracts styled-component definition bases for prepass consumers that need
 * component names and their root shape.
 */
import {
  collectStyledLocalBindingNames,
  walkForImportsAndTemplates,
} from "./scan-cross-file-selectors.js";
import type { AstNode } from "./prepass-parser.js";

export type StyledDefBase = { kind: "intrinsic" } | { kind: "component"; ident: string };

/** Per file → component local name → how its styled() base is classified (regex-derived). */
export type StyledDefBasesMap = Map<string, Map<string, StyledDefBase>>;

const RX_EXPORT_DECL = String.raw`(?:export\s+)?(?:const|let|var)\s+`;

/** `const Name = styled.tag` — intrinsic HTML/SVG tag member. */
const STYLED_INTRINSIC_MEMBER_RE = new RegExp(
  String.raw`\b${RX_EXPORT_DECL}([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled\.([a-z][a-zA-Z0-9]*)\b`,
  "g",
);

/** `const Name = styled("tag")` — intrinsic string tag. */
const STYLED_INTRINSIC_STRING_RE = new RegExp(
  String.raw`\b${RX_EXPORT_DECL}([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled\s*\(\s*["']([^"']+)["']`,
  "g",
);

/** `const Name = styled(Component)` — wraps another component identifier. */
const STYLED_COMPONENT_RE = new RegExp(
  String.raw`\b${RX_EXPORT_DECL}([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled\s*\(\s*([A-Z][A-Za-z0-9]*)\s*\)`,
  "g",
);

/**
 * Regex-derived styled definition bases for files in the transform set.
 * Later entries for the same component name overwrite earlier ones (rare).
 */
function extractStyledDefBasesFromSource(
  filePath: string,
  source: string,
  into: StyledDefBasesMap,
): void {
  let map = into.get(filePath);
  if (!map) {
    map = new Map();
    into.set(filePath, map);
  }

  STYLED_INTRINSIC_MEMBER_RE.lastIndex = 0;
  for (const m of source.matchAll(STYLED_INTRINSIC_MEMBER_RE)) {
    const name = m[1];
    if (name) {
      map.set(name, { kind: "intrinsic" });
    }
  }

  STYLED_INTRINSIC_STRING_RE.lastIndex = 0;
  for (const m of source.matchAll(STYLED_INTRINSIC_STRING_RE)) {
    const name = m[1];
    if (name) {
      map.set(name, { kind: "intrinsic" });
    }
  }

  STYLED_COMPONENT_RE.lastIndex = 0;
  for (const m of source.matchAll(STYLED_COMPONENT_RE)) {
    const name = m[1];
    const ident = m[2];
    if (name && ident) {
      map.set(name, { kind: "component", ident });
    }
  }
}

/**
 * Regex baseline for styled defs, then an AST pass overrides/adds rows when the
 * source parses. The AST pass understands aliased/named `styled` imports
 * (`import { styled as sc }`) that the regexes (which assume the literal `styled`)
 * miss, so callers that only ran the regex extractor under-report components.
 */
export function extractStyledDefBases(
  filePath: string,
  source: string,
  parser: { parse(source: string): unknown },
  into: StyledDefBasesMap,
): void {
  extractStyledDefBasesFromSource(filePath, source, into);
  try {
    const ast = parser.parse(source) as AstNode;
    const program = ((ast as { program?: AstNode }).program ?? ast) as AstNode;
    const importNodes: AstNode[] = [];
    walkForImportsAndTemplates(program, importNodes, []);
    extractStyledDefBasesFromAstProgram(
      filePath,
      program,
      collectStyledLocalBindingNames(importNodes),
      into,
    );
  } catch {
    // Regex rows already populated; nothing more to add when parsing fails.
  }
}

/**
 * AST-based extraction: understands `let`/`var`, export blocks, named `styled` imports,
 * and `.attrs` / `.withConfig` chains before the tagged template.
 * Results merge into `into`; bindings found here override regex entries for the same name.
 */
function extractStyledDefBasesFromAstProgram(
  filePath: string,
  program: AstNode,
  styledLocalNames: ReadonlySet<string>,
  into: StyledDefBasesMap,
): void {
  if (styledLocalNames.size === 0) {
    return;
  }

  let map = into.get(filePath);
  if (!map) {
    map = new Map();
    into.set(filePath, map);
  }

  const body = program.body as AstNode[] | undefined;
  if (!body) {
    return;
  }

  for (const stmt of body) {
    walkStatement(stmt);
  }

  function walkStatement(stmt: AstNode): void {
    if (stmt.type === "VariableDeclaration") {
      for (const d of (stmt.declarations as AstNode[] | undefined) ?? []) {
        processDeclarator(d);
      }
      return;
    }
    if (stmt.type === "ExportNamedDeclaration" && stmt.declaration) {
      walkStatement(stmt.declaration as AstNode);
    }
  }

  function processDeclarator(decl: AstNode): void {
    if (decl.type !== "VariableDeclarator") {
      return;
    }
    const id = decl.id as AstNode;
    if (id.type !== "Identifier" || typeof id.name !== "string") {
      return;
    }
    const init = unwrapInitializer(decl.init as AstNode | null | undefined);
    const tpl = findTaggedTemplate(init);
    if (!tpl || tpl.type !== "TaggedTemplateExpression") {
      return;
    }
    const base = classifyStyledTemplateTag(tpl.tag as AstNode, styledLocalNames);
    if (base) {
      map!.set(id.name, base);
    }
  }
}

function unwrapInitializer(node: AstNode | null | undefined): AstNode | null | undefined {
  let cur: AstNode | null | undefined = node ?? undefined;
  while (cur) {
    if (cur.type === "TSAsExpression" || cur.type === "AsExpression") {
      cur = cur.expression as AstNode;
      continue;
    }
    if (cur.type === "ParenthesizedExpression") {
      cur = cur.expression as AstNode;
      continue;
    }
    return cur;
  }
  return undefined;
}

function findTaggedTemplate(node: AstNode | null | undefined): AstNode | null | undefined {
  const n = unwrapInitializer(node);
  if (!n) {
    return undefined;
  }
  if (n.type === "TaggedTemplateExpression") {
    return n;
  }
  return undefined;
}

/** Peel `.attrs` / `.withConfig` / nested calls down to `styled.div` or `styled(X)`. */
function peelStyledApplication(
  tag: AstNode | undefined,
  styledNames: ReadonlySet<string>,
): AstNode | null {
  let cur: AstNode | undefined = tag;
  while (cur) {
    if (cur.type === "CallExpression") {
      const callee = cur.callee as AstNode | undefined;
      if (callee?.type === "MemberExpression") {
        cur = callee;
        continue;
      }
      if (
        callee?.type === "Identifier" &&
        typeof (callee as { name?: string }).name === "string" &&
        styledNames.has((callee as { name: string }).name)
      ) {
        return cur;
      }
      return null;
    }
    if (cur.type === "MemberExpression") {
      const obj = cur.object as AstNode | undefined;
      if (
        obj?.type === "Identifier" &&
        typeof (obj as { name?: string }).name === "string" &&
        styledNames.has((obj as { name: string }).name)
      ) {
        return cur;
      }
      cur = obj;
      continue;
    }
    break;
  }
  return null;
}

function classifyStyledTemplateTag(
  tag: AstNode,
  styledNames: ReadonlySet<string>,
): StyledDefBase | null {
  const root = peelStyledApplication(tag, styledNames);
  if (!root) {
    return null;
  }

  if (root.type === "MemberExpression") {
    const obj = root.object as AstNode | undefined;
    const prop = root.property as AstNode | undefined;
    const objName = obj?.type === "Identifier" ? (obj as { name: string }).name : undefined;
    if (obj?.type !== "Identifier" || typeof objName !== "string" || !styledNames.has(objName)) {
      return null;
    }
    const isComputed = Boolean((root as { computed?: boolean }).computed);
    if (isComputed && prop?.type === "StringLiteral" && typeof prop.value === "string") {
      return { kind: "intrinsic" };
    }
    if (
      !isComputed &&
      prop?.type === "Identifier" &&
      typeof (prop as { name?: string }).name === "string"
    ) {
      return { kind: "intrinsic" };
    }
    return null;
  }

  if (root.type === "CallExpression") {
    const callee = root.callee as AstNode | undefined;
    const args = (root as { arguments?: AstNode[] }).arguments;
    const arg0 = args?.[0];
    const calleeName =
      callee?.type === "Identifier" ? (callee as { name: string }).name : undefined;
    if (
      callee?.type !== "Identifier" ||
      typeof calleeName !== "string" ||
      !styledNames.has(calleeName) ||
      !arg0
    ) {
      return null;
    }
    if (arg0.type === "Identifier" && typeof arg0.name === "string") {
      return { kind: "component", ident: arg0.name };
    }
    if (arg0.type === "StringLiteral" && typeof arg0.value === "string") {
      return { kind: "intrinsic" };
    }
    return null;
  }

  return null;
}
