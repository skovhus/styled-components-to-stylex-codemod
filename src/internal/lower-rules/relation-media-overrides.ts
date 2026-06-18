/**
 * Relation override, sibling/has selector, and computed-media handling.
 *
 * Processes self-referencing sibling selectors (`& ~ &`, `& + &`), cross-component
 * sibling/has selectors, and computed @media entries into relation-override and
 * computed-media buckets, including the dynamic relation-override fallback that
 * emits ancestor-pseudo-wrapped styleFn entries.
 */
import type { JSCodeshift } from "jscodeshift";
import type { DeclProcessingState } from "./decl-setup.js";
import type { StyledDecl } from "../transform-types.js";
import type { CssDeclarationIR, CssValuePart } from "../css-ir.js";
import { computeSelectorWarningLoc } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { cssValueToJs, literalToAst, styleKeyWithSuffix } from "../transform/helpers.js";
import { cloneAstNode } from "../utilities/jscodeshift-utils.js";
import { cssPropertyToIdentifier, makeAncestorKeyExpr, makeCssPropKey } from "./shared.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  unwrapArrowFunctionToPropsExpr,
  hasThemeAccessInArrowFn,
  buildTemplateWithStaticParts,
} from "./inline-styles.js";
import { extractStaticPartsForDecl } from "./interpolations.js";
import {
  findSupportedAtRule,
  hasUnsupportedAtRule,
  resolveMediaAtRulePlaceholders,
  setStyleObjectValue,
} from "./utils.js";
import { SHORTHAND_LONGHANDS } from "../stylex-shorthands.js";
import { processDeclarationsIntoBucket } from "./decl-bucket-resolution.js";

/**
 * Reverse mapping from physical longhand → logical shorthand that contains it.
 * E.g. `paddingRight` → `paddingInline`, `marginTop` → `marginBlock`.
 * Built once from SHORTHAND_LONGHANDS; used to resolve base values when the
 * style object uses logical shorthands but a computed-key targets a physical longhand.
 */
const PHYSICAL_TO_LOGICAL: Record<string, string> = Object.fromEntries(
  Object.values(SHORTHAND_LONGHANDS).flatMap(({ physical, logical }) => [
    [physical[0]!, logical[0]!], // Top → Block
    [physical[2]!, logical[0]!], // Bottom → Block
    [physical[1]!, logical[1]!], // Right → Inline
    [physical[3]!, logical[1]!], // Left → Inline
  ]),
);

/**
 * Returns the computed-media entry for `prop`, creating it on first access.
 * Centralises the get-or-create + default-value logic that both
 * resolvedSelectorMedia handling and sibling-selector handling need.
 */
export function getOrCreateComputedMediaEntry(prop: string, ctx: DeclProcessingState) {
  const { perPropComputedMedia, styleObj, cssHelperPropValues, getComposedDefaultValue } = ctx;
  let entry = perPropComputedMedia.get(prop);
  if (!entry) {
    const style = styleObj as Record<string, unknown>;
    // Check direct match first, then fall back to the logical shorthand
    // that covers this physical longhand (e.g. paddingRight → paddingInline).
    const existingVal = style[prop] ?? style[PHYSICAL_TO_LOGICAL[prop]!];
    const defaultValue =
      existingVal !== undefined
        ? existingVal
        : cssHelperPropValues.has(prop)
          ? getComposedDefaultValue(prop)
          : null;
    entry = { defaultValue, entries: [] };
    perPropComputedMedia.set(prop, entry);
  }
  return entry;
}

/**
 * Registers a marker for a referenced component used in cross-component
 * sibling or descendant-has selectors. Returns the marker variable name.
 */
export function registerReferencedMarker(
  styleKey: string,
  localName: string,
  state: DeclProcessingState["state"],
  ancestorSelectorParents: Set<string>,
): string {
  const markerVarName = state.siblingMarkerNames.get(styleKey) ?? `${localName}Marker`;
  state.siblingMarkerNames.set(styleKey, markerVarName);
  state.siblingMarkerParents.add(styleKey);
  ancestorSelectorParents.add(styleKey);
  return markerVarName;
}

