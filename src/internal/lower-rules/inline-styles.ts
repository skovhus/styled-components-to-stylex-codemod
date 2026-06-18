/**
 * Utilities for analyzing inline style arrow functions and templates.
 * Core concepts: prop extraction, conditional detection, and template assembly.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ImportSource, ImportSpec } from "../../adapter.js";
import {
  type ASTNodeRecord,
  cloneAstNode,
  getArrowFnParamBindings,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  isFunctionNode,
  literalToStaticValue,
  patternBindsAnyName,
} from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  type AuthoredMultilineContext,
  maybeApplyAuthoredMultilineTemplateFormatting,
} from "../utilities/css-authored-multiline.js";
import {
  buildStylexValueWithStaticParts as buildStylexValueWithStaticPartsBase,
  canOmitPxUnitForStylexNumber,
  isNumericStylexExpression,
  maybeOmitPxUnitFromStylexStyleValue,
  maybeOmitPxUnitFromStylexValue,
} from "../utilities/stylex-numeric-values.js";
import {
  collectNumericStylexImportBindings,
  type StylexImportBinding,
} from "../utilities/stylex-numeric-imports.js";
import { isStylexImportSource } from "../utilities/stylex-import-source.js";
import { findInAst, isMemberExpression, mapAst, walkAst } from "./utils.js";

export {
  canOmitPxUnitForStylexNumber,
  isNumericStylexExpression,
  maybeOmitPxUnitFromStylexStyleValue,
  maybeOmitPxUnitFromStylexValue,
};

type StylexImportMapEntry =
  | { importedName?: string; source?: ImportSource | { value?: string } }
  | null
  | undefined;

export function getImportedStylexIdentifiers(
  importMap: ReadonlyMap<string, StylexImportMapEntry>,
  resolverImports: ReadonlyMap<string, ImportSpec>,
): Set<string> {
  const identifiers = new Set<string>();
  for (const [localName, importEntry] of importMap) {
    const sourceValue = importEntry?.source?.value;
    if (typeof sourceValue === "string" && isStylexImportSource(sourceValue)) {
      identifiers.add(localName);
    }
  }
  for (const importSpec of resolverImports.values()) {
    if (!isStylexImportSource(importSpec.from.value)) {
      continue;
    }
    for (const name of importSpec.names) {
      identifiers.add(name.local ?? name.imported);
    }
  }
  return identifiers;
}

export function getNumericImportedStylexIdentifiers(
  j: JSCodeshift,
  filePath: string,
  importMap: ReadonlyMap<string, StylexImportMapEntry>,
  resolverImports: ReadonlyMap<string, ImportSpec>,
): Set<string> {
  const bindings: StylexImportBinding[] = [];
  for (const [localName, importEntry] of importMap) {
    const source = importEntry?.source;
    const sourceValue = source?.value;
    const importedName = importEntry?.importedName;
    if (!source || typeof sourceValue !== "string" || !importedName) {
      continue;
    }
    bindings.push({
      localName,
      importedName,
      source:
        "kind" in source
          ? (source as ImportSource)
          : { kind: "specifier" as const, value: sourceValue },
    });
  }
  for (const importSpec of resolverImports.values()) {
    for (const name of importSpec.names) {
      bindings.push({
        localName: name.local ?? name.imported,
        importedName: name.imported,
        source: importSpec.from,
      });
    }
  }
  return collectNumericStylexImportBindings({ j, filePath, bindings });
}

// Build a template literal with static prefix/suffix around a dynamic expression.
// e.g., prefix="" suffix="ms" expr=<call> -> `${<call>}ms`
// If the expression is a static literal, returns a simple string literal instead.
// e.g., prefix="" suffix="px" expr=34 -> "34px" (not `${34}px`)
export function buildTemplateWithStaticParts(
  j: JSCodeshift,
  expr: ExpressionKind,
  prefix: string,
  suffix: string,
  multilineContext?: AuthoredMultilineContext,
): ExpressionKind {
  if (!prefix && !suffix) {
    return expr;
  }
  // If the expression is a static literal, return a simple string literal
  const staticValue = literalToStaticValue(expr);
  if (staticValue !== null) {
    return j.stringLiteral(prefix + String(staticValue) + suffix);
  }
  const templateLiteral = j.templateLiteral(
    [
      j.templateElement({ raw: prefix, cooked: prefix }, false),
      j.templateElement({ raw: suffix, cooked: suffix }, true),
    ],
    [expr],
  );
  if (!multilineContext) {
    return templateLiteral;
  }
  return maybeApplyAuthoredMultilineTemplateFormatting({
    j,
    templateLiteral,
    ...multilineContext,
  });
}

export function buildStylexValueWithStaticParts(
  j: JSCodeshift,
  expr: ExpressionKind,
  prefix: string,
  suffix: string,
  stylexProp: string,
  important = false,
  multilineContext?: AuthoredMultilineContext,
  numericIdentifiers?: ReadonlySet<string>,
): ExpressionKind {
  return buildStylexValueWithStaticPartsBase(
    j,
    expr,
    prefix,
    suffix,
    stylexProp,
    (innerExpr, innerPrefix, innerSuffix) =>
      buildTemplateWithStaticParts(j, innerExpr, innerPrefix, innerSuffix, multilineContext),
    important,
    { numericIdentifiers },
  );
}

/**
 * Rewrites `props.theme.X` member access to `theme.X` in a cloned AST node.
 *
 * This is used when wrapper emission introduces `const theme = useTheme();`
 * and a preserved runtime expression should read from that variable.
 */
