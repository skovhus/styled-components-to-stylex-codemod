/**
 * Processes per-rule selector logic and dispatches declarations.
 * Core concepts: selector normalization, attribute wrappers, and rule buckets.
 */
import type { DeclProcessingState } from "./decl-setup.js";
import type { StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import { computeSelectorWarningLoc } from "../css-ir.js";
import { addPropComments } from "./comments.js";
import { processRuleDeclarations } from "./process-rule-declarations.js";
import {
  normalizeSelectorForAttributePseudos,
  normalizeInterpolatedSelector,
  normalizeSpecificityHacks,
  parseSelector,
} from "../selectors.js";
import { extractRootAndPath, getNodeLocStart, isAstNode } from "../utilities/jscodeshift-utils.js";
import { SOURCE_CSS_PROPERTIES_KEY, literalToAst, toStyleKey } from "../transform/helpers.js";
import { getOrCreateRelationOverrideBucket, makeDescendantKeyExpr } from "./shared.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import { setConditionSourceOrder } from "./condition-source-order.js";
import {
  findSupportedAtRule,
  hasUnsupportedAtRule,
  isMemberExpression,
  isSupportedAtRule,
  registerImports,
  resolveMediaAtRulePlaceholders,
  setStyleObjectValue,
} from "./utils.js";
import { cssValueIsImportant } from "./important-values.js";
import {
  getFirstAncestorPseudo,
  copyWrittenPropsToRemainingAncestorPseudoBuckets,
  tryForwardCssVarBridgeForAncestorPseudos,
} from "./css-var-bridge.js";
import { processDeclarationsIntoBucket } from "./decl-bucket-resolution.js";
import {
  ELEMENT_BAIL_WARNING_MAP,
  resolveElementSelectorTarget,
  hasDynamicJsxChildren,
  hasLocalElementPseudoCollision,
} from "./element-selector-resolution.js";
import {
  tryResolveInterpolatedPseudo,
  hasEnabledCompoundPseudoSelector,
  isStylexCompilerPseudoElement,
} from "./pseudo-selectors.js";
import {
  HAS_COMPONENT_SELECTOR_STRICT_RE,
  annotateSpecificityStrippedDeclaration,
  extractParentPseudosForNestedComponentBlock,
  extractReverseSelectorPseudos,
  isCommaGroupedReverseSelectorPattern,
  resolveStaticAttributeSelectorPlaceholders,
  tagCrossFileOverride,
} from "./selector-placeholders.js";
import {
  getOrCreateComputedMediaEntry,
  handleAdjacentSiblingSelector,
  handleSiblingSelector,
  hasPatchableDescendantJsx,
  registerReferencedMarker,
  resolveMediaAndEmitComputedKeys,
  tryDynamicRelationOverrideFallback,
} from "./relation-media-overrides.js";
import { mergeAttrsStyles } from "./attrs-merge.js";

export function processDeclRules(ctx: DeclProcessingState): void {
  const {
    state,
    decl,
    styleObj,
    perPropPseudo,
    perPropMedia,
    nestedSelectors,
    variantBuckets,
    extraStyleObjects,
    styleFnDecls,
    attrBuckets,
    localVarValues,
    cssHelperPropValues,
    getComposedDefaultValue,
  } = ctx;
  const {
    j,
    root,
    warnings,
    resolverImports,
    resolveSelector,
    parseExpr,
    cssHelperNames,
    declByLocalName,
    relationOverridePseudoBuckets,
    relationOverrides,
    ancestorSelectorParents,
    resolveThemeValue,
    resolveThemeValueFromFn,
    resolveImportInScope,
  } = state;
  // Canonical resolver for a conditional style's `default` entry: a css-helper-composed
  // default if the prop has one, otherwise the wrapped base component's default, else null.
  // All conditional-default sites below go through this so the precedence lives in one place.
  const getConditionDefaultValue = (propName: string): unknown =>
    cssHelperPropValues.has(propName)
      ? getComposedDefaultValue(propName)
      : (ctx.getWrappedComponentBaseDefaultValue(propName) ?? null);

  // Bails the current declaration and records an unsupported-selector warning at the
  // selector's source location. Centralizes the markBail + warnings.push idiom used
  // throughout this file. `warnDecl` defaults to the declaration under processing but
  // can be overridden (e.g. a resolved element selector's parent component).
  const bailWithSelectorWarning = (
    type: WarningType,
    rule: (typeof decl.rules)[number],
    warnDecl: StyledDecl = decl,
  ): void => {
    state.markBail();
    warnings.push({
      severity: "warning",
      type,
      loc: computeSelectorWarningLoc(warnDecl.loc, warnDecl.rawCss, rule.selector),
    });
  };

  /**
   * Attempts to resolve an element selector (e.g., `& svg`, `& > button`) to a
   * styled component override. Returns "break" to bail, "continue" to skip to next
   * rule, or null if the selector isn't an element pattern.
   */
  const tryHandleElementSelector = (
    selectorStr: string,
    rule: (typeof decl.rules)[number],
    parentDecl: StyledDecl,
  ): "break" | "continue" | null => {
    const elementResult = resolveElementSelectorTarget(selectorStr, parentDecl, root, j);
    if (typeof elementResult === "string") {
      bailWithSelectorWarning(ELEMENT_BAIL_WARNING_MAP[elementResult], rule, parentDecl);
      return "break";
    }
    if (!elementResult) {
      return null;
    }
    const { tagName, ancestorPseudo, childPseudo, directOnly } = elementResult;

    if (rule.atRuleStack.length > 0) {
      bailWithSelectorWarning(
        "Unsupported selector: descendant/child/sibling selector",
        rule,
        parentDecl,
      );
      return "break";
    }

    if (hasDynamicJsxChildren(parentDecl.localName, root, j)) {
      bailWithSelectorWarning(ELEMENT_BAIL_WARNING_MAP["bail-dynamic"], rule, parentDecl);
      return "break";
    }
    if (
      hasLocalElementPseudoCollision(
        parentDecl.localElementOverrides ?? [],
        tagName,
        ancestorPseudo,
        childPseudo,
      )
    ) {
      bailWithSelectorWarning(ELEMENT_BAIL_WARNING_MAP["bail-pseudo-collision"], rule, parentDecl);
      return "break";
    }

    const overrideIndex = (parentDecl.localElementOverrides?.length ?? 0) + 1;
    const overrideStyleKey = `${parentDecl.styleKey}Element${overrideIndex}`;
    const pseudoForBucket = childPseudo ?? ancestorPseudo;
    const bucket: Record<string, unknown> = {};

    const result = processDeclarationsIntoBucket(
      rule,
      bucket,
      j,
      parentDecl,
      resolveThemeValue,
      resolveThemeValueFromFn,
      { bailOnUnresolved: true },
    );
    if (result === "bail") {
      bailWithSelectorWarning(
        "Unsupported selector: unresolved interpolation in element selector",
        rule,
        parentDecl,
      );
      return "break";
    }
    const pseudoBuckets = new Map<string | null, Record<string, unknown>>();
    pseudoBuckets.set(pseudoForBucket, bucket);
    parentDecl.localElementOverrides ??= [];
    parentDecl.localElementOverrides.push({
      styleKey: overrideStyleKey,
      tagName,
      relation: directOnly ? "child" : "descendant",
      ancestorPseudo,
      childPseudo,
      pseudoBuckets,
      loc: computeSelectorWarningLoc(parentDecl.loc, parentDecl.rawCss, rule.selector),
    });
    return "continue";
  };

  for (const rule of decl.rules) {
    if (state.bail) {
      break;
    }

    // Skip rules inside @keyframes blocks whose keyframes were successfully
    // extracted — these are keyframe frame selectors (e.g. "0%", "100%",
    // "from", "to") that would otherwise be misidentified as descendant/tag
    // selectors. If the keyframe was NOT extracted (e.g. it has interpolated
    // values), let it fall through so the bail logic catches the unsupported case.
    const kfAtRule = rule.atRuleStack.find((at) => at.startsWith("@keyframes "));
    if (kfAtRule) {
      const kfName = kfAtRule.replace("@keyframes ", "").trim();
      if (state.keyframesNames.has(kfName)) {
        continue;
      }
    }

    // Track resolved selector media for this rule (set by adapter.resolveSelector)
    let resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null = null;

    if (typeof rule.selector === "string") {
      const selectorWithStaticAttrs = resolveStaticAttributeSelectorPlaceholders(
        rule.selector,
        decl,
        state,
      );
      if (selectorWithStaticAttrs === null) {
        bailWithSelectorWarning(
          "Unsupported selector: unresolved interpolation in attribute selector",
          rule,
        );
        break;
      }
      rule.selector = selectorWithStaticAttrs;
    }

    // --- Unsupported complex selector detection ---
    // We bail out rather than emitting incorrect unconditional styles.
    //
    // Examples we currently cannot represent safely:
    // - Grouped selectors: `&:hover, &:focus { ... }`
    // - Compound class selectors: `&.card.highlighted { ... }`
    // - Class-conditioned rules: `&.active { ... }` (requires runtime class/prop gating)
    // - Descendant element selectors: `& a { ... }`, `& h1, & h2 { ... }`
    // - Chained pseudos like `:not(...)`
    //
    // NOTE: normalize interpolated component selectors before the complex selector checks
    // to avoid skipping bails for selectors like `${Other} .child &`.
    if (typeof rule.selector === "string") {
      // Normalize specificity hacks (&&) before any selector analysis.
      // Only double-ampersand is collapsed; triple-or-more (&&&) bails.
      const specificityResult = normalizeSpecificityHacks(rule.selector);
      if (specificityResult.hasHigherTier) {
        bailWithSelectorWarning(
          "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX",
          rule,
        );
        break;
      }
      if (specificityResult.wasStripped && decl.base.kind === "component") {
        bailWithSelectorWarning(
          "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX",
          rule,
        );
        break;
      }
      const selectorForAnalysis = specificityResult.normalized;
      const s = normalizeInterpolatedSelector(selectorForAnalysis).trim();
      const hasComponentExpr = rule.selector.includes("__SC_EXPR_");
      const hasInterpolatedPseudo = /:[^\s{]*__SC_EXPR_\d+__/.test(selectorForAnalysis);
      // &:has(${Component}) has a placeholder inside :has() — not an interpolated pseudo.
      // Skip the interpolated-pseudo handler so it reaches the component selector path.
      const isHasComponentSelector = HAS_COMPONENT_SELECTOR_STRICT_RE.test(selectorForAnalysis);

      if (hasInterpolatedPseudo && !isHasComponentSelector) {
        annotateSpecificityStrippedDeclaration(rule.selector, rule.declarations[0]);

        // Handle interpolated pseudo selectors like `&:${highlight}`.
        // Also supports prefix pseudo-classes before the interpolation,
        // e.g., `&:not(:disabled):${highlight}` → prefixPseudo = ":not(:disabled)".
        // Limitation: the `\([^)]*\)` group does not handle nested parentheses,
        // so patterns like `&:not(:nth-child(2n+1)):${expr}` won't match.
        // Uses `selectorForAnalysis` so that `&&:${expr}` (specificity hack) is accepted
        // after being normalized to `&:__SC_EXPR_N__`.
        const pseudoSlotMatch = selectorForAnalysis.match(
          /^&((?::[a-zA-Z][a-zA-Z0-9-]*(?:\([^)]*\))?)*):__SC_EXPR_(\d+)__\s*$/,
        );
        if (!pseudoSlotMatch) {
          bailWithSelectorWarning("Unsupported selector: interpolated pseudo selector", rule);
          break;
        }

        const prefixPseudo = pseudoSlotMatch[1] || null; // e.g. ":not(:disabled)" or null
        const pseudoSlotId = Number(pseudoSlotMatch[2]);
        const pseudoSlotExpr = decl.templateExpressions[pseudoSlotId];

        const pseudoResolved = tryResolveInterpolatedPseudo(
          pseudoSlotExpr,
          rule,
          ctx,
          prefixPseudo,
        );

        if (pseudoResolved === "bail") {
          bailWithSelectorWarning("Unsupported selector: interpolated pseudo selector", rule);
          break;
        }

        // pseudoAlias and media both handled all declarations —
        // skip remaining rule processing for this rule.
        continue;
      }

      if (hasEnabledCompoundPseudoSelector(s)) {
        bailWithSelectorWarning("Unsupported selector: compound pseudo selector", rule);
        break;
      }

      // Component selector patterns that have special handling below:
      // 1. `${Other}:pseudo &` - ancestor pseudo via descendant combinator (space only)
      // 1c: `${Other} &` - ancestor without pseudo (no-pseudo reverse)
      // 2. `&:pseudo ${Child}` or just `& ${Child}` - parent styling descendant child
      // 3. `${Link}:pseudo + &` or `~ &` - cross-component sibling combinator
      // Other component selector patterns (like `${Other} .child`) should bail.
      const selectorTrimmed = selectorForAnalysis.trim();
      const isHandledComponentPattern =
        hasComponentExpr && // Pattern 1: `__SC_EXPR_N__:pseudo &` — descendant combinator only (space, no +~>)
        (/^__SC_EXPR_\d+__:[a-z][a-z0-9()-]*\s+&\s*$/.test(selectorTrimmed) ||
          // Pattern 1b: comma-separated reverse selectors where each part matches Pattern 1
          // e.g., `__SC_EXPR_0__:focus-visible &, __SC_EXPR_1__:active &`
          isCommaGroupedReverseSelectorPattern(selectorTrimmed) ||
          // Pattern 1c: no-pseudo reverse: `${Other} &` (component as ancestor, no pseudo condition)
          /^__SC_EXPR_\d+__\s+&\s*$/.test(selectorTrimmed) ||
          // Pattern 2: starts with & (forward descendant/pseudo pattern)
          selectorTrimmed.startsWith("&") ||
          // Pattern 3: standalone component selector `${Child} { ... }`
          /^__SC_EXPR_\d+__\s*\{/.test(selectorTrimmed) ||
          // Pattern 4: cross-component sibling: `${Link}:pseudo + &` or `~ &`
          /^__SC_EXPR_\d+__:[a-z][a-z0-9()-]*\s*[+~]\s*&\s*$/.test(selectorTrimmed) ||
          // Pattern 5: descendant-has: `&:has(${Component})`
          HAS_COMPONENT_SELECTOR_STRICT_RE.test(selectorTrimmed));

      // Use heuristic-based bail checks. We need to allow:
      // - Component selectors that have special handling
      // - Attribute selectors (have special handling for input type, href, etc.)
      // Note: Specificity hacks (&&, &&&) bail early in transform.ts

      // Check for descendant pseudo selectors BEFORE normalization collapses them.
      // "& :not(:disabled)" (with space) targets descendants, not the component itself.
      // normalizeInterpolatedSelector would collapse this to "&:not(:disabled)" which
      // has completely different semantics. We must bail on these patterns.
      if (/&\s+:/.test(rule.selector)) {
        bailWithSelectorWarning(
          "Unsupported selector: descendant pseudo selector (space before pseudo)",
          rule,
        );
        break;
      }

      if (s.includes(",") && !isHandledComponentPattern) {
        // Comma-separated selectors: bail unless ALL parts are valid pseudo-selectors
        // or pseudo-elements. Ancestor attribute selectors (`[attr] &`) resolve to
        // `:is([attr] *)` pseudos, so they satisfy the `pseudo` check below.
        const parsed = parseSelector(s);
        if (parsed.kind !== "pseudo" && parsed.kind !== "pseudoElements") {
          bailWithSelectorWarning(
            "Unsupported selector: comma-separated selectors must all be simple pseudos or pseudo-elements",
            rule,
          );
          break;
        }
      } else if (/&\.[a-zA-Z0-9_-]+/.test(s)) {
        // Class selector on same element like &.active
        // Note: Specificity hacks (&&, &&&) bail early in transform.ts
        bailWithSelectorWarning("Unsupported selector: class selector", rule);
        break;
      } else if (/[+~]/.test(s) && !isHandledComponentPattern) {
        // General-sibling selectors (`~`) can map to siblingBefore(). Adjacent sibling
        // selectors (`+`) are only supported when later JSX analysis can prove exact
        // same-file adjacency for every use site.
        if (/^&\s*[+~]\s*&$/.test(s)) {
          if (/\+/.test(s)) {
            const adjacentAction = handleAdjacentSiblingSelector(rule, ctx);
            if (adjacentAction === "break") {
              break;
            }
            continue;
          }
          const siblingAction = handleSiblingSelector(rule, ctx);
          if (siblingAction === "break") {
            break;
          }
          continue;
        }
        bailWithSelectorWarning(
          /\+/.test(s)
            ? "Unsupported selector: adjacent sibling combinator"
            : "Unsupported selector: sibling combinator",
          rule,
        );
        break;
      } else if (/\s+[a-zA-Z.#]/.test(s) && !isHandledComponentPattern) {
        // Before bailing on descendant selectors, try to resolve element selectors
        // like `& svg`, `& > button`, `&:hover svg`, `& svg:hover` to a styled component
        // in the same file. If resolved, we can transform them to relation overrides.
        const elementAction = tryHandleElementSelector(s, rule, decl);
        if (elementAction === "break") {
          break;
        }
        if (elementAction === "continue") {
          continue;
        }

        // Fall through to existing bail for descendant selectors
        bailWithSelectorWarning("Unsupported selector: descendant/child/sibling selector", rule);
        break;
      }
    }

    // Component selector emulation and other rule handling continues...
    // NOTE: This function intentionally mirrors existing logic from `transform.ts`.

    if (typeof rule.selector === "string" && rule.selector.includes("__SC_EXPR_")) {
      const slotMatch = rule.selector.match(PLACEHOLDER_RE);
      const slotId = slotMatch ? Number(slotMatch[1]) : null;
      const slotExpr = slotId !== null ? (decl.templateExpressions[slotId] as any) : null;
      const otherLocal = slotExpr?.type === "Identifier" ? (slotExpr.name as string) : null;
      const isCssHelperPlaceholder = !!otherLocal && cssHelperNames.has(otherLocal);

      const selTrim2 = rule.selector.trim();
      // Use specificity-normalized selector for :has() detection (e.g. &&:has → &:has)
      const normalizedSel2 = normalizeSpecificityHacks(selTrim2).normalized;
      const isHasPattern = HAS_COMPONENT_SELECTOR_STRICT_RE.test(normalizedSel2);

      // `${Other}:pseudo &` (Icon reacting to ancestor hover/focus/etc.)
      // This is the inverse of `&:pseudo ${Child}` — the declaring component is the child,
      // and the referenced component is the ancestor.
      //
      // The selector MUST be: `__SC_EXPR_N__:pseudo <space> &` (descendant combinator only).
      // Reject non-descendant combinators like `+`, `~`, `>` (e.g., `${Link}:focus + &`).
      //
      // Also supports comma-grouped patterns like `${Link}:focus-visible &, ${Link}:active &`,
      // where each part references the same component with a different pseudo — the same
      // declarations are registered under multiple pseudo buckets.
      const isReverseSelectorPattern =
        selTrim2.startsWith("__SC_EXPR_") &&
        /^__SC_EXPR_\d+__:[a-z][a-z0-9()-]*\s+&\s*$/.test(selTrim2);
      const isGroupedReverseSelectorPattern =
        !isReverseSelectorPattern &&
        selTrim2.startsWith("__SC_EXPR_") &&
        isCommaGroupedReverseSelectorPattern(selTrim2);
      // `${Other} &` — no pseudo, component as ancestor. Requires a scoped defineMarker()
      // since defaultMarker() would match ANY ancestor, not just Other.
      const isNoPseudoReversePattern =
        !isReverseSelectorPattern &&
        !isGroupedReverseSelectorPattern &&
        selTrim2.startsWith("__SC_EXPR_") &&
        /^__SC_EXPR_\d+__\s+&\s*$/.test(selTrim2);
      if (
        otherLocal &&
        !isCssHelperPlaceholder &&
        (isReverseSelectorPattern || isGroupedReverseSelectorPattern || isNoPseudoReversePattern)
      ) {
        // For grouped selectors, verify ALL slot IDs resolve to the same component.
        // Without this guard, `${Link}:focus &, ${Button}:active &` would silently
        // attribute all pseudos to Link (the first match).
        if (isGroupedReverseSelectorPattern) {
          const allSlotMatches = [...selTrim2.matchAll(new RegExp(PLACEHOLDER_RE.source, "g"))];
          const allLocal = allSlotMatches.map((m) => {
            const id = Number(m[1]);
            const expr = decl.templateExpressions[id] as
              | { type?: string; name?: string }
              | undefined;
            return expr?.type === "Identifier" ? expr.name : null;
          });
          const hasDifferentComponents = allLocal.some((name) => name !== otherLocal);
          if (hasDifferentComponents) {
            bailWithSelectorWarning(
              "Unsupported selector: grouped reverse selector references different components",
              rule,
            );
            break;
          }
        }

        const parentDecl = declByLocalName.get(otherLocal);
        const crossFileParent = !parentDecl
          ? state.crossFileSelectorsByLocal.get(otherLocal)
          : undefined;
        if (!parentDecl && !crossFileParent) {
          bailWithSelectorWarning("Unsupported selector: unknown component selector", rule);
          break;
        }

        // Extract all ancestor pseudos (one per comma-separated part).
        // For no-pseudo reverse (`${Other} &`), use `:is(*)` as synthetic always-matching
        // pseudo so the style is conditional on the marker, not unconditional.
        const ancestorPseudos = isNoPseudoReversePattern
          ? [":is(*)"]
          : extractReverseSelectorPseudos(rule.selector);
        if (ancestorPseudos.length === 0) {
          bailWithSelectorWarning("Unsupported selector: unknown component selector", rule);
          break;
        }

        // Declare self as child, referenced component as ancestor parent.
        // For cross-file parents, use the JSX-targeted local binding for style keys
        // to avoid collisions when both an aliased bridge import and a local component
        // of the same canonical name exist in one file.
        const jsxParentName = crossFileParent?.bridgeComponentLocalName ?? otherLocal;
        const parentStyleKey = parentDecl ? parentDecl.styleKey : toStyleKey(jsxParentName);
        const overrideStyleKey = `${toStyleKey(decl.localName)}In${jsxParentName}`;
        ancestorSelectorParents.add(parentStyleKey);

        // Register a defineMarker for the parent:
        // - Cross-file reverse always needs a marker
        // - No-pseudo reverse needs a scoped marker (defaultMarker() would be too broad)
        const needsScopedMarker = isNoPseudoReversePattern || !!crossFileParent;
        const reverseMarkerVarName = needsScopedMarker ? `${jsxParentName}Marker` : undefined;

        // For no-pseudo reverse with same-file parent, register the marker through
        // the sibling marker mechanism (feeds into crossFileMarkers → sidecar generation).
        if (isNoPseudoReversePattern && !crossFileParent && reverseMarkerVarName) {
          state.siblingMarkerNames.set(parentStyleKey, reverseMarkerVarName);
          state.siblingMarkerParents.add(parentStyleKey);
        }

        const overrideCountBeforeReverse = relationOverrides.length;
        // Process declarations once, then register into each pseudo bucket
        const firstBucket = getOrCreateRelationOverrideBucket(
          overrideStyleKey,
          parentStyleKey,
          decl.styleKey,
          ancestorPseudos[0]!,
          relationOverrides,
          relationOverridePseudoBuckets,
          decl.extraStyleKeys,
        );

        // Tag newly-created relation override as cross-file (reverse direction)
        tagCrossFileOverride(
          relationOverrides,
          overrideCountBeforeReverse,
          reverseMarkerVarName,
          jsxParentName,
        );

        // For same-file no-pseudo reverse, set markerVarName on the override so
        // finalizeRelationOverrides emits stylex.when.ancestor(":is(*)", Marker).
        // This must also handle pre-existing overrides (e.g., when ${Parent}:hover &
        // created the override earlier and ${Parent} & now targets the same key).
        if (isNoPseudoReversePattern && !crossFileParent && reverseMarkerVarName) {
          const matchingOverride = relationOverrides.find(
            (o) => o.overrideStyleKey === overrideStyleKey,
          );
          if (matchingOverride) {
            matchingOverride.markerVarName = reverseMarkerVarName;
          }
        }

        const result = processDeclarationsIntoBucket(
          rule,
          firstBucket,
          j,
          decl,
          resolveThemeValue,
          resolveThemeValueFromFn,
          { bailOnUnresolved: true },
        );
        if (result === "bail") {
          // Clear partially-processed entries from the firstBucket before
          // attempting the dynamic fallback.  processDeclarationsIntoBucket may
          // have written some static declarations before encountering the
          // unresolvable interpolation that caused the bail.  The fallback
          // re-processes ALL declarations itself, so stale entries in the
          // bucket would create duplicate outputs in finalizeRelationOverrides.
          for (const key of Object.keys(firstBucket)) {
            delete firstBucket[key];
          }

          // Try dynamic style fallback before bailing: if the unresolved
          // interpolations are prop-based arrow functions, we can emit styleFn
          // entries with ancestor pseudo wrapping instead.
          const dynamicHandled = tryDynamicRelationOverrideFallback({
            rule,
            decl,
            ctx,
            j,
            overrideStyleKey,
            ancestorPseudos,
            markerVarName: reverseMarkerVarName,
          });
          if (!dynamicHandled) {
            bailWithSelectorWarning(
              "Unsupported selector: unresolved interpolation in reverse component selector",
              rule,
            );
            break;
          }
          continue;
        }

        copyWrittenPropsToRemainingAncestorPseudoBuckets({
          ctx,
          ancestorPseudos,
          sourceBucket: firstBucket,
          writtenProps: result,
          overrideStyleKey,
          parentStyleKey,
          childStyleKey: decl.styleKey,
          childExtraStyleKeys: decl.extraStyleKeys,
        });

        continue;
      }

      // `${Child}` / `&:hover ${Child}` / `&:focus-visible ${Child}` (Parent styling a descendant child)
      // Also handle standalone `__SC_EXPR_N__` selectors (no `&` prefix) which Stylis
      // produces when the component selector is used without `&` in the template.
      if (
        otherLocal &&
        !isCssHelperPlaceholder &&
        !/[+~]\s*&/.test(selTrim2) &&
        /__SC_EXPR_\d+__:[a-z-]+(?:\([^)]*\))?/i.test(selTrim2)
      ) {
        bailWithSelectorWarning("Unsupported selector: component selector with child pseudo", rule);
        break;
      }
      const isComponentSelectorPattern =
        selTrim2.startsWith("&") || /^__SC_EXPR_\d+__$/.test(selTrim2);
      if (otherLocal && !isCssHelperPlaceholder && isComponentSelectorPattern && !isHasPattern) {
        const childDecl = declByLocalName.get(otherLocal);
        const crossFileUsage = !childDecl
          ? state.crossFileSelectorsByLocal.get(otherLocal)
          : undefined;
        // Extract the actual pseudo-selector (e.g., ":hover", ":focus-visible").
        // Stylis flattens nested grouped selectors like
        // `&:hover, &:focus { ${Child} { ... } }` into a standalone
        // `__SC_EXPR_N__` rule, so recover the parent pseudos from raw CSS.
        const pseudoMatch = rule.selector.match(/&(:[a-z-]+(?:\([^)]*\))?)/i);
        const ancestorPseudos =
          pseudoMatch?.[1] ??
          (slotId !== null
            ? extractParentPseudosForNestedComponentBlock(decl.rawCss, slotId)
            : null);
        if (!childDecl && !crossFileUsage) {
          bailWithSelectorWarning("Unsupported selector: unknown component selector", rule);
          break;
        }

        // For cross-file selectors, the child's style key is synthetic (just the local name
        // lowered to a style key). The override style objects will be applied to the
        // imported component via JSX spread in rewrite-jsx.
        // For bridge GlobalSelector usages, use the JSX-targeted local binding (not the
        // canonical component name) for style keys to avoid collisions when both an aliased
        // bridge import and a local component of the same canonical name exist in one file.
        const jsxLocalName = crossFileUsage?.bridgeComponentLocalName ?? otherLocal;

        // The JSX rewrite step can only apply descendant/component selector overrides
        // when the selected child JSX appears under this styled parent in the same file.
        // Otherwise the generated override style object is dead code.
        if (
          !decl.isCssHelper &&
          !hasPatchableDescendantJsx(root, j, decl.localName, jsxLocalName)
        ) {
          bailWithSelectorWarning(
            "Unsupported selector: component selector target has no patchable JSX usage under selector parent",
            rule,
          );
          break;
        }

        const childStyleKey = childDecl ? childDecl.styleKey : toStyleKey(jsxLocalName);
        const overrideStyleKey = `${toStyleKey(jsxLocalName)}In${decl.localName}`;
        ancestorSelectorParents.add(decl.styleKey);

        // For cross-file, compute the marker variable name (stored on RelationOverride,
        // derived into crossFileMarkers map by lowerRules after processing completes)
        const markerVarName = crossFileUsage ? `${decl.localName}Marker` : undefined;

        // getOrCreateRelationOverrideBucket creates the RelationOverride entry on first
        // call for this overrideStyleKey. Track count to detect new entries.
        // For grouped parent pseudos (`&:hover, &:focus-within ${Child}`), seed the
        // first pseudo's bucket — not the null/base bucket — so an earlier
        // `${Child} { ... }` base rule's values aren't overwritten.
        const overrideCountBefore = relationOverrides.length;
        const firstAncestorPseudo = getFirstAncestorPseudo(ancestorPseudos);
        const bucket = getOrCreateRelationOverrideBucket(
          overrideStyleKey,
          decl.styleKey,
          childStyleKey,
          firstAncestorPseudo,
          relationOverrides,
          relationOverridePseudoBuckets,
        );

        // Tag newly-created relation override as cross-file
        tagCrossFileOverride(relationOverrides, overrideCountBefore, markerVarName, jsxLocalName);

        const forwardResult = processDeclarationsIntoBucket(
          rule,
          bucket,
          j,
          decl,
          resolveThemeValue,
          resolveThemeValueFromFn,
          { bailOnUnresolved: true },
        );
        if (forwardResult === "bail") {
          // Try CSS variable bridge: forward prop-based interpolations via CSS custom
          // properties set on the parent component's inline style.
          if (
            !crossFileUsage &&
            tryForwardCssVarBridgeForAncestorPseudos({
              ctx,
              rule,
              firstBucket: bucket,
              overrideStyleKey,
              childStyleKey,
              ancestorPseudos,
              firstAncestorPseudo,
            })
          ) {
            continue;
          }
          bailWithSelectorWarning(
            crossFileUsage
              ? "Unsupported selector: unresolved interpolation in cross-file component selector"
              : "Unsupported selector: unresolved interpolation in descendant component selector",
            rule,
          );
          break;
        }

        if (Array.isArray(ancestorPseudos)) {
          copyWrittenPropsToRemainingAncestorPseudoBuckets({
            ctx,
            ancestorPseudos,
            sourceBucket: bucket,
            writtenProps: forwardResult,
            overrideStyleKey,
            parentStyleKey: decl.styleKey,
            childStyleKey,
          });
        }
        continue;
      }

      // Cross-component sibling: `${Link}:focus-visible + &` or `${Link}:active ~ &`
      // The declaring component reacts when the referenced component is its sibling.
      // Uses stylex.when.siblingBefore(":pseudo", ReferencedMarker).
      const crossComponentSiblingMatch = otherLocal
        ? selTrim2.match(/^__SC_EXPR_\d+__:([a-z][a-z0-9()-]*)\s*([+~])\s*&\s*$/)
        : null;
      if (otherLocal && !isCssHelperPlaceholder && crossComponentSiblingMatch) {
        const siblingPseudo = `:${crossComponentSiblingMatch[1]}`;
        const combinator = crossComponentSiblingMatch[2] as "+" | "~";

        if (combinator === "+") {
          bailWithSelectorWarning("Unsupported selector: adjacent sibling combinator", rule);
          break;
        }

        const referencedDecl = declByLocalName.get(otherLocal);
        if (!referencedDecl) {
          // Cross-file cross-component sibling selectors are not yet supported:
          // the marker infrastructure for imported components requires relation-override
          // metadata that rewrite-jsx uses to patch JSX by element name. Without this,
          // the marker would never be injected into the imported component's JSX.
          bailWithSelectorWarning("Unsupported selector: unknown component selector", rule);
          break;
        }

        // Register marker for the referenced component
        const refMarkerVarName = registerReferencedMarker(
          referencedDecl.styleKey,
          otherLocal,
          state,
          ancestorSelectorParents,
        );

        // Process declarations into a temporary bucket
        const sibBucket: Record<string, unknown> = {};
        const sibResult = processDeclarationsIntoBucket(
          rule,
          sibBucket,
          j,
          decl,
          resolveThemeValue,
          resolveThemeValueFromFn,
          { bailOnUnresolved: true },
        );
        if (sibResult === "bail") {
          bailWithSelectorWarning(
            "Unsupported selector: unresolved interpolation in cross-component sibling selector",
            rule,
          );
          break;
        }

        // Build stylex.when.siblingBefore(':pseudo', Marker) per property
        const makeSiblingKeyExpr = () =>
          j.callExpression(
            j.memberExpression(
              j.memberExpression(j.identifier("stylex"), j.identifier("when")),
              j.identifier("siblingBefore"),
            ),
            [j.literal(siblingPseudo), j.identifier(refMarkerVarName)],
          );

        const emitResult = resolveMediaAndEmitComputedKeys(
          sibBucket,
          makeSiblingKeyExpr,
          rule,
          ctx,
          "Unsupported selector: computed media query inside cross-component sibling selector",
        );
        if (emitResult === "break") {
          break;
        }
        continue;
      }

      // Descendant-has: `&:has(${Component})` — style self when containing a specific descendant.
      // Uses stylex.when.descendant(ComponentMarker).
      if (otherLocal && !isCssHelperPlaceholder && isHasPattern) {
        const referencedDecl = declByLocalName.get(otherLocal);
        if (!referencedDecl) {
          bailWithSelectorWarning(
            "Unsupported selector: cross-file :has() component selector not yet supported",
            rule,
          );
          break;
        }

        // Register marker for the referenced (child) component
        const refMarkerVarName = registerReferencedMarker(
          referencedDecl.styleKey,
          otherLocal,
          state,
          ancestorSelectorParents,
        );

        // Process declarations into a temporary bucket
        const hasBucket: Record<string, unknown> = {};
        const hasResult = processDeclarationsIntoBucket(
          rule,
          hasBucket,
          j,
          decl,
          resolveThemeValue,
          resolveThemeValueFromFn,
          { bailOnUnresolved: true },
        );
        if (hasResult === "bail") {
          bailWithSelectorWarning(
            "Unsupported selector: unresolved interpolation in :has() component selector",
            rule,
          );
          break;
        }

        const hasEmitResult = resolveMediaAndEmitComputedKeys(
          hasBucket,
          () => makeDescendantKeyExpr(j, refMarkerVarName),
          rule,
          ctx,
          "Unsupported selector: computed media query inside :has() component selector",
        );
        if (hasEmitResult === "break") {
          break;
        }
        continue;
      }

      // Selector interpolation that's a MemberExpression (e.g., screenSize.phone)
      // Try to resolve it via the adapter as a media query helper.
      if (!otherLocal && slotExpr && isMemberExpression(slotExpr)) {
        const info = extractRootAndPath(slotExpr);
        const identifierDesc = info
          ? info.path.length > 0
            ? `${info.rootName}.${info.path.join(".")}`
            : info.rootName
          : "unknown expression";

        // Try to resolve via adapter
        let resolved = false;
        if (info) {
          const imp = resolveImportInScope(info.rootName, info.rootNode);
          if (imp) {
            const selectorResult = resolveSelector({
              kind: "selectorInterpolation",
              importedName: imp.importedName,
              source: imp.source,
              path: info.path.length > 0 ? info.path.join(".") : undefined,
              filePath: state.filePath,
              loc: getNodeLocStart(slotExpr) ?? undefined,
            });

            if (selectorResult && selectorResult.kind === "media") {
              // Store the resolved media expression for this rule
              const mediaExpr = parseExpr(selectorResult.expr);
              if (mediaExpr) {
                resolvedSelectorMedia = {
                  keyExpr: mediaExpr,
                  exprSource: selectorResult.expr,
                };
                // Add required imports
                registerImports(selectorResult.imports, resolverImports);
                resolved = true;
              }
            }
          }
        }

        if (!resolved) {
          // Bail: adapter couldn't resolve this selector interpolation
          state.markBail();
          warnings.push({
            severity: "error",
            type: "Unsupported selector interpolation: imported value in selector position",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
            context: { selector: rule.selector, expression: identifierDesc },
          });
          break;
        }
      }
    }

    let media = findSupportedAtRule(rule.atRuleStack);
    if (hasUnsupportedAtRule(rule.atRuleStack)) {
      bailWithSelectorWarning(
        "CSS block contains unsupported at-rule (only @media, @container, and @supports are supported; mixed nested at-rules require manual handling)",
        rule,
      );
      break;
    }

    const intrinsicTagName = decl.base.kind === "intrinsic" ? decl.base.tagName : null;
    let selector = normalizeSelectorForAttributePseudos(rule.selector, intrinsicTagName);
    selector = normalizeInterpolatedSelector(selector);
    // Normalize specificity hacks (&&) to base selector (&).
    // Higher tiers (&&&) are caught in the heuristic check above.
    const { normalized: selectorNormalized, wasStripped: specificityStripped } =
      normalizeSpecificityHacks(selector);
    selector = selectorNormalized;

    // When a specificity hack is stripped, annotate the first declaration so the
    // output includes a comment explaining the change.
    if (specificityStripped && rule.declarations.length > 0) {
      annotateSpecificityStrippedDeclaration(rule.selector, rule.declarations[0]);
    }

    if (!media && isSupportedAtRule(selector.trim())) {
      media = selector.trim();
      selector = "&";
    }

    // Resolve __SC_EXPR_N__ placeholders inside the media query
    if (media) {
      const resolved = resolveMediaAtRulePlaceholders(
        media,
        (slotId) => decl.templateExpressions[slotId],
        {
          lookupImport: resolveImportInScope,
          resolveValue: state.resolveValue,
          resolveSelector,
          parseExpr,
          filePath: state.filePath,
          resolverImports,
        },
      );
      if (resolved === null) {
        bailWithSelectorWarning(
          "Unsupported: media query interpolation must be a simple imported reference (expressions like `value + 1` are not supported)",
          rule,
        );
        break;
      }
      if (resolved.kind === "static") {
        media = resolved.value;
      } else {
        resolvedSelectorMedia = { keyExpr: resolved.keyExpr, exprSource: "" };
        media = undefined;
      }
    }

    // Support comma-separated pseudo-selectors like "&:hover, &:focus"
    // and chained pseudo-selectors like "&:focus:not(:disabled)"
    const parsedSelector = parseSelector(selector);

    // Bail on unsupported selectors that weren't caught by the heuristic checks above.
    // The heuristic regex checks may miss cases where Stylis normalizes selectors differently
    // (e.g., `& > button[disabled]` becomes `&>button[disabled]` after form-feed stripping).
    if (
      parsedSelector.kind === "unsupported" &&
      selector !== "&" &&
      !rule.selector.includes("__SC_EXPR_")
    ) {
      // Try element selector resolution as a last resort before bailing
      const elementAction = tryHandleElementSelector(selector, rule, decl);
      if (elementAction === "break") {
        break;
      }
      if (elementAction === "continue") {
        continue;
      }

      bailWithSelectorWarning("Unsupported selector: descendant/child/sibling selector", rule);
      break;
    }

    const pseudos =
      parsedSelector.kind === "pseudo"
        ? parsedSelector.pseudos
        : parsedSelector.kind === "pseudoElementWithPseudo"
          ? parsedSelector.pseudos
          : null;
    const pseudoElement =
      parsedSelector.kind === "pseudoElement"
        ? parsedSelector.element
        : parsedSelector.kind === "pseudoElementWithPseudo"
          ? parsedSelector.element
          : null;
    const pseudoElementsList =
      parsedSelector.kind === "pseudoElements" ? parsedSelector.elements : null;

    const pseudoElementsToValidate = pseudoElement ? [pseudoElement] : pseudoElementsList;
    if (pseudoElementsToValidate?.some((pe) => !isStylexCompilerPseudoElement(pe))) {
      bailWithSelectorWarning("Unsupported selector: unsupported pseudo-element", rule);
      break;
    }

    const attrSel =
      parsedSelector.kind === "attribute"
        ? {
            kind: parsedSelector.attr.type,
            suffix: parsedSelector.attr.suffix,
            pseudoElement: parsedSelector.attr.pseudoElement,
          }
        : null;
    const attrWrapperKind =
      decl.base.kind === "intrinsic" && decl.base.tagName === "input"
        ? "input"
        : decl.base.kind === "intrinsic" && decl.base.tagName === "a"
          ? "link"
          : null;
    const isAttrRule = !!attrSel && !!attrWrapperKind;
    let attrTarget: Record<string, unknown> | null = null;
    let attrPseudoElement: string | null = null;

    // Bail when an attribute selector is recognized but the element type doesn't
    // support attr wrappers (e.g., [readonly] on <textarea>). Without this check,
    // the declarations would fall through unconditionally into the base style object.
    if (attrSel && !attrWrapperKind) {
      bailWithSelectorWarning(
        "Unsupported selector: attribute selector on unsupported element",
        rule,
      );
      break;
    }

    if (isAttrRule && attrSel && attrWrapperKind) {
      decl.needsWrapperComponent = true;
      decl.attrWrapper ??= { kind: attrWrapperKind };
      const suffix = attrSel.suffix;
      const attrTargetStyleKey = `${decl.styleKey}${suffix}`;
      attrTarget = attrBuckets.get(attrTargetStyleKey) ?? {};
      attrBuckets.set(attrTargetStyleKey, attrTarget);
      attrPseudoElement = attrSel.pseudoElement ?? null;

      if (attrWrapperKind === "input") {
        if (attrSel.kind === "typeCheckbox") {
          decl.attrWrapper.checkboxKey = attrTargetStyleKey;
        } else if (attrSel.kind === "typeRadio") {
          decl.attrWrapper.radioKey = attrTargetStyleKey;
        } else if (attrSel.kind === "readonly") {
          decl.attrWrapper.readonlyKey = attrTargetStyleKey;
        }
      } else if (attrWrapperKind === "link") {
        if (attrSel.kind === "targetBlankAfter") {
          decl.attrWrapper.externalKey = attrTargetStyleKey;
        } else if (attrSel.kind === "hrefStartsHttps") {
          decl.attrWrapper.httpsKey = attrTargetStyleKey;
        } else if (attrSel.kind === "hrefEndsPdf") {
          decl.attrWrapper.pdfKey = attrTargetStyleKey;
        }
      }
    }

    const wrapStyleConditionValue = (
      target: Record<string, unknown>,
      prop: string,
      conditionKey: string,
      conditionValue: unknown,
    ): void => {
      const current = target[prop];
      if (
        current &&
        typeof current === "object" &&
        !Array.isArray(current) &&
        !isAstNode(current)
      ) {
        const map = current as Record<string, unknown>;
        if (!("default" in map)) {
          map.default = getConditionDefaultValue(prop);
        }
        map[conditionKey] = conditionValue;
        return;
      }
      setStyleObjectValue(target, prop, {
        default: current ?? getConditionDefaultValue(prop),
        [conditionKey]: conditionValue,
      });
    };

    const patchStyleFnConditionValue = (
      prop: string,
      conditionKey: string,
      conditionValue: unknown,
    ): void => {
      for (const fn of styleFnDecls.values()) {
        const body = (fn as { body?: unknown }).body;
        if (
          !body ||
          typeof body !== "object" ||
          (body as { type?: string }).type !== "ObjectExpression"
        ) {
          continue;
        }
        const properties = (body as { properties?: unknown[] }).properties ?? [];
        for (const property of properties) {
          if (!property || typeof property !== "object") {
            continue;
          }
          const propNode = property as {
            key?: { type?: string; name?: string; value?: unknown };
            value?: unknown;
          };
          const key = propNode.key;
          const keyName =
            key?.type === "Identifier"
              ? key.name
              : key?.type === "Literal" || key?.type === "StringLiteral"
                ? String(key.value)
                : null;
          if (keyName !== prop || propNode.value === undefined) {
            continue;
          }
          propNode.value = j.objectExpression([
            j.property("init", j.identifier("default"), propNode.value as any),
            j.property("init", j.literal(conditionKey), literalToAst(j, conditionValue)),
          ]);
        }
      }
    };

    const patchEarlierDynamicConditionValues = (
      prop: string,
      conditionKey: string,
      conditionValue: unknown,
    ): void => {
      for (const bucket of variantBuckets.values()) {
        if (Object.hasOwn(bucket, prop)) {
          wrapStyleConditionValue(bucket, prop, conditionKey, conditionValue);
        }
      }
      patchStyleFnConditionValue(prop, conditionKey, conditionValue);
    };

    /**
     * A base-scope declaration later in the CSS overrides any earlier conditional
     * assignment of the same property — within one styled template the generated
     * class contains both declarations, and the last one wins regardless of the
     * runtime condition. Drop the dead base-scope value from earlier variant
     * buckets so the emitted variant (applied after the base style in
     * stylex.props) cannot incorrectly win. Condition-scoped values (pseudo/media
     * maps) only lose their `default` layer.
     *
     * Exception: an earlier `!important` conditional value still wins over a later
     * non-important base declaration in the CSS cascade, so it must be preserved.
     * (When the later base is itself `!important`, source order decides and the
     * later one wins, so clearing is correct.)
     */
    const clearEarlierVariantBaseValues = (prop: string, laterBaseValue: unknown): void => {
      const laterBaseIsImportant = cssValueIsImportant(laterBaseValue);
      // Deleting entries while iterating a Map is safe in JS.
      for (const [when, bucket] of variantBuckets) {
        if (!Object.hasOwn(bucket, prop)) {
          continue;
        }
        const bucketValue = bucket[prop];
        if (
          bucketValue !== null &&
          typeof bucketValue === "object" &&
          !isAstNode(bucketValue) &&
          "default" in (bucketValue as Record<string, unknown>)
        ) {
          const conditionDefault = (bucketValue as Record<string, unknown>).default;
          if (!laterBaseIsImportant && cssValueIsImportant(conditionDefault)) {
            continue;
          }
          (bucketValue as Record<string, unknown>).default = null;
          continue;
        }
        if (!laterBaseIsImportant && cssValueIsImportant(bucketValue)) {
          continue;
        }
        delete bucket[prop];
        if (Object.keys(bucket).length === 0) {
          variantBuckets.delete(when);
          delete ctx.variantStyleKeys[when];
          delete ctx.variantSourceOrder[when];
        }
      }
    };

    const clearEarlierThemeBaseValues = (
      prop: string,
      laterBaseValue: unknown,
      sourceCssProperty?: string,
    ): void => {
      const hooks = decl.needsUseThemeHook;
      if (!hooks?.length) {
        return;
      }
      const propsToClear =
        sourceCssProperty === "background" ? ["backgroundColor", "backgroundImage"] : [prop];
      const laterBaseIsImportant = cssValueIsImportant(laterBaseValue);
      const clearHookStyleKey = (
        hook: NonNullable<StyledDecl["needsUseThemeHook"]>[number],
        side: "trueStyleKey" | "falseStyleKey",
      ): boolean => {
        const styleKey = hook[side];
        if (!styleKey) {
          return false;
        }
        const bucket = extraStyleObjects.get(styleKey);
        if (!bucket) {
          return false;
        }
        let changed = false;
        for (const propToClear of propsToClear) {
          if (!Object.hasOwn(bucket, propToClear)) {
            continue;
          }
          const bucketValue = bucket[propToClear];
          if (!laterBaseIsImportant && cssValueIsImportant(bucketValue)) {
            continue;
          }
          delete bucket[propToClear];
          changed = true;
        }
        if (!changed) {
          return false;
        }
        if (Object.keys(bucket).length === 0) {
          extraStyleObjects.delete(styleKey);
          hook[side] = null;
        }
        return true;
      };

      for (let i = hooks.length - 1; i >= 0; i--) {
        const hook = hooks[i]!;
        const hadStyleKeys = Boolean(hook.trueStyleKey || hook.falseStyleKey);
        const clearedTrue = clearHookStyleKey(hook, "trueStyleKey");
        const clearedFalse = clearHookStyleKey(hook, "falseStyleKey");
        const changed = clearedTrue || clearedFalse;
        if (changed && hadStyleKeys && !hook.trueStyleKey && !hook.falseStyleKey) {
          hooks.splice(i, 1);
        }
      }
    };

    const applyResolvedPropValue = (
      prop: string,
      value: unknown,
      commentSource: { leading?: string; leadingLine?: string; trailingLine?: string } | null,
      sourceCssProperty?: string,
    ): void => {
      const noteSourceCssProperty = (target: Record<string, unknown>): void => {
        if (sourceCssProperty) {
          if (!Object.hasOwn(target, SOURCE_CSS_PROPERTIES_KEY)) {
            Object.defineProperty(target, SOURCE_CSS_PROPERTIES_KEY, {
              value: {},
              enumerable: false,
              configurable: true,
              writable: true,
            });
          }
          const sourceProperties = target[SOURCE_CSS_PROPERTIES_KEY] as Record<string, string>;
          sourceProperties[prop] = sourceCssProperty;
        }
      };
      const noteConditionSourceOrder = (
        target: Record<string, unknown>,
        condition: string,
      ): void => {
        setConditionSourceOrder(target, condition, ctx.getCurrentDeclarationSourceOrder());
      };
      if (attrTarget) {
        if (attrPseudoElement) {
          const nested = (attrTarget[attrPseudoElement] as any) ?? {};
          nested[prop] = value;
          attrTarget[attrPseudoElement] = nested;
          noteSourceCssProperty(nested);
          if (commentSource) {
            addPropComments(nested, prop, {
              leading: commentSource.leading,
              leadingLine: commentSource.leadingLine,
              trailingLine: commentSource.trailingLine,
            });
          }
          return;
        }
        attrTarget[prop] = value;
        noteSourceCssProperty(attrTarget);
        if (commentSource) {
          addPropComments(attrTarget, prop, {
            leading: commentSource.leading,
            leadingLine: commentSource.leadingLine,
            trailingLine: commentSource.trailingLine,
          });
        }
        return;
      }

      if (prop && prop.startsWith("--") && typeof value === "string") {
        localVarValues.set(prop, value);
      }

      // Handle nested pseudo + condition: `&:hover { @media (...) { ... } }`
      if (media && pseudos?.length) {
        if (media.startsWith("@supports")) {
          perPropMedia[prop] ??= {};
          const existing = perPropMedia[prop]!;
          noteSourceCssProperty(existing);
          if (!("default" in existing)) {
            const existingVal = (styleObj as Record<string, unknown>)[prop];
            existing.default =
              existingVal !== undefined ? existingVal : getConditionDefaultValue(prop);
          }
          const current = existing[media];
          const mediaMap =
            current && typeof current === "object" && !Array.isArray(current) && !isAstNode(current)
              ? (current as Record<string, unknown>)
              : { default: current ?? getConditionDefaultValue(prop) };
          for (const ps of pseudos) {
            mediaMap[ps] = value;
            noteConditionSourceOrder(mediaMap, ps);
          }
          existing[media] = mediaMap;
        } else {
          perPropPseudo[prop] ??= {};
          const existing = perPropPseudo[prop]!;
          noteSourceCssProperty(existing);
          if (!("default" in existing)) {
            const existingVal = (styleObj as Record<string, unknown>)[prop];
            existing.default =
              existingVal !== undefined ? existingVal : getConditionDefaultValue(prop);
          }
          for (const ps of pseudos) {
            const current = existing[ps];
            if (!current || typeof current !== "object") {
              const fallbackDefault = getConditionDefaultValue(prop);
              const preservedDefault = current !== undefined ? current : fallbackDefault;
              existing[ps] = { default: preservedDefault };
            } else if (!("default" in (current as Record<string, unknown>))) {
              (current as Record<string, unknown>).default = getConditionDefaultValue(prop);
            }
            (existing[ps] as Record<string, unknown>)[media] = value;
            noteConditionSourceOrder(existing[ps] as Record<string, unknown>, media);
          }
        }
        return;
      }

      if (media && (pseudoElement || pseudoElementsList)) {
        const pseudoElementsToApply = pseudoElement ? [pseudoElement] : pseudoElementsList;
        for (const pe of pseudoElementsToApply ?? []) {
          nestedSelectors[pe] ??= {};
          const peTarget = nestedSelectors[pe]!;
          noteSourceCssProperty(peTarget);
          const current = peTarget[prop];
          if (!current || typeof current !== "object" || isAstNode(current)) {
            peTarget[prop] = {
              default: current ?? getConditionDefaultValue(prop),
              [media]: value,
            };
          } else {
            const map = current as Record<string, unknown>;
            if (!("default" in map)) {
              map.default = null;
            }
            map[media] = value;
          }
        }
        return;
      }

      if (media) {
        const target = ctx.getBaseStyleTarget();
        if (target !== styleObj) {
          wrapStyleConditionValue(target, prop, media, value);
          noteSourceCssProperty(target);
          if (commentSource) {
            addPropComments(target, prop, {
              leading: commentSource.leading,
              leadingLine: commentSource.leadingLine,
              trailingLine: commentSource.trailingLine,
            });
          }
          patchEarlierDynamicConditionValues(prop, media, value);
          return;
        }
        perPropMedia[prop] ??= {};
        const existing = perPropMedia[prop]!;
        noteSourceCssProperty(existing);
        if (!("default" in existing)) {
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          existing.default =
            existingVal !== undefined ? existingVal : getConditionDefaultValue(prop);
        }
        const currentMediaValue = existing[media];
        if (
          currentMediaValue &&
          typeof currentMediaValue === "object" &&
          !Array.isArray(currentMediaValue) &&
          !isAstNode(currentMediaValue)
        ) {
          (currentMediaValue as Record<string, unknown>).default = value;
        } else {
          existing[media] = value;
        }
        noteConditionSourceOrder(existing, media);
        patchEarlierDynamicConditionValues(prop, media, value);
        return;
      }

      // Handle resolved selector media (from adapter.resolveSelector)
      // These use computed property keys like [breakpoints.phone]
      if (resolvedSelectorMedia) {
        // A computed media key is emitted at the property's top level — it cannot be
        // nested inside a pseudo condition map. This covers ancestor attribute selectors
        // (`[attr] &` → `:is([attr] *)`), which would otherwise silently lose their scope
        // when a computed `@media ${importedBreakpoint}` wraps the declaration.
        if (pseudos?.length) {
          bailWithSelectorWarning(
            "Unsupported selector: computed media query inside ancestor attribute selector",
            rule,
          );
          return;
        }
        const entry = getOrCreateComputedMediaEntry(prop, ctx);
        entry.entries.push({ keyExpr: resolvedSelectorMedia.keyExpr, value });
        return;
      }

      // When both pseudoElement and pseudos are set (e.g., ::-webkit-slider-thumb:hover),
      // scope the pseudo-class within the pseudo-element using per-property overrides.
      if (pseudos?.length && pseudoElement) {
        nestedSelectors[pseudoElement] ??= {};
        const peTarget = nestedSelectors[pseudoElement]!;
        noteSourceCssProperty(peTarget);
        const existingVal = peTarget[prop];
        // Check if the existing value is already a pseudo map (plain object with "default" key),
        // not an AST node or other object. AST nodes should be wrapped in a new pseudo map.
        if (
          typeof existingVal === "object" &&
          existingVal !== null &&
          "default" in (existingVal as Record<string, unknown>)
        ) {
          for (const ps of pseudos) {
            (existingVal as Record<string, unknown>)[ps] = value;
            noteConditionSourceOrder(existingVal as Record<string, unknown>, ps);
          }
        } else {
          const pseudoMap: Record<string, unknown> = {
            default: existingVal ?? getConditionDefaultValue(prop),
          };
          for (const ps of pseudos) {
            pseudoMap[ps] = value;
            noteConditionSourceOrder(pseudoMap, ps);
          }
          peTarget[prop] = pseudoMap;
        }
        return;
      }

      if (pseudos?.length) {
        perPropPseudo[prop] ??= {};
        const existing = perPropPseudo[prop]!;
        noteSourceCssProperty(existing);
        if (!("default" in existing)) {
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          existing.default =
            existingVal !== undefined ? existingVal : getConditionDefaultValue(prop);
        }
        for (const ps of pseudos) {
          existing[ps] = value;
          noteConditionSourceOrder(existing, ps);
        }
        return;
      }

      const pseudoElementsToApply = pseudoElement ? [pseudoElement] : pseudoElementsList;
      if (pseudoElementsToApply) {
        for (const pe of pseudoElementsToApply) {
          nestedSelectors[pe] ??= {};
          const pseudoSelector = nestedSelectors[pe];
          if (pseudoSelector) {
            const existing = pseudoSelector[prop];
            if (
              existing &&
              typeof existing === "object" &&
              !Array.isArray(existing) &&
              "default" in (existing as Record<string, unknown>)
            ) {
              (existing as Record<string, unknown>).default = value;
            } else {
              pseudoSelector[prop] = value;
            }
            noteSourceCssProperty(pseudoSelector);
            if (commentSource) {
              addPropComments(pseudoSelector, prop, {
                leading: commentSource.leading,
                leadingLine: commentSource.leadingLine,
                trailingLine: commentSource.trailingLine,
              });
            }
          }
        }
        return;
      }

      // Use getBaseStyleTarget() to respect after-base segments created by
      // resolvedStyles helpers, preserving CSS cascade order.
      clearEarlierVariantBaseValues(prop, value);
      clearEarlierThemeBaseValues(prop, value, sourceCssProperty);
      const target = ctx.getBaseStyleTarget();
      setStyleObjectValue(target, prop, value);
      noteSourceCssProperty(target);
      if (commentSource) {
        addPropComments(target, prop, {
          leading: commentSource.leading,
          leadingLine: commentSource.leadingLine,
          trailingLine: commentSource.trailingLine,
        });
      }
    };

    processRuleDeclarations({
      ctx,
      rule,
      allRules: decl.rules,
      media,
      pseudos,
      pseudoElement: pseudoElement ?? (pseudoElementsList ? (pseudoElementsList[0] ?? null) : null),
      attrTarget,
      resolvedSelectorMedia,
      applyResolvedPropValue,
    });
    if (state.bail) {
      break;
    }
  }

  // Merge CSS properties from `.attrs({ style: { ... } })` into the style object.
  // Merged AFTER template rules so attrs styles take precedence (matching
  // styled-components inline-style semantics where attrs style wins over class CSS).
  mergeAttrsStyles(ctx);
}
