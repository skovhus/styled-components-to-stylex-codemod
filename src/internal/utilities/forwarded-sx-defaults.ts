/**
 * Guards conditional StyleX defaults forwarded through wrapped component `sx`.
 * Core concepts: sx composition, conditional defaults, and static base proofs.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import type { API } from "jscodeshift";
import type { WarningType } from "../logger.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { wrappedComponentInterfaceFor } from "./wrapped-component-interface.js";
import { isRelativeSpecifier, toRealPath } from "./path-utils.js";
import {
  propertiesWithNullConditionalDefault,
  setConditionalDefault,
} from "./conditional-style-defaults.js";

export function guardForwardedSxConditionalDefaults(
  ctx: TransformContext,
  styledDecls: readonly StyledDecl[],
): "ok" | "bail" {
  if (!ctx.adapter.useSxProp || !ctx.resolvedStyleObjects) {
    return "ok";
  }

  for (const decl of styledDecls) {
    if (decl.base.kind !== "component" || !wrappedComponentForwardsSx(ctx, decl.base.ident)) {
      continue;
    }

    for (const styleKey of styleKeysForDecl(decl)) {
      const styleObj = ctx.resolvedStyleObjects.get(styleKey);
      if (!isRecord(styleObj)) {
        continue;
      }
      for (const prop of propertiesWithNullConditionalDefault(styleObj)) {
        const result = applyForwardedSxDefault({
          ctx,
          decl,
          prop,
          applyStaticDefault: (value) => setConditionalDefault(styleObj, prop, value),
        });
        if (result === "ok") {
          continue;
        }
        return "bail";
      }
      for (const prop of functionPropertiesWithNullConditionalDefault(styleObj)) {
        const result = applyForwardedSxDefault({
          ctx,
          decl,
          prop,
          applyStaticDefault: (value) => setFunctionConditionalDefault(styleObj, prop, value),
        });
        if (result === "ok") {
          continue;
        }
        return "bail";
      }
    }
  }

  return "ok";
}

function applyForwardedSxDefault(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  prop: string;
  applyStaticDefault: (value: StaticStyleValue) => void;
}): "ok" | "bail" {
  const { ctx, decl, prop, applyStaticDefault } = args;
  const wrappedComponent = decl.base.kind === "component" ? decl.base.ident : "";
  const inferred = inferWrappedComponentSxProperty(ctx, wrappedComponent, prop);
  if (inferred.kind === "static") {
    applyStaticDefault(inferred.value);
    return "ok";
  }
  if (inferred.kind === "absent") {
    return "ok";
  }
  ctx.warnings.push({
    severity: "warning",
    type: FORWARDED_SX_DEFAULT_WARNING,
    loc: decl.loc,
    context: {
      localName: decl.localName,
      wrappedComponent,
      property: prop,
      reason:
        inferred.kind === "variable"
          ? "wrapped component base property can vary before sx is applied"
          : "wrapped component base default could not be proven",
      todo: `TODO: set an explicit default for ${prop} or avoid forwarding this conditional override through sx.`,
    },
  });
  return "bail";
}

const FORWARDED_SX_DEFAULT_WARNING =
  "Forwarded sx conditional default would override an unproven wrapped component base style" satisfies WarningType;

type AstRecord = Record<string, unknown> & { type?: string };
type StaticStyleValue = string | number | boolean | null;
type StyleEntry =
  | { kind: "object"; props: Map<string, PropValue> }
  | { kind: "function"; props: Set<string> };
type PropValue = { kind: "static"; value: StaticStyleValue } | { kind: "dynamic" };
type StyleMaps = Map<string, Map<string, StyleEntry>>;
type PropertyInference =
  | { kind: "static"; value: StaticStyleValue }
  | { kind: "absent" }
  | { kind: "variable" }
  | { kind: "unknown" };

function wrappedComponentForwardsSx(ctx: TransformContext, componentLocalName: string): boolean {
  return wrappedComponentInterfaceFor(ctx, componentLocalName)?.acceptsSx === true;
}

function styleKeysForDecl(decl: StyledDecl): string[] {
  return [
    decl.styleKey,
    ...(decl.extraStyleKeys ?? []),
    ...(decl.needsUseThemeHook?.flatMap((entry) =>
      [entry.trueStyleKey, entry.falseStyleKey].filter((key): key is string => key !== null),
    ) ?? []),
    ...Object.values(decl.variantStyleKeys ?? {}),
    ...(decl.styleFnFromProps?.map((entry) => entry.fnKey) ?? []),
    ...(decl.compoundVariants?.flatMap((entry) =>
      entry.kind === "3branch"
        ? [entry.outerTruthyKey, entry.innerTruthyKey, entry.innerFalsyKey]
        : [
            entry.outerTruthyInnerTruthyKey,
            entry.outerTruthyInnerFalsyKey,
            entry.outerFalsyInnerTruthyKey,
            entry.outerFalsyInnerFalsyKey,
          ],
    ) ?? []),
    ...(decl.pseudoExpandSelectors?.map((entry) => entry.styleKey) ?? []),
    ...(decl.pseudoAliasSelectors?.flatMap((entry) => entry.styleKeys) ?? []),
    ...(decl.attrWrapper
      ? [
          decl.attrWrapper.checkboxKey,
          decl.attrWrapper.radioKey,
          decl.attrWrapper.readonlyKey,
          decl.attrWrapper.externalKey,
          decl.attrWrapper.httpsKey,
          decl.attrWrapper.pdfKey,
        ].filter((key): key is string => typeof key === "string")
      : []),
    ...(decl.enumVariant
      ? [decl.enumVariant.baseKey, ...decl.enumVariant.cases.map((entry) => entry.styleKey)]
      : []),
    ...(decl.callSiteCombinedStyles?.map((entry) => entry.styleKey) ?? []),
    ...(decl.promotedStyleProps
      ?.filter((entry) => !entry.mergeIntoBase)
      .map((entry) => entry.styleKey) ?? []),
    ...(decl.adjacentSiblingStyleKey ? [decl.adjacentSiblingStyleKey] : []),
  ];
}

function inferWrappedComponentSxProperty(
  ctx: TransformContext,
  componentLocalName: string,
  prop: string,
): PropertyInference {
  const source = readComponentSource(ctx, componentLocalName);
  if (!source) {
    return { kind: "unknown" };
  }

  const root = parseSource(ctx.api.jscodeshift, source.source);
  if (!root) {
    return { kind: "unknown" };
  }

  const styleMaps = collectStylexCreateMaps(root.ast);
  const component = findComponentFunction(root.ast, source.componentNames);
  if (!component) {
    return { kind: "unknown" };
  }

  const sxBindings = collectSxBindings(component);
  const observations = collectSxCompositionObservations(component, sxBindings, styleMaps, prop);
  if (observations.length === 0) {
    return { kind: "unknown" };
  }
  return mergePropertyInferences(observations);
}

function readComponentSource(
  ctx: TransformContext,
  componentLocalName: string,
): { source: string; componentNames: string[] } | null {
  const importInfo = ctx.importMap?.get(componentLocalName);
  if (!importInfo) {
    return { source: ctx.file.source, componentNames: [componentLocalName] };
  }
  const absolutePath =
    importInfo.source.kind === "absolutePath"
      ? importInfo.source.value
      : isRelativeSpecifier(importInfo.source.value)
        ? pathResolve(dirname(ctx.file.path), importInfo.source.value)
        : null;
  if (!absolutePath) {
    return null;
  }
  const source = readSourceFile(ctx, absolutePath);
  if (!source) {
    return null;
  }
  const componentNames =
    importInfo.importedName === "default"
      ? [componentLocalName, importInfo.importedName]
      : [importInfo.importedName];
  return { source, componentNames };
}

function readSourceFile(ctx: TransformContext, absolutePath: string): string | null {
  for (const candidate of sourcePathCandidates(absolutePath)) {
    const override = ctx.options.transformedFileSources?.get(toRealPath(candidate));
    if (override !== undefined) {
      return override;
    }
    if (existsSync(candidate)) {
      try {
        return readFileSync(candidate, "utf8");
      } catch {
        continue;
      }
    }
  }
  return null;
}

function sourcePathCandidates(absolutePath: string): string[] {
  return [
    "",
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    "/index.tsx",
    "/index.ts",
    "/index.jsx",
    "/index.js",
  ].map((ext) => absolutePath + ext);
}

function parseSource(jscodeshift: API["jscodeshift"], source: string): { ast: unknown } | null {
  try {
    const j = jscodeshift.withParser("tsx");
    return { ast: j(source).get().node as unknown };
  } catch {
    return null;
  }
}

function collectStylexCreateMaps(ast: unknown): StyleMaps {
  const maps: StyleMaps = new Map();
  walk(ast, (node) => {
    if (node.type !== "VariableDeclarator") {
      return;
    }
    const id = node.id;
    const init = node.init;
    if (!isIdentifier(id) || !isRecord(init) || !isStylexCreateCall(init)) {
      return;
    }
    const stylesArg = getCallArguments(init)[0];
    if (!isObjectExpression(stylesArg)) {
      return;
    }
    maps.set(id.name, readStyleEntries(stylesArg));
  });
  return maps;
}

function readStyleEntries(stylexCreateArg: AstRecord): Map<string, StyleEntry> {
  const entries = new Map<string, StyleEntry>();
  for (const property of getObjectProperties(stylexCreateArg)) {
    const key = readPropertyKey(property);
    const value = property.value;
    if (!key || !value) {
      continue;
    }
    if (isObjectExpression(value)) {
      entries.set(key, { kind: "object", props: readStyleObjectProps(value) });
      continue;
    }
    const returnedObject = readFunctionReturnedObject(value);
    if (returnedObject) {
      entries.set(key, {
        kind: "function",
        props: new Set(readStyleObjectProps(returnedObject).keys()),
      });
    }
  }
  return entries;
}

function readStyleObjectProps(styleObject: AstRecord): Map<string, PropValue> {
  const props = new Map<string, PropValue>();
  for (const property of getObjectProperties(styleObject)) {
    const key = readPropertyKey(property);
    if (!key || !property.value) {
      continue;
    }
    const value = readStaticStyleValue(property.value);
    props.set(key, value.found ? { kind: "static", value: value.value } : { kind: "dynamic" });
  }
  return props;
}

function readStaticStyleValue(
  node: unknown,
): { found: true; value: StaticStyleValue } | { found: false } {
  if (!isRecord(node)) {
    return { found: false };
  }
  if (
    node.type === "StringLiteral" ||
    node.type === "NumericLiteral" ||
    node.type === "BooleanLiteral"
  ) {
    return { found: true, value: node.value as StaticStyleValue };
  }
  if (node.type === "Literal") {
    const value = node.value;
    return typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
      ? { found: true, value }
      : { found: false };
  }
  if (node.type === "NullLiteral") {
    return { found: true, value: null };
  }
  if (isObjectExpression(node)) {
    const defaultProp = getObjectProperties(node).find(
      (prop) => readPropertyKey(prop) === "default",
    );
    return defaultProp?.value ? readStaticStyleValue(defaultProp.value) : { found: false };
  }
  return { found: false };
}

function readFunctionReturnedObject(node: unknown): AstRecord | null {
  if (!isRecord(node)) {
    return null;
  }
  if (
    node.type !== "ArrowFunctionExpression" &&
    node.type !== "FunctionExpression" &&
    node.type !== "FunctionDeclaration"
  ) {
    return null;
  }
  const body = node.body;
  if (isObjectExpression(body)) {
    return body;
  }
  if (!isRecord(body) || body.type !== "BlockStatement") {
    return null;
  }
  const statements = Array.isArray(body.body) ? body.body : [];
  for (const statement of statements) {
    if (
      isRecord(statement) &&
      statement.type === "ReturnStatement" &&
      isObjectExpression(statement.argument)
    ) {
      return statement.argument;
    }
  }
  return null;
}

function functionPropertiesWithNullConditionalDefault(node: unknown): string[] {
  const returnedObject = readFunctionReturnedObject(node);
  if (!returnedObject) {
    return [];
  }
  const props: string[] = [];
  for (const property of getObjectProperties(returnedObject)) {
    const key = readPropertyKey(property);
    if (!key || !isObjectExpression(property.value)) {
      continue;
    }
    if (objectExpressionHasNullDefault(property.value)) {
      props.push(key);
    }
  }
  return props;
}

function setFunctionConditionalDefault(
  node: unknown,
  propName: string,
  value: StaticStyleValue,
): void {
  const returnedObject = readFunctionReturnedObject(node);
  if (!returnedObject) {
    return;
  }
  for (const property of getObjectProperties(returnedObject)) {
    if (readPropertyKey(property) !== propName || !isObjectExpression(property.value)) {
      continue;
    }
    setObjectExpressionDefault(property.value, value);
  }
}

function objectExpressionHasNullDefault(node: AstRecord): boolean {
  return getObjectProperties(node).some((property) => {
    if (readPropertyKey(property) !== "default") {
      return false;
    }
    return isNullLiteral(property.value);
  });
}

function setObjectExpressionDefault(node: AstRecord, value: StaticStyleValue): void {
  for (const property of getObjectProperties(node)) {
    if (readPropertyKey(property) === "default") {
      property.value = staticStyleValueToAst(value);
    }
  }
}

function staticStyleValueToAst(value: StaticStyleValue): AstRecord {
  return value === null ? { type: "Literal", value: null } : { type: "Literal", value };
}

function findComponentFunction(ast: unknown, componentNames: readonly string[]): AstRecord | null {
  const names = new Set(componentNames);
  let found: AstRecord | null = null;
  walk(ast, (node) => {
    if (found) {
      return;
    }
    if (node.type === "ExportDefaultDeclaration") {
      const declaration = node.declaration;
      if (isFunctionLike(declaration)) {
        const declarationId = declaration.id;
        if (
          names.has("default") ||
          (isIdentifier(declarationId) && names.has(declarationId.name))
        ) {
          found = declaration;
        }
        return;
      }
      if (isIdentifier(declaration)) {
        names.add(declaration.name);
      }
      return;
    }
    if (node.type === "FunctionDeclaration" && isIdentifier(node.id) && names.has(node.id.name)) {
      found = node;
      return;
    }
    if (node.type !== "VariableDeclarator" || !isIdentifier(node.id) || !names.has(node.id.name)) {
      return;
    }
    if (isFunctionLike(node.init)) {
      found = node.init;
    }
  });
  return found;
}

function collectSxBindings(component: AstRecord): {
  localNames: Set<string>;
  propsNames: Set<string>;
} {
  const localNames = new Set<string>(["sx"]);
  const propsNames = new Set<string>();
  for (const param of getFunctionParams(component)) {
    if (isIdentifier(param)) {
      propsNames.add(param.name);
    } else if (isObjectPattern(param)) {
      collectObjectPatternBinding(param, "sx", localNames);
    }
  }
  walk(component.body, (node) => {
    if (
      node.type !== "VariableDeclarator" ||
      !isObjectPattern(node.id) ||
      !isIdentifier(node.init)
    ) {
      return;
    }
    if (propsNames.has(node.init.name)) {
      collectObjectPatternBinding(node.id, "sx", localNames);
    }
  });
  return { localNames, propsNames };
}

function collectObjectPatternBinding(pattern: AstRecord, propName: string, out: Set<string>): void {
  const properties = Array.isArray(pattern.properties) ? pattern.properties : [];
  for (const property of properties) {
    if (!isRecord(property) || property.type !== "Property") {
      continue;
    }
    if (readPropertyKey(property) !== propName) {
      continue;
    }
    const value = unwrapAssignmentPattern(property.value);
    if (isIdentifier(value)) {
      out.add(value.name);
    }
  }
}

function collectSxCompositionObservations(
  component: AstRecord,
  sxBindings: { localNames: Set<string>; propsNames: Set<string> },
  styleMaps: StyleMaps,
  prop: string,
): PropertyInference[] {
  const observations: PropertyInference[] = [];
  walk(component.body, (node) => {
    if (node.type === "CallExpression" && isStylexPropsCall(node)) {
      const beforeSx = argsBeforeSx(getCallArguments(node), sxBindings);
      if (beforeSx) {
        observations.push(analyzeStyleSequence(beforeSx, styleMaps, prop));
      }
      return;
    }
    if (node.type === "CallExpression" && isMergedSxCall(node)) {
      const firstArg = getCallArguments(node)[0];
      const elements = isArrayExpression(firstArg) ? getArrayElements(firstArg) : [];
      const beforeSx = argsBeforeSx(elements, sxBindings);
      if (beforeSx) {
        observations.push(analyzeStyleSequence(beforeSx, styleMaps, prop));
      }
      return;
    }
    if (node.type === "JSXAttribute" && getJsxAttributeName(node) === "sx") {
      const expression = readJsxExpression(node.value);
      const elements = isArrayExpression(expression) ? getArrayElements(expression) : [expression];
      const beforeSx = argsBeforeSx(elements, sxBindings);
      if (beforeSx) {
        observations.push(analyzeStyleSequence(beforeSx, styleMaps, prop));
      }
    }
  });
  return observations;
}

function argsBeforeSx(
  args: readonly unknown[],
  sxBindings: { localNames: Set<string>; propsNames: Set<string> },
): unknown[] | null {
  const index = args.findIndex((arg) => isSxExpression(arg, sxBindings));
  return index === -1 ? null : args.slice(0, index);
}

function analyzeStyleSequence(
  styleArgs: readonly unknown[],
  styleMaps: StyleMaps,
  prop: string,
): PropertyInference {
  let current: PropertyInference = { kind: "absent" };
  for (const arg of styleArgs) {
    const next = analyzeStyleArg(arg, styleMaps, prop);
    if (next.kind === "absent") {
      continue;
    }
    if (next.kind === "unknown" || next.kind === "variable") {
      return next;
    }
    current = next;
  }
  return current;
}

function analyzeStyleArg(arg: unknown, styleMaps: StyleMaps, prop: string): PropertyInference {
  const node = unwrapExpression(arg);
  if (!isRecord(node)) {
    return { kind: "absent" };
  }
  if (isNullishOrBooleanFalse(node)) {
    return { kind: "absent" };
  }
  const styleRef = readStyleReference(node);
  if (styleRef) {
    return analyzeStyleReference(styleRef, styleMaps, prop, false);
  }
  if (node.type === "LogicalExpression" && node.operator === "&&") {
    const right = analyzeStyleArg(node.right, styleMaps, prop);
    return right.kind === "absent" ? right : { kind: "variable" };
  }
  if (node.type === "ConditionalExpression") {
    const consequent = analyzeStyleArg(node.consequent, styleMaps, prop);
    const alternate = analyzeStyleArg(node.alternate, styleMaps, prop);
    return consequent.kind === "absent" && alternate.kind === "absent"
      ? { kind: "absent" }
      : { kind: "variable" };
  }
  if (isArrayExpression(node)) {
    return analyzeStyleSequence(getArrayElements(node), styleMaps, prop);
  }
  if ((node as AstRecord).type === "CallExpression") {
    const callNode = node as AstRecord;
    const calleeRef = readStyleReference(callNode.callee);
    if (calleeRef) {
      return analyzeStyleReference(calleeRef, styleMaps, prop, true);
    }
    if (isStylexDefaultMarkerCall(callNode)) {
      return { kind: "absent" };
    }
  }
  return { kind: "unknown" };
}

function analyzeStyleReference(
  ref: { objectName: string; styleKey: string },
  styleMaps: StyleMaps,
  prop: string,
  called: boolean,
): PropertyInference {
  const styleEntry = styleMaps.get(ref.objectName)?.get(ref.styleKey);
  if (!styleEntry) {
    return { kind: "unknown" };
  }
  if (styleEntry.kind === "function") {
    return styleEntry.props.has(prop) ? { kind: "variable" } : { kind: "absent" };
  }
  const value = styleEntry.props.get(prop);
  if (!value) {
    return { kind: "absent" };
  }
  if (called || value.kind === "dynamic") {
    return { kind: "variable" };
  }
  return { kind: "static", value: value.value };
}

function mergePropertyInferences(inferences: readonly PropertyInference[]): PropertyInference {
  let merged: PropertyInference = { kind: "absent" };
  for (const inference of inferences) {
    if (inference.kind === "unknown" || inference.kind === "variable") {
      return inference;
    }
    if (inference.kind === "absent") {
      continue;
    }
    if (merged.kind === "static" && merged.value !== inference.value) {
      return { kind: "variable" };
    }
    merged = inference;
  }
  return merged;
}

function isStylexCreateCall(node: unknown): boolean {
  return isMemberCall(node, "stylex", "create");
}

function isStylexPropsCall(node: unknown): boolean {
  return isMemberCall(node, "stylex", "props");
}

function isStylexDefaultMarkerCall(node: unknown): boolean {
  return isMemberCall(node, "stylex", "defaultMarker");
}

function isMergedSxCall(node: unknown): boolean {
  const callee = isRecord(node) ? node.callee : null;
  return isIdentifier(callee) && callee.name === "mergedSx";
}

function isMemberCall(node: unknown, objectName: string, propertyName: string): boolean {
  if (!isRecord(node) || node.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee;
  return (
    isRecord(callee) &&
    callee.type === "MemberExpression" &&
    isIdentifier(callee.object) &&
    callee.object.name === objectName &&
    isIdentifier(callee.property) &&
    callee.property.name === propertyName
  );
}

function readStyleReference(node: unknown): { objectName: string; styleKey: string } | null {
  const unwrapped = unwrapExpression(node);
  if (
    !isRecord(unwrapped) ||
    unwrapped.type !== "MemberExpression" ||
    unwrapped.computed === true
  ) {
    return null;
  }
  if (!isIdentifier(unwrapped.object) || !isIdentifier(unwrapped.property)) {
    return null;
  }
  return { objectName: unwrapped.object.name, styleKey: unwrapped.property.name };
}

function isSxExpression(
  node: unknown,
  sxBindings: { localNames: Set<string>; propsNames: Set<string> },
): boolean {
  const unwrapped = unwrapExpression(node);
  if (isIdentifier(unwrapped)) {
    return sxBindings.localNames.has(unwrapped.name);
  }
  return (
    isRecord(unwrapped) &&
    unwrapped.type === "MemberExpression" &&
    isIdentifier(unwrapped.object) &&
    sxBindings.propsNames.has(unwrapped.object.name) &&
    isIdentifier(unwrapped.property) &&
    unwrapped.property.name === "sx"
  );
}

function unwrapExpression(node: unknown): unknown {
  let current = node;
  while (
    isRecord(current) &&
    (current.type === "TSAsExpression" ||
      current.type === "TSTypeAssertion" ||
      current.type === "ParenthesizedExpression")
  ) {
    current = current.expression;
  }
  return current;
}

function unwrapAssignmentPattern(node: unknown): unknown {
  return isRecord(node) && node.type === "AssignmentPattern" ? node.left : node;
}

function isNullishOrBooleanFalse(node: AstRecord): boolean {
  return (
    node.type === "NullLiteral" ||
    (node.type === "Identifier" && node.name === "undefined") ||
    (node.type === "BooleanLiteral" && node.value === false) ||
    (node.type === "Literal" && (node.value === null || node.value === false))
  );
}

function isNullLiteral(node: unknown): boolean {
  return (
    isRecord(node) &&
    (node.type === "NullLiteral" || (node.type === "Literal" && node.value === null))
  );
}

function isFunctionLike(node: unknown): node is AstRecord {
  return (
    isRecord(node) &&
    (node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression")
  );
}

function isObjectPattern(node: unknown): node is AstRecord {
  return isRecord(node) && node.type === "ObjectPattern";
}

function isObjectExpression(node: unknown): node is AstRecord {
  return isRecord(node) && node.type === "ObjectExpression";
}

function isArrayExpression(node: unknown): node is AstRecord {
  return isRecord(node) && node.type === "ArrayExpression";
}

function isIdentifier(node: unknown): node is AstRecord & { name: string } {
  return isRecord(node) && node.type === "Identifier" && typeof node.name === "string";
}

function isRecord(value: unknown): value is AstRecord {
  return !!value && typeof value === "object";
}

function getCallArguments(node: AstRecord): unknown[] {
  return Array.isArray(node.arguments) ? node.arguments : [];
}

function getArrayElements(node: AstRecord): unknown[] {
  return Array.isArray(node.elements) ? node.elements.filter((element) => element != null) : [];
}

function getObjectProperties(node: AstRecord): AstRecord[] {
  return Array.isArray(node.properties) ? node.properties.filter(isRecord) : [];
}

function getFunctionParams(node: AstRecord): unknown[] {
  return Array.isArray(node.params) ? node.params : [];
}

function readPropertyKey(property: AstRecord): string | null {
  const key = property.key;
  if (isIdentifier(key)) {
    return key.name;
  }
  if (isRecord(key) && (key.type === "StringLiteral" || key.type === "Literal")) {
    return typeof key.value === "string" ? key.value : null;
  }
  return null;
}

function getJsxAttributeName(node: AstRecord): string | null {
  const name = node.name;
  return isRecord(name) && name.type === "JSXIdentifier" && typeof name.name === "string"
    ? name.name
    : null;
}

function readJsxExpression(value: unknown): unknown {
  return isRecord(value) && value.type === "JSXExpressionContainer" ? value.expression : value;
}

function walk(node: unknown, visit: (node: AstRecord) => void, seen = new WeakSet<object>()): void {
  if (!isRecord(node)) {
    return;
  }
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "comments" || key === "tokens") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, visit, seen);
      }
    } else if (isRecord(value)) {
      walk(value, visit, seen);
    }
  }
}
