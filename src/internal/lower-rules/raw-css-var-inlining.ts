/**
 * Moves raw `var(--x)` CSS-variable usages that StyleX cannot safely keep in a
 * style class into inline styles, registers local StyleX var fallbacks, and
 * drops resolved CSS-variable definitions from style buckets.
 */
import { literalToAst } from "../transform/helpers.js";
import type { StyledDecl } from "../transform-types.js";
import { findCssVarCallsInString } from "../css-vars.js";
import {
  cloneAstNode,
  getFunctionBodyExpr,
  isAstNode,
} from "../utilities/jscodeshift-utils.js";
import type { DeclProcessingState } from "./decl-setup.js";
import type { ExpressionKind } from "./decl-types.js";
import { isStyleConditionKey, mapAst, walkAst } from "./utils.js";
import {
  collectObjectExpressionPropertyNames,
  isStyleObjectForCssVarDrop,
} from "./ast-style-utils.js";

export function moveUnsafeRawCssVarPropsToInlineStyles(args: {
  styleObj: Record<string, unknown>;
  inlineStyleProps: NonNullable<StyledDecl["inlineStyleProps"]>;
  staticInlineStyleProps: NonNullable<StyledDecl["staticInlineStyleProps"]>;
  unsafeProps: ReadonlySet<string>;
  j: Parameters<typeof literalToAst>[0];
}): void {
  const { styleObj, inlineStyleProps, staticInlineStyleProps, unsafeProps, j } = args;
  for (const [prop, value] of Object.entries(styleObj)) {
    if (prop.startsWith("__") || prop.startsWith("--")) {
      continue;
    }
    if (unsafeProps.has(prop)) {
      continue;
    }
    if (typeof value !== "string" || findCssVarCallsInString(value).length === 0) {
      continue;
    }

    delete styleObj[prop];
    const expr = j.stringLiteral(value);
    inlineStyleProps.push({ prop, expr });
    staticInlineStyleProps.push({ prop, expr });
  }
}

export function moveCustomPropertyOnlyBaseToInlineStyles(args: {
  styleObj: Record<string, unknown>;
  inlineStyleProps: NonNullable<StyledDecl["inlineStyleProps"]>;
  staticInlineStyleProps: NonNullable<StyledDecl["staticInlineStyleProps"]>;
  unsafeProps: ReadonlySet<string>;
  hasOpaqueExtraStylexPropsArgs: boolean;
  j: Parameters<typeof literalToAst>[0];
}): void {
  const {
    styleObj,
    inlineStyleProps,
    staticInlineStyleProps,
    unsafeProps,
    hasOpaqueExtraStylexPropsArgs,
    j,
  } = args;
  const entries = Object.entries(styleObj).filter(([prop]) => !prop.startsWith("__"));
  if (
    entries.length === 0 ||
    hasOpaqueExtraStylexPropsArgs ||
    entries.some(([prop]) => !prop.startsWith("--")) ||
    entries.some(([prop]) => unsafeProps.has(prop)) ||
    entries.some(([, value]) => isConditionalCustomPropertyValue(value))
  ) {
    return;
  }

  for (const [prop, value] of entries) {
    delete styleObj[prop];
    const expr = isAstNode(value)
      ? (cloneAstNode(value) as ExpressionKind)
      : (literalToAst(j, value) as ExpressionKind);
    inlineStyleProps.push({ prop, expr });
    staticInlineStyleProps.push({ prop, expr });
  }

  for (const prop of Object.keys(styleObj)) {
    if (prop.startsWith("__")) {
      delete styleObj[prop];
    }
  }
}