/**
 * Resolves @media at-rules and emits computed-key entries for a set of
 * CSS declarations. Shared by sibling, cross-component sibling, and
 * descendant-has (:has()) handlers.
 *
 * Returns "break" on error (caller should bail), undefined on success.
 */
export function resolveMediaAndEmitComputedKeys(
  bucket: Record<string, unknown>,
  makeKeyExpr: () => ExpressionKind,
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
  computedMediaWarningType: import("../logger.js").WarningType,
  entryExtra?: { leadingComment: string },
): "break" | void {
  const { state, decl } = ctx;
  const { warnings } = state;

  if (hasUnsupportedAtRule(rule.atRuleStack)) {
    state.markBail();
    warnings.push({
      severity: "warning",
      type: "CSS block contains unsupported at-rule (only @media, @container, and @supports are supported; mixed nested at-rules require manual handling)",
      loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
    });
    return "break";
  }

  let media = findSupportedAtRule(rule.atRuleStack);
  if (media) {
    const resolved = resolveMediaAtRulePlaceholders(
      media,
      (slotId) => decl.templateExpressions[slotId],
      {
        lookupImport: state.resolveImportInScope,
        resolveValue: state.resolveValue,
        resolveSelector: state.resolveSelector,
        parseExpr: state.parseExpr,
        filePath: state.filePath,
        resolverImports: state.resolverImports,
      },
    );
    if (resolved === null) {
      state.markBail();
      warnings.push({
        severity: "warning",
        type: "Unsupported: media query interpolation must be a simple imported reference (expressions like `value + 1` are not supported)",
        loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
      });
      return "break";
    }
    if (resolved.kind === "static") {
      media = resolved.value;
    } else {
      state.markBail();
      warnings.push({
        severity: "warning",
        type: computedMediaWarningType,
        loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
      });
      return "break";
    }
  }

  for (const [prop, value] of Object.entries(bucket)) {
    const wrappedValue = media ? { default: null, [media]: value } : value;
    const entry = getOrCreateComputedMediaEntry(prop, ctx);
    entry.entries.push({
      keyExpr: makeKeyExpr(),
      value: wrappedValue,
      ...entryExtra,
    });
  }
}

/**
 * Handles a self-referencing general sibling selector (`& ~ &`) by processing
 * declarations and storing them as computed keys using `stylex.when.siblingBefore(':is(*)', Marker)`.
 *
 * Uses per-component `defineMarker()` (emitted in a `.stylex` sidecar file) so that
 * sibling matching is component-scoped. Without a scoped marker, `defaultMarker()` is
 * file-global and styles from one component could leak to another if both use sibling
 * selectors and appear as siblings in the same render tree.
 *
 * **`:is(*)` workaround:** The StyleX Babel plugin mandates a pseudo argument
 * starting with `:` for `siblingBefore()`. `:is(*)` is a universal match with
 * no effect on specificity or matching.
 * TODO: Remove the `:is(*)` workaround if the StyleX Babel plugin adds support
 * for no-arg `siblingBefore()` calls (currently crashes in `validatePseudoSelector`).
 *
 * Returns "break" on error to bail, otherwise the caller should `continue`.
 */
