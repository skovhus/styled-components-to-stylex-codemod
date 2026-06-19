/**
 * Folds static base/variant style objects into dynamic style functions and
 * consolidates style functions: merging base properties into a single style fn,
 * converting positional params to a `props` object, merging matching variant
 * buckets, and consolidating same-jsxProp functions.
 */
import { literalToAst } from "../transform/helpers.js";
import type { StyledDecl } from "../transform-types.js";
import {
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  isAstNode,
} from "../utilities/jscodeshift-utils.js";
import {
  astShapeKey,
  findBodyProperty,
  renameIdentifierInAst,
  replaceIdentifierInAst,
  styleObjToAstProperties,
  type ASTProperty,
} from "./ast-style-utils.js";

/**
 * Inserts styleFnDecls entries into resolvedStyleObjects right after the last
 * entry belonging to the current component. This ensures dynamic style functions
 * appear adjacent to their static counterparts in stylex.create() output.
 */
export function insertStyleFnDeclsAfterComponent(
  resolvedStyleObjects: Map<string, unknown>,
  styleFnDecls: Map<string, unknown>,
  component: {
    styleKey: string;
    extraStyleObjects: Map<string, Record<string, unknown>>;
    remainingStyleKeys: Record<string, string>;
    attrBuckets: Map<string, Record<string, unknown>>;
    enumVariant?: { baseKey: string; cases: Array<{ styleKey: string }> } | null;
  },
): void {
  if (styleFnDecls.size === 0) {
    return;
  }

  // Collect all keys this component added to resolvedStyleObjects
  const componentKeys = new Set<string>();
  componentKeys.add(component.styleKey);
  for (const k of component.extraStyleObjects.keys()) {
    componentKeys.add(k);
  }
  for (const k of Object.values(component.remainingStyleKeys)) {
    componentKeys.add(k);
  }
  for (const k of component.attrBuckets.keys()) {
    componentKeys.add(k);
  }
  if (component.enumVariant) {
    componentKeys.add(component.enumVariant.baseKey);
    for (const c of component.enumVariant.cases) {
      componentKeys.add(c.styleKey);
    }
  }

  // Also include keys from styleFnDecls that are already in resolvedStyleObjects
  // (e.g. merged variant buckets that share a key with the styleFn).
  for (const k of styleFnDecls.keys()) {
    if (resolvedStyleObjects.has(k)) {
      componentKeys.add(k);
    }
  }

  // Find the last component key in the Map's insertion order
  let lastComponentKey: string | null = null;
  for (const k of resolvedStyleObjects.keys()) {
    if (componentKeys.has(k)) {
      lastComponentKey = k;
    }
  }

  if (lastComponentKey === null) {
    // Fallback: append at end
    for (const [k, v] of styleFnDecls.entries()) {
      resolvedStyleObjects.set(k, v);
    }
    return;
  }

  // Rebuild the Map, inserting styleFnDecls right after lastComponentKey.
  // When a styleFnDecl key matches an existing entry (e.g. a merged variant bucket
  // or a fully-dynamic base), replace the value in-place. New styleFnDecl keys
  // are inserted after lastComponentKey.
  const emittedFnKeys = new Set<string>();
  const entries = [...resolvedStyleObjects.entries()];
  resolvedStyleObjects.clear();
  for (const [k, v] of entries) {
    if (styleFnDecls.has(k)) {
      resolvedStyleObjects.set(k, styleFnDecls.get(k));
      emittedFnKeys.add(k);
    } else {
      resolvedStyleObjects.set(k, v);
    }
    if (k === lastComponentKey) {
      for (const [fk, fv] of styleFnDecls.entries()) {
        if (!emittedFnKeys.has(fk)) {
          resolvedStyleObjects.set(fk, fv);
          emittedFnKeys.add(fk);
        }
      }
    }
  }
}

/**
 * Merges static base properties into a single unconditional style function.
 *
 * When a styled component has both static CSS properties and a single
 * unconditional dynamic style function, the static properties are folded
 * into the function's return object so that the emitted code uses a single
 * `styles.key(arg)` call instead of separate `styles.key, styles.keyDynamic(arg)`.
 *
 * Preconditions:
 * - Exactly one unconditional styleFn entry (no conditionWhen)
 * - Base styleObj has at least one property
 * - No extra style objects (css`` helpers interleave with base)
 * - No enum variants
 * - The component is not extended by other styled components
 */
