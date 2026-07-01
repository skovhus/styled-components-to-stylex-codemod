/**
 * Guards conditional StyleX defaults forwarded through wrapped component `sx`.
 * Core concepts: sx composition, conditional defaults, and static base proofs.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import type { API } from "jscodeshift";
import type { ImportSource } from "../../adapter.js";
import type { WarningType } from "../logger.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { wrappedComponentInterfaceFor } from "./wrapped-component-interface.js";
import { isRelativeSpecifier, toRealPath } from "./path-utils.js";
import {
  propertiesWithUnsafeNullConditionalDefault,
  patchNullConditionalDefaultsForProp,
  patchFlatValueAgainstPriorPropertyShape,
  defaultInferenceFromPropertyShape,
  propertiesWithFlatValue,
  flatStylexValueErasureExample,
  isStyleConditionKey,
  FLAT_ERASES_CONDITIONAL_WARNING,
  type DefaultInference,
  type PropertyShape,
  type StaticStyleValue,
} from "./conditional-style-defaults.js";
import { buildStyleKeySequence } from "./style-composition-plan.js";
import { addPropComments } from "../lower-rules/comments.js";

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

    for (const entry of buildStyleKeySequence(ctx, decl, {
      includeLocalBase: false,
    })) {
      const styleObj = entry.styleObj ?? ctx.resolvedStyleObjects.get(entry.styleKey);
      if (!isRecord(styleObj)) {
        continue;
      }
      if (guardForwardedSxStyleObject(ctx, decl, styleObj) === "bail") {
        return "bail";
      }
      for (const prop of functionPropertiesWithNullConditionalDefault(styleObj)) {
        const result = applyForwardedSxDefault({
          ctx,
          decl,
          prop,
          warningType: FORWARDED_SX_DEFAULT_WARNING,
          applyInference: (inferred) => {
            if (inferred.kind === "flat") {
              setFunctionConditionalDefault(styleObj, prop, inferred.value);
              return "patched";
            }
            return inferred.kind === "absent" ? "safe" : "bail";
          },
          warningContext: (inferred) => ({
            reason:
              inferred.kind === "variable" || inferred.kind === "variableConditionalMap"
                ? "wrapped component base property can vary before sx is applied"
                : "wrapped component base default could not be proven",
            todo: `TODO: set an explicit default for ${prop} or avoid forwarding this conditional override through sx.`,
          }),
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

function guardForwardedSxStyleObject(
  ctx: TransformContext,
  decl: StyledDecl,
  styleObj: Record<string, unknown>,
): "ok" | "bail" {
  for (const prop of propertiesWithFlatValue(styleObj)) {
    const result = applyForwardedFlatSxValue({ ctx, decl, styleObj, prop });
    if (result === "bail") {
      return result;
    }
  }

  for (const prop of propertiesWithUnsafeNullConditionalDefault(styleObj)) {
    const result = applyForwardedSxDefault({
      ctx,
      decl,
      prop,
      warningType: FORWARDED_SX_DEFAULT_WARNING,
      applyInference: (inferred) => {
        if (inferred.kind !== "flat" && inferred.kind !== "absent") {
          return "bail";
        }
        return patchNullConditionalDefaultsForProp(
          styleObj,
          prop,
          defaultInferenceFromPropertyShape(toPropertyShape(inferred)),
        );
      },
      warningContext: (inferred) => ({
        reason:
          inferred.kind === "variable" || inferred.kind === "variableConditionalMap"
            ? "wrapped component base property can vary before sx is applied"
            : "wrapped component base default could not be proven",
        todo: `TODO: set an explicit default for ${prop} or avoid forwarding this conditional override through sx.`,
      }),
    });
    if (result !== "ok") {
      return "bail";
    }
  }
  return "ok";
}

function applyForwardedFlatSxValue(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  styleObj: Record<string, unknown>;
  prop: string;
}): "ok" | "bail" {
  const { ctx, decl, styleObj, prop } = args;
  const wrappedComponent = decl.base.kind === "component" ? decl.base.ident : "";
  const inferred = inferWrappedComponentSxProperty(
    ctx,
    wrappedComponent,
    prop,
    staticPropsForDecl(decl),
  );
  const applied = patchFlatValueAgainstPropertyInference(styleObj, prop, inferred);
  if (applied === "patched" || applied === "safe") {
    return "ok";
  }
  if (shouldAnnotateUnprovenForwardedFlatValue(inferred)) {
    addFlatSxOverrideTodo(styleObj, prop, wrappedComponent);
    return "ok";
  }
  ctx.warnings.push({
    severity: "warning",
    type: FLAT_ERASES_CONDITIONAL_WARNING,
    loc: decl.loc,
    context: {
      localName: decl.localName,
      wrappedComponent,
      property: prop,
      reason:
        inferred.kind === "variableConditionalMap"
          ? "wrapped component base property can be conditional for this prop before sx is applied"
          : "a forwarded flat sx value would replace wrapped component conditional property states",
      droppedConditionKeys: conditionKeysForWarning(inferred).join(", "),
      example: flatStylexValueErasureExample(prop),
      todo: `TODO: lift ${prop} into a conditional map on the forwarded sx style, or avoid overriding it with a flat value.`,
    },
  });
  return "bail";
}

function shouldAnnotateUnprovenForwardedFlatValue(inferred: PropertyInference): boolean {
  return inferred.kind === "unknown" || inferred.kind === "dynamic";
}

function addFlatSxOverrideTodo(
  styleObj: Record<string, unknown>,
  prop: string,
  wrappedComponent: string,
): void {
  const todo = `TODO: Verify this flat ${prop} override is safe; add explicit conditional defaults if ${wrappedComponent}'s root sx sets ${prop} states before caller sx.`;
  const leadingLine = existingLeadingLineComment(styleObj, prop);
  addPropComments(styleObj, prop, {
    leadingLine: leadingLine ? `${leadingLine}\n${todo}` : todo,
  });
}

function existingLeadingLineComment(
  styleObj: Record<string, unknown>,
  prop: string,
): string | null {
  const comments = styleObj.__propComments;
  if (!isRecord(comments)) {
    return null;
  }
  const propComments = comments[prop];
  if (!isRecord(propComments)) {
    return null;
  }
  return typeof propComments.leadingLine === "string" ? propComments.leadingLine : null;
}

function applyForwardedSxDefault(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  prop: string;
  warningType: WarningType;
  applyInference: (value: PropertyInference) => "patched" | "safe" | "bail";
  warningContext: (value: PropertyInference) => Record<string, unknown>;
}): "ok" | "bail" {
  const { ctx, decl, prop, warningType, applyInference, warningContext } = args;
  const wrappedComponent = decl.base.kind === "component" ? decl.base.ident : "";
  const inferred = inferWrappedComponentSxProperty(
    ctx,
    wrappedComponent,
    prop,
    staticPropsForDecl(decl),
  );
  const applied = applyInference(inferred);
  if (applied === "patched" || applied === "safe") {
    return "ok";
  }
  ctx.warnings.push({
    severity: "warning",
    type: warningType,
    loc: decl.loc,
    context: {
      localName: decl.localName,
      wrappedComponent,
      property: prop,
      ...warningContext(inferred),
    },
  });
  return "bail";
}

const FORWARDED_SX_DEFAULT_WARNING =
  "Forwarded sx conditional default would override an unproven wrapped component base style" satisfies WarningType;

type AstRecord = Record<string, unknown> & { type?: string };
type StyleEntry =
  | { kind: "object"; props: Map<string, PropValue>; complete: boolean }
  | { kind: "function"; props: Map<string, PropValue>; complete: boolean };
type PropValue = Exclude<PropertyShape, { kind: "absent" }>;
type StyleMap = {
  entries: Map<string, StyleEntry>;
  complete: boolean;
};
type StyleMaps = Map<string, StyleMap>;
type PropertyInference =
  | PropertyShape
  | { kind: "absent" }
  | { kind: "variable" }
  | { kind: "variableConditionalMap"; conditionKeys: string[] }
  | { kind: "unknown" }
  | { kind: "unavailable" };
type StyleReference =
  | { kind: "entry"; objectName: string; styleKey: string }
  | { kind: "computedMap"; objectName: string; mayBeAbsent: boolean };
type StaticBindings = Map<string, StaticStyleValue>;
type ExpressionBindings = Map<string, unknown>;
type ArrayStyleHelper = {
  params: unknown[];
  returnedArray: AstRecord;
  expressionBindings: ExpressionBindings;
};
type ArrayStyleHelpers = Map<string, ArrayStyleHelper>;
type SxBindings = { localNames: Set<string>; propsNames: Set<string> };
type AnalysisContext = {
  styleMaps: StyleMaps;
  arrayStyleHelpers: ArrayStyleHelpers;
  staticBindings: StaticBindings;
  expressionBindings: ExpressionBindings;
  // Names currently being resolved through expression bindings on this analysis
  // path; guards against cyclic const bindings in scanned source.
  resolvingNames: ReadonlySet<string>;
};
type ComponentSxAnalysis = {
  component: AstRecord;
  sxBindings: SxBindings;
  styleMaps: StyleMaps;
  arrayStyleHelpers: ArrayStyleHelpers;
  componentExpressionBindings: ExpressionBindings;
};

// The parsed wrapped-component analysis is property-independent, but the guards
// query it once per style property; cache it per transform run so a base file is
// parsed once instead of once per property.
const componentSxAnalysisCache = new WeakMap<
  TransformContext,
  Map<string, ComponentSxAnalysis | null>
>();

function wrappedComponentForwardsSx(ctx: TransformContext, componentLocalName: string): boolean {
  return wrappedComponentInterfaceFor(ctx, componentLocalName)?.acceptsSx === true;
}

function inferWrappedComponentSxProperty(
  ctx: TransformContext,
  componentLocalName: string,
  prop: string,
  staticProps: StaticBindings,
): PropertyInference {
  const analysis = componentSxAnalysisFor(ctx, componentLocalName);
  if (!analysis) {
    return { kind: "unavailable" };
  }
  const observations = collectSxCompositionObservations(
    analysis.component,
    analysis.sxBindings,
    {
      styleMaps: analysis.styleMaps,
      arrayStyleHelpers: analysis.arrayStyleHelpers,
      staticBindings: collectComponentStaticBindings(
        analysis.component,
        staticProps,
        analysis.sxBindings.propsNames,
      ),
      expressionBindings: analysis.componentExpressionBindings,
      resolvingNames: new Set(),
    },
    prop,
  );
  if (observations.length === 0) {
    return { kind: "unavailable" };
  }
  return mergePropertyInferences(observations);
}

function componentSxAnalysisFor(
  ctx: TransformContext,
  componentLocalName: string,
): ComponentSxAnalysis | null {
  let cache = componentSxAnalysisCache.get(ctx);
  if (!cache) {
    cache = new Map();
    componentSxAnalysisCache.set(ctx, cache);
  }
  const cached = cache.get(componentLocalName);
  if (cached !== undefined) {
    return cached;
  }
  const analysis = buildComponentSxAnalysis(ctx, componentLocalName);
  cache.set(componentLocalName, analysis);
  return analysis;
}

function buildComponentSxAnalysis(
  ctx: TransformContext,
  componentLocalName: string,
): ComponentSxAnalysis | null {
  const source = readComponentSource(ctx, componentLocalName);
  if (!source) {
    return null;
  }
  const root = parseSource(ctx.api.jscodeshift, source.source);
  if (!root) {
    return null;
  }
  const component = findComponentFunction(root.ast, source.componentNames);
  if (!component) {
    return null;
  }
  const moduleBindings = collectModuleConstBindings(root.ast);
  return {
    component,
    sxBindings: collectSxBindings(component),
    styleMaps: collectStylexCreateMaps(root.ast, moduleBindings),
    arrayStyleHelpers: collectArrayStyleHelpers(root.ast),
    componentExpressionBindings: collectFunctionExpressionBindings(component),
  };
}

function readComponentSource(
  ctx: TransformContext,
  componentLocalName: string,
): { source: string; componentNames: string[] } | null {
  const importInfo = ctx.importMap?.get(componentLocalName);
  if (!importInfo) {
    return { source: ctx.file.source, componentNames: [componentLocalName] };
  }
  const absolutePath = resolveReadableImportSource(ctx, importInfo.source);
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

function resolveReadableImportSource(ctx: TransformContext, source: ImportSource): string | null {
  if (isRelativeSpecifier(source.value)) {
    return (
      ctx.options.resolveModule?.(ctx.file.path, source.value) ??
      pathResolve(dirname(ctx.file.path), source.value)
    );
  }
  const resolved = ctx.options.resolveModule?.(ctx.file.path, source.value);
  if (resolved) {
    return resolved;
  }
  return source.kind === "absolutePath" ? source.value : null;
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

function collectModuleConstBindings(ast: unknown): ExpressionBindings {
  return collectConstBindingsFromStatements(moduleStatements(ast));
}

function moduleStatements(ast: unknown): readonly unknown[] {
  const program = isRecord(ast) && isRecord(ast.program) ? ast.program : ast;
  return isRecord(program) && Array.isArray(program.body) ? program.body : [];
}

function collectConstBindingsFromStatements(statements: readonly unknown[]): ExpressionBindings {
  const bindings: ExpressionBindings = new Map();
  for (const statement of statements) {
    const declaration =
      isRecord(statement) && statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (
      !isRecord(declaration) ||
      declaration.type !== "VariableDeclaration" ||
      declaration.kind !== "const"
    ) {
      continue;
    }
    for (const declarator of Array.isArray(declaration.declarations)
      ? declaration.declarations
      : []) {
      if (isRecord(declarator) && isIdentifier(declarator.id) && declarator.init != null) {
        bindings.set(declarator.id.name, declarator.init);
      }
    }
  }
  return bindings;
}

type ConstResolution = { kind: "resolved"; node: unknown } | { kind: "unresolved"; name: string };

function resolveConstReference(node: unknown, bindings: ExpressionBindings): ConstResolution {
  let current = unwrapExpression(node);
  const resolvingNames = new Set<string>();
  while (isIdentifier(current) && current.name !== "undefined") {
    if (resolvingNames.has(current.name) || !bindings.has(current.name)) {
      return { kind: "unresolved", name: current.name };
    }
    resolvingNames.add(current.name);
    current = unwrapExpression(bindings.get(current.name));
  }
  return { kind: "resolved", node: current };
}

function collectStylexCreateMaps(ast: unknown, moduleBindings: ExpressionBindings): StyleMaps {
  const maps: StyleMaps = new Map();
  for (const statement of moduleStatements(ast)) {
    const declaration =
      isRecord(statement) && statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (
      !isRecord(declaration) ||
      declaration.type !== "VariableDeclaration" ||
      declaration.kind !== "const"
    ) {
      continue;
    }
    for (const node of Array.isArray(declaration.declarations) ? declaration.declarations : []) {
      if (!isRecord(node) || node.type !== "VariableDeclarator") {
        continue;
      }
      const id = node.id;
      const init = node.init;
      if (!isIdentifier(id) || !isRecord(init) || !isStylexCreateCall(init)) {
        continue;
      }
      const stylesArg = getCallArguments(init)[0];
      if (!isObjectExpression(stylesArg)) {
        continue;
      }
      maps.set(id.name, readStyleEntries(stylesArg, moduleBindings));
    }
  }
  return maps;
}

function readStyleEntries(
  stylexCreateArg: AstRecord,
  moduleBindings: ExpressionBindings,
): StyleMap {
  const entries = new Map<string, StyleEntry>();
  let complete = true;
  for (const property of getObjectProperties(stylexCreateArg)) {
    const key = readPropertyKey(property);
    if (!key || !property.value) {
      complete = false;
      continue;
    }
    const resolution = resolveConstReference(property.value, moduleBindings);
    if (resolution.kind === "unresolved") {
      complete = false;
      continue;
    }
    const value = resolution.node;
    if (isObjectExpression(value)) {
      entries.set(key, {
        kind: "object",
        ...readStyleObjectProps(value, moduleBindings),
      });
      continue;
    }
    const returnedObject = readFunctionReturnedObject(value);
    if (returnedObject) {
      entries.set(key, {
        kind: "function",
        // Dynamic style function params compile to CSS variables, so they can
        // only carry primitive values — treat them as dynamic, not unproven.
        ...readStyleObjectProps(returnedObject, moduleBindings, functionBoundNames(value)),
      });
      continue;
    }
    complete = false;
  }
  return { entries, complete };
}

function readStyleObjectProps(
  styleObject: AstRecord,
  moduleBindings: ExpressionBindings,
  dynamicValueNames: ReadonlySet<string> = new Set(),
): {
  props: Map<string, PropValue>;
  complete: boolean;
} {
  const props = new Map<string, PropValue>();
  let complete = true;
  for (const property of getObjectProperties(styleObject)) {
    const key = readPropertyKey(property);
    if (!key || !property.value) {
      complete = false;
      continue;
    }
    const resolution = resolveConstReference(property.value, moduleBindings);
    if (resolution.kind === "unresolved") {
      if (dynamicValueNames.has(resolution.name)) {
        props.set(key, { kind: "dynamic" });
      } else {
        complete = false;
      }
      continue;
    }
    const valueNode = resolution.node;
    if (isObjectExpression(valueNode) && objectExpressionHasUnreadProperties(valueNode)) {
      complete = false;
    }
    const value = readAstPropertyShape(valueNode, moduleBindings);
    if (value.kind !== "absent") {
      props.set(key, value);
    }
  }
  return { props, complete };
}

function functionBoundNames(functionNode: unknown): Set<string> {
  const names = new Set<string>();
  if (!isRecord(functionNode)) {
    return names;
  }
  for (const param of getFunctionParams(functionNode)) {
    collectPatternBoundNames(param, names);
  }
  return names;
}

function collectPatternBoundNames(node: unknown, out: Set<string>): void {
  const unwrapped = unwrapAssignmentPattern(node);
  if (isIdentifier(unwrapped)) {
    out.add(unwrapped.name);
    return;
  }
  if (!isRecord(unwrapped)) {
    return;
  }
  if (unwrapped.type === "RestElement") {
    collectPatternBoundNames(unwrapped.argument, out);
    return;
  }
  if (unwrapped.type === "ObjectPattern") {
    for (const property of Array.isArray(unwrapped.properties) ? unwrapped.properties : []) {
      if (isObjectProperty(property)) {
        collectPatternBoundNames(property.value, out);
      } else if (isRecord(property) && property.type === "RestElement") {
        collectPatternBoundNames(property.argument, out);
      }
    }
    return;
  }
  if (unwrapped.type === "ArrayPattern" && Array.isArray(unwrapped.elements)) {
    for (const element of unwrapped.elements) {
      collectPatternBoundNames(element, out);
    }
  }
}

function collectArrayStyleHelpers(ast: unknown): ArrayStyleHelpers {
  const helpers: ArrayStyleHelpers = new Map();
  for (const statement of moduleStatements(ast)) {
    const declaration =
      isRecord(statement) && statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (isRecord(declaration) && declaration.type === "FunctionDeclaration") {
      const node = declaration;
      if (isIdentifier(node.id)) {
        addArrayStyleHelper(helpers, node.id.name, node);
      }
      continue;
    }
    if (
      !isRecord(declaration) ||
      declaration.type !== "VariableDeclaration" ||
      declaration.kind !== "const"
    ) {
      continue;
    }
    for (const node of Array.isArray(declaration.declarations) ? declaration.declarations : []) {
      if (
        !isRecord(node) ||
        node.type !== "VariableDeclarator" ||
        !isIdentifier(node.id) ||
        !isFunctionLike(node.init)
      ) {
        continue;
      }
      addArrayStyleHelper(helpers, node.id.name, node.init);
    }
  }
  return helpers;
}

function addArrayStyleHelper(
  helpers: ArrayStyleHelpers,
  helperName: string,
  functionNode: AstRecord,
): void {
  const returnedArray = readFunctionReturnedArray(functionNode);
  if (!returnedArray) {
    return;
  }
  helpers.set(helperName, {
    params: getFunctionParams(functionNode),
    returnedArray,
    expressionBindings: collectFunctionExpressionBindings(functionNode),
  });
}

function readAstPropertyShape(node: unknown, moduleBindings: ExpressionBindings): PropertyShape {
  if (isObjectExpression(node) && astObjectExpressionIsConditionalMap(node)) {
    const conditionKeys: string[] = [];
    const staticConditions: Record<string, StaticStyleValue> = {};
    let canCopyConditions = true;
    let defaultValue: DefaultInference = { kind: "dynamic" };
    for (const property of getObjectProperties(node)) {
      const key = readPropertyKey(property);
      if (!key) {
        return { kind: "dynamic" };
      }
      if (key === "default") {
        const staticDefault = readStaticStyleValue(
          resolvedValueNode(property.value, moduleBindings),
        );
        defaultValue = staticDefault.found
          ? staticDefault.value === null
            ? { kind: "absent" }
            : { kind: "static", value: staticDefault.value }
          : { kind: "dynamic" };
        continue;
      }
      if (!isStyleConditionKey(key)) {
        continue;
      }
      conditionKeys.push(key);
      const staticValue = readDirectStaticStyleValue(
        resolvedValueNode(property.value, moduleBindings),
      );
      if (staticValue.found) {
        staticConditions[key] = staticValue.value;
      } else {
        canCopyConditions = false;
      }
    }
    return {
      kind: "conditionalMap",
      defaultValue,
      conditionKeys,
      ...(canCopyConditions ? { staticConditions } : {}),
    };
  }
  const value = readStaticStyleValue(node);
  return value.found
    ? value.value === null
      ? { kind: "absent" }
      : { kind: "flat", value: value.value }
    : { kind: "dynamic" };
}

function resolvedValueNode(node: unknown, moduleBindings: ExpressionBindings): unknown {
  const resolution = resolveConstReference(node, moduleBindings);
  return resolution.kind === "resolved" ? resolution.node : node;
}

function objectExpressionHasUnreadProperties(node: AstRecord): boolean {
  return getObjectProperties(node).some((property) => {
    if (!readPropertyKey(property) || !property.value) {
      return true;
    }
    return (
      isObjectExpression(property.value) && objectExpressionHasUnreadProperties(property.value)
    );
  });
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

function readDirectStaticStyleValue(
  node: unknown,
): { found: true; value: StaticStyleValue } | { found: false } {
  if (!isRecord(node) || isObjectExpression(node)) {
    return { found: false };
  }
  return readStaticStyleValue(node);
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

function readFunctionReturnedArray(node: unknown): AstRecord | null {
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
  if (isArrayExpression(body)) {
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
      isArrayExpression(statement.argument)
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

function astObjectExpressionIsConditionalMap(node: AstRecord): boolean {
  return getObjectProperties(node).some((property) => {
    const key = readPropertyKey(property);
    return key === "default" || (key != null && isStyleConditionKey(key));
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
  const names = new Set([...componentNames, ...defaultExportedIdentifierNames(ast)]);
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

function defaultExportedIdentifierNames(ast: unknown): string[] {
  const names: string[] = [];
  walk(ast, (node) => {
    if (node.type !== "ExportDefaultDeclaration") {
      return;
    }
    const declaration = node.declaration;
    if (isIdentifier(declaration)) {
      names.push(declaration.name);
    }
  });
  return names;
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
    if (!isObjectProperty(property)) {
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
  analysisCtx: AnalysisContext,
  prop: string,
): PropertyInference[] {
  const observations: PropertyInference[] = [];
  walkTopLevelComponentBody(component.body, (node) => {
    if (node.type === "CallExpression" && isStylexPropsCall(node)) {
      const beforeSx = argsBeforeSx(getCallArguments(node), sxBindings);
      if (beforeSx) {
        observations.push(analyzeStyleSequence(beforeSx, analysisCtx, prop));
      }
      return;
    }
    if (node.type === "CallExpression" && isMergedSxCall(node)) {
      const firstArg = getCallArguments(node)[0];
      const elements = isArrayExpression(firstArg) ? getArrayElements(firstArg) : [];
      const beforeSx = argsBeforeSx(elements, sxBindings);
      if (beforeSx) {
        observations.push(analyzeStyleSequence(beforeSx, analysisCtx, prop));
      }
      return;
    }
    if (node.type === "JSXAttribute" && getJsxAttributeName(node) === "sx") {
      const expression = readJsxExpression(node.value);
      const elements = isArrayExpression(expression) ? getArrayElements(expression) : [expression];
      const beforeSx = argsBeforeSx(elements, sxBindings);
      if (beforeSx) {
        observations.push(analyzeStyleSequence(beforeSx, analysisCtx, prop));
      }
    }
  });
  return observations;
}

function walkTopLevelComponentBody(node: unknown, visit: (node: AstRecord) => void): void {
  walk(node, (current) => {
    if (current !== node && isFunctionLike(current)) {
      return "skip";
    }
    visit(current);
    return undefined;
  });
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
  analysisCtx: AnalysisContext,
  prop: string,
): PropertyInference {
  let current: PropertyInference = { kind: "absent" };
  let unproven: PropertyInference | null = null;
  for (const arg of styleArgs) {
    const next = analyzeStyleArg(arg, analysisCtx, prop);
    if (next.kind === "absent") {
      continue;
    }
    if (next.kind === "unknown" || next.kind === "unavailable") {
      unproven ??= next;
      continue;
    }
    current = next;
  }
  return mergeWithUnprovenInference(current, unproven);
}

function mergeWithUnprovenInference(
  inference: PropertyInference,
  unproven: PropertyInference | null,
): PropertyInference {
  return unproven ? mergePropertyInferences([unproven, inference]) : inference;
}

function analyzeStyleArg(
  arg: unknown,
  analysisCtx: AnalysisContext,
  prop: string,
): PropertyInference {
  const node = unwrapExpression(arg);
  if (!isRecord(node)) {
    return { kind: "absent" };
  }
  if (node.type === "SpreadElement") {
    return analyzeStyleArg(node.argument, analysisCtx, prop);
  }
  if (isNullishOrBooleanFalse(node)) {
    return { kind: "absent" };
  }
  if (isIdentifier(node) && analysisCtx.expressionBindings.has(node.name)) {
    if (analysisCtx.resolvingNames.has(node.name)) {
      return { kind: "unknown" };
    }
    return analyzeStyleArg(
      analysisCtx.expressionBindings.get(node.name),
      withResolvingName(analysisCtx, node.name),
      prop,
    );
  }
  const styleRef = readStyleReference(node, analysisCtx.staticBindings);
  if (styleRef) {
    return analyzeStyleReference(styleRef, analysisCtx.styleMaps, prop, false);
  }
  if (node.type === "LogicalExpression" && node.operator === "&&") {
    const test = evaluateStaticBoolean(node.left, analysisCtx);
    if (test === false) {
      return { kind: "absent" };
    }
    const right = analyzeStyleArg(node.right, analysisCtx, prop);
    if (test === true) {
      return right;
    }
    return right.kind === "absent"
      ? right
      : variableInferenceFromBranches([{ kind: "absent" }, right]);
  }
  if (node.type === "ConditionalExpression") {
    const test = evaluateStaticBoolean(node.test, analysisCtx);
    if (test === true) {
      return analyzeStyleArg(node.consequent, analysisCtx, prop);
    }
    if (test === false) {
      return analyzeStyleArg(node.alternate, analysisCtx, prop);
    }
    const consequent = analyzeStyleArg(node.consequent, analysisCtx, prop);
    const alternate = analyzeStyleArg(node.alternate, analysisCtx, prop);
    return consequent.kind === "absent" && alternate.kind === "absent"
      ? { kind: "absent" }
      : variableInferenceFromBranches([consequent, alternate]);
  }
  if (isArrayExpression(node)) {
    return analyzeStyleSequence(getArrayElements(node), analysisCtx, prop);
  }
  if ((node as AstRecord).type === "CallExpression") {
    const callNode = node as AstRecord;
    const calleeRef = readStyleReference(callNode.callee, analysisCtx.staticBindings);
    if (calleeRef) {
      return analyzeStyleReference(calleeRef, analysisCtx.styleMaps, prop, true);
    }
    if (isStylexDefaultMarkerCall(callNode)) {
      return { kind: "absent" };
    }
    const helperResult = analyzeArrayStyleHelperCall(callNode, analysisCtx, prop);
    if (helperResult) {
      return helperResult;
    }
  }
  return { kind: "unknown" };
}

function analyzeStyleReference(
  ref: StyleReference,
  styleMaps: StyleMaps,
  prop: string,
  called: boolean,
): PropertyInference {
  if (ref.kind === "computedMap") {
    return analyzeComputedStyleMapReference(ref, styleMaps, prop, called);
  }
  const styleMap = styleMaps.get(ref.objectName);
  if (!styleMap) {
    return { kind: "unknown" };
  }
  const styleEntry = styleMap.entries.get(ref.styleKey);
  if (styleEntry) {
    return analyzeStyleEntry(styleEntry, prop, called);
  }
  return styleMap.complete
    ? { kind: "unknown" }
    : { kind: "variableConditionalMap", conditionKeys: [] };
}

function analyzeComputedStyleMapReference(
  ref: Extract<StyleReference, { kind: "computedMap" }>,
  styleMaps: StyleMaps,
  prop: string,
  called: boolean,
): PropertyInference {
  const styleMap = styleMaps.get(ref.objectName);
  if (!styleMap?.complete) {
    return { kind: "variableConditionalMap", conditionKeys: [] };
  }
  const inferences = [...styleMap.entries.values()].map((entry) =>
    analyzeStyleEntry(entry, prop, called),
  );
  const branches = ref.mayBeAbsent
    ? ([{ kind: "absent" }, ...inferences] satisfies PropertyInference[])
    : inferences;
  return mergePropertyInferences(branches);
}

function analyzeStyleEntry(
  styleEntry: StyleEntry,
  prop: string,
  called: boolean,
): PropertyInference {
  if (!styleEntry.complete) {
    return { kind: "variableConditionalMap", conditionKeys: [] };
  }
  const value = styleEntry.props.get(prop);
  if (!value) {
    return { kind: "absent" };
  }
  if (styleEntry.kind === "function" || called || value.kind === "dynamic") {
    // The runtime value varies, but a conditional-map shape still means the
    // earlier style can carry condition states a later flat value would erase.
    return value.kind === "conditionalMap"
      ? { kind: "variableConditionalMap", conditionKeys: value.conditionKeys }
      : { kind: "variable" };
  }
  return value;
}

function mergePropertyInferences(inferences: readonly PropertyInference[]): PropertyInference {
  const unproven = inferences.find(
    (inference) => inference.kind === "unknown" || inference.kind === "unavailable",
  );
  if (unproven) {
    return variableConditionalInferenceFromBranches(inferences) ?? unproven;
  }
  let merged: PropertyInference = { kind: "absent" };
  let sawAbsent = false;
  let sawContributor = false;
  for (const inference of inferences) {
    if (inference.kind === "variable" || inference.kind === "variableConditionalMap") {
      return variableInferenceFromBranches(inferences);
    }
    if (inference.kind === "absent") {
      if (sawContributor) {
        return variableInferenceFromBranches(inferences);
      }
      sawAbsent = true;
      continue;
    }
    if (sawAbsent) {
      return variableInferenceFromBranches(inferences);
    }
    if (!sawContributor) {
      sawContributor = true;
      merged = inference;
      continue;
    }
    if (!propertyInferencesEqual(merged, inference)) {
      return variableInferenceFromBranches(inferences);
    }
    sawContributor = true;
    merged = inference;
  }
  return merged;
}

function propertyInferencesEqual(left: PropertyInference, right: PropertyInference): boolean {
  if (left.kind === "absent") {
    return right.kind === "absent";
  }
  if (right.kind === "absent") {
    return false;
  }
  if (left.kind === "flat" && right.kind === "flat") {
    return left.value === right.value;
  }
  if (left.kind === "conditionalMap" && right.kind === "conditionalMap") {
    return (
      defaultInferencesEqual(left.defaultValue, right.defaultValue) &&
      left.conditionKeys.length === right.conditionKeys.length &&
      left.conditionKeys.every((key) => right.conditionKeys.includes(key)) &&
      staticConditionsEqual(left.staticConditions, right.staticConditions)
    );
  }
  return left.kind === right.kind && left.kind === "dynamic";
}

function defaultInferencesEqual(left: DefaultInference, right: DefaultInference): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  return left.kind === "static" && right.kind === "static" ? left.value === right.value : true;
}

function staticConditionsEqual(
  left: Record<string, StaticStyleValue> | undefined,
  right: Record<string, StaticStyleValue> | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([key, value]) => right[key] === value)
  );
}

function variableInferenceFromBranches(branches: readonly PropertyInference[]): PropertyInference {
  return variableConditionalInferenceFromBranches(branches) ?? { kind: "variable" };
}

function variableConditionalInferenceFromBranches(
  branches: readonly PropertyInference[],
): Extract<PropertyInference, { kind: "variableConditionalMap" }> | null {
  const mayBeConditional = branches.some(
    (branch) => branch.kind === "conditionalMap" || branch.kind === "variableConditionalMap",
  );
  if (!mayBeConditional) {
    return null;
  }
  return {
    kind: "variableConditionalMap",
    conditionKeys: uniqueStrings(branches.flatMap(conditionKeysForWarning)),
  };
}

function conditionKeysForWarning(inferred: PropertyInference): string[] {
  if (inferred.kind === "conditionalMap" || inferred.kind === "variableConditionalMap") {
    return inferred.conditionKeys;
  }
  return [];
}

function patchFlatValueAgainstPropertyInference(
  styleObj: Record<string, unknown>,
  prop: string,
  inferred: PropertyInference,
): "patched" | "safe" | "bail" {
  // "unavailable" (unreadable base source) and "variable" (flat-only variation,
  // token references, CSS-variable styles) are deliberately safe here, unlike in
  // the null-default guard: a later flat sx value wins over any earlier flat or
  // CSS-variable value in StyleX, and only a conditional map carries states a
  // flat value can erase. Bailing on "unavailable" would flag every wrapper
  // around an external component.
  if (inferred.kind === "unavailable" || inferred.kind === "absent" || inferred.kind === "flat") {
    return "safe";
  }
  if (inferred.kind === "variable") {
    return "safe";
  }
  if (inferred.kind === "conditionalMap") {
    return patchFlatValueAgainstPriorPropertyShape(styleObj, prop, inferred);
  }
  return "bail";
}

function toPropertyShape(inferred: PropertyInference): PropertyShape {
  if (
    inferred.kind === "flat" ||
    inferred.kind === "conditionalMap" ||
    inferred.kind === "absent" ||
    inferred.kind === "dynamic"
  ) {
    return inferred;
  }
  return { kind: "dynamic" };
}

function staticPropsForDecl(decl: StyledDecl): StaticBindings {
  const bindings: StaticBindings = new Map();
  for (const [key, value] of Object.entries(decl.attrsInfo?.staticAttrs ?? {})) {
    if (isStaticValue(value)) {
      bindings.set(key, value);
    }
  }
  return bindings;
}

function collectComponentStaticBindings(
  component: AstRecord,
  staticProps: StaticBindings,
  propsNames: ReadonlySet<string>,
): StaticBindings {
  const bindings: StaticBindings = new Map();
  for (const param of getFunctionParams(component)) {
    collectObjectPatternStaticBindings(param, staticProps, bindings);
  }
  walkTopLevelComponentBody(component.body, (node) => {
    if (
      node.type !== "VariableDeclarator" ||
      !isObjectPattern(node.id) ||
      !isIdentifier(node.init) ||
      !propsNames.has(node.init.name)
    ) {
      return;
    }
    collectObjectPatternStaticBindings(node.id, staticProps, bindings);
  });
  return bindings;
}

function collectObjectPatternStaticBindings(
  pattern: unknown,
  staticProps: StaticBindings,
  bindings: StaticBindings,
): void {
  if (!isObjectPattern(pattern)) {
    return;
  }
  for (const property of getObjectPatternProperties(pattern)) {
    const key = readPropertyKey(property);
    if (!key) {
      continue;
    }
    const local = unwrapAssignmentPattern(property.value);
    if (!isIdentifier(local)) {
      continue;
    }
    const staticProp = staticProps.get(key);
    if (staticProp !== undefined) {
      bindings.set(local.name, staticProp);
    }
  }
}

function collectFunctionExpressionBindings(functionNode: AstRecord): ExpressionBindings {
  const body = functionNode.body;
  if (!isRecord(body) || body.type !== "BlockStatement" || !Array.isArray(body.body)) {
    return new Map();
  }
  return collectConstBindingsFromStatements(body.body);
}

function analyzeArrayStyleHelperCall(
  callNode: AstRecord,
  analysisCtx: AnalysisContext,
  prop: string,
): PropertyInference | null {
  if (!isIdentifier(callNode.callee)) {
    return null;
  }
  const helper = analysisCtx.arrayStyleHelpers.get(callNode.callee.name);
  if (!helper) {
    return null;
  }
  return analyzeStyleSequence(
    getArrayElements(helper.returnedArray),
    {
      ...analysisCtx,
      staticBindings: mergeStaticBindings(
        analysisCtx.staticBindings,
        staticBindingsForHelperCall(helper, getCallArguments(callNode), analysisCtx.staticBindings),
        helperStaticBindingShadowNames(helper),
      ),
      expressionBindings: new Map([
        ...analysisCtx.expressionBindings,
        ...helper.expressionBindings,
      ]),
    },
    prop,
  );
}

function staticBindingsForHelperCall(
  helper: ArrayStyleHelper,
  args: readonly unknown[],
  callerBindings: StaticBindings,
): StaticBindings {
  const bindings: StaticBindings = new Map();
  const firstParam = helper.params[0];
  const firstArg = args[0];
  if (!isObjectPattern(firstParam) || !isObjectExpression(firstArg)) {
    return bindings;
  }
  const argValues = readObjectExpressionStaticBindings(firstArg, callerBindings);
  for (const property of getObjectPatternProperties(firstParam)) {
    const key = readPropertyKey(property);
    if (!key) {
      continue;
    }
    const local = unwrapAssignmentPattern(property.value);
    if (!isIdentifier(local)) {
      continue;
    }
    const value = argValues.get(key);
    if (value !== undefined) {
      bindings.set(local.name, value);
    }
  }
  return bindings;
}

function readObjectExpressionStaticBindings(
  objectExpression: AstRecord,
  callerBindings: StaticBindings,
): StaticBindings {
  const bindings: StaticBindings = new Map();
  for (const property of getObjectProperties(objectExpression)) {
    const key = readPropertyKey(property);
    if (!key || property.value == null) {
      bindings.clear();
      continue;
    }
    const value = staticValueFromExpression(property.value, callerBindings);
    if (value !== undefined) {
      bindings.set(key, value);
    } else {
      bindings.delete(key);
    }
  }
  return bindings;
}

function staticValueFromExpression(
  expression: unknown,
  bindings: StaticBindings,
): StaticStyleValue | undefined {
  const unwrapped = unwrapExpression(expression);
  if (isIdentifier(unwrapped)) {
    return bindings.get(unwrapped.name);
  }
  const staticValue = readStaticStyleValue(unwrapped);
  return staticValue.found ? staticValue.value : undefined;
}

function helperStaticBindingShadowNames(helper: ArrayStyleHelper): Set<string> {
  const names = new Set<string>();
  for (const param of helper.params) {
    collectPatternBoundNames(param, names);
  }
  return names;
}

function mergeStaticBindings(
  first: StaticBindings,
  second: StaticBindings,
  shadowNames: ReadonlySet<string> = new Set(),
): StaticBindings {
  const merged = new Map(first);
  for (const name of shadowNames) {
    merged.delete(name);
  }
  for (const [name, value] of second) {
    merged.set(name, value);
  }
  return merged;
}

function evaluateStaticBoolean(
  expression: unknown,
  analysisCtx: AnalysisContext,
): boolean | undefined {
  const node = unwrapExpression(expression);
  if (!isRecord(node)) {
    return undefined;
  }
  if (
    node.type === "BooleanLiteral" ||
    (node.type === "Literal" && typeof node.value === "boolean")
  ) {
    return Boolean(node.value);
  }
  if (isIdentifier(node)) {
    if (analysisCtx.expressionBindings.has(node.name)) {
      if (analysisCtx.resolvingNames.has(node.name)) {
        return undefined;
      }
      return evaluateStaticBoolean(
        analysisCtx.expressionBindings.get(node.name),
        withResolvingName(analysisCtx, node.name),
      );
    }
    const value = analysisCtx.staticBindings.get(node.name);
    return typeof value === "boolean" ? value : undefined;
  }
  if (node.type === "UnaryExpression" && node.operator === "!") {
    const value = evaluateStaticBoolean(node.argument, analysisCtx);
    return value === undefined ? undefined : !value;
  }
  if (node.type === "LogicalExpression") {
    const left = evaluateStaticBoolean(node.left, analysisCtx);
    const right = evaluateStaticBoolean(node.right, analysisCtx);
    if (node.operator === "&&") {
      return left === false || right === false
        ? false
        : left === true && right === true
          ? true
          : undefined;
    }
    if (node.operator === "||") {
      return left === true || right === true
        ? true
        : left === false && right === false
          ? false
          : undefined;
    }
  }
  if (node.type === "BinaryExpression" && (node.operator === "===" || node.operator === "!==")) {
    const left = staticValueFromExpression(node.left, analysisCtx.staticBindings);
    const right = staticValueFromExpression(node.right, analysisCtx.staticBindings);
    if (left === undefined || right === undefined) {
      return undefined;
    }
    return node.operator === "===" ? left === right : left !== right;
  }
  return undefined;
}

function withResolvingName(analysisCtx: AnalysisContext, name: string): AnalysisContext {
  return {
    ...analysisCtx,
    resolvingNames: new Set([...analysisCtx.resolvingNames, name]),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
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

function readStyleReference(node: unknown, staticBindings: StaticBindings): StyleReference | null {
  const unwrapped = unwrapExpression(node);
  if (!isRecord(unwrapped) || unwrapped.type !== "MemberExpression") {
    return null;
  }
  if (!isIdentifier(unwrapped.object)) {
    return null;
  }
  if (unwrapped.computed === true) {
    const styleKey = readComputedMemberPropertyName(unwrapped.property, staticBindings);
    return styleKey
      ? { kind: "entry", objectName: unwrapped.object.name, styleKey }
      : {
          kind: "computedMap",
          objectName: unwrapped.object.name,
          mayBeAbsent: true,
        };
  }
  return isIdentifier(unwrapped.property)
    ? {
        kind: "entry",
        objectName: unwrapped.object.name,
        styleKey: unwrapped.property.name,
      }
    : null;
}

function readComputedMemberPropertyName(
  property: unknown,
  staticBindings: StaticBindings,
): string | null {
  if (!isRecord(property)) {
    return null;
  }
  if (property.type === "StringLiteral" || property.type === "Literal") {
    return typeof property.value === "string" ? property.value : null;
  }
  if (isIdentifier(property)) {
    const boundValue = staticBindings.get(property.name);
    return typeof boundValue === "string" ? boundValue : null;
  }
  return null;
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

function getObjectPatternProperties(node: AstRecord): AstRecord[] {
  return Array.isArray(node.properties) ? node.properties.filter(isObjectProperty) : [];
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

function isStaticValue(value: unknown): value is StaticStyleValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function isObjectProperty(node: unknown): node is AstRecord {
  return isRecord(node) && (node.type === "Property" || node.type === "ObjectProperty");
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

function walk(
  node: unknown,
  visit: (node: AstRecord) => "skip" | undefined | void,
  seen = new WeakSet<object>(),
): void {
  if (!isRecord(node)) {
    return;
  }
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  if (visit(node) === "skip") {
    return;
  }
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
