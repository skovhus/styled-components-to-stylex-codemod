/**
 * Shared structural AST helpers for prepass modules that walk raw babel ASTs
 * to relate exports, local bindings, and named references.
 *
 * These were duplicated verbatim across `component-styled-dependencies` and
 * `stylex-component-exports`; centralizing keeps the traversal semantics
 * (which keys to skip, how to read a node name) consistent.
 */
import { createPrepassParser, type AstNode, type PrepassParserName } from "./prepass-parser.js";

/** Parse a module `source` into its Program node, trying `tsx` then `babel`. */
export function parseProgram(source: string): AstNode | null {
  for (const parserName of ["tsx", "babel"] satisfies PrepassParserName[]) {
    try {
      const ast = createPrepassParser(parserName).parse(source) as AstNode;
      return ((ast as { program?: AstNode }).program ?? ast) as AstNode;
    } catch {
      // Try the next parser before falling back to conservative behavior.
    }
  }
  return null;
}

export function programBody(program: AstNode): AstNode[] {
  return astArray(program.body);
}

export function astArray(value: unknown): AstNode[] {
  return Array.isArray(value) ? (value.filter(isAstNode) as AstNode[]) : [];
}

export function nodeName(node: AstNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (
    node.type === "Identifier" ||
    node.type === "JSXIdentifier" ||
    node.type === "StringLiteral"
  ) {
    return typeof node.name === "string"
      ? node.name
      : typeof node.value === "string"
        ? node.value
        : undefined;
  }
  return undefined;
}

/**
 * Top-level binding name → initializer/body node for function, class, and
 * variable declarations (including those behind a named export).
 */
export function localBindings(program: AstNode): Array<{ name: string; node: AstNode }> {
  const bindings: Array<{ name: string; node: AstNode }> = [];
  for (const stmt of programBody(program)) {
    const declaration =
      stmt.type === "ExportNamedDeclaration" ? (stmt.declaration as AstNode | undefined) : stmt;
    if (!declaration) {
      continue;
    }

    if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
      const name = nodeName(declaration.id as AstNode | undefined);
      const body = declaration.body as AstNode | undefined;
      if (name && body) {
        bindings.push({ name, node: body });
      }
      continue;
    }

    if (declaration.type === "VariableDeclaration") {
      for (const declarator of astArray(declaration.declarations)) {
        const name = nodeName(declarator.id as AstNode | undefined);
        const init = declarator.init as AstNode | undefined;
        if (name && init) {
          bindings.push({ name, node: init });
        }
      }
    }
  }
  return bindings;
}

/**
 * Depth-first walk that skips metadata (`loc`/comments), type annotations, and
 * the non-computed `key`/`property` of object members and member expressions,
 * so visitors only see value-position nodes.
 */
export function walkValueAst(root: AstNode, visitor: (node: AstNode) => void): void {
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    const astNode = node as AstNode;
    visitor(astNode);
    for (const key of Object.keys(astNode)) {
      if (shouldSkipChild(astNode, key)) {
        continue;
      }
      const child = astNode[key];
      if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(root);
}

/**
 * Whether `node` references any of `localNames`. `whenUndefined` is the
 * conservative answer when `node` is absent — dependency checks treat a missing
 * node as dependent (`true`), surface checks as not referencing (`false`).
 */
export function nodeReferencesLocalNames(
  node: AstNode | undefined,
  localNames: ReadonlySet<string>,
  whenUndefined: boolean,
): boolean {
  if (!node) {
    return whenUndefined;
  }

  let found = false;
  walkValueAst(node, (candidate) => {
    if (!found && isNamedReference(candidate, localNames)) {
      found = true;
    }
  });
  return found;
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === "object");
}

function isNamedReference(node: AstNode, localNames: ReadonlySet<string>): boolean {
  if (node.type === "Identifier" || node.type === "JSXIdentifier") {
    return typeof node.name === "string" && localNames.has(node.name);
  }
  return false;
}

function shouldSkipChild(node: AstNode, key: string): boolean {
  if (["loc", "comments", "leadingComments", "trailingComments"].includes(key)) {
    return true;
  }
  if (["typeAnnotation", "typeParameters", "returnType"].includes(key)) {
    return true;
  }
  if (
    key === "key" &&
    (node.type === "ObjectProperty" || node.type === "Property") &&
    (node as { computed?: boolean }).computed !== true
  ) {
    return true;
  }
  if (
    key === "property" &&
    node.type === "MemberExpression" &&
    (node as { computed?: boolean }).computed !== true
  ) {
    return true;
  }
  return false;
}