export function mergeBaseIntoSingleStyleFn(args: {
  j: Parameters<typeof literalToAst>[0];
  decl: StyledDecl;
  styleObj: Record<string, unknown>;
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  styledDecls: StyledDecl[];
}): void {
  const { j, decl, styleObj, styleFnFromProps, styleFnDecls, extraStyleObjects, styledDecls } =
    args;

  // Must have base properties to merge
  if (Object.keys(styleObj).length === 0) {
    return;
  }

  // Must have styleFn entries
  if (styleFnFromProps.length === 0) {
    return;
  }

  // Must have no extra style objects (css`` helpers interleave with base)
  if (extraStyleObjects.size > 0) {
    return;
  }

  // Must have no enum variant
  if (decl.enumVariant) {
    return;
  }

  // Must not be extended by other styled components
  for (const other of styledDecls) {
    if (other !== decl && other.extendsStyleKey === decl.styleKey) {
      return;
    }
  }

  // Base properties can only be folded into a dynamic function when that function
  // is the sole dynamic entry. Otherwise the merged base may move after another
  // dynamic override in `stylex.props()` and change CSS source-order semantics.
  if (styleFnFromProps.length !== 1) {
    return;
  }

  // Find unconditional styleFn entries with "always" condition.
  // Entries with "truthy" condition are guarded (e.g. `prop ? styles.fn(prop) : undefined`),
  // so the base static properties must remain separate as defaults when the guard is false.
  const unconditionalEntries = styleFnFromProps.filter(
    (p) => !p.conditionWhen && p.condition === "always",
  );
  if (unconditionalEntries.length !== 1) {
    return;
  }

  const entry = unconditionalEntries[0]!;
  const fnKey = entry.fnKey;
  const fnAst = styleFnDecls.get(fnKey);
  if (!fnAst || typeof fnAst !== "object") {
    return;
  }

  // Extract the function body (ObjectExpression)
  const body = getFunctionBodyExpr(fnAst as { body?: unknown });
  if (!body || (body as { type?: string }).type !== "ObjectExpression") {
    return;
  }
  const bodyObj = body as { properties?: unknown[] };
  if (!Array.isArray(bodyObj.properties)) {
    return;
  }

  // Collect existing property keys in the function body
  const existingKeys = new Set<string>();
  for (const prop of bodyObj.properties) {
    const key = (prop as { key?: { name?: string; value?: string } }).key;
    if (key) {
      existingKeys.add(key.name ?? key.value ?? "");
    }
  }

  const staticKeys = Object.keys(styleObj).filter((k) => !k.startsWith("__"));
  const overlappingKeys = new Set(staticKeys.filter((k) => existingKeys.has(k)));

  // Handle overlapping keys: scalar overlaps are dropped (the function body's
  // value takes precedence since condition === "always"), nested objects
  // (pseudo-elements, media queries) are deep-merged.
  for (const key of overlappingKeys) {
    const staticValue = styleObj[key];
    if (
      !staticValue ||
      typeof staticValue !== "object" ||
      isAstNode(staticValue) ||
      Array.isArray(staticValue)
    ) {
      continue;
    }
    // Nested object overlap — validate and deep-merge into function body
    const fnProp = findBodyProperty(bodyObj.properties as ASTProperty[], key);
    if (!fnProp?.value || (fnProp.value as { type?: string }).type !== "ObjectExpression") {
      return;
    }
    const fnNestedObj = fnProp.value as { properties?: ASTProperty[] };
    if (!Array.isArray(fnNestedObj.properties)) {
      return;
    }
    const fnNestedKeys = new Set(
      fnNestedObj.properties.map((p) => p.key?.name ?? p.key?.value ?? ""),
    );
    for (const nestedKey of Object.keys(staticValue as Record<string, unknown>)) {
      if (fnNestedKeys.has(nestedKey)) {
        return;
      }
    }
    (fnNestedObj.properties as unknown[]).unshift(
      ...styleObjToAstProperties(j, staticValue as Record<string, unknown>),
    );
  }

  // Prepend non-overlapping base static properties to the function body
  bodyObj.properties.unshift(...styleObjToAstProperties(j, styleObj, overlappingKeys));

  // Rename the function key from fnKey to decl.styleKey
  if (fnKey !== decl.styleKey) {
    styleFnDecls.delete(fnKey);
    styleFnDecls.set(decl.styleKey, fnAst);
    entry.fnKey = decl.styleKey;
  }
  if (entry.jsxProp !== "__props" && !entry.propsObjectKey) {
    entry.forceScalarArgs = true;
  }

  // The merged function now contains base properties that must come before
  // any variant overrides in the sx array.  Set sourceOrder to -1 so it
  // sorts before all variant entries (which start at 0).
  //
  // Safety: this won't jump ahead of other ordered entries incorrectly
  // because the guards above ensure no extraStyleObjects (css`` helpers)
  // exist, and only one unconditional styleFn entry is present.
  entry.sourceOrder = -1;

  // Clear the base styleObj so it becomes empty in resolvedStyleObjects
  for (const key of Object.keys(styleObj)) {
    delete styleObj[key];
  }
}