export function handleSiblingSelector(
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
): "break" | void {
  const { state, decl } = ctx;
  const { j, warnings, resolveThemeValue, resolveThemeValueFromFn, ancestorSelectorParents } =
    state;

  // Add to ancestorSelectorParents so the marker is injected into stylex.props() calls.
  // Also add to siblingMarkerParents to distinguish from forward/reverse selectors —
  // sibling markers are always needed (stylex.when.siblingBefore() references them).
  ancestorSelectorParents.add(decl.styleKey);
  state.siblingMarkerParents.add(decl.styleKey);

  // Register a per-component marker for scoped sibling matching.
  // The marker variable (e.g. "ThingMarker") is emitted as defineMarker() in a
  // sidecar .stylex file and passed as the second argument to siblingBefore().
  const markerVarName = state.siblingMarkerNames.get(decl.styleKey) ?? `${decl.localName}Marker`;
  state.siblingMarkerNames.set(decl.styleKey, markerVarName);

  // Process declarations into a temporary bucket using the shared helper
  const bucket: Record<string, unknown> = {};
  const result = processDeclarationsIntoBucket(
    rule,
    bucket,
    j,
    decl,
    resolveThemeValue,
    resolveThemeValueFromFn,
    { bailOnUnresolved: true },
  );
  if (result === "bail") {
    state.markBail();
    warnings.push({
      severity: "warning",
      type: "Unsupported selector: unresolved interpolation in sibling selector",
      loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
    });
    return "break";
  }

  // Build a fresh stylex.when.siblingBefore(':is(*)', Marker) AST node per property.
  // The second argument scopes sibling matching to the component's own marker.
  const makeSiblingKeyExpr = () =>
    j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("siblingBefore"),
      ),
      [j.literal(":is(*)"), j.identifier(markerVarName)],
    );

  return resolveMediaAndEmitComputedKeys(
    bucket,
    makeSiblingKeyExpr,
    rule,
    ctx,
    "Unsupported selector: computed media query inside sibling selector",
  );
}

/**
 * Handles a self-referencing adjacent sibling selector (`& + &`) by capturing the
 * declarations into a dedicated override style key. Later JSX analysis decides whether
 * every same-file usage site is provably adjacent; if not, the transform bails.
 */
export function handleAdjacentSiblingSelector(
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
): "break" | void {
  const { state, decl, extraStyleObjects } = ctx;
  const { j, resolveThemeValue, resolveThemeValueFromFn } = state;
  const overrideStyleKey = `${decl.styleKey}AdjacentSibling`;
  const bucket = extraStyleObjects.get(overrideStyleKey) ?? {};
  const ruleBucket: Record<string, unknown> = {};
  extraStyleObjects.set(overrideStyleKey, bucket);

  const result = processDeclarationsIntoBucket(
    rule,
    ruleBucket,
    j,
    decl,
    resolveThemeValue,
    resolveThemeValueFromFn,
    { bailOnUnresolved: true },
  );
  if (result === "bail") {
    state.markBail();
    state.warnings.push({
      severity: "warning",
      type: "Unsupported selector: unresolved interpolation in sibling selector",
      loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
    });
    return "break";
  }

  if (hasUnsupportedAtRule(rule.atRuleStack)) {
    state.markBail();
    state.warnings.push({
      severity: "warning",
      type: "CSS block contains unsupported at-rule (only @media, @container, and @supports are supported; mixed nested at-rules require manual handling)",
      loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
    });
    return "break";
  }

  let media = findSupportedAtRule(rule.atRuleStack);
  if (media) {
    const resolved = resolveMediaAtRulePlaceholders(
      media,
      (slotId) => decl.templateExpressions[slotId],
      {
        lookupImport: state.resolveImportInScope,
        resolveValue: state.resolveValue,
        resolveSelector: state.resolveSelector,
        parseExpr: state.parseExpr,
        filePath: state.filePath,
        resolverImports: state.resolverImports,
      },
    );
    if (resolved === null) {
      state.markBail();
      state.warnings.push({
        severity: "warning",
        type: "Unsupported: media query interpolation must be a simple imported reference (expressions like `value + 1` are not supported)",
        loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
      });
      return "break";
    }
    if (resolved.kind !== "static") {
      state.markBail();
      state.warnings.push({
        severity: "warning",
        type: "Unsupported selector: computed media query inside sibling selector",
        loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
      });
      return "break";
    }
    media = resolved.value;
  }

  if (media) {
    for (const [prop, value] of Object.entries(ruleBucket)) {
      const existing = bucket[prop];
      setStyleObjectValue(
        bucket,
        prop,
        existing === undefined
          ? { default: null, [media]: value }
          : { default: existing, [media]: value },
      );
    }
  } else {
    for (const [prop, value] of Object.entries(ruleBucket)) {
      setStyleObjectValue(bucket, prop, value);
    }
  }

  decl.adjacentSiblingStyleKey = overrideStyleKey;
  decl.adjacentSiblingLoc = computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector);
}

