/**
 * Preserves conditional StyleX defaults when generated style keys compose.
 * Core concepts: style-key order, static default proofs, and conservative bails.
 */
import type { WarningType } from "../logger.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { isAstNode } from "./jscodeshift-utils.js";
import {
  buildStyleKeySequence,
  type StyleContributionSource,
  type StyleSequenceEntry,
} from "./style-composition-plan.js";

export type DefaultInference =
  | { kind: "static"; value: string | number | boolean | null }
  | { kind: "absent" }
  | { kind: "dynamic" };
export type StaticStyleValue = string | number | boolean | null;
export type PropertyShape =
  | { kind: "absent" }
  | { kind: "flat"; value: StaticStyleValue }
  | {
      kind: "conditionalMap";
      defaultValue: DefaultInference;
      conditionKeys: string[];
      staticConditions?: Record<string, StaticStyleValue>;
    }
  | { kind: "dynamic" };

export const FLAT_ERASES_CONDITIONAL_WARNING =
  "Flat StyleX value would erase earlier conditional property states" satisfies WarningType;

export function flatStylexValueErasureExample(prop: string): string {
  return `A flat StyleX value is \`${prop}: value\`; if an earlier style has \`${prop}: { default: baseValue, ":hover": hoverValue }\`, the flat value replaces the whole map and drops ":hover".`;
}

export function isStyleConditionKey(key: string): boolean {
  return key.startsWith(":") || key.startsWith("@");
}

export function propertiesWithFlatValue(styleObj: Record<string, unknown>): string[] {
  const props: string[] = [];
  for (const [prop, value] of Object.entries(styleObj)) {
    if (isMetadataOrConditionKey(prop)) {
      continue;
    }
    if (inferPropertyShapeFromValue(value).kind === "flat") {
      props.push(prop);
    }
  }
  return props;
}

export function defaultInferenceFromPropertyShape(shape: PropertyShape): DefaultInference {
  if (shape.kind === "flat") {
    return { kind: "static", value: shape.value };
  }
  if (shape.kind === "conditionalMap") {
    return shape.defaultValue;
  }
  return shape;
}

export function patchFlatValueAgainstPriorPropertyShape(
  styleObj: Record<string, unknown>,
  prop: string,
  earlier: PropertyShape,
  laterSource: StyleContributionSource = "mixin",
): "patched" | "safe" | "bail" {
  if (earlier.kind !== "conditionalMap") {
    return "safe";
  }
  const current = inferPropertyShapeFromValue(styleObj[prop]);
  if (current.kind !== "flat") {
    return "safe";
  }
  const preservedConditions = staticConditionsPreservedByLaterFlat(earlier, laterSource);
  if (!preservedConditions) {
    return "bail";
  }
  if (Object.keys(preservedConditions).length === 0) {
    return "safe";
  }
  styleObj[prop] = {
    default: current.value,
    ...preservedConditions,
  };
  return "patched";
}

export function guardGeneratedConditionalDefaults(
  ctx: TransformContext,
  styledDecls: readonly StyledDecl[],
): "ok" | "bail" {
  if (!ctx.resolvedStyleObjects) {
    return "ok";
  }
  const styleKeyUseCounts = countStyleKeyUses(ctx, styledDecls);

  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.isCssHelper) {
      continue;
    }
    const result = patchConditionalDefaultsForSequence({
      ctx,
      decl,
      entries: buildStyleKeySequence(ctx, decl),
      styleKeyUseCounts,
    });
    if (result === "bail") {
      return "bail";
    }
  }

  return "ok";
}

