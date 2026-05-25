/**
 * Preserves conditional StyleX defaults when generated style keys compose.
 * Core concepts: style-key order, static default proofs, and conservative bails.
 */
import type { WarningType } from "../logger.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { isAstNode } from "./jscodeshift-utils.js";

const CONDITIONAL_DEFAULT_WARNING =
  "Conditional StyleX default would override an unproven earlier style for the same property" satisfies WarningType;

type DefaultInference =
  | { kind: "static"; value: string | number | boolean | null }
  | { kind: "absent" }
  | { kind: "dynamic" };

type StyleSequenceEntry = {
  styleKey: string;
  patchable: boolean;
  source: "base" | "mixin" | "variant" | "styleFn" | "pseudo" | "attr" | "enum";
};

type OrderedTailEntry = {
  order: number;
  index: number;
  entry: StyleSequenceEntry;
};

export function guardGeneratedConditionalDefaults(
  ctx: TransformContext,
  styledDecls: readonly StyledDecl[],
): "ok" | "bail" {
  if (!ctx.resolvedStyleObjects) {
    return "ok";
  }

  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.isCssHelper) {
      continue;
    }
    const result = patchConditionalDefaultsForSequence({
      ctx,
      decl,
      entries: buildStyleKeySequence(ctx, decl),
    });
    if (result === "bail") {
      return "bail";
    }
  }

  return "ok";
}

export function propertiesWithNullConditionalDefault(styleObj: Record<string, unknown>): string[] {
  const props: string[] = [];
  for (const [prop, value] of Object.entries(styleObj)) {
    if (isMetadataOrConditionKey(prop) || !isPlainStyleObject(value)) {
      continue;
    }
    if (isConditionalStyleMap(value) && value.default === null) {
      props.push(prop);
    }
  }
  return props;
}

export function setConditionalDefault(
  styleObj: Record<string, unknown>,
  prop: string,
  value: string | number | boolean | null,
): void {
  const map = styleObj[prop];
  if (isPlainStyleObject(map)) {
    map.default = value;
  }
}

function patchConditionalDefaultsForSequence(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  entries: StyleSequenceEntry[];
}): "ok" | "bail" {
  const { ctx, decl, entries } = args;
  const defaults = new Map<string, DefaultInference>();

  for (const entry of entries) {
    const source = ctx.resolvedStyleObjects?.get(entry.styleKey);
    if (entry.patchable && isPlainStyleObject(source)) {
      for (const prop of propertiesWithNullConditionalDefault(source)) {
        const earlier = defaults.get(prop) ?? { kind: "absent" };
        if (earlier.kind === "absent") {
          continue;
        }
        if (earlier.kind === "static") {
          if (earlier.value !== null) {
            setConditionalDefault(source, prop, earlier.value);
          }
          continue;
        }
        ctx.warnings.push({
          severity: "warning",
          type: CONDITIONAL_DEFAULT_WARNING,
          loc: decl.loc,
          context: {
            component: decl.localName,
            styleKey: entry.styleKey,
            property: prop,
            source: entry.source,
            reason: "an earlier generated style for this property can vary at runtime",
            todo: `TODO: make the ${prop} default explicit in ${entry.styleKey}, or keep the conditional override in the same dynamic style function as the base value.`,
          },
        });
        return "bail";
      }
    } else if (entry.patchable) {
      for (const prop of functionPropertiesWithNullConditionalDefault(source)) {
        const earlier = defaults.get(prop) ?? { kind: "absent" };
        if (earlier.kind === "absent") {
          continue;
        }
        ctx.warnings.push({
          severity: "warning",
          type: CONDITIONAL_DEFAULT_WARNING,
          loc: decl.loc,
          context: {
            component: decl.localName,
            styleKey: entry.styleKey,
            property: prop,
            source: entry.source,
            reason: "a generated dynamic style function would clear an earlier default",
            todo: `TODO: merge the ${prop} base value into ${entry.styleKey}'s dynamic conditional default.`,
          },
        });
        return "bail";
      }
    }

    for (const [prop, inference] of inferDefaultContributions(source)) {
      if (inference.kind === "absent") {
        defaults.delete(prop);
      } else {
        defaults.set(prop, inference);
      }
    }
  }

  return "ok";
}