/**
 * Converts single-positional-param style functions to use a named `props`
 * object parameter. Skips functions that already use a `props` parameter
 * (e.g. consolidated multi-param functions).
 *
 * Before: `(color: string) => ({ color })`
 * After:  `(props: { color: string }) => ({ color: props.color })`
 */
export function convertStyleFnsToPropsPattern(
  j: Parameters<typeof literalToAst>[0],
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
  baseStyleKey: string,
): void {
  const managedFnKeys = new Set(styleFnFromProps.map((p) => p.fnKey));

  for (const [fnKey, fnAst] of styleFnDecls.entries()) {
    if (fnKey !== baseStyleKey) {
      continue;
    }
    if (!managedFnKeys.has(fnKey)) {
      continue;
    }
    const managedEntries = styleFnFromProps.filter((entry) => entry.fnKey === fnKey);
    if (managedEntries.some((entry) => entry.forceScalarArgs)) {
      continue;
    }
    if (!fnAst || typeof fnAst !== "object") {
      continue;
    }
    const fn = fnAst as { params?: unknown[]; body?: unknown };
    if (!Array.isArray(fn.params) || fn.params.length !== 1) {
      continue;
    }

    const param = fn.params[0] as { type?: string; name?: string; typeAnnotation?: unknown };
    if (param.type !== "Identifier" || !param.name || param.name === "props") {
      continue;
    }

    const paramName = param.name;
    const paramTypeAnnotation = param.typeAnnotation;
    const body = getFunctionBodyExpr(fn);
    if (!body || (body as { type?: string }).type !== "ObjectExpression") {
      continue;
    }
    const bodyObj = body as { properties?: ASTProperty[] };

    if (
      Array.isArray(bodyObj.properties) &&
      bodyObj.properties.some((p) => (p.key?.name ?? p.key?.value) === paramName)
    ) {
      continue;
    }

    replaceIdentifierInAst(j, body, paramName);

    const propsParam = j.identifier("props");
    if (paramTypeAnnotation) {
      const innerType = (paramTypeAnnotation as { typeAnnotation?: unknown }).typeAnnotation;
      if (innerType) {
        const propSignature = j.tsPropertySignature(
          j.identifier(paramName),
          j.tsTypeAnnotation(innerType as any),
        );
        (propsParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsTypeLiteral([propSignature]),
        );
      }
    }

    fn.params[0] = propsParam;

    for (const entry of managedEntries) {
      if (!entry.propsObjectKey) {
        entry.propsObjectKey = paramName;
      }
    }
  }
}

/**
 * Merges variant bucket properties into style functions that share the same
 * condition key. When a ternary condition (e.g., `$open`) produces both static
 * variant values (e.g., `opacity: 1`, `pointerEvents: "inherit"`) and a
 * dynamic style function (e.g., `transitionDelay: \`${props.$delay}ms\``),
 * the static values must be folded into the function's return object to
 * avoid a duplicate bare style reference in `stylex.props()`.
 */