export function rewritePropsThemeToThemeVar(node: ExpressionKind): ExpressionKind {
  return mapAst(cloneAstNode(node), (rec, recurse) => {
    if (!isMemberExpression(rec)) {
      return undefined; // default traversal
    }
    const obj = rec.object as ASTNodeRecord | undefined;
    if (
      obj &&
      isMemberExpression(obj) &&
      (obj.object as { type?: string; name?: string })?.type === "Identifier" &&
      (obj.object as { name?: string })?.name === "props" &&
      (obj.property as { type?: string; name?: string })?.type === "Identifier" &&
      (obj.property as { name?: string })?.name === "theme" &&
      obj.computed === false
    ) {
      rec.object = { type: "Identifier", name: "theme" } as unknown as ASTNodeRecord;
      if (rec.computed) {
        rec.property = recurse(rec.property) as ASTNodeRecord;
      }
      return rec;
    }
    rec.object = recurse(rec.object) as ASTNodeRecord;
    if (rec.computed) {
      rec.property = recurse(rec.property) as ASTNodeRecord;
    }
    return rec;
  }) as ExpressionKind;
}

export function unwrapArrowFunctionToPropsExpr(
  j: JSCodeshift,
  expr: any,
): { expr: any; propsUsed: Set<string> } | null {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return null;
  }
  if (expr.params?.length !== 1 || expr.params[0]?.type !== "Identifier") {
    return null;
  }
  const paramName = expr.params[0].name;
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return null;
  }

  const propsUsed = new Set<string>();
  let safeToInline = true;
  const replaced = mapAst(cloneAstNode(bodyExpr), (node) => {
    if (
      isMemberExpression(node) &&
      (node.object as any)?.type === "Identifier" &&
      (node.object as any)?.name === paramName &&
      (node.property as any)?.type === "Identifier" &&
      node.computed === false
    ) {
      const propName = (node.property as { name: string }).name;
      if (!propName.startsWith("$")) {
        safeToInline = false;
        return node;
      }
      propsUsed.add(propName);
      return j.identifier(propName);
    }
    return undefined; // default traversal
  });
  if (!safeToInline || propsUsed.size === 0) {
    return null;
  }
  return { expr: replaced, propsUsed };
}

export function collectPropsFromArrowFn(expr: any): Set<string> {
  const props = new Set<string>();
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return props;
  }
  const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
  if (!paramName) {
    return props;
  }
  walkAst(getFunctionBodyExpr(expr), (node) => {
    if (
      isMemberExpression(node) &&
      (node.object as any)?.type === "Identifier" &&
      (node.object as any)?.name === paramName &&
      (node.property as any)?.type === "Identifier" &&
      node.computed === false
    ) {
      props.add((node.property as { name: string }).name);
    }
  });
  return props;
}

/**
 * Collects prop names referenced in a destructured arrow function body.
 * Unlike collectPropsFromArrowFn, this handles both identifier and destructured params.
 * Used specifically for CSS variable bridge contexts where destructured arrow forms
 * like `({ $color }) => $color` must also register shouldForwardProp drops.
 */