/**
 * Fallback for component selector rules with unresolvable (prop-based) interpolations.
 * Instead of bailing the entire component, emits dynamic styleFn entries that wrap
 * values in `stylex.when.ancestor()` pseudo maps.
 *
 * Handles both static declarations (emitted as ancestor-pseudo-wrapped AST nodes in the
 * component's style object) and dynamic arrow-function interpolations (emitted as
 * styleFn + styleFnFromProps entries). For shorthand declarations that expand to mixed
 * static/interpolated longhands (e.g. `border: 2px solid ${color}`), static longhands
 * become ancestor-wrapped AST entries while only interpolated longhands become dynamic
 * styleFn entries.
 *
 * Returns `true` if all declarations were handled, `false` if any cannot be processed
 * (caller should bail as before).
 */
export function tryDynamicRelationOverrideFallback(args: {
  rule: { declarations: CssDeclarationIR[] };
  decl: StyledDecl;
  ctx: DeclProcessingState;
  j: JSCodeshift;
  overrideStyleKey: string;
  ancestorPseudos: string[];
  markerVarName?: string;
}): boolean {
  const { rule, decl, ctx, j, overrideStyleKey, ancestorPseudos, markerVarName } = args;
  const { styleFnDecls, styleFnFromProps, styleObj } = ctx;
  const filePath = ctx.state.filePath;
  const avoidNames = new Set(ctx.state.importMap.keys());

  for (const d of rule.declarations) {
    if (d.value.kind === "static") {
      // Static declarations that processDeclarationsIntoBucket didn't reach
      // (after the bail point): emit as ancestor-pseudo-wrapped AST nodes in
      // the component's style object so they merge into the styleFn body.
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        if (out.value.kind === "static" && out.prop) {
          const staticVal = literalToAst(j, cssValueToJs(out.value, d.important, out.prop));
          setStyleObjectValue(
            styleObj,
            out.prop,
            buildAncestorPseudoMap(j, staticVal, ancestorPseudos, markerVarName),
          );
        }
      }
      continue;
    }

    if (d.value.kind !== "interpolated" || !d.property) {
      return false;
    }

    // Extract slots — only support single-slot interpolations for now.
    // After the kind === "interpolated" check above, d.value is guaranteed to have parts.
    const parts: CssValuePart[] = (d.value as { parts: CssValuePart[] }).parts;
    const slotParts = parts.filter(
      (p): p is CssValuePart & { kind: "slot"; slotId: number } => p.kind === "slot",
    );
    if (slotParts.length !== 1) {
      return false;
    }

    const slotPart = slotParts[0]!;
    const expr = decl.templateExpressions[slotPart.slotId] as { type?: string } | undefined;
    if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
      return false;
    }

    // Theme accesses should have been handled by processDeclarationsIntoBucket — if they
    // weren't, something unexpected happened; bail.
    if (hasThemeAccessInArrowFn(expr)) {
      return false;
    }

    const unwrapped = unwrapArrowFunctionToPropsExpr(j, expr);
    if (!unwrapped) {
      return false;
    }

    const { expr: inlineExpr, propsUsed } = unwrapped;

    const stylexDecls = cssDeclarationToStylexDeclarations(d);

    for (const out of stylexDecls) {
      if (!out.prop) {
        continue;
      }

      // Shorthand expansion can produce mixed static/interpolated longhands
      // (e.g. border: 2px solid ${color} → static borderWidth/borderStyle + interpolated borderColor).
      // Only emit dynamic styleFn entries for interpolated longhands; static ones become
      // ancestor-pseudo-wrapped AST nodes in the component's style object.
      if (out.value.kind === "static") {
        const staticVal = literalToAst(j, cssValueToJs(out.value, d.important, out.prop));
        setStyleObjectValue(
          styleObj,
          out.prop,
          buildAncestorPseudoMap(j, staticVal, ancestorPseudos, markerVarName),
        );
        continue;
      }

      // Extract prefix/suffix from the expanded output's parts (not the original declaration)
      // so shorthand expansion is respected (e.g. borderColor gets no "2px solid" prefix).
      const { prefix, suffix } = extractStaticPartsForDecl({
        property: out.prop,
        value: out.value,
      });
      const valueExpr: ExpressionKind =
        prefix || suffix ? buildTemplateWithStaticParts(j, inlineExpr, prefix, suffix) : inlineExpr;

      // Determine if the expression is a simple identity prop reference
      const isSimpleIdentity =
        propsUsed.size === 1 &&
        !prefix &&
        !suffix &&
        inlineExpr.type === "Identifier" &&
        propsUsed.has((inlineExpr as { name: string }).name);

      const jsxProp = isSimpleIdentity ? [...propsUsed][0]! : "__props";
      const fnKey = styleKeyWithSuffix(overrideStyleKey, out.prop);
      if (!styleFnDecls.has(fnKey)) {
        const outParamName =
          isSimpleIdentity && jsxProp.startsWith("$")
            ? jsxProp.slice(1)
            : cssPropertyToIdentifier(out.prop, avoidNames);
        const param = j.identifier(outParamName);
        if (isSimpleIdentity && jsxProp !== "__props") {
          ctx.annotateParamFromJsxProp(param, jsxProp);
        } else if (/\.(ts|tsx)$/.test(filePath)) {
          (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
            j.tsStringKeyword(),
          );
        }

        // Build { default: null, [stylex.when.ancestor(pseudo, marker?)]: paramExpr }
        const conditionalMap = buildAncestorPseudoMap(
          j,
          j.identifier(outParamName),
          ancestorPseudos,
          markerVarName,
        );

        const cssPropKeyNode = makeCssPropKey(j, out.prop);
        const bodyProp = j.property("init", cssPropKeyNode, conditionalMap);
        const body = j.objectExpression([bodyProp]);
        styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
      }

      if (isSimpleIdentity) {
        const isOptional = ctx.isJsxPropOptional(jsxProp);
        styleFnFromProps.push({
          fnKey,
          jsxProp,
          ...(isOptional ? {} : { condition: "always" as const }),
        });
      } else {
        styleFnFromProps.push({
          fnKey,
          jsxProp: "__props" as const,
          condition: "always" as const,
          callArg: cloneAstNode(valueExpr) as ExpressionKind,
        });
      }
    }

    for (const propName of propsUsed) {
      ensureShouldForwardPropDrop(decl, propName);
    }
  }

  decl.needsWrapperComponent = true;
  return true;
}