function buildStyleKeySequence(ctx: TransformContext, decl: StyledDecl): StyleSequenceEntry[] {
  const entries: StyleSequenceEntry[] = [];
  const afterBase = new Set(decl.extraStyleKeysAfterBase ?? []);

  for (const styleKey of localBaseStyleKeys(ctx, decl)) {
    entries.push({ styleKey, patchable: false, source: "base" });
  }
  for (const styleKey of decl.extraStyleKeys ?? []) {
    if (!afterBase.has(styleKey)) {
      entries.push({ styleKey, patchable: false, source: "mixin" });
    }
  }
  if (!decl.skipBaseStyleRef) {
    entries.push({ styleKey: decl.styleKey, patchable: true, source: "base" });
  }
  for (const styleKey of decl.extraStyleKeysAfterBase ?? []) {
    entries.push({ styleKey, patchable: true, source: "mixin" });
  }

  entries.push(...buildVariantAndStyleFnEntries(decl));
  entries.push(...buildPseudoExpandEntries(decl));
  entries.push(...buildAttrWrapperEntries(decl));
  entries.push(...buildEnumVariantEntries(decl));

  return entries;
}

function localBaseStyleKeys(ctx: TransformContext, decl: StyledDecl): string[] {
  if (decl.extendsStyleKey) {
    return [decl.extendsStyleKey];
  }
  const keys: string[] = [];
  const visited = new Set<string>([decl.localName]);
  let currentBase = decl.base;
  while (currentBase.kind === "component") {
    if (visited.has(currentBase.ident)) {
      break;
    }
    visited.add(currentBase.ident);
    const baseDecl = ctx.declByLocal?.get(currentBase.ident);
    if (!baseDecl || baseDecl.skipTransform) {
      break;
    }
    keys.push(baseDecl.styleKey);
    currentBase = baseDecl.base;
  }
  return keys.reverse();
}

function buildVariantAndStyleFnEntries(decl: StyledDecl): StyleSequenceEntry[] {
  const variantEntries = Object.entries(decl.variantStyleKeys ?? {}).map(([when, styleKey]) => ({
    when,
    entry: { styleKey, patchable: true, source: "variant" } satisfies StyleSequenceEntry,
  }));
  const styleFnEntries = (decl.styleFnFromProps ?? []).map((styleFn) => ({
    sourceOrder: styleFn.sourceOrder,
    entry: {
      styleKey: styleFn.fnKey,
      patchable: true,
      source: "styleFn",
    } satisfies StyleSequenceEntry,
  }));
  const hasSourceOrder =
    Object.keys(decl.variantSourceOrder ?? {}).length > 0 ||
    styleFnEntries.some((entry) => entry.sourceOrder !== undefined);

  if (!hasSourceOrder) {
    return [
      ...variantEntries.map((entry) => entry.entry),
      ...styleFnEntries.map((entry) => entry.entry),
    ];
  }

  const ordered: OrderedTailEntry[] = [];
  let index = 0;
  for (const variant of variantEntries) {
    ordered.push({
      order: decl.variantSourceOrder?.[variant.when] ?? Number.MAX_SAFE_INTEGER,
      index,
      entry: variant.entry,
    });
    index += 1;
  }
  for (const styleFn of styleFnEntries) {
    ordered.push({
      order: styleFn.sourceOrder ?? Number.MAX_SAFE_INTEGER,
      index,
      entry: styleFn.entry,
    });
    index += 1;
  }

  return ordered
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((orderedEntry) => orderedEntry.entry);
}

function buildPseudoExpandEntries(decl: StyledDecl): StyleSequenceEntry[] {
  return (decl.pseudoExpandSelectors ?? []).map((entry) => ({
    styleKey: entry.styleKey,
    patchable: true,
    source: "pseudo",
  }));
}

function buildAttrWrapperEntries(decl: StyledDecl): StyleSequenceEntry[] {
  const attrWrapper = decl.attrWrapper;
  if (!attrWrapper) {
    return [];
  }
  return [
    attrWrapper.checkboxKey,
    attrWrapper.radioKey,
    attrWrapper.readonlyKey,
    attrWrapper.externalKey,
    attrWrapper.httpsKey,
    attrWrapper.pdfKey,
  ]
    .filter((styleKey): styleKey is string => typeof styleKey === "string")
    .map(
      (styleKey) => ({ styleKey, patchable: true, source: "attr" }) satisfies StyleSequenceEntry,
    );
}

function buildEnumVariantEntries(decl: StyledDecl): StyleSequenceEntry[] {
  const enumVariant = decl.enumVariant;
  if (!enumVariant) {
    return [];
  }
  return [
    { styleKey: enumVariant.baseKey, patchable: true, source: "enum" } satisfies StyleSequenceEntry,
    ...enumVariant.cases.map(
      (entry) =>
        ({
          styleKey: entry.styleKey,
          patchable: true,
          source: "enum",
        }) satisfies StyleSequenceEntry,
    ),
  ];
}

