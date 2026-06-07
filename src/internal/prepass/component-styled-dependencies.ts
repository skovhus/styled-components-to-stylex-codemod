/**
 * Utilities for relating exported components to local styled-component definitions.
 * Core concepts: export bindings, local declaration lookup, and conservative dependency checks.
 */
import { getReExportedSourceName } from "./extract-external-interface.js";
import { createPrepassParser, type AstNode, type PrepassParserName } from "./prepass-parser.js";

export function localNamesForExport(
  source: string,
  exportedName: string,
  includeDefault: boolean,
): string[] {
  const parsed = parseProgram(source);
  if (!parsed) {
    return fallbackLocalNamesForExport(source, exportedName, includeDefault);
  }
  const targets = collectExportTargets(parsed, exportedName, includeDefault);
  return [...expandIdentityAliasNames(parsed, targets.localNames)];
}

export function exportedBindingDependsOnLocalNames(args: {
  source: string;
  exportedName: string;
  includeDefault: boolean;
  localNames: ReadonlySet<string>;
}): boolean {
  const parsed = parseProgram(args.source);
  if (!parsed) {
    return true;
  }

  const targets = collectExportTargets(parsed, args.exportedName, args.includeDefault);
  if (targets.localNames.size === 0 && targets.nodes.length === 0) {
    return true;
  }
  const dependencyNames = expandLocalDependencyNames(parsed, args.localNames);

  for (const localName of targets.localNames) {
    if (dependencyNames.has(localName)) {
      return true;
    }
    const node = findLocalBindingNode(parsed, localName);
    if (!node || nodeReferencesLocalNames(node, dependencyNames)) {
      return true;
    }
  }

  for (const node of targets.nodes) {
    if (nodeReferencesLocalNames(exportedNodeBody(node), dependencyNames)) {
      return true;
    }
  }

  return false;
}

type ExportTargets = {
  localNames: Set<string>;
  nodes: AstNode[];
};

function parseProgram(source: string): AstNode | null {
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

function collectExportTargets(
  program: AstNode,
  exportedName: string,
  includeDefault: boolean,
): ExportTargets {
  const targets: ExportTargets = { localNames: new Set(), nodes: [] };
  for (const stmt of programBody(program)) {
    collectNamedExportTargets(stmt, exportedName, targets);
    if (includeDefault) {
      collectDefaultExportTargets(stmt, targets);
    }
  }
  return targets;
}

function collectNamedExportTargets(
  stmt: AstNode,
  exportedName: string,
  targets: ExportTargets,
): void {
  if (stmt.type !== "ExportNamedDeclaration") {
    return;
  }

  const declaration = stmt.declaration as AstNode | undefined;
  if (declaration) {
    collectDeclarationTargets(declaration, exportedName, targets);
  }

  for (const specifier of astArray(stmt.specifiers)) {
    if (specifier.type !== "ExportSpecifier") {
      continue;
    }
    const specifierExportedName = nodeName(specifier.exported as AstNode | undefined);
    const localName = nodeName(specifier.local as AstNode | undefined);
    if (specifierExportedName === exportedName && localName) {
      targets.localNames.add(localName);
    }
  }
}

function collectDefaultExportTargets(stmt: AstNode, targets: ExportTargets): void {
  if (stmt.type !== "ExportDefaultDeclaration") {
    return;
  }
  const declaration = stmt.declaration as AstNode | undefined;
  if (!declaration) {
    return;
  }
  const localName = nodeName(declaration);
  if (localName) {
    targets.localNames.add(localName);
    return;
  }
  targets.nodes.push(declaration);
}

function collectDeclarationTargets(
  declaration: AstNode,
  exportedName: string,
  targets: ExportTargets,
): void {
  if (declaration.type === "VariableDeclaration") {
    for (const declarator of astArray(declaration.declarations)) {
      const localName = nodeName(declarator.id as AstNode | undefined);
      if (localName === exportedName) {
        targets.localNames.add(localName);
      }
    }
    return;
  }

  const localName = nodeName(declaration.id as AstNode | undefined);
  if (localName === exportedName) {
    targets.localNames.add(localName);
  }
}

function findLocalBindingNode(program: AstNode, localName: string): AstNode | undefined {
  for (const stmt of programBody(program)) {
    const declaration =
      stmt.type === "ExportNamedDeclaration" ? (stmt.declaration as AstNode | undefined) : stmt;
    if (!declaration) {
      continue;
    }

    if (declaration.type === "FunctionDeclaration") {
      if (nodeName(declaration.id as AstNode | undefined) === localName) {
        return declaration.body as AstNode | undefined;
      }
      continue;
    }

    if (declaration.type === "ClassDeclaration") {
      if (nodeName(declaration.id as AstNode | undefined) === localName) {
        return declaration.body as AstNode | undefined;
      }
      continue;
    }

    if (declaration.type === "VariableDeclaration") {
      for (const declarator of astArray(declaration.declarations)) {
        if (nodeName(declarator.id as AstNode | undefined) === localName) {
          return declarator.init as AstNode | undefined;
        }
      }
    }
  }
  return undefined;
}

function exportedNodeBody(node: AstNode): AstNode {
  if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
    return (node.body as AstNode | undefined) ?? node;
  }
  return node;
}