export function moveUnsafeRawCssVarStyleFnsToInlineStyles(args: {
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  inlineStyleProps: NonNullable<StyledDecl["inlineStyleProps"]>;
  staticInlineStyleProps: NonNullable<StyledDecl["staticInlineStyleProps"]>;
  baseRawCssVarProps: ReadonlySet<string>;
  rawCss: string | undefined;
  unsafeProps: ReadonlySet<string>;
  j: Parameters<typeof literalToAst>[0];
}): void {
  const {
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    staticInlineStyleProps,
    baseRawCssVarProps,
    rawCss,
    unsafeProps,
    j,
  } = args;
  const fnKeyUseCounts = new Map<string, number>();
  for (const entry of styleFnFromProps) {
    fnKeyUseCounts.set(entry.fnKey, (fnKeyUseCounts.get(entry.fnKey) ?? 0) + 1);
  }
  const staticInlineProps = new Set(staticInlineStyleProps.map((entry) => entry.prop));
  const styleFnPropUseCounts = collectStyleFnPropUseCounts(styleFnDecls);
  const movedEntries: Array<{
    index: number;
    sourceOrder: number;
    inlineStyleProp: NonNullable<StyledDecl["inlineStyleProps"]>[number];
    fnKey: string;
  }> = [];

  for (let i = styleFnFromProps.length - 1; i >= 0; i--) {
    const entry = styleFnFromProps[i];
    if (
      !entry ||
      entry.conditionWhen ||
      entry.extraCallArgs?.length ||
      fnKeyUseCounts.get(entry.fnKey) !== 1
    ) {
      continue;
    }
    const fnAst = styleFnDecls.get(entry.fnKey);
    const extracted = extractSingleRawCssVarStyleFnProperty(fnAst);
    const dynamicDeclarationIsLast =
      extracted && rawCssVarDeclarationOrderHasDynamicLast(rawCss, extracted.prop);
    if (
      !extracted ||
      unsafeProps.has(extracted.prop) ||
      (styleFnPropUseCounts.get(extracted.prop) ?? 0) > 1 ||
      (rawCss !== undefined && !dynamicDeclarationIsLast) ||
      (baseRawCssVarProps.has(extracted.prop) && !dynamicDeclarationIsLast) ||
      (staticInlineProps.has(extracted.prop) && !dynamicDeclarationIsLast) ||
      expressionContainsStyleConditionKey(extracted.value)
    ) {
      continue;
    }

    const expr = rewriteStyleFnValueForWrapperScope({
      j,
      value: extracted.value,
      fnParamName: extracted.paramName,
      entry,
    });
    if (!expr) {
      continue;
    }

    movedEntries.push({
      index: i,
      sourceOrder: entry.sourceOrder ?? i,
      inlineStyleProp: {
        prop: extracted.prop,
        expr,
        ...(entry.jsxProp && entry.jsxProp !== "__props" ? { jsxProp: entry.jsxProp } : {}),
      },
      fnKey: entry.fnKey,
    });
  }

  movedEntries.sort((a, b) => a.sourceOrder - b.sourceOrder);
  for (const moved of movedEntries) {
    inlineStyleProps.push(moved.inlineStyleProp);
  }
  for (const moved of [...movedEntries].sort((a, b) => b.index - a.index)) {
    styleFnDecls.delete(moved.fnKey);
    styleFnFromProps.splice(moved.index, 1);
  }
}

export function collectRawCssVarStyleObjectProps(styleObj: Record<string, unknown>): Set<string> {
  const props = new Set<string>();
  for (const [prop, value] of Object.entries(styleObj)) {
    if (
      !prop.startsWith("__") &&
      !prop.startsWith("--") &&
      typeof value === "string" &&
      findCssVarCallsInString(value).length > 0
    ) {
      props.add(prop);
    }
  }
  return props;
}

export function extractSingleRawCssVarStyleFnProperty(fnAst: unknown): {
  prop: string;
  value: ExpressionKind;
  paramName: string | null;
} | null {
  if (!fnAst || typeof fnAst !== "object" || !isAstNode(fnAst)) {
    return null;
  }
  const fn = fnAst as {
    params?: unknown[];
  };
  if (!Array.isArray(fn.params) || fn.params.length > 1) {
    return null;
  }
  const param = fn.params[0] as { type?: string; name?: string } | undefined;
  const paramName = param?.type === "Identifier" ? (param.name ?? null) : null;
  const body = getFunctionBodyExpr(fnAst as Parameters<typeof getFunctionBodyExpr>[0]);
  if (!body || (body as { type?: string }).type !== "ObjectExpression") {
    return null;
  }
  const properties = (body as { properties?: unknown[] }).properties ?? [];
  if (properties.some((property) => (property as { type?: string }).type === "SpreadElement")) {
    return null;
  }
  if (properties.length !== 1) {
    return null;
  }

  const property = properties[0] as {
    type?: string;
    computed?: boolean;
    key?: { type?: string; name?: string; value?: unknown };
    value?: unknown;
  };
  if (
    property.type !== "Property" &&
    property.type !== "ObjectProperty" &&
    property.type !== "ObjectMethod"
  ) {
    return null;
  }
  if (property.computed || !property.key || !property.value) {
    return null;
  }
  const prop =
    property.key.type === "Identifier"
      ? property.key.name
      : (property.key.type === "StringLiteral" || property.key.type === "Literal") &&
          typeof property.key.value === "string"
        ? property.key.value
        : null;
  if (!prop || !expressionContainsRawCssVar(property.value)) {
    return null;
  }
  return { prop, value: property.value as ExpressionKind, paramName };
}