function propertiesWithNullConditionalDefault(styleObj: Record<string, unknown>): string[] {
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

export function propertiesWithUnsafeNullConditionalDefault(
  styleObj: Record<string, unknown>,
): string[] {
  const props = new Set(propertiesWithNullConditionalDefault(styleObj));
  for (const [prop, value] of Object.entries(styleObj)) {
    if (isMetadataOrConditionKey(prop) || !isPlainStyleObject(value)) {
      continue;
    }
    if (hasNestedNullConditionalDefault(value)) {
      props.add(prop);
    }
  }
  return [...props];
}

export function patchNullConditionalDefaultsForProp(
  styleObj: Record<string, unknown>,
  prop: string,
  earlier: DefaultInference,
): "patched" | "safe" | "bail" {
  const value = styleObj[prop];
  if (!isPlainStyleObject(value) || !isConditionalStyleMap(value)) {
    return "safe";
  }

  let inheritedDefault = inferDefaultFromValue(value);
  if (value.default === null && earlier.kind === "static" && earlier.value !== null) {
    value.default = earlier.value;
    inheritedDefault = earlier;
  } else if (value.default === null && earlier.kind === "dynamic") {
    return "bail";
  } else if (value.default === null) {
    inheritedDefault = earlier;
  }

  if (!hasNestedNullConditionalDefault(value)) {
    return "safe";
  }
  if (inheritedDefault.kind === "static" && inheritedDefault.value !== null) {
    patchNestedNullConditionalDefaults(value, inheritedDefault.value);
    return "patched";
  }
  return inheritedDefault.kind === "dynamic" ? "bail" : "safe";
}

function patchConditionalDefaultsForSequence(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  entries: StyleSequenceEntry[];
  styleKeyUseCounts: Map<string, number>;
}): "ok" | "bail" {
  const { ctx, decl, entries, styleKeyUseCounts } = args;
  const shapes = new Map<string, PropertyShape>();
  let hasDynamicUnknownContributor = false;

  for (const entry of entries) {
    const source = entry.styleObj ?? ctx.resolvedStyleObjects?.get(entry.styleKey);
    let contributionSource = source;
    if (entry.patchable && isPlainStyleObject(source)) {
      const clonedPatchSources = new Map<string, Record<string, unknown>>();
      for (const prop of propertiesWithFlatValue(source)) {
        const earlier = shapes.get(prop) ?? { kind: "absent" };
        const clonedPatchSource = clonedPatchSources.get(entry.styleKey);
        const patchTarget =
          clonedPatchSource ??
          (needsSharedFlatEntryClone(entry, source, prop, earlier) && ctx.resolvedStyleObjects
            ? cloneSharedStyleEntryForPatch(
                ctx.resolvedStyleObjects,
                decl,
                entry.styleKey,
                source,
                clonedPatchSources,
                styleKeyUseCounts,
              )
            : source);
        contributionSource = patchTarget;
        if (
          patchFlatValueAgainstPriorPropertyShape(patchTarget, prop, earlier, entry.source) !==
          "bail"
        ) {
          continue;
        }
        ctx.warnings.push({
          severity: "warning",
          type: FLAT_ERASES_CONDITIONAL_WARNING,
          loc: decl.loc,
          context: {
            component: decl.localName,
            styleKey: entry.styleKey,
            property: prop,
            source: entry.source,
            droppedConditionKeys:
              earlier.kind === "conditionalMap" ? earlier.conditionKeys.join(", ") : undefined,
            reason: "a later flat StyleX value would replace an earlier conditional property map",
            example: flatStylexValueErasureExample(prop),
            todo: `TODO: lift ${prop} into a conditional map that preserves the earlier condition slots.`,
          },
        });
        return "bail";
      }

      for (const prop of propertiesWithUnsafeNullConditionalDefault(source)) {
        const earlier = hasDynamicUnknownContributor
          ? ({ kind: "dynamic" } satisfies DefaultInference)
          : defaultInferenceFromPropertyShape(shapes.get(prop) ?? { kind: "absent" });
        const patchResult = patchNullConditionalDefaultsForProp(source, prop, earlier);
        if (patchResult === "patched" || patchResult === "safe") {
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
        const earlier = defaultInferenceFromPropertyShape(shapes.get(prop) ?? { kind: "absent" });
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

    if (entry.contributesDynamic) {
      hasDynamicUnknownContributor = true;
      continue;
    }

    if (entry.contributes !== false) {
      for (const [prop, shape] of inferPropertyContributions(contributionSource)) {
        if (shape.kind === "absent") {
          shapes.delete(prop);
        } else {
          shapes.set(prop, shape);
        }
      }
    }
  }

  return "ok";
}

function countStyleKeyUses(
  ctx: TransformContext,
  styledDecls: readonly StyledDecl[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.isCssHelper) {
      continue;
    }
    for (const entry of buildStyleKeySequence(ctx, decl)) {
      counts.set(entry.styleKey, (counts.get(entry.styleKey) ?? 0) + 1);
    }
  }
  for (const styleKey of cssHelperReferencedStyleKeys(ctx)) {
    counts.set(styleKey, (counts.get(styleKey) ?? 0) + 1);
  }
  return counts;
}

type CssHelperStyleKeyReference = { styleKey?: unknown };

function cssHelperReferencedStyleKeys(ctx: TransformContext): string[] {
  const cssHelpers:
    | {
        cssHelperReplacements?: CssHelperStyleKeyReference[];
        cssHelperTemplateReplacements?: CssHelperStyleKeyReference[];
      }
    | undefined = ctx.cssHelpers;
  const references = [
    ...(cssHelpers?.cssHelperReplacements ?? []),
    ...(cssHelpers?.cssHelperTemplateReplacements ?? []),
  ];
  return references
    .map((reference) => reference.styleKey)
    .filter((styleKey): styleKey is string => typeof styleKey === "string");
}

function needsSharedFlatEntryClone(
  entry: StyleSequenceEntry,
  source: Record<string, unknown>,
  prop: string,
  earlier: PropertyShape,
): boolean {
  return (
    entry.source === "mixin" &&
    earlier.kind === "conditionalMap" &&
    inferPropertyShapeFromValue(source[prop]).kind === "flat"
  );
}

function cloneSharedStyleEntryForPatch(
  styles: Map<string, unknown>,
  decl: StyledDecl,
  styleKey: string,
  source: Record<string, unknown>,
  clonedPatchSources: Map<string, Record<string, unknown>>,
  styleKeyUseCounts: Map<string, number>,
): Record<string, unknown> {
  const existing = clonedPatchSources.get(styleKey);
  if (existing) {
    return existing;
  }
  const clonedStyleKey = uniqueStyleKey(styles, `${decl.styleKey}${capitalize(styleKey)}`);
  const clonedSource = { ...source };
  styles.set(clonedStyleKey, clonedSource);
  replaceFirstStyleKey(decl.extraStyleKeys, styleKey, clonedStyleKey);
  replaceFirstStyleKey(decl.extraStyleKeysAfterBase, styleKey, clonedStyleKey);
  decrementStyleKeyUse(styles, styleKeyUseCounts, styleKey);
  styleKeyUseCounts.set(clonedStyleKey, 1);
  clonedPatchSources.set(styleKey, clonedSource);
  return clonedSource;
}

function decrementStyleKeyUse(
  styles: Map<string, unknown>,
  styleKeyUseCounts: Map<string, number>,
  styleKey: string,
): void {
  const nextCount = (styleKeyUseCounts.get(styleKey) ?? 0) - 1;
  if (nextCount > 0) {
    styleKeyUseCounts.set(styleKey, nextCount);
    return;
  }
  styleKeyUseCounts.delete(styleKey);
  styles.delete(styleKey);
}

function uniqueStyleKey(styles: ReadonlyMap<string, unknown>, baseKey: string): string {
  let candidate = baseKey;
  let index = 2;
  while (styles.has(candidate)) {
    candidate = `${baseKey}${index}`;
    index += 1;
  }
  return candidate;
}

function replaceFirstStyleKey(
  styleKeys: string[] | undefined,
  previousStyleKey: string,
  nextStyleKey: string,
): void {
  if (!styleKeys) {
    return;
  }
  for (let index = 0; index < styleKeys.length; index += 1) {
    if (styleKeys[index] === previousStyleKey) {
      styleKeys[index] = nextStyleKey;
      return;
    }
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;
}

function inferPropertyContributions(source: unknown): Map<string, PropertyShape> {
  if (isPlainStyleObject(source)) {
    return inferStyleObjectContributions(source);
  }
  return inferStyleFunctionContributions(source);
}

function inferStyleObjectContributions(
  styleObj: Record<string, unknown>,
): Map<string, PropertyShape> {
  const contributions = new Map<string, PropertyShape>();
  for (const [prop, value] of Object.entries(styleObj)) {
    if (isMetadataOrConditionKey(prop)) {
      continue;
    }
    contributions.set(prop, inferPropertyShapeFromValue(value));
  }
  return contributions;
}

function inferStyleFunctionContributions(source: unknown): Map<string, PropertyShape> {
  const returnedObject = readFunctionReturnedObject(source);
  const contributions = new Map<string, PropertyShape>();
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
  return defaultInferenceFromPropertyShape(inferPropertyShapeFromValue(value));
}

function inferPropertyShapeFromValue(value: unknown): PropertyShape {
  if (isStaticStyleValue(value)) {
    return value === null ? { kind: "absent" } : { kind: "flat", value };
  }
  if (isPlainStyleObject(value) && isConditionalStyleMap(value)) {
    const defaultValue = value.default;
    const conditionKeys = Object.keys(value).filter(isStyleConditionKey);
    const staticConditions = readStaticConditionValues(value, conditionKeys);
    return {
      kind: "conditionalMap",
      defaultValue: isStaticStyleValue(defaultValue)
        ? defaultValue === null
          ? { kind: "absent" }
          : { kind: "static", value: defaultValue }
        : { kind: "dynamic" },
      conditionKeys,
      ...(staticConditions ? { staticConditions } : {}),
    };
  }
  return { kind: "dynamic" };
}

const CONDITIONAL_DEFAULT_WARNING =
  "Conditional StyleX default would override an unproven earlier style for the same property" satisfies WarningType;

function readStaticConditionValues(
  value: Record<string, unknown>,
  conditionKeys: readonly string[],
): Record<string, StaticStyleValue> | undefined {
  const conditions: Record<string, StaticStyleValue> = {};
  for (const key of conditionKeys) {
    const conditionValue = value[key];
    if (!isStaticStyleValue(conditionValue)) {
      return undefined;
    }
    conditions[key] = conditionValue;
  }
  return conditions;
}

function staticConditionsPreservedByLaterFlat(
  earlier: Extract<PropertyShape, { kind: "conditionalMap" }>,
  laterSource: StyleContributionSource,
): Record<string, StaticStyleValue> | undefined {
  const minSpecificity = conditionSpecificityNeededToOutrankFlatSource(laterSource);
  const preservedKeys = earlier.conditionKeys.filter(
    (key) => conditionSpecificity(key) > minSpecificity,
  );
  if (preservedKeys.length === 0) {
    return {};
  }
  if (!earlier.staticConditions) {
    return undefined;
  }
  const preserved: Record<string, StaticStyleValue> = {};
  for (const key of preservedKeys) {
    const value = earlier.staticConditions[key];
    if (!isStaticStyleValue(value)) {
      return undefined;
    }
    preserved[key] = value;
  }
  return preserved;
}

function conditionSpecificityNeededToOutrankFlatSource(source: StyleContributionSource): number {
  return source === "attr" ? 1 : 0;
}

function conditionSpecificity(conditionKey: string): number {
  if (conditionKey.startsWith("@")) {
    return 0;
  }
  let specificity = 0;
  for (let index = 0; index < conditionKey.length; index += 1) {
    const char = conditionKey[index];
    if (char === "[") {
      specificity += 1;
      index = skipBalanced(conditionKey, index, "[", "]");
      continue;
    }
    if (char === ".") {
      specificity += 1;
      index = readIdentifierEnd(conditionKey, index + 1) - 1;
      continue;
    }
    if (char === "#") {
      specificity += 100;
      index = readIdentifierEnd(conditionKey, index + 1) - 1;
      continue;
    }
    if (char !== ":") {
      continue;
    }
    if (conditionKey[index + 1] === ":") {
      index = readIdentifierEnd(conditionKey, index + 2);
      continue;
    }
    const nameStart = index + 1;
    const nameEnd = readIdentifierEnd(conditionKey, nameStart);
    const pseudoName = conditionKey.slice(nameStart, nameEnd);
    if (!pseudoName) {
      continue;
    }
    if (conditionKey[nameEnd] !== "(") {
      specificity += 1;
      index = nameEnd - 1;
      continue;
    }
    const argsEnd = skipBalanced(conditionKey, nameEnd, "(", ")");
    const args = conditionKey.slice(nameEnd + 1, argsEnd);
    if (pseudoName === "where") {
      index = argsEnd;
      continue;
    }
    if (pseudoName === "is" || pseudoName === "not" || pseudoName === "has") {
      specificity += Math.max(0, ...splitSelectorList(args).map(conditionSpecificity));
      index = argsEnd;
      continue;
    }
    specificity += 1;
    index = argsEnd;
  }
  return specificity;
}

function readIdentifierEnd(value: string, start: number): number {
  let index = start;
  while (index < value.length && /[A-Za-z0-9_-]/.test(value[index] ?? "")) {
    index += 1;
  }
  return index;
}

function skipBalanced(value: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return value.length - 1;
}

function splitSelectorList(value: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") {
      parenDepth += 1;
    } else if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (char === "[") {
      bracketDepth += 1;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (char === "," && parenDepth === 0 && bracketDepth === 0) {
      selectors.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(value.slice(start).trim());
  return selectors.filter(Boolean);
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
    if (isObjectExpression(property.value) && astObjectHasNullConditionalDefault(property.value)) {
      return true;
    }
  }
  return hasCondition && hasNullDefault;
}

function hasNestedNullConditionalDefault(value: Record<string, unknown>): boolean {
  for (const [key, nested] of Object.entries(value)) {
    if (key === "__computedKeys" && computedEntriesHaveNullConditionalDefault(nested)) {
      return true;
    }
    if (key === "default" || !isPlainStyleObject(nested)) {
      continue;
    }
    if (isConditionalStyleMap(nested) && nested.default === null) {
      return true;
    }
    if (hasNestedNullConditionalDefault(nested)) {
      return true;
    }
  }
  return false;
}

function patchNestedNullConditionalDefaults(
  value: Record<string, unknown>,
  inheritedDefault: string | number | boolean,
): void {
  for (const [key, nested] of Object.entries(value)) {
    if (key === "__computedKeys") {
      patchComputedEntryDefaults(nested, inheritedDefault);
      continue;
    }
    if (key === "default" || !isPlainStyleObject(nested)) {
      continue;
    }
    let nextDefault = inheritedDefault;
    if (isConditionalStyleMap(nested)) {
      if (nested.default === null) {
        nested.default = inheritedDefault;
      } else {
        const nestedDefault = inferDefaultFromValue(nested);
        if (nestedDefault.kind === "static" && nestedDefault.value !== null) {
          nextDefault = nestedDefault.value;
        }
      }
    }
    patchNestedNullConditionalDefaults(nested, nextDefault);
  }
}

function computedEntriesHaveNullConditionalDefault(value: unknown): boolean {
  return getComputedEntryValues(value).some(
    (entryValue) =>
      (isPlainStyleObject(entryValue) &&
        ((isConditionalStyleMap(entryValue) && entryValue.default === null) ||
          hasNestedNullConditionalDefault(entryValue))) ||
      astObjectHasNullConditionalDefault(entryValue),
  );
}

function patchComputedEntryDefaults(
  value: unknown,
  inheritedDefault: string | number | boolean,
): void {
  for (const entryValue of getComputedEntryValues(value)) {
    if (isObjectExpression(entryValue)) {
      patchAstObjectNullConditionalDefaults(entryValue, inheritedDefault);
      continue;
    }
    if (!isPlainStyleObject(entryValue)) {
      continue;
    }
    let nextDefault = inheritedDefault;
    if (isConditionalStyleMap(entryValue)) {
      if (entryValue.default === null) {
        entryValue.default = inheritedDefault;
      } else {
        const entryDefault = inferDefaultFromValue(entryValue);
        if (entryDefault.kind === "static" && entryDefault.value !== null) {
          nextDefault = entryDefault.value;
        }
      }
    }
    patchNestedNullConditionalDefaults(entryValue, nextDefault);
  }
}

function getComputedEntryValues(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => (isAstRecord(entry) ? entry.value : undefined));
}

function patchAstObjectNullConditionalDefaults(
  value: Record<string, unknown>,
  inheritedDefault: string | number | boolean,
): void {
  let nextDefault = inheritedDefault;
  for (const property of getObjectProperties(value)) {
    const key = readPropertyKey(property);
    if (key === "default") {
      if (isNullLiteral(property.value)) {
        property.value = astLiteral(inheritedDefault);
      } else {
        const staticDefault = readStaticAstLiteral(property.value);
        if (staticDefault !== undefined && staticDefault !== null) {
          nextDefault = staticDefault;
        }
      }
      continue;
    }
    if (isObjectExpression(property.value)) {
      patchAstObjectNullConditionalDefaults(property.value, nextDefault);
    }
  }
}

function astLiteral(value: string | number | boolean): Record<string, unknown> {
  return { type: "Literal", value };
}

function readStaticAstLiteral(value: unknown): string | number | boolean | null | undefined {
  if (!isAstRecord(value)) {
    return undefined;
  }
  if (
    value.type === "StringLiteral" ||
    value.type === "NumericLiteral" ||
    value.type === "BooleanLiteral" ||
    value.type === "Literal"
  ) {
    return typeof value.value === "string" ||
      typeof value.value === "number" ||
      typeof value.value === "boolean" ||
      value.value === null
      ? value.value
      : undefined;
  }
  if (value.type === "NullLiteral") {
    return null;
  }
  return undefined;
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
