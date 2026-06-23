/**
 * Utilities for relating exported components to local styled-component definitions.
 * Core concepts: export bindings, local declaration lookup, and conservative dependency checks.
 */
import { findDefaultExportedLocalName } from "../utilities/default-export-name.js";
import { getReExportedSourceName } from "./extract-external-interface.js";
import { type AstNode } from "./prepass-parser.js";
import {
  astArray,
  localBindings,
  nodeName,
  nodeReferencesLocalNames as referencesLocalNames,
  parseProgram,
  programBody,
} from "./prepass-ast-utils.js";

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
  /**
   * Static member path when the consumer uses `Exported.Member` rather than the
   * export itself. The check then targets the member's assigned value instead of
   * the root binding, and stays conservative (dependent) when the member
   * assignment cannot be located.
   */
  memberPath?: readonly string[];
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

  if (args.memberPath !== undefined && args.memberPath.length > 0) {
    return staticMemberDependsOnLocalNames(parsed, targets, args.memberPath, dependencyNames);
  }

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

type StaticMemberValues = {
  values: AstNode[];
  hasUnknownSource: boolean;
};

/**
 * Dependency check for `Exported.Member` consumers: locate static member
 * assignments (`Root.Member = Value`, or `Member:` properties in the root's
 * object-literal / `Object.assign` initializer) and test the assigned values.
 * Returns true (dependent) when the member cannot be proven independent.
 */
function staticMemberDependsOnLocalNames(
  program: AstNode,
  targets: ExportTargets,
  memberPath: readonly string[],
  dependencyNames: ReadonlySet<string>,
): boolean {
  const memberName = memberPath[0];
  if (memberPath.length !== 1 || memberName === undefined || targets.nodes.length > 0) {
    return true;
  }
  const rootNames = expandAliasNamesBothWays(program, targets.localNames);
  const memberValues = collectStaticMemberValues(program, rootNames, memberName);
  if (memberValues.hasUnknownSource || memberValues.values.length === 0) {
    return true;
  }
  return memberValues.values.some((value) => nodeReferencesLocalNames(value, dependencyNames));
}

/**
 * Expand a name set across identity aliases in both directions, so member
 * assignments written on any alias of the export (e.g. `CustomSelect.Option = X`
 * behind `export const Public = CustomSelect`) are found.
 */
function expandAliasNamesBothWays(
  program: AstNode,
  initialNames: ReadonlySet<string>,
): Set<string> {
  const aliases = collectIdentityAliases(program);
  const expanded = new Set(initialNames);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [aliasName, targetName] of aliases) {
      if (expanded.has(aliasName) !== expanded.has(targetName)) {
        expanded.add(aliasName);
        expanded.add(targetName);
        changed = true;
      }
    }
  }
  return expanded;
}

function collectStaticMemberValues(
  program: AstNode,
  rootNames: ReadonlySet<string>,
  memberName: string,
): StaticMemberValues {
  const result: StaticMemberValues = { values: [], hasUnknownSource: false };
  for (const stmt of programBody(program)) {
    if (stmt.type !== "ExpressionStatement") {
      continue;
    }
    const assignedValue = staticMemberAssignmentValue(
      stmt.expression as AstNode | undefined,
      rootNames,
      memberName,
    );
    if (assignedValue) {
      result.values.push(assignedValue);
    }
  }
  for (const binding of localBindings(program)) {
    if (rootNames.has(binding.name)) {
      const bindingValues = objectLiteralMemberValues(
        unwrapTransparentExpression(binding.node),
        memberName,
      );
      result.values.push(...bindingValues.values);
      result.hasUnknownSource ||= bindingValues.hasUnknownSource;
    }
  }
  return result;
}

/** Value assigned by a `Root.Member = Value` statement, if `expression` is one. */
function staticMemberAssignmentValue(
  expression: AstNode | undefined,
  rootNames: ReadonlySet<string>,
  memberName: string,
): AstNode | undefined {
  if (expression?.type !== "AssignmentExpression" || expression.operator !== "=") {
    return undefined;
  }
  const left = expression.left as AstNode | undefined;
  if (left?.type !== "MemberExpression" || (left as { computed?: boolean }).computed === true) {
    return undefined;
  }
  const objectName = nodeName(left.object as AstNode | undefined);
  const propertyName = nodeName(left.property as AstNode | undefined);
  if (!objectName || !rootNames.has(objectName) || propertyName !== memberName) {
    return undefined;
  }
  return expression.right as AstNode | undefined;
}

/** `Member:` property values in an object-literal or `Object.assign(...)` initializer. */
function objectLiteralMemberValues(init: AstNode, memberName: string): StaticMemberValues {
  const result: StaticMemberValues = { values: [], hasUnknownSource: false };
  if (init.type === "ObjectExpression") {
    collectObjectExpressionMemberValues(init, memberName, result);
  } else if (init.type === "CallExpression" && isObjectAssignCallee(init.callee as AstNode)) {
    for (const arg of astArray(init.arguments)) {
      if (arg.type === "ObjectExpression") {
        collectObjectExpressionMemberValues(arg, memberName, result);
      } else {
        result.hasUnknownSource = true;
        result.values = [];
      }
    }
  }

  return result;
}

function collectObjectExpressionMemberValues(
  objectNode: AstNode,
  memberName: string,
  result: StaticMemberValues,
): void {
  for (const property of astArray(objectNode.properties)) {
    if (
      (property.type === "ObjectProperty" || property.type === "Property") &&
      (property as { computed?: boolean }).computed !== true &&
      nodeName(property.key as AstNode | undefined) === memberName
    ) {
      const value = property.value as AstNode | undefined;
      if (value) {
        result.values = [value];
        result.hasUnknownSource = false;
      }
    } else if (property.type === "SpreadElement" || property.type === "SpreadProperty") {
      result.hasUnknownSource = true;
      result.values = [];
    }
  }
}

function isObjectAssignCallee(callee: AstNode | undefined): boolean {
  return (
    callee?.type === "MemberExpression" &&
    (callee as { computed?: boolean }).computed !== true &&
    nodeName(callee.object as AstNode | undefined) === "Object" &&
    nodeName(callee.property as AstNode | undefined) === "assign"
  );
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

/** Dependency checks treat a missing node as conservatively dependent. */
function nodeReferencesLocalNames(
  node: AstNode | undefined,
  localNames: ReadonlySet<string>,
): boolean {
  return referencesLocalNames(node, localNames, true);
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