export function collectStyleOverrideProps(args: {
  afterBaseStyleKeys: readonly string[];
  cssHelperPropValues: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  resolvedStyleObjects: Map<string, unknown>;
  variantBuckets: Map<string, Record<string, unknown>>;
  styleFnDecls: Map<string, unknown>;
}): Set<string> {
  const {
    afterBaseStyleKeys,
    cssHelperPropValues,
    extraStyleObjects,
    resolvedStyleObjects,
    variantBuckets,
    styleFnDecls,
  } = args;
  const props = new Set<string>();
  for (const prop of cssHelperPropValues.keys()) {
    props.add(prop);
  }
  for (const styleKey of afterBaseStyleKeys) {
    const styleObject = resolvedStyleObjects.get(styleKey);
    if (isStyleObjectForCssVarDrop(styleObject)) {
      addBucketProps(styleObject, props);
    }
  }
  for (const bucket of extraStyleObjects.values()) {
    addBucketProps(bucket, props);
  }
  for (const bucket of variantBuckets.values()) {
    addBucketProps(bucket, props);
  }
  for (const fnAst of styleFnDecls.values()) {
    collectObjectExpressionPropertyNames(fnAst, props);
  }
  return props;
}

export function registerLocalStylexVarFallbacks(
  state: DeclProcessingState["state"],
  decl: StyledDecl,
  styleObj: Record<string, unknown>,
): void {
  for (const [prop, value] of Object.entries(styleObj)) {
    if (prop.startsWith("--") || typeof value !== "string") {
      continue;
    }
    for (const call of findCssVarCallsInString(value)) {
      if (!call.fallback || !hasCustomPropertyDefinition(decl, call.name)) {
        continue;
      }
      state.getOrCreateLocalStylexVar(call.name, call.fallback);
    }
  }
}

export function findLocalCustomPropertyFallbackFromRules(
  cssName: string,
  decl: StyledDecl,
): string | null {
  for (const rule of decl.rules) {
    for (const candidate of rule.declarations) {
      if (candidate.property !== cssName || candidate.value.kind !== "static") {
        continue;
      }
      const staticValue = String(candidate.value.value);
      if (staticValue) {
        return staticValue;
      }
    }
  }
  return null;
}

export function dropCssVariableDefinitionsFromBucket(
  bucket: Record<string, unknown>,
  name: string,
): void {
  delete bucket[name];

  const computedKeys = bucket.__computedKeys;
  if (Array.isArray(computedKeys)) {
    const retained = computedKeys.filter((entry) => {
      const cssVariableName = readComputedEntryCssVariableName(entry);
      return cssVariableName !== name;
    });

    if (retained.length === 0) {
      delete bucket.__computedKeys;
    } else if (retained.length !== computedKeys.length) {
      bucket.__computedKeys = retained;
    }
  }

  for (const [key, value] of Object.entries(bucket)) {
    if (key.startsWith("__")) {
      continue;
    }
    if (!isStyleObjectForCssVarDrop(value)) {
      continue;
    }
    dropCssVariableDefinitionsFromBucket(value, name);
  }
}

// --- Non-exported helpers ---

function isConditionalCustomPropertyValue(value: unknown): boolean {
  return !!value && typeof value === "object" && !isAstNode(value);
}

function collectStyleFnPropUseCounts(styleFnDecls: Map<string, unknown>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fnAst of styleFnDecls.values()) {
    const props = new Set<string>();
    collectObjectExpressionPropertyNames(fnAst, props);
    for (const prop of props) {
      counts.set(prop, (counts.get(prop) ?? 0) + 1);
    }
  }
  return counts;
}

function rawCssVarDeclarationOrderHasDynamicLast(
  rawCss: string | undefined,
  stylexProp: string,
): boolean {
  if (!rawCss) {
    return false;
  }
  const cssProp = stylexProp.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
  const declarationPattern = /([-\w]+)\s*:\s*([^;{}]+);/g;
  let last: "dynamic" | "static" | null = null;
  let match: RegExpExecArray | null;
  while ((match = declarationPattern.exec(rawCss))) {
    if (match[1] !== cssProp) {
      continue;
    }
    const value = match[2] ?? "";
    if (value.includes("__SC_EXPR_")) {
      last = "dynamic";
    } else {
      last = "static";
    }
  }
  return last === "dynamic";
}