function inferDefaultContributions(source: unknown): Map<string, DefaultInference> {
  if (isPlainStyleObject(source)) {
    return inferStyleObjectContributions(source);
  }
  return inferStyleFunctionContributions(source);
}

function inferStyleObjectContributions(
  styleObj: Record<string, unknown>,
): Map<string, DefaultInference> {
  const contributions = new Map<string, DefaultInference>();
  for (const [prop, value] of Object.entries(styleObj)) {
    if (isMetadataOrConditionKey(prop)) {
      continue;
    }
    contributions.set(prop, inferDefaultFromValue(value));
  }
  return contributions;
}

function inferStyleFunctionContributions(source: unknown): Map<string, DefaultInference> {
  const returnedObject = readFunctionReturnedObject(source);
  const contributions = new Map<string, DefaultInference>();
  if (!returnedObject) {
    return contributions;
  }
  for (const property of getObjectProperties(returnedObject)) {
    const key = readPropertyKey(property);
    if (!key || isMetadataOrConditionKey(key)) {
      continue;
    }
    contributions.set(key, { kind: "dynamic" });
  }
  return contributions;
}

function functionPropertiesWithNullConditionalDefault(source: unknown): string[] {
  const returnedObject = readFunctionReturnedObject(source);
  if (!returnedObject) {
    return [];
  }
  const props: string[] = [];
  for (const property of getObjectProperties(returnedObject)) {
    const key = readPropertyKey(property);
    if (!key || isMetadataOrConditionKey(key)) {
      continue;
    }
    if (astObjectHasNullConditionalDefault(property.value)) {
      props.push(key);
    }
  }
  return props;
}

function inferDefaultFromValue(value: unknown): DefaultInference {
  if (isStaticStyleValue(value)) {
    return value === null ? { kind: "absent" } : { kind: "static", value };
  }
  if (isPlainStyleObject(value) && isConditionalStyleMap(value)) {
    const defaultValue = value.default;
    return isStaticStyleValue(defaultValue)
      ? defaultValue === null
        ? { kind: "absent" }
        : { kind: "static", value: defaultValue }
      : { kind: "dynamic" };
  }
  return { kind: "dynamic" };
}

function isConditionalStyleMap(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => key === "default" || isStyleConditionKey(key));
}

function astObjectHasNullConditionalDefault(value: unknown): boolean {
  if (!isObjectExpression(value)) {
    return false;
  }
  let hasCondition = false;
  let hasNullDefault = false;
  for (const property of getObjectProperties(value)) {
    const key = readPropertyKey(property);
    if (!key) {
      continue;
    }
    hasCondition ||= key === "default" || isStyleConditionKey(key);
    if (key === "default" && isNullLiteral(property.value)) {
      hasNullDefault = true;
    }
  }
  return hasCondition && hasNullDefault;
}

function isStyleConditionKey(key: string): boolean {
  return key.startsWith(":") || key.startsWith("@");
}

function isMetadataOrConditionKey(key: string): boolean {
  return key.startsWith("__") || isStyleConditionKey(key);
}

function isStaticStyleValue(value: unknown): value is string | number | boolean | null {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function isPlainStyleObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && !isAstNode(value);
}

function readFunctionReturnedObject(node: unknown): Record<string, unknown> | null {
  if (!isAstRecord(node)) {
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
  if (!isAstRecord(body) || body.type !== "BlockStatement") {
    return null;
  }
  for (const statement of Array.isArray(body.body) ? body.body : []) {
    if (
      isAstRecord(statement) &&
      statement.type === "ReturnStatement" &&
      isObjectExpression(statement.argument)
    ) {
      return statement.argument;
    }
  }
  return null;
}

function getObjectProperties(node: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(node.properties) ? node.properties.filter(isAstRecord) : [];
}

function readPropertyKey(property: Record<string, unknown>): string | null {
  const key = property.key;
  if (isIdentifier(key)) {
    return key.name;
  }
  if (isAstRecord(key) && (key.type === "StringLiteral" || key.type === "Literal")) {
    return typeof key.value === "string" ? key.value : null;
  }
  return null;
}

function isObjectExpression(node: unknown): node is Record<string, unknown> {
  return isAstRecord(node) && node.type === "ObjectExpression";
}

function isIdentifier(node: unknown): node is Record<string, unknown> & { name: string } {
  return isAstRecord(node) && node.type === "Identifier" && typeof node.name === "string";
}

function isNullLiteral(node: unknown): boolean {
  return (
    isAstRecord(node) &&
    (node.type === "NullLiteral" || (node.type === "Literal" && node.value === null))
  );
}

function isAstRecord(value: unknown): value is Record<string, unknown> & { type?: string } {
  return !!value && typeof value === "object";
}