/**
 * Builds an AST ObjectExpression representing `{ default: null, [stylex.when.ancestor(pseudo)]: value }`.
 * Used to wrap static CSS values in ancestor pseudo maps for relation override fallback.
 */
function buildAncestorPseudoMap(
  j: JSCodeshift,
  valueNode: ExpressionKind,
  ancestorPseudos: string[],
  markerVarName?: string,
): ExpressionKind {
  const pseudoEntries = ancestorPseudos.map((pseudo) => {
    const ancestorKey = makeAncestorKeyExpr(j, pseudo, markerVarName);
    return Object.assign(j.property("init", ancestorKey, valueNode), {
      computed: true,
    });
  });
  return j.objectExpression([
    j.property("init", j.identifier("default"), j.literal(null)),
    ...pseudoEntries,
  ]);
}

export function hasPatchableDescendantJsx(
  root: { find: (...args: any[]) => { forEach: (callback: (path: any) => void) => void } },
  j: JSCodeshift,
  parentLocalName: string,
  childLocalName: string,
): boolean {
  let found = false;
  root
    .find(j.JSXOpeningElement, {
      name: { type: "JSXIdentifier", name: childLocalName },
    } as any)
    .forEach((path: any) => {
      if (found) {
        return;
      }
      let current = path.parent;
      while (current) {
        const value = current.value;
        if (
          value?.type === "JSXElement" &&
          jsxElementName(value.openingElement?.name) === parentLocalName
        ) {
          found = true;
          return;
        }
        current = current.parent;
      }
    });
  return found;
}

function jsxElementName(name: unknown): string | null {
  if (!name || typeof name !== "object") {
    return null;
  }
  const node = name as { type?: string; name?: string };
  return node.type === "JSXIdentifier" ? (node.name ?? null) : null;
}