function expandIdentityAliasNames(
  program: AstNode,
  initialNames: ReadonlySet<string>,
): Set<string> {
  const aliases = collectIdentityAliases(program);
  const expanded = new Set(initialNames);

  const addAliasTargets = (name: string, visiting = new Set<string>()): void => {
    if (visiting.has(name)) {
      return;
    }
    visiting.add(name);
    const target = aliases.get(name);
    if (!target) {
      return;
    }
    expanded.add(target);
    addAliasTargets(target, visiting);
  };

  for (const name of initialNames) {
    addAliasTargets(name);
  }
  return expanded;
}

function collectIdentityAliases(program: AstNode): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const binding of localBindings(program)) {
    const target = nodeName(unwrapTransparentExpression(binding.node));
    if (target && target !== binding.name) {
      aliases.set(binding.name, target);
    }
  }
  return aliases;
}

function unwrapTransparentExpression(node: AstNode): AstNode {
  let current = node;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TypeCastExpression"
  ) {
    const expression = current.expression as AstNode | undefined;
    if (!expression) {
      return current;
    }
    current = expression;
  }
  return current;
}

function expandLocalDependencyNames(
  program: AstNode,
  initialNames: ReadonlySet<string>,
): Set<string> {
  const dependencyNames = new Set(initialNames);
  let changed = true;

  while (changed) {
    changed = false;
    for (const binding of localBindings(program)) {
      if (dependencyNames.has(binding.name)) {
        continue;
      }
      if (nodeReferencesLocalNames(binding.node, dependencyNames)) {
        dependencyNames.add(binding.name);
        changed = true;
      }
    }
  }

  return dependencyNames;
}

function localBindings(program: AstNode): Array<{ name: string; node: AstNode }> {
  const bindings: Array<{ name: string; node: AstNode }> = [];
  for (const stmt of programBody(program)) {
    const declaration =
      stmt.type === "ExportNamedDeclaration" ? (stmt.declaration as AstNode | undefined) : stmt;
    if (!declaration) {
      continue;
    }

    if (declaration.type === "FunctionDeclaration") {
      const name = nodeName(declaration.id as AstNode | undefined);
      const body = declaration.body as AstNode | undefined;
      if (name && body) {
        bindings.push({ name, node: body });
      }
      continue;
    }

    if (declaration.type === "ClassDeclaration") {
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

function nodeReferencesLocalNames(
  node: AstNode | undefined,
  localNames: ReadonlySet<string>,
): boolean {
  if (!node) {
    return true;
  }

  let found = false;
  walkValueAst(node, (candidate) => {
    if (!found && isNamedReference(candidate, localNames)) {
      found = true;
    }
  });
  return found;
}

function walkValueAst(root: AstNode, visitor: (node: AstNode) => void): void {
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

function isNamedReference(node: AstNode, localNames: ReadonlySet<string>): boolean {
  if (node.type === "Identifier" || node.type === "JSXIdentifier") {
    return typeof node.name === "string" && localNames.has(node.name);
  }
  return false;
}

function fallbackLocalNamesForExport(
  source: string,
  exportedName: string,
  includeDefault: boolean,
): string[] {
  const candidates = new Set<string>();
  if (exportedName !== "default") {
    candidates.add(exportedName);
  }

  const exportBlockRe = /export\s*\{([^}]+)\}/g;
  for (const match of source.matchAll(exportBlockRe)) {
    const localName = getReExportedSourceName(match[1] ?? "", exportedName);
    if (localName) {
      candidates.add(localName);
    }
  }

  if (includeDefault) {
    const defaultName = findDefaultExportedLocalName(source);
    if (defaultName) {
      candidates.add(defaultName);
    }
  }

  return [...candidates];
}

function findDefaultExportedLocalName(source: string): string | undefined {
  return (
    source.match(/\bexport\s+default\s+([A-Z][A-Za-z0-9]*)\b/)?.[1] ??
    source.match(/\bexport\s*\{[^}]*\b([A-Z][A-Za-z0-9]*)\s+as\s+default\b[^}]*\}/)?.[1]
  );
}

function programBody(program: AstNode): AstNode[] {
  return astArray(program.body);
}

function astArray(value: unknown): AstNode[] {
  return Array.isArray(value) ? (value.filter(isAstNode) as AstNode[]) : [];
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === "object");
}

function nodeName(node: AstNode | undefined): string | undefined {
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
