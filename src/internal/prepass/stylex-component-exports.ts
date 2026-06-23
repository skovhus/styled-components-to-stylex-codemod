/**
 * Prepass helpers for identifying exported components that already apply StyleX.
 * Core concepts: StyleX import bindings, export names, and local binding traces.
 */
import { type AstNode } from "./prepass-parser.js";
import {
  astArray,
  localBindings,
  nodeName,
  nodeReferencesLocalNames as referencesLocalNames,
  parseProgram,
  programBody,
  walkValueAst,
} from "./prepass-ast-utils.js";

export function collectStylexExportNames(source: string): Set<string> {
  const parsed = parseProgram(source);
  if (!parsed) {
    return new Set();
  }

  const stylexUsage = collectStylexUsage(parsed);
  if (!stylexUsage.hasStylexSurface) {
    return new Set();
  }

  const names = new Set<string>();
  for (const stmt of programBody(parsed)) {
    collectStylexNamedExports(parsed, stmt, stylexUsage, names);
    collectStylexDefaultExport(parsed, stmt, stylexUsage, names);
  }
  return names;
}

type StylexUsage = {
  namespaceNames: Set<string>;
  propsNames: Set<string>;
  styleObjectNames: Set<string>;
  hasStylexSurface: boolean;
};

function collectStylexNamedExports(
  program: AstNode,
  stmt: AstNode,
  stylexUsage: StylexUsage,
  names: Set<string>,
): void {
  if (stmt.type !== "ExportNamedDeclaration") {
    return;
  }

  const declaration = stmt.declaration as AstNode | undefined;
  for (const localName of declarationLocalNames(declaration)) {
    if (localBindingUsesStylex(program, localName, stylexUsage)) {
      names.add(localName);
    }
  }

  for (const specifier of astArray(stmt.specifiers)) {
    if (specifier.type !== "ExportSpecifier") {
      continue;
    }
    const exportedName = nodeName(specifier.exported as AstNode | undefined);
    const localName = nodeName(specifier.local as AstNode | undefined);
    if (exportedName && localName && localBindingUsesStylex(program, localName, stylexUsage)) {
      names.add(exportedName);
    }
  }
}

function declarationLocalNames(declaration: AstNode | undefined): string[] {
  if (!declaration) {
    return [];
  }
  if (declaration.type === "VariableDeclaration") {
    return astArray(declaration.declarations).flatMap((declarator) => {
      const localName = nodeName(declarator.id as AstNode | undefined);
      return localName ? [localName] : [];
    });
  }
  const localName = nodeName(declaration.id as AstNode | undefined);
  return localName ? [localName] : [];
}

function collectStylexDefaultExport(
  program: AstNode,
  stmt: AstNode,
  stylexUsage: StylexUsage,
  names: Set<string>,
): void {
  if (stmt.type !== "ExportDefaultDeclaration") {
    return;
  }
  const declaration = stmt.declaration as AstNode | undefined;
  const localName = nodeName(declaration?.id as AstNode | undefined) ?? nodeName(declaration);
  const usesStylex = localName
    ? localBindingUsesStylex(program, localName, stylexUsage) ||
      nodeUsesStylex(declaration, stylexUsage)
    : nodeUsesStylex(declaration, stylexUsage) ||
      (declaration
        ? referencedLocalNames(program, declaration).some((referencedName) =>
            localBindingUsesStylex(program, referencedName, stylexUsage),
          )
        : false);
  if (usesStylex) {
    names.add("default");
  }
}

function collectStylexUsage(program: AstNode): StylexUsage {
  const namespaceNames = new Set<string>();
  const createNames = new Set<string>();
  const propsNames = new Set<string>();
  const styleObjectNames = new Set<string>();
  for (const stmt of programBody(program)) {
    if (stmt.type !== "ImportDeclaration") {
      continue;
    }
    const importSource = (stmt.source as { value?: unknown } | undefined)?.value;
    if (typeof importSource !== "string") {
      continue;
    }
    for (const specifier of astArray(stmt.specifiers)) {
      const localName = nodeName(specifier.local as AstNode | undefined);
      if (!localName) {
        continue;
      }
      if (importSource.includes(".stylex")) {
        styleObjectNames.add(localName);
        continue;
      }
      if (importSource !== "@stylexjs/stylex") {
        continue;
      }
      if (specifier.type === "ImportNamespaceSpecifier") {
        namespaceNames.add(localName);
        continue;
      }
      if (specifier.type === "ImportSpecifier") {
        const importedName = nodeName(specifier.imported as AstNode | undefined);
        if (importedName === "create") {
          createNames.add(localName);
        } else if (importedName === "props") {
          propsNames.add(localName);
        }
      }
    }
  }

  for (const binding of localBindings(program)) {
    if (nodeIsStylexCreateCall(binding.node, namespaceNames, createNames)) {
      styleObjectNames.add(binding.name);
    }
  }

  return {
    namespaceNames,
    propsNames,
    styleObjectNames,
    hasStylexSurface:
      namespaceNames.size > 0 ||
      propsNames.size > 0 ||
      createNames.size > 0 ||
      styleObjectNames.size > 0,
  };
}