export function collectPropsFromArrowFnDestructured(expr: any): Set<string> {
  // First try the standard identifier-param path
  const fromIdentifier = collectPropsFromArrowFn(expr);
  if (fromIdentifier.size > 0) {
    return fromIdentifier;
  }

  const props = new Set<string>();
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return props;
  }
  const bindings = getArrowFnParamBindings(expr);
  if (!bindings || bindings.kind !== "destructured") {
    return props;
  }

  // Walk body for identifiers matching destructured local names
  const localToOriginal = bindings.bindings;
  walkAst(getFunctionBodyExpr(expr), (node) => {
    if (node.type === "Identifier" && localToOriginal.has(node.name as string)) {
      props.add(localToOriginal.get(node.name as string)!);
    }
  });
  return props;
}

export function collectDollarParamBindingIdentifiers(expr: any): Set<string> {
  const identifiers = new Set<string>();
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return identifiers;
  }
  const bindings = getArrowFnParamBindings(expr);
  if (!bindings || bindings.kind !== "destructured") {
    return identifiers;
  }
  for (const localName of bindings.bindings.keys()) {
    if (localName.startsWith("$")) {
      identifiers.add(localName);
    }
  }
  return identifiers;
}

export function countConditionalExpressions(node: any): number {
  let count = 0;
  walkAst(node, (n) => {
    if (n.type === "ConditionalExpression") {
      count++;
    }
  });
  return count;
}

export function hasThemeAccessInArrowFn(expr: any): boolean {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return false;
  }
  if (expr.params?.length !== 1) {
    return false;
  }
  const param = expr.params[0];

  // Check for destructured `theme` in ObjectPattern: ({ enabled, theme }) => ...
  if (param?.type === "ObjectPattern" && Array.isArray(param.properties)) {
    for (const prop of param.properties) {
      if (
        prop &&
        (prop.type === "Property" || prop.type === "ObjectProperty") &&
        prop.key?.type === "Identifier" &&
        prop.key.name === "theme"
      ) {
        return true;
      }
    }
    return false;
  }

  if (param?.type !== "Identifier") {
    return false;
  }
  const paramName = param.name;
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return false;
  }
  return findInAst(
    bodyExpr,
    (node) =>
      isMemberExpression(node) &&
      (node.object as any)?.type === "Identifier" &&
      (node.object as any)?.name === paramName &&
      (node.property as any)?.type === "Identifier" &&
      (node.property as any)?.name === "theme" &&
      node.computed === false,
  );
}

export function hasFunctionParamReferenceInArrowFn(expr: any): boolean {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return false;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return false;
  }
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return false;
  }
  return findInAst(bodyExpr, (node) => node.type === "Identifier" && node.name === paramName);
}

export function hasThemeReferenceInExpression(node: unknown): boolean {
  return hasIdentifierReference(node, "theme");
}

export function rewritePropsReferencesToPropsWithTheme(
  j: JSCodeshift,
  node: ExpressionKind,
): ExpressionKind {
  return mapAst(cloneAstNode(node), (rec, recurse) => {
    if (
      isMemberExpression(rec) &&
      (rec.object as ASTNodeRecord | undefined)?.type === "Identifier" &&
      (rec.object as { name?: string }).name === "props"
    ) {
      if (rec.computed) {
        rec.property = recurse(rec.property) as ASTNodeRecord;
      }
      return rec;
    }
    if (rec.type === "Identifier" && rec.name === "props") {
      return makePropsWithThemeObject(j);
    }
    return recurseReferencePositionsOnly(rec, recurse);
  }) as ExpressionKind;
}

/**
 * Styled-components invokes functions returned from interpolation branches with
 * the execution props. Preserve that behavior for branch calls that exactly
 * match another call used in curried form in the same runtime expression.
 */
export function invokeKnownCurriedHelperBranchesWithPropsTheme(
  j: JSCodeshift,
  node: ExpressionKind,
): ExpressionKind {
  const curriedCallKeys = collectCurriedCallKeys(node);
  if (curriedCallKeys.size === 0) {
    return node;
  }

  const invokeIfCurriedHelper = (value: unknown): unknown => {
    if (!value || typeof value !== "object") {
      return value;
    }
    const call = value as ASTNodeRecord;
    if (
      call.type !== "CallExpression" ||
      (call.callee as ASTNodeRecord | undefined)?.type === "CallExpression"
    ) {
      return value;
    }
    const callKey = getComparableAstKey(call);
    return callKey && curriedCallKeys.has(callKey)
      ? j.callExpression(call as Parameters<typeof j.callExpression>[0], [
          makePropsWithThemeObject(j),
        ])
      : value;
  };

  return mapAst(cloneAstNode(node), (rec, recurse) => {
    if (rec.type === "ConditionalExpression") {
      rec.test = recurse(rec.test);
      rec.consequent = invokeIfCurriedHelper(recurse(rec.consequent)) as ASTNodeRecord;
      rec.alternate = invokeIfCurriedHelper(recurse(rec.alternate)) as ASTNodeRecord;
      return rec;
    }
    return recurseReferencePositionsOnly(rec, recurse);
  }) as ExpressionKind;
}