export function mergeVariantBucketsIntoStyleFns(args: {
  j: Parameters<typeof literalToAst>[0];
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  remainingBuckets: Map<string, Record<string, unknown>>;
  remainingStyleKeys: Record<string, string>;
  resolvedStyleObjects: Map<string, unknown>;
  variantSourceOrder?: Record<string, number>;
}): void {
  const { j, styleFnFromProps, styleFnDecls, remainingBuckets, remainingStyleKeys } = args;

  // Build a map from condition ("when") to the styleFn key that handles it
  const conditionToFnKey = new Map<string, string>();
  for (const sfp of styleFnFromProps) {
    if (sfp.conditionWhen && sfp.fnKey) {
      conditionToFnKey.set(sfp.conditionWhen, sfp.fnKey);
    }
  }

  // Find variant buckets whose condition matches a styleFn condition AND shares the same style key
  for (const [when, variantObj] of remainingBuckets.entries()) {
    const fnKey = conditionToFnKey.get(when);
    if (!fnKey) {
      continue;
    }
    // Only merge when the variant's style key matches the styleFn's key
    const variantKey = remainingStyleKeys[when];
    if (variantKey !== fnKey) {
      continue;
    }
    const fnAst = styleFnDecls.get(fnKey);
    if (!fnAst || typeof fnAst !== "object") {
      continue;
    }

    // Extract the function body (ObjectExpression) from the arrow function
    const body = getFunctionBodyExpr(fnAst);
    if (!body || (body as { type?: string }).type !== "ObjectExpression") {
      continue;
    }
    const bodyObj = body as { properties?: unknown[] };
    if (!Array.isArray(bodyObj.properties)) {
      continue;
    }

    // Get existing property keys in the function body
    const existingKeys = new Set<string>();
    for (const prop of bodyObj.properties) {
      const key = (prop as { key?: { name?: string } }).key?.name;
      if (key) {
        existingKeys.add(key);
      }
    }

    // Merge variant properties that aren't already in the function body
    const propsToMerge = styleObjToAstProperties(j, variantObj, existingKeys);
    bodyObj.properties.unshift(...propsToMerge);

    if (propsToMerge.length > 0) {
      // Remove the variant from remainingBuckets/remainingStyleKeys so it
      // doesn't produce a duplicate bare reference in stylex.props()
      remainingBuckets.delete(when);
      delete remainingStyleKeys[when];
      if (args.variantSourceOrder) {
        delete args.variantSourceOrder[when];
      }
      // Also remove the resolved style object that was set for this variant
      const variantStyleObjKey = Object.entries(args.remainingStyleKeys).find(
        ([w]) => w === when,
      )?.[1];
      if (variantStyleObjKey) {
        args.resolvedStyleObjects.delete(variantStyleObjKey);
      }
    }
  }
}

/**
 * Consolidates style functions that share the same jsxProp into a single
 * function with all properties merged. For example, when multiple CSS
 * declarations depend on the same transient prop `$size`, their separate
 * style functions are merged into one.
 *
 * Before: containerWidth($size), containerHeight($size), containerLineHeight($size)
 * After:  containerSize($size) with all properties combined
 */