function localBindingUsesStylex(
  program: AstNode,
  localName: string,
  stylexUsage: StylexUsage,
  checkedNames = new Set<string>(),
): boolean {
  if (checkedNames.has(localName)) {
    return false;
  }
  checkedNames.add(localName);
  const node = findLocalBindingNode(program, localName);
  if (!node) {
    return false;
  }
  if (nodeUsesStylex(node, stylexUsage)) {
    return true;
  }
  return referencedLocalNames(program, node).some((referencedName) =>
    localBindingUsesStylex(program, referencedName, stylexUsage, checkedNames),
  );
}

function nodeUsesStylex(node: AstNode | undefined, stylexUsage: StylexUsage): boolean {
  if (!node) {
    return false;
  }

  let found = false;
  walkValueAst(node, (candidate) => {
    found ||= candidateUsesStylex(candidate, stylexUsage);
  });
  return found;
}

function candidateUsesStylex(candidate: AstNode, stylexUsage: StylexUsage): boolean {
  return (
    nodeIsStylexPropsCall(candidate, stylexUsage.namespaceNames, stylexUsage.propsNames) ||
    nodeIsMergedSxCall(candidate, stylexUsage.styleObjectNames) ||
    isStylexSxAttribute(candidate, stylexUsage.styleObjectNames)
  );
}

function findLocalBindingNode(program: AstNode, localName: string): AstNode | undefined {
  for (const binding of localBindings(program)) {
    if (binding.name === localName) {
      return binding.node;
    }
  }
  return undefined;
}

function referencedLocalNames(program: AstNode, node: AstNode): string[] {
  const localNameSet = new Set(localBindings(program).map((binding) => binding.name));
  const referenced = new Set<string>();
  walkValueAst(node, (candidate) => {
    if (candidate.type !== "Identifier" && candidate.type !== "JSXIdentifier") {
      return;
    }
    const name = candidate.name;
    if (typeof name === "string" && localNameSet.has(name)) {
      referenced.add(name);
    }
  });
  return [...referenced];
}

function nodeIsStylexCreateCall(
  node: AstNode,
  namespaceNames: ReadonlySet<string>,
  createNames: ReadonlySet<string>,
): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee as AstNode | undefined;
  if (callee?.type === "Identifier") {
    return typeof callee.name === "string" && createNames.has(callee.name);
  }
  return isStylexMemberCall(callee, namespaceNames, "create");
}

function nodeIsStylexPropsCall(
  node: AstNode,
  namespaceNames: ReadonlySet<string>,
  propsNames: ReadonlySet<string>,
): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee as AstNode | undefined;
  if (callee?.type === "Identifier") {
    return typeof callee.name === "string" && propsNames.has(callee.name);
  }
  return isStylexMemberCall(callee, namespaceNames, "props");
}

function nodeIsMergedSxCall(node: AstNode, styleObjectNames: ReadonlySet<string>): boolean {
  if (styleObjectNames.size === 0 || node.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee as AstNode | undefined;
  if (callee?.type !== "Identifier" || callee.name !== "mergedSx") {
    return false;
  }
  return astArray(node.arguments).some((arg) => nodeReferencesLocalNames(arg, styleObjectNames));
}

function isStylexMemberCall(
  callee: AstNode | undefined,
  namespaceNames: ReadonlySet<string>,
  propertyName: string,
): boolean {
  if (callee?.type !== "MemberExpression") {
    return false;
  }
  const objectName = nodeName(callee.object as AstNode | undefined);
  const property = callee.property as AstNode | undefined;
  const actualPropertyName =
    (callee as { computed?: boolean }).computed === true ? undefined : nodeName(property);
  return !!objectName && namespaceNames.has(objectName) && actualPropertyName === propertyName;
}

function isStylexSxAttribute(node: AstNode, styleObjectNames: ReadonlySet<string>): boolean {
  if (styleObjectNames.size === 0 || node.type !== "JSXAttribute") {
    return false;
  }
  if (nodeName(node.name as AstNode | undefined) !== "sx") {
    return false;
  }
  const value = node.value as AstNode | undefined;
  if (!value) {
    return false;
  }
  const expression =
    value.type === "JSXExpressionContainer" ? (value.expression as AstNode) : value;
  return nodeReferencesLocalNames(expression, styleObjectNames);
}

/** StyleX surface checks treat a missing node as not referencing the names. */
function nodeReferencesLocalNames(
  node: AstNode | undefined,
  localNames: ReadonlySet<string>,
): boolean {
  return referencesLocalNames(node, localNames, false);
}