export function inlineArrowFunctionBody(j: JSCodeshift, expr: any): ExpressionKind | null {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return null;
  }
  if (expr.params?.length !== 1) {
    return null;
  }
  const param = expr.params[0];
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return null;
  }

  // Simple identifier param: (props) => ...
  if (param?.type === "Identifier") {
    const paramName = param.name;
    return mapAst(cloneAstNode(bodyExpr), (node, recurse) => {
      if (isFunctionNode(node) && functionBindsAnyName(node, new Set([paramName]))) {
        return node;
      }
      if (node.type === "Identifier" && node.name === paramName) {
        return j.identifier("props");
      }
      return recurseReferencePositionsOnly(node, recurse);
    }) as ExpressionKind;
  }

  // Destructured param: ({ color, size: size_ }) => ...
  const bindings = getArrowFnParamBindings(expr);
  if (!bindings || bindings.kind !== "destructured") {
    return null;
  }

  // Replace destructured identifiers with props.propName
  // If there's a default value, wrap with nullish coalescing: props.propName ?? defaultValue
  const bindingNames = new Set(bindings.bindings.keys());
  return mapAst(cloneAstNode(bodyExpr), (node, recurse) => {
    if (isFunctionNode(node) && functionBindsAnyName(node, bindingNames)) {
      return node;
    }
    if (node.type === "Identifier" && bindings.bindings.has(node.name as string)) {
      const propName = bindings.bindings.get(node.name as string)!;
      const memberExpr = j.memberExpression(j.identifier("props"), j.identifier(propName));
      const defaultValue = bindings.defaults?.get(propName);
      if (defaultValue) {
        return j.logicalExpression("??", memberExpr, cloneAstNode(defaultValue) as ExpressionKind);
      }
      return memberExpr;
    }
    return recurseReferencePositionsOnly(node, recurse);
  }) as ExpressionKind;
}

export function hasUnsupportedConditionalTest(expr: any): boolean {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return false;
  }
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return false;
  }
  return findInAst(
    bodyExpr,
    (node) =>
      node.type === "ConditionalExpression" &&
      ((node.test as Record<string, unknown>)?.type === "LogicalExpression" ||
        (node.test as Record<string, unknown>)?.type === "ConditionalExpression"),
  );
}

/**
 * Collects prop names from AST expressions by finding:
 * - Member expressions accessing `props.X` (non-computed)
 * - Identifiers starting with `$` (transient props)
 */
export function collectPropsFromExpressions(
  expressions: Iterable<unknown>,
  propsUsed: Set<string>,
): void {
  for (const expr of expressions) {
    walkAst(expr, (n) => {
      if (
        isMemberExpression(n) &&
        (n.object as ASTNodeRecord)?.type === "Identifier" &&
        (n.object as { name?: string })?.name === "props" &&
        (n.property as ASTNodeRecord)?.type === "Identifier" &&
        n.computed === false
      ) {
        propsUsed.add((n.property as { name: string }).name);
      }
      if (n.type === "Identifier") {
        const identName = n.name as string | undefined;
        if (identName?.startsWith("$")) {
          propsUsed.add(identName);
        }
      }
    });
  }
}

/**
 * Normalizes $-prefixed prop references to props.X format for StyleX style functions:
 * - `$foo` identifier -> `props.foo` (wrap in member expression)
 * - `props.$foo` -> `props.foo` (strip $ prefix)
 * - `props.foo` -> unchanged
 */