export function consolidateSameJsxPropStyleFns(args: {
  styleKey: string;
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  hasShouldForwardProp: boolean;
}): void {
  const { styleKey, styleFnFromProps, styleFnDecls, hasShouldForwardProp } = args;

  // Group entries by jsxProp — only consolidate transient props ($-prefixed) on
  // shouldForwardProp components. Non-transient props use intentionally separate
  // style functions with individual parameter types.
  if (!hasShouldForwardProp) {
    return;
  }
  const groups = new Map<string, number[]>();
  for (let i = 0; i < styleFnFromProps.length; i++) {
    const entry = styleFnFromProps[i]!;
    if (entry.jsxProp === "__props" || entry.conditionWhen || !entry.jsxProp.startsWith("$")) {
      continue;
    }
    const indices = groups.get(entry.jsxProp) ?? [];
    indices.push(i);
    groups.set(entry.jsxProp, indices);
  }

  // Only consolidate groups with 2+ entries
  const indicesToRemove = new Set<number>();
  for (const [, indices] of groups) {
    if (indices.length < 2) {
      continue;
    }

    // Collect all arrow function bodies and verify they're compatible
    const firstIdx = indices[0]!;
    const firstEntry = styleFnFromProps[firstIdx]!;
    const unifiedParamName = firstEntry.jsxProp;
    const mergedProperties: unknown[] = [];
    let firstFnAst: object | undefined;

    let canMerge = true;
    const firstCallArgKey = astShapeKey(firstEntry.callArg);
    for (const idx of indices) {
      const entry = styleFnFromProps[idx]!;
      if (astShapeKey(entry.callArg) !== firstCallArgKey) {
        canMerge = false;
        break;
      }
      const fnAst = styleFnDecls.get(entry.fnKey);
      if (!fnAst || typeof fnAst !== "object") {
        canMerge = false;
        break;
      }
      if (idx === firstIdx) {
        firstFnAst = fnAst;
      }
      const body = getFunctionBodyExpr(fnAst);
      if (!body || (body as { type?: string }).type !== "ObjectExpression") {
        canMerge = false;
        break;
      }
      // Get the original parameter name for this function
      const origParam = getArrowFnSingleParamName(fnAst as any);
      const bodyProps = (body as { properties?: unknown[] }).properties ?? [];
      if (
        origParam &&
        !bodyProps.every((prop) => objectPropertyValueIsIdentifier(prop, origParam))
      ) {
        canMerge = false;
        break;
      }
      if (origParam && origParam !== unifiedParamName) {
        // Rename all identifier references from the original param to the unified name
        for (const prop of bodyProps) {
          renameIdentifierInAst(prop, origParam, unifiedParamName);
        }
      }
      mergedProperties.push(...bodyProps);
    }
    if (!canMerge || !firstFnAst) {
      continue;
    }

    // Build merged function name: styleKey + suffix from the prop name
    // (without the "$" prefix, e.g., $size → Size)
    const propName = firstEntry.jsxProp;
    const suffix = propName.startsWith("$")
      ? propName.slice(1).charAt(0).toUpperCase() + propName.slice(2)
      : propName.charAt(0).toUpperCase() + propName.slice(1);
    const mergedFnKey = `${styleKey}${suffix}`;

    // Build merged function: take the first function as template, replace body and param
    const firstBody = getFunctionBodyExpr(firstFnAst);
    if (!firstBody) {
      continue;
    }
    // Build the unified param with the jsxProp name
    const firstFn = firstFnAst as { params?: Array<{ name?: string; typeAnnotation?: unknown }> };
    const firstParam = firstFn.params?.[0];
    const unifiedParam = firstParam ? { ...firstParam, name: unifiedParamName } : undefined;
    const mergedBody = { ...(firstBody as object), properties: mergedProperties };
    const mergedFnAst = {
      ...firstFnAst,
      body: mergedBody,
      params: unifiedParam ? [unifiedParam] : (firstFn.params ?? []),
    };

    // Update styleFnDecls: add merged, remove old
    styleFnDecls.set(mergedFnKey, mergedFnAst);
    for (const idx of indices) {
      const entry = styleFnFromProps[idx]!;
      styleFnDecls.delete(entry.fnKey);
    }

    // Update styleFnFromProps: replace first entry, mark rest for removal
    styleFnFromProps[firstIdx] = {
      ...firstEntry,
      fnKey: mergedFnKey,
      // Preserve sourceOrder from the first entry
    };
    for (let k = 1; k < indices.length; k++) {
      indicesToRemove.add(indices[k]!);
    }
  }

  // Remove consolidated entries (in reverse order to preserve indices)
  const sortedRemoveIndices = [...indicesToRemove].sort((a, b) => b - a);
  for (const idx of sortedRemoveIndices) {
    styleFnFromProps.splice(idx, 1);
  }
}

// --- Non-exported helpers ---

function objectPropertyValueIsIdentifier(prop: unknown, name: string): boolean {
  const p = prop as { type?: string; value?: { type?: string; name?: string } };
  return (
    (p.type === "ObjectProperty" || p.type === "Property") &&
    p.value?.type === "Identifier" &&
    p.value.name === name
  );
}