function expressionContainsRawCssVar(expr: unknown): boolean {
  let found = false;
  walkAst(expr, (node) => {
    if (found) {
      return;
    }
    const n = node as { type?: string; value?: unknown; extra?: { raw?: string } };
    if (
      (n.type === "StringLiteral" || n.type === "Literal") &&
      typeof n.value === "string" &&
      stringContainsRawCssVarRef(n.value)
    ) {
      found = true;
      return;
    }
    if (
      n.type === "TemplateElement" &&
      typeof n.value === "object" &&
      n.value &&
      "raw" in n.value &&
      typeof n.value.raw === "string" &&
      stringContainsRawCssVarRef(n.value.raw)
    ) {
      found = true;
      return;
    }
    if (typeof n.extra?.raw === "string" && stringContainsRawCssVarRef(n.extra.raw)) {
      found = true;
    }
  });
  return found;
}

function expressionContainsStyleConditionKey(expr: unknown): boolean {
  let found = false;
  walkAst(expr, (node) => {
    if (found) {
      return;
    }
    const n = node as { type?: string; properties?: unknown[] };
    if (n.type !== "ObjectExpression" || !Array.isArray(n.properties)) {
      return;
    }
    for (const property of n.properties) {
      const p = property as {
        type?: string;
        computed?: boolean;
        key?: { type?: string; name?: string; value?: unknown };
      };
      if (p.type !== "Property" && p.type !== "ObjectProperty") {
        continue;
      }
      if (p.computed) {
        found = true;
        return;
      }
      const key =
        p.key?.type === "Identifier"
          ? p.key.name
          : (p.key?.type === "StringLiteral" || p.key?.type === "Literal") &&
              typeof p.key.value === "string"
            ? p.key.value
            : null;
      if (key && isStyleConditionKey(key)) {
        found = true;
        return;
      }
    }
  });
  return found;
}

function stringContainsRawCssVarRef(value: string): boolean {
  return findCssVarCallsInString(value).length > 0 || value.includes("var(--");
}

function rewriteStyleFnValueForWrapperScope(args: {
  j: Parameters<typeof literalToAst>[0];
  value: ExpressionKind;
  fnParamName: string | null;
  entry: NonNullable<StyledDecl["styleFnFromProps"]>[number];
}): ExpressionKind | null {
  const { j, value, fnParamName, entry } = args;
  let expr = cloneAstNode(value);
  if (fnParamName) {
    const replacement = styleFnEntryArgumentExpression(j, entry);
    if (!replacement) {
      return null;
    }
    expr = mapAst(expr, (node) => {
      if ((node as { type?: string; name?: string }).type !== "Identifier") {
        return undefined;
      }
      if ((node as { name?: string }).name !== fnParamName) {
        return undefined;
      }
      return cloneAstNode(replacement);
    }) as ExpressionKind;
  }
  if (entry.condition === "truthy") {
    const condition = styleFnEntryArgumentExpression(j, entry);
    if (!condition) {
      return null;
    }
    expr = j.conditionalExpression(
      cloneAstNode(condition) as Parameters<typeof j.conditionalExpression>[0],
      expr,
      j.identifier("undefined"),
    );
  }
  return expr;
}

function styleFnEntryArgumentExpression(
  j: Parameters<typeof literalToAst>[0],
  entry: NonNullable<StyledDecl["styleFnFromProps"]>[number],
): ExpressionKind | null {
  if (entry.callArg) {
    return cloneAstNode(entry.callArg);
  }
  if (entry.jsxProp === "__props") {
    return j.identifier("props");
  }
  if (!entry.jsxProp) {
    return null;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(entry.jsxProp)) {
    return j.memberExpression(j.identifier("props"), j.identifier(entry.jsxProp));
  }
  return j.memberExpression(j.identifier("props"), j.stringLiteral(entry.jsxProp), true);
}

function addBucketProps(bucket: Record<string, unknown>, props: Set<string>): void {
  for (const prop of Object.keys(bucket)) {
    if (!prop.startsWith("__")) {
      props.add(prop);
    }
  }
}

function hasCustomPropertyDefinition(decl: StyledDecl, cssName: string): boolean {
  return decl.rules.some((rule) =>
    rule.declarations.some((candidate) => candidate.property === cssName),
  );
}

function readComputedEntryCssVariableName(entry: unknown): string | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  if (!("originalCssVariableName" in entry)) {
    return null;
  }

  const cssVariableName = entry.originalCssVariableName;
  return typeof cssVariableName === "string" ? cssVariableName : null;
}