export function normalizeDollarProps(
  j: JSCodeshift,
  exprNode: ExpressionKind,
  opts?: {
    skipIdentifiers?: ReadonlySet<string>;
    localDollarIdentifiers?: ReadonlySet<string>;
  },
): ExpressionKind {
  return mapAst(cloneAstNode(exprNode), (n) => {
    // Handle props.$foo -> props.foo (strip $ from property name)
    if (
      isMemberExpression(n) &&
      (n.object as ASTNodeRecord)?.type === "Identifier" &&
      (n.object as { name?: string })?.name === "props" &&
      (n.property as ASTNodeRecord)?.type === "Identifier" &&
      n.computed === false
    ) {
      const propName = (n.property as { name: string }).name;
      if (propName.startsWith("$")) {
        return j.memberExpression(j.identifier("props"), j.identifier(propName.slice(1)));
      }
      // props.foo stays as props.foo - no change needed
      return n;
    }
    // Handle $foo identifier -> props.foo
    if (n.type === "Identifier") {
      const identName = n.name as string | undefined;
      const isLocalDollarIdentifier = !!identName && opts?.localDollarIdentifiers?.has(identName);
      if (
        identName?.startsWith("$") &&
        (isLocalDollarIdentifier || !opts?.skipIdentifiers?.has(identName))
      ) {
        return j.memberExpression(j.identifier("props"), j.identifier(identName.slice(1)));
      }
    }
    return undefined; // default traversal
  }) as ExpressionKind;
}

// ── Non-exported helpers ────────────────────────────────────────────

/**
 * For MemberExpression and Property nodes, only recurse into reference
 * positions (object, computed keys, values) — not non-computed property keys.
 * Returns `undefined` for other node types to let mapAst use default traversal.
 */
function recurseReferencePositionsOnly(
  node: Record<string, unknown>,
  recurse: (n: unknown) => unknown,
): Record<string, unknown> | undefined {
  if (isMemberExpression(node)) {
    node.object = recurse(node.object);
    if (node.computed) {
      node.property = recurse(node.property);
    }
    return node;
  }
  if (node.type === "Property" || node.type === "ObjectProperty") {
    if (node.computed) {
      node.key = recurse(node.key);
    }
    node.value = recurse(node.value);
    return node;
  }
  return undefined; // default traversal for all other nodes
}

function makePropsWithThemeObject(j: JSCodeshift) {
  const themeProperty = j.property("init", j.identifier("theme"), j.identifier("theme"));
  themeProperty.shorthand = true;
  return j.objectExpression([j.spreadElement(j.identifier("props")), themeProperty]);
}

function functionBindsAnyName(node: Record<string, unknown>, names: ReadonlySet<string>): boolean {
  const params = node.params;
  return Array.isArray(params) && params.some((param) => patternBindsAnyName(param, names));
}

function collectCurriedCallKeys(node: unknown): Set<string> {
  const keys = new Set<string>();
  walkAst(node, (rec) => {
    if (rec.type !== "CallExpression") {
      return;
    }
    const callee = rec.callee as ASTNodeRecord | undefined;
    if (callee?.type !== "CallExpression") {
      return;
    }
    const key = getComparableAstKey(callee);
    if (key) {
      keys.add(key);
    }
  });
  return keys;
}

function hasIdentifierReference(node: unknown, name: string): boolean {
  let found = false;
  const visit = (value: unknown): void => {
    if (found || !value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    const rec = value as ASTNodeRecord;
    if (rec.type === "Identifier" && rec.name === name) {
      found = true;
      return;
    }
    if (isMemberExpression(rec)) {
      visit(rec.object);
      if (rec.computed) {
        visit(rec.property);
      }
      return;
    }
    if (rec.type === "Property" || rec.type === "ObjectProperty") {
      if (rec.computed) {
        visit(rec.key);
      }
      visit(rec.value);
      return;
    }
    for (const [key, child] of Object.entries(rec)) {
      if (isAstMetadataKey(key)) {
        continue;
      }
      visit(child);
    }
  };
  visit(node);
  return found;
}

function getComparableAstKey(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  return JSON.stringify(normalizeAstForComparison(node));
}

function normalizeAstForComparison(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeAstForComparison);
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (isAstMetadataKey(key)) {
      continue;
    }
    out[key] = normalizeAstForComparison((value as Record<string, unknown>)[key]);
  }
  return out;
}

function isAstMetadataKey(key: string): boolean {
  return (
    key === "comments" ||
    key === "end" ||
    key === "extra" ||
    key === "leadingComments" ||
    key === "loc" ||
    key === "start" ||
    key === "trailingComments"
  );
}
