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
  propertiesWithUnsafeNullConditionalDefault,
  patchNullConditionalDefaultsForProp,
  patchFlatValueAgainstConditionalMap,
  defaultInferenceFromPropertyShape,
  inferPropertyShapeFromValue,
  type DefaultInference,
  type PropertyShape,
  type StaticStyleValue,
} from "./conditional-style-defaults.js";
import { buildStyleKeySequence } from "./style-composition-plan.js";

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

    for (const entry of buildStyleKeySequence(ctx, decl, { includeLocalBase: false })) {
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
    const result = applyForwardedSxDefault({
      ctx,
      decl,
      prop,
      warningType: FLAT_ERASES_CONDITIONAL_WARNING,
      applyInference: (inferred) => {
        if (inferred.kind === "variableConditionalMap") {
          return "bail";
        }
        return patchFlatValueAgainstConditionalMap(styleObj, prop, toPropertyShape(inferred));
      },
      warningContext: (inferred) => ({
        reason:
          inferred.kind === "variableConditionalMap"
            ? "wrapped component base property can be conditional for this prop before sx is applied"
            : "a forwarded flat sx value would replace wrapped component conditional property states",
        droppedConditionKeys: conditionKeysForWarning(inferred).join(", "),
        todo: `TODO: lift ${prop} into a conditional map on the forwarded sx style, or avoid overriding it with a flat value.`,
      }),
    });
    if (result !== "ok") {
      return "bail";
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
const FLAT_ERASES_CONDITIONAL_WARNING =
  "Flat StyleX value would erase earlier conditional property states" satisfies WarningType;

type AstRecord = Record<string, unknown> & { type?: string };
type StyleEntry =
  | { kind: "object"; props: Map<string, PropValue> }
  | { kind: "function"; props: Set<string> };
type PropValue = Exclude<PropertyShape, { kind: "absent" }>;
type StyleMaps = Map<string, Map<string, StyleEntry>>;
type PropertyInference =
  | PropertyShape
  | { kind: "absent" }
  | { kind: "variable" }
  | { kind: "variableConditionalMap"; conditionKeys: string[] }
  | { kind: "unknown" };
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
type AnalysisContext = {
  styleMaps: StyleMaps;
  arrayStyleHelpers: ArrayStyleHelpers;
  staticBindings: StaticBindings;
  expressionBindings: ExpressionBindings;
};

function wrappedComponentForwardsSx(ctx: TransformContext, componentLocalName: string): boolean {
  return wrappedComponentInterfaceFor(ctx, componentLocalName)?.acceptsSx === true;
}

function inferWrappedComponentSxProperty(
  ctx: TransformContext,
  componentLocalName: string,
  prop: string,
  staticProps: StaticBindings,
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
  const arrayStyleHelpers = collectArrayStyleHelpers(root.ast);
  const component = findComponentFunction(root.ast, source.componentNames);
  if (!component) {
    return { kind: "unknown" };
  }

  const sxBindings = collectSxBindings(component);
  const observations = collectSxCompositionObservations(
    component,
    sxBindings,
    {
      styleMaps,
      arrayStyleHelpers,
      staticBindings: collectComponentStaticBindings(component, staticProps),
      expressionBindings: collectFunctionExpressionBindings(component),
    },
    prop,
  );
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
  const absolutePath = resolveReadableImportSource(ctx, importInfo.source.value);
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

function resolveReadableImportSource(ctx: TransformContext, source: string): string | null {
  if (isRelativeSpecifier(source)) {
    return (
      ctx.options.resolveModule?.(ctx.file.path, source) ??
      pathResolve(dirname(ctx.file.path), source)
    );
  }
  return ctx.options.resolveModule?.(ctx.file.path, source) ?? source;
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
    const value = readAstPropertyShape(property.value);
    if (value.kind !== "absent") {
      props.set(key, value);
    }
  }
  return props;
}

function collectArrayStyleHelpers(ast: unknown): ArrayStyleHelpers {
  const helpers: ArrayStyleHelpers = new Map();
  walk(ast, (node) => {
    if (node.type === "FunctionDeclaration" && isIdentifier(node.id)) {
      const returnedArray = readFunctionReturnedArray(node);
      if (returnedArray) {
        helpers.set(node.id.name, {
          params: getFunctionParams(node),
          returnedArray,
          expressionBindings: collectFunctionExpressionBindings(node),
        });
      }
      return;
    }
    if (
      node.type !== "VariableDeclarator" ||
      !isIdentifier(node.id) ||
      !isFunctionLike(node.init)
    ) {
      return;
    }
    const returnedArray = readFunctionReturnedArray(node.init);
    if (!returnedArray) {
      return;
    }
    helpers.set(node.id.name, {
      params: getFunctionParams(node.init),
      returnedArray,
      expressionBindings: collectFunctionExpressionBindings(node.init),
    });
  });
  return helpers;
}

function readAstPropertyShape(node: unknown): PropertyShape {
  if (isObjectExpression(node) && astObjectExpressionIsConditionalMap(node)) {
    const conditionKeys: string[] = [];
    const staticConditions: Record<string, StaticStyleValue> = {};
    let canCopyConditions = true;
    let defaultValue: DefaultInference = { kind: "dynamic" };
    for (const property of getObjectProperties(node)) {
      const key = readPropertyKey(property);
      if (!key) {
        continue;
      }
      if (key === "default") {
        const staticDefault = readStaticStyleValue(property.value);
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
      const staticValue = readStaticStyleValue(property.value);
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
  for (const arg of styleArgs) {
    const next = analyzeStyleArg(arg, analysisCtx, prop);
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
    return analyzeStyleArg(analysisCtx.expressionBindings.get(node.name), analysisCtx, prop);
  }
  const styleRef = readStyleReference(node, analysisCtx.staticBindings);
  if (styleRef) {
    return analyzeStyleReference(styleRef, analysisCtx.styleMaps, prop, false);
  }
  if (node.type === "LogicalExpression" && node.operator === "&&") {
    const test = evaluateStaticBoolean(
      node.left,
      analysisCtx.staticBindings,
      analysisCtx.expressionBindings,
    );
    if (test === false) {
      return { kind: "absent" };
    }
    const right = analyzeStyleArg(node.right, analysisCtx, prop);
    if (test === true) {
      return right;
    }
    return right.kind === "absent" ? right : { kind: "variable" };
  }
  if (node.type === "ConditionalExpression") {
    const test = evaluateStaticBoolean(
      node.test,
      analysisCtx.staticBindings,
      analysisCtx.expressionBindings,
    );
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
  const styleEntry = styleMaps.get(ref.objectName)?.get(ref.styleKey);
  return styleEntry ? analyzeStyleEntry(styleEntry, prop, called) : { kind: "unknown" };
}

function analyzeComputedStyleMapReference(
  ref: Extract<StyleReference, { kind: "computedMap" }>,
  styleMaps: StyleMaps,
  prop: string,
  called: boolean,
): PropertyInference {
  const entries = styleMaps.get(ref.objectName);
  if (!entries) {
    return { kind: "unknown" };
  }
  const inferences = [...entries.values()].map((entry) => analyzeStyleEntry(entry, prop, called));
  const branches = ref.mayBeAbsent
    ? ([{ kind: "absent" }, ...inferences] satisfies PropertyInference[])
    : inferences;
  const merged = mergePropertyInferences(branches);
  if (merged.kind === "variable") {
    const conditionKeys = uniqueStrings(branches.flatMap(conditionKeysForWarning));
    return conditionKeys.length > 0 ? { kind: "variableConditionalMap", conditionKeys } : merged;
  }
  return merged;
}

function analyzeStyleEntry(
  styleEntry: StyleEntry,
  prop: string,
  called: boolean,
): PropertyInference {
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
  return value;
}

function mergePropertyInferences(inferences: readonly PropertyInference[]): PropertyInference {
  let merged: PropertyInference = { kind: "absent" };
  let sawAbsent = false;
  let sawContributor = false;
  for (const inference of inferences) {
    if (
      inference.kind === "unknown" ||
      inference.kind === "variable" ||
      inference.kind === "variableConditionalMap"
    ) {
      return inference;
    }
    if (inference.kind === "absent") {
      if (sawContributor) {
        return { kind: "variable" };
      }
      sawAbsent = true;
      continue;
    }
    if (sawAbsent) {
      return { kind: "variable" };
    }
    if (!sawContributor) {
      sawContributor = true;
      merged = inference;
      continue;
    }
    if (!propertyInferencesEqual(merged, inference)) {
      return variableInferenceFromBranches([merged, inference]);
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
  const conditionKeys = uniqueStrings(branches.flatMap(conditionKeysForWarning));
  return conditionKeys.length > 0
    ? { kind: "variableConditionalMap", conditionKeys }
    : { kind: "variable" };
}

function conditionKeysForWarning(inferred: PropertyInference): string[] {
  if (inferred.kind === "conditionalMap" || inferred.kind === "variableConditionalMap") {
    return inferred.conditionKeys;
  }
  return [];
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

function propertiesWithFlatValue(styleObj: Record<string, unknown>): string[] {
  const props: string[] = [];
  for (const [prop, value] of Object.entries(styleObj)) {
    if (prop.startsWith("__") || isStyleConditionKey(prop)) {
      continue;
    }
    if (inferPropertyShapeFromValue(value).kind === "flat") {
      props.push(prop);
    }
  }
  return props;
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
): StaticBindings {
  const bindings: StaticBindings = new Map(staticProps);
  for (const param of getFunctionParams(component)) {
    collectObjectPatternStaticBindings(param, staticProps, bindings);
  }
  walkTopLevelComponentBody(component.body, (node) => {
    if (
      node.type !== "VariableDeclarator" ||
      !isObjectPattern(node.id) ||
      (!isIdentifier(node.init) && node.init !== undefined)
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
  const bindings: ExpressionBindings = new Map();
  const body = functionNode.body;
  if (!isRecord(body) || body.type !== "BlockStatement" || !Array.isArray(body.body)) {
    return bindings;
  }
  for (const statement of body.body) {
    if (!isRecord(statement) || statement.type !== "VariableDeclaration") {
      continue;
    }
    for (const declaration of Array.isArray(statement.declarations) ? statement.declarations : []) {
      if (!isRecord(declaration) || !isIdentifier(declaration.id) || declaration.init == null) {
        continue;
      }
      bindings.set(declaration.id.name, declaration.init);
    }
  }
  return bindings;
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
      continue;
    }
    const value = staticValueFromExpression(property.value, callerBindings);
    if (value !== undefined) {
      bindings.set(key, value);
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

function mergeStaticBindings(first: StaticBindings, second: StaticBindings): StaticBindings {
  return new Map([...first, ...second]);
}

function evaluateStaticBoolean(
  expression: unknown,
  staticBindings: StaticBindings,
  expressionBindings: ExpressionBindings,
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
    if (expressionBindings.has(node.name)) {
      return evaluateStaticBoolean(
        expressionBindings.get(node.name),
        staticBindings,
        expressionBindings,
      );
    }
    const value = staticBindings.get(node.name);
    return typeof value === "boolean" ? value : undefined;
  }
  if (node.type === "UnaryExpression" && node.operator === "!") {
    const value = evaluateStaticBoolean(node.argument, staticBindings, expressionBindings);
    return value === undefined ? undefined : !value;
  }
  if (node.type === "LogicalExpression") {
    const left = evaluateStaticBoolean(node.left, staticBindings, expressionBindings);
    const right = evaluateStaticBoolean(node.right, staticBindings, expressionBindings);
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
    const left = staticValueFromExpression(node.left, staticBindings);
    const right = staticValueFromExpression(node.right, staticBindings);
    if (left === undefined || right === undefined) {
      return undefined;
    }
    return node.operator === "===" ? left === right : left !== right;
  }
  return undefined;
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
    ? { kind: "entry", objectName: unwrapped.object.name, styleKey: unwrapped.property.name }
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
  return Array.isArray(node.properties)
    ? node.properties.filter(
        (property): property is AstRecord => isRecord(property) && property.type === "Property",
      )
    : [];
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

function isStyleConditionKey(key: string): boolean {
  return key.startsWith(":") || key.startsWith("@");
}

function isStaticValue(value: unknown): value is StaticStyleValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
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
