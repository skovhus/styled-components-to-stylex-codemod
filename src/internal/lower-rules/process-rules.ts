/**
 * Processes per-rule selector logic and dispatches declarations.
 * Core concepts: selector normalization, attribute wrappers, and rule buckets.
 */
import type { JSCodeshift } from "jscodeshift";
import type { SelectorResolveResult } from "../../adapter.js";
import type { DeclProcessingState } from "./decl-setup.js";
import type { StyledDecl } from "../transform-types.js";
import type { CssDeclarationIR } from "../css-ir.js";
import { computeSelectorWarningLoc } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { addPropComments } from "./comments.js";
import { processRuleDeclarations } from "./process-rule-declarations.js";
import {
  normalizeSelectorForInputAttributePseudos,
  normalizeInterpolatedSelector,
  normalizeSpecificityHacks,
  parseElementSelectorPattern,
  parseSelector,
} from "../selectors.js";
import {
  extractRootAndPath,
  getArrowFnParamBindings,
  getNodeLocStart,
} from "../utilities/jscodeshift-utils.js";
import {
  cssValueToJs,
  toStyleKey,
  toSuffixFromProp,
  type ComputedKeyEntry,
} from "../transform/helpers.js";
import { capitalize, kebabToCamelCase } from "../utilities/string-utils.js";
import { getOrCreateRelationOverrideBucket } from "./shared.js";
import type { RelationOverride } from "./state.js";
import { createPropTestHelpers } from "./variant-utils.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import type { ExpressionKind } from "./decl-types.js";

export function processDeclRules(ctx: DeclProcessingState): void {
  const {
    state,
    decl,
    styleObj,
    perPropPseudo,
    perPropMedia,
    perPropComputedMedia,
    nestedSelectors,
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
    styledDecls,
    relationOverridePseudoBuckets,
    relationOverrides,
    ancestorSelectorParents,
    childPseudoMarkers,
    resolveThemeValue,
    resolveThemeValueFromFn,
    resolveImportInScope,
  } = state;

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
    const elementResult = resolveElementSelectorTarget(
      selectorStr,
      parentDecl,
      styledDecls,
      root,
      j,
    );
    if (typeof elementResult === "string") {
      state.markBail();
      warnings.push({
        severity: "warning",
        type: ELEMENT_BAIL_WARNING_MAP[elementResult],
        loc: computeSelectorWarningLoc(parentDecl.loc, parentDecl.rawCss, rule.selector),
      });
      return "break";
    }
    if (!elementResult) {
      return null;
    }
    const { childDecl, ancestorPseudo, childPseudo } = elementResult;
    const overrideStyleKey = `${toStyleKey(childDecl.localName)}In${parentDecl.localName}`;
    ancestorSelectorParents.add(parentDecl.styleKey);

    // For child pseudos, record the pseudo in childPseudoMarkers
    // so finalizeRelationOverrides uses a string literal key instead of
    // stylex.when.ancestor().
    const pseudoForBucket = childPseudo ?? ancestorPseudo;

    // Detect pseudo collision: same pseudo used as both ancestor and child
    // for the same override key (e.g., `&:hover svg` + `svg:hover`).
    if (pseudoForBucket) {
      const existingChildPseudos = childPseudoMarkers.get(overrideStyleKey);
      const existingBuckets = relationOverridePseudoBuckets.get(overrideStyleKey);
      const isAlreadyUsedAsAncestor = !childPseudo && existingChildPseudos?.has(pseudoForBucket);
      const isAlreadyUsedAsChild =
        childPseudo &&
        existingBuckets?.has(pseudoForBucket) &&
        !existingChildPseudos?.has(pseudoForBucket);
      if (isAlreadyUsedAsAncestor || isAlreadyUsedAsChild) {
        state.markBail();
        warnings.push({
          severity: "warning",
          type: ELEMENT_BAIL_WARNING_MAP["bail-pseudo-collision"],
          loc: computeSelectorWarningLoc(parentDecl.loc, parentDecl.rawCss, rule.selector),
        });
        return "break";
      }
    }

    if (childPseudo) {
      let markers = childPseudoMarkers.get(overrideStyleKey);
      if (!markers) {
        markers = new Set();
        childPseudoMarkers.set(overrideStyleKey, markers);
      }
      markers.add(childPseudo);
    }

    const bucket = getOrCreateRelationOverrideBucket(
      overrideStyleKey,
      parentDecl.styleKey,
      childDecl.styleKey,
      pseudoForBucket,
      relationOverrides,
      relationOverridePseudoBuckets,
      childDecl.extraStyleKeys,
    );

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
      state.markBail();
      warnings.push({
        severity: "warning",
        type: "Unsupported selector: unresolved interpolation in element selector",
        loc: computeSelectorWarningLoc(parentDecl.loc, parentDecl.rawCss, rule.selector),
      });
      return "break";
    }
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
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      }
      const selectorForAnalysis = specificityResult.normalized;
      const s = normalizeInterpolatedSelector(selectorForAnalysis).trim();
      const hasComponentExpr = rule.selector.includes("__SC_EXPR_");
      const hasInterpolatedPseudo = /:[^\s{]*__SC_EXPR_\d+__/.test(selectorForAnalysis);

      if (hasInterpolatedPseudo) {
        // Only handle the simple case: selector is exactly `&:__SC_EXPR_N__`
        // (the entire pseudo-class is a single interpolation).
        // Uses `selectorForAnalysis` so that `&&:${expr}` (specificity hack) is accepted
        // after being normalized to `&:__SC_EXPR_N__`.
        const pseudoSlotMatch = selectorForAnalysis.match(/^&:__SC_EXPR_(\d+)__\s*$/);
        if (!pseudoSlotMatch) {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: interpolated pseudo selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        const pseudoSlotId = Number(pseudoSlotMatch[1]);
        const pseudoSlotExpr = decl.templateExpressions[pseudoSlotId];

        const pseudoResolved = tryResolveInterpolatedPseudo(pseudoSlotExpr, rule, ctx);

        if (pseudoResolved === "bail") {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: interpolated pseudo selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        // pseudoAlias and media both handled all declarations —
        // skip remaining rule processing for this rule.
        continue;
      }

      // Component selector patterns that have special handling below:
      // 1. `${Other}:pseudo &` - ancestor pseudo via descendant combinator (space only)
      // 2. `&:pseudo ${Child}` or just `& ${Child}` - parent styling descendant child
      // Other component selector patterns (like `${Other} .child`) should bail.
      const selectorTrimmed = selectorForAnalysis.trim();
      const isHandledComponentPattern =
        hasComponentExpr && // Pattern 1: `__SC_EXPR_N__:pseudo &` — descendant combinator only (space, no +~>)
        (/^__SC_EXPR_\d+__:[a-z][a-z0-9()-]*\s+&\s*$/.test(selectorTrimmed) ||
          // Pattern 1b: comma-separated reverse selectors where each part matches Pattern 1
          // e.g., `__SC_EXPR_0__:focus-visible &, __SC_EXPR_1__:active &`
          isCommaGroupedReverseSelectorPattern(selectorTrimmed) ||
          // Pattern 2: starts with & (forward descendant/pseudo pattern)
          selectorTrimmed.startsWith("&") ||
          // Pattern 3: standalone component selector `${Child} { ... }`
          /^__SC_EXPR_\d+__\s*\{/.test(selectorTrimmed));

      // Use heuristic-based bail checks. We need to allow:
      // - Component selectors that have special handling
      // - Attribute selectors (have special handling for input type, href, etc.)
      // Note: Specificity hacks (&&, &&&) bail early in transform.ts

      // Check for descendant pseudo selectors BEFORE normalization collapses them.
      // "& :not(:disabled)" (with space) targets descendants, not the component itself.
      // normalizeInterpolatedSelector would collapse this to "&:not(:disabled)" which
      // has completely different semantics. We must bail on these patterns.
      if (/&\s+:/.test(rule.selector)) {
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: descendant pseudo selector (space before pseudo)",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      }

      if (s.includes(",") && !isHandledComponentPattern) {
        // Comma-separated selectors: bail unless ALL parts are valid pseudo-selectors
        const parsed = parseSelector(s);
        if (parsed.kind !== "pseudo") {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: comma-separated selectors must all be simple pseudos",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }
      } else if (/&\.[a-zA-Z0-9_-]+/.test(s)) {
        // Class selector on same element like &.active
        // Note: Specificity hacks (&&, &&&) bail early in transform.ts
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: class selector",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      } else if (/[+~]/.test(s) && !isHandledComponentPattern) {
        // Self-referencing sibling combinators (`& + &`, `& ~ &`) are supported via
        // stylex.when.siblingBefore(). Non-self-referencing patterns still bail.
        const selfSiblingMatch = s.match(/^&\s*([+~])\s*&$/);
        if (!selfSiblingMatch) {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: sibling combinator",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        // Handle self-referencing sibling selector: collect declarations into perPropComputedMedia.
        // Both `& + &` (adjacent) and `& ~ &` (general) map to siblingBefore().
        //
        // Known semantic broadenings vs CSS:
        //  1. siblingBefore() emits `:where(.marker ~ *)` (general sibling), not `+ *`
        //     (adjacent). For `& + &`, if an unrelated element is interleaved between
        //     two instances, CSS would NOT match but siblingBefore() WILL.
        //     StyleX has no adjacent-sibling API, so this is the closest approximation.
        //  2. defaultMarker() is file-global, not component-scoped. If another component
        //     in the same file also uses defaultMarker() (e.g. for ancestor overrides),
        //     its marker could incorrectly activate this component's sibling styles.
        //     Use stylex.defineMarker() for strict scoping (not yet implemented).
        const combinator = selfSiblingMatch[1]; // "+" or "~"
        if (combinator === "+") {
          warnings.push({
            severity: "info",
            type: "Sibling selector broadened: & + & (adjacent) becomes general sibling (~) in StyleX — interleaved non-matching elements will no longer block the match",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
        }
        const siblingKeyExpr = makeSiblingKey(j);

        // Mark this component for defaultMarker() so siblings can observe it
        ancestorSelectorParents.add(decl.styleKey);

        const siblingMedia = rule.atRuleStack.find((a) => a.startsWith("@media"));
        const siblingResult = processSiblingDeclarations(
          rule,
          j,
          decl,
          siblingKeyExpr,
          siblingMedia ?? null,
          perPropComputedMedia,
          styleObj,
          resolveThemeValue,
          resolveThemeValueFromFn,
        );
        if (siblingResult === "bail") {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: sibling combinator",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }
        continue;
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
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: descendant/child/sibling selector",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
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
      if (
        otherLocal &&
        !isCssHelperPlaceholder &&
        (isReverseSelectorPattern || isGroupedReverseSelectorPattern)
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
            state.markBail();
            warnings.push({
              severity: "warning",
              type: "Unsupported selector: grouped reverse selector references different components",
              loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
            });
            break;
          }
        }

        const parentDecl = declByLocalName.get(otherLocal);
        const crossFileParent = !parentDecl
          ? state.crossFileSelectorsByLocal.get(otherLocal)
          : undefined;
        if (!parentDecl && !crossFileParent) {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: unknown component selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        // Extract all ancestor pseudos (one per comma-separated part)
        const ancestorPseudos = extractReverseSelectorPseudos(rule.selector);
        if (ancestorPseudos.length === 0) {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: unknown component selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        // Declare self as child, referenced component as ancestor parent.
        // For cross-file parents, use a synthetic style key based on the local name.
        const parentStyleKey = parentDecl ? parentDecl.styleKey : toStyleKey(otherLocal);
        const overrideStyleKey = `${toStyleKey(decl.localName)}In${otherLocal}`;
        ancestorSelectorParents.add(parentStyleKey);

        // For cross-file reverse, register a defineMarker for the imported parent
        const reverseMarkerVarName = crossFileParent ? `${otherLocal}Marker` : undefined;

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
          otherLocal,
        );

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
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: unresolved interpolation in reverse component selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        // Copy only the declarations written by THIS rule into remaining pseudo buckets.
        // Using the writtenProps set (returned by processDeclarationsIntoBucket) ensures
        // we propagate overwrites of existing keys while not leaking unrelated declarations
        // that were already in firstBucket from earlier rules.
        const writtenProps = result;
        for (let i = 1; i < ancestorPseudos.length; i++) {
          const bucket = getOrCreateRelationOverrideBucket(
            overrideStyleKey,
            parentStyleKey,
            decl.styleKey,
            ancestorPseudos[i]!,
            relationOverrides,
            relationOverridePseudoBuckets,
            decl.extraStyleKeys,
          );
          for (const key of writtenProps) {
            bucket[key] = firstBucket[key];
          }
        }

        continue;
      }

      // `${Child}` / `&:hover ${Child}` / `&:focus-visible ${Child}` (Parent styling a descendant child)
      // Also handle standalone `__SC_EXPR_N__` selectors (no `&` prefix) which Stylis
      // produces when the component selector is used without `&` in the template.
      const isComponentSelectorPattern =
        selTrim2.startsWith("&") || /^__SC_EXPR_\d+__$/.test(selTrim2);
      if (otherLocal && !isCssHelperPlaceholder && isComponentSelectorPattern) {
        const childDecl = declByLocalName.get(otherLocal);
        const crossFileUsage = !childDecl
          ? state.crossFileSelectorsByLocal.get(otherLocal)
          : undefined;
        // Extract the actual pseudo-selector (e.g., ":hover", ":focus-visible")
        const pseudoMatch = rule.selector.match(/&(:[a-z-]+(?:\([^)]*\))?)/i);
        const ancestorPseudo: string | null = pseudoMatch?.[1] ?? null;
        if (!childDecl && !crossFileUsage) {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: unknown component selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        // For cross-file selectors, the child's style key is synthetic (just the local name
        // lowered to a style key). The override style objects will be applied to the
        // imported component via JSX spread in rewrite-jsx.
        const childStyleKey = childDecl ? childDecl.styleKey : toStyleKey(otherLocal);
        const overrideStyleKey = `${toStyleKey(otherLocal)}In${decl.localName}`;
        ancestorSelectorParents.add(decl.styleKey);

        // For cross-file, compute the marker variable name (stored on RelationOverride,
        // derived into crossFileMarkers map by lowerRules after processing completes)
        const markerVarName = crossFileUsage ? `${decl.localName}Marker` : undefined;

        // getOrCreateRelationOverrideBucket creates the RelationOverride entry on first
        // call for this overrideStyleKey. Track count to detect new entries.
        const overrideCountBefore = relationOverrides.length;
        const bucket = getOrCreateRelationOverrideBucket(
          overrideStyleKey,
          decl.styleKey,
          childStyleKey,
          ancestorPseudo,
          relationOverrides,
          relationOverridePseudoBuckets,
        );

        // Tag newly-created relation override as cross-file
        tagCrossFileOverride(relationOverrides, overrideCountBefore, markerVarName, otherLocal);

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
          state.markBail();
          warnings.push({
            severity: "warning",
            type: crossFileUsage
              ? "Unsupported selector: unresolved interpolation in cross-file component selector"
              : "Unsupported selector: unresolved interpolation in descendant component selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }
        continue;
      }

      // Selector interpolation that's a MemberExpression (e.g., screenSize.phone)
      // Try to resolve it via the adapter as a media query helper.
      if (
        !otherLocal &&
        slotExpr &&
        (slotExpr.type === "MemberExpression" || slotExpr.type === "OptionalMemberExpression")
      ) {
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
                resolvedSelectorMedia = { keyExpr: mediaExpr, exprSource: selectorResult.expr };
                // Add required imports
                for (const impSpec of selectorResult.imports ?? []) {
                  resolverImports.set(JSON.stringify(impSpec), impSpec);
                }
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

    let media = rule.atRuleStack.find((a) => a.startsWith("@media"));

    const isInputIntrinsic = decl.base.kind === "intrinsic" && decl.base.tagName === "input";
    let selector = normalizeSelectorForInputAttributePseudos(rule.selector, isInputIntrinsic);
    selector = normalizeInterpolatedSelector(selector);
    // Normalize specificity hacks (&&) to base selector (&).
    // Higher tiers (&&&) are caught in the heuristic check above.
    const { normalized: selectorNormalized, wasStripped: specificityStripped } =
      normalizeSpecificityHacks(selector);
    selector = selectorNormalized;

    // When a specificity hack is stripped, annotate the first declaration so the
    // output includes a comment explaining the change.
    if (specificityStripped && rule.declarations.length > 0) {
      const first = rule.declarations[0];
      if (first) {
        const note = `Specificity hack stripped (was: ${rule.selector.trim()})`;
        first.leadingComment = first.leadingComment ? `${note}\n${first.leadingComment}` : note;
      }
    }

    if (!media && selector.trim().startsWith("@media")) {
      media = selector.trim();
      selector = "&";
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

      state.markBail();
      warnings.push({
        severity: "warning",
        type: "Unsupported selector: descendant/child/sibling selector",
        loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
      });
      break;
    }

    const pseudos = parsedSelector.kind === "pseudo" ? parsedSelector.pseudos : null;
    const pseudoElement = parsedSelector.kind === "pseudoElement" ? parsedSelector.element : null;
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
      state.markBail();
      warnings.push({
        severity: "warning",
        type: "Unsupported selector: attribute selector on unsupported element",
        loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
      });
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

    const applyResolvedPropValue = (
      prop: string,
      value: unknown,
      commentSource: { leading?: string; trailingLine?: string } | null,
    ): void => {
      if (attrTarget) {
        if (attrPseudoElement) {
          const nested = (attrTarget[attrPseudoElement] as any) ?? {};
          nested[prop] = value;
          attrTarget[attrPseudoElement] = nested;
          if (commentSource) {
            addPropComments(nested, prop, {
              leading: commentSource.leading,
              trailingLine: commentSource.trailingLine,
            });
          }
          return;
        }
        attrTarget[prop] = value;
        if (commentSource) {
          addPropComments(attrTarget, prop, {
            leading: commentSource.leading,
            trailingLine: commentSource.trailingLine,
          });
        }
        return;
      }

      if (prop && prop.startsWith("--") && typeof value === "string") {
        localVarValues.set(prop, value);
      }

      // Handle nested pseudo + media: `&:hover { @media (...) { ... } }`
      // This produces: { ":hover": { default: value, "@media (...)": value } }
      if (media && pseudos?.length) {
        perPropPseudo[prop] ??= {};
        const existing = perPropPseudo[prop]!;
        if (!("default" in existing)) {
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          if (existingVal !== undefined) {
            existing.default = existingVal;
          } else if (cssHelperPropValues.has(prop)) {
            existing.default = getComposedDefaultValue(prop);
          } else {
            existing.default = null;
          }
        }
        // For each pseudo, create/update a nested media map
        for (const ps of pseudos) {
          const current = existing[ps];
          if (!current || typeof current !== "object") {
            const fallbackDefault = cssHelperPropValues.has(prop)
              ? getComposedDefaultValue(prop)
              : null;
            const preservedDefault = current !== undefined ? current : fallbackDefault;
            existing[ps] = { default: preservedDefault };
          } else if (!("default" in (current as Record<string, unknown>))) {
            const fallbackDefault = cssHelperPropValues.has(prop)
              ? getComposedDefaultValue(prop)
              : null;
            (current as Record<string, unknown>).default = fallbackDefault;
          }
          (existing[ps] as Record<string, unknown>)[media] = value;
        }
        return;
      }

      if (media) {
        perPropMedia[prop] ??= {};
        const existing = perPropMedia[prop]!;
        if (!("default" in existing)) {
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          if (existingVal !== undefined) {
            existing.default = existingVal;
          } else if (cssHelperPropValues.has(prop)) {
            existing.default = getComposedDefaultValue(prop);
          } else {
            existing.default = null;
          }
        }
        existing[media] = value;
        return;
      }

      // Handle resolved selector media (from adapter.resolveSelector)
      // These use computed property keys like [breakpoints.phone]
      if (resolvedSelectorMedia) {
        let entry = perPropComputedMedia.get(prop);
        if (!entry) {
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          const defaultValue =
            existingVal !== undefined
              ? existingVal
              : cssHelperPropValues.has(prop)
                ? getComposedDefaultValue(prop)
                : null;
          entry = { defaultValue, entries: [] };
          perPropComputedMedia.set(prop, entry);
        }
        entry.entries.push({ keyExpr: resolvedSelectorMedia.keyExpr, value });
        return;
      }

      if (pseudos?.length) {
        perPropPseudo[prop] ??= {};
        const existing = perPropPseudo[prop]!;
        if (!("default" in existing)) {
          // If the property comes from a composed css helper, use the helper's
          // value as the default to preserve it during style merging.
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          if (existingVal !== undefined) {
            existing.default = existingVal;
          } else if (cssHelperPropValues.has(prop)) {
            existing.default = getComposedDefaultValue(prop);
          } else {
            existing.default = null;
          }
        }
        // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
        for (const ps of pseudos) {
          existing[ps] = value;
        }
        return;
      }

      if (pseudoElement) {
        nestedSelectors[pseudoElement] ??= {};
        const pseudoSelector = nestedSelectors[pseudoElement];
        if (pseudoSelector) {
          pseudoSelector[prop] = value;
          if (commentSource) {
            addPropComments(pseudoSelector, prop, {
              leading: commentSource.leading,
              trailingLine: commentSource.trailingLine,
            });
          }
        }
        return;
      }

      styleObj[prop] = value;
      if (commentSource) {
        addPropComments(styleObj, prop, {
          leading: commentSource.leading,
          trailingLine: commentSource.trailingLine,
        });
      }
    };

    processRuleDeclarations({
      ctx,
      rule,
      media,
      pseudos,
      pseudoElement,
      attrTarget,
      resolvedSelectorMedia,
      applyResolvedPropValue,
    });
    if (state.bail) {
      break;
    }
  }
}

// --- Non-exported helpers ---

/**
 * Processes rule declarations into a relation override bucket, handling both static
 * and interpolated (theme-resolved) values. Returns "bail" if any interpolated
 * declaration can't be resolved; returns the set of property names written otherwise.
 */
function processDeclarationsIntoBucket(
  rule: { declarations: CssDeclarationIR[] },
  bucket: Record<string, unknown>,
  j: DeclProcessingState["state"]["j"],
  decl: { templateExpressions: unknown[] },
  resolveThemeValue: (expr: unknown) => unknown,
  resolveThemeValueFromFn: (expr: unknown) => unknown,
  options?: { bailOnUnresolved?: boolean },
): Set<string> | "bail" {
  const writtenProps = new Set<string>();
  for (const d of rule.declarations) {
    if (d.value.kind === "static") {
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        if (out.value.kind !== "static") {
          continue;
        }
        const v = cssValueToJs(out.value, d.important, out.prop);
        bucket[out.prop] = v;
        writtenProps.add(out.prop);
      }
    } else if (d.value.kind === "interpolated" && d.property) {
      const resolveResult = resolveAllSlots(d, decl, resolveThemeValue, resolveThemeValueFromFn);
      if (resolveResult === "bail") {
        if (options?.bailOnUnresolved) {
          return "bail";
        }
        continue;
      }
      if (resolveResult) {
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          bucket[out.prop] = buildInterpolatedValue(j, d, resolveResult);
          writtenProps.add(out.prop);
        }
      }
    }
  }
  return writtenProps;
}

/**
 * Resolves all interpolation slots in a declaration to theme AST nodes.
 * Returns a resolver function `(slotId) => astNode`, or `"bail"` if any
 * slot can't be resolved, or `null` if no slots are found.
 */
function resolveAllSlots(
  d: { value: { kind: string; parts?: Array<{ kind: string; slotId?: number }> } },
  decl: { templateExpressions: unknown[] },
  resolveThemeValue: (expr: unknown) => unknown,
  resolveThemeValueFromFn: (expr: unknown) => unknown,
): ((slotId: number) => unknown) | "bail" | null {
  const parts = (d.value as { parts?: Array<{ kind: string; slotId?: number }> }).parts;
  if (!parts) {
    return null;
  }
  const slotParts = parts.filter((p) => p.kind === "slot" && p.slotId !== undefined);
  if (slotParts.length === 0) {
    return null;
  }
  const resolvedBySlotId = new Map<number, unknown>();
  for (const sp of slotParts) {
    const slotId = sp.slotId;
    if (slotId === undefined || resolvedBySlotId.has(slotId)) {
      continue;
    }
    const expr = decl.templateExpressions[slotId] as unknown;
    const resolved =
      expr &&
      typeof expr === "object" &&
      ((expr as { type?: string }).type === "ArrowFunctionExpression" ||
        (expr as { type?: string }).type === "FunctionExpression")
        ? resolveThemeValueFromFn(expr)
        : resolveThemeValue(expr);
    if (!resolved) {
      return "bail";
    }
    resolvedBySlotId.set(slotId, resolved);
  }
  return (slotId: number) => resolvedBySlotId.get(slotId);
}

/**
 * Builds the final AST value for an interpolated CSS declaration,
 * preserving the order of static and interpolated parts.
 *
 * Each slot is resolved independently via `resolveSlot(slotId)`.
 *
 * For a declaration like `border: 2px solid ${color}`, this produces
 * a template literal `\`2px solid ${resolvedExpr}\``.
 * For a purely interpolated value like `${color}`, returns the resolved
 * expression directly.
 */
function buildInterpolatedValue(
  j: DeclProcessingState["state"]["j"],
  d: { value: { kind: string; parts?: Array<{ kind: string; value?: string; slotId?: number }> } },
  resolveSlot: (slotId: number) => unknown,
): unknown {
  const parts = d.value.parts ?? [];
  const hasStaticParts = parts.some((p) => p.kind === "static" && p.value);
  if (hasStaticParts) {
    const quasis: any[] = [];
    const expressions: any[] = [];
    let currentStatic = "";

    for (const part of parts) {
      if (part.kind === "static") {
        currentStatic += part.value ?? "";
      } else if (part.kind === "slot" && part.slotId !== undefined) {
        quasis.push(j.templateElement({ raw: currentStatic, cooked: currentStatic }, false));
        currentStatic = "";
        expressions.push(resolveSlot(part.slotId));
      }
    }
    quasis.push(j.templateElement({ raw: currentStatic, cooked: currentStatic }, true));
    return j.templateLiteral(quasis, expressions);
  }
  // Single-slot pure interpolation: return the resolved value directly
  const singleSlot = parts.find((p) => p.kind === "slot" && p.slotId !== undefined);
  if (singleSlot && singleSlot.slotId !== undefined) {
    return resolveSlot(singleSlot.slotId);
  }
  return j.literal(null);
}

type ElementSelectorBailReason =
  | "bail-exported"
  | "bail-ambiguous"
  | "bail-dynamic"
  | "bail-combined-pseudo"
  | "bail-plain-intrinsic"
  | "bail-pseudo-collision";

const ELEMENT_BAIL_WARNING_MAP: Record<
  ElementSelectorBailReason,
  import("../logger.js").WarningType
> = {
  "bail-exported": "Unsupported selector: element selector on exported component",
  "bail-ambiguous": "Unsupported selector: ambiguous element selector",
  "bail-dynamic": "Unsupported selector: element selector with dynamic children",
  "bail-combined-pseudo":
    "Unsupported selector: element selector with combined ancestor and child pseudos",
  "bail-plain-intrinsic": "Unsupported selector: element selector with plain intrinsic children",
  "bail-pseudo-collision": "Unsupported selector: element selector pseudo collision",
};

/**
 * Orchestrates element selector resolution. Parses the selector, checks for bail
 * conditions (exported parent, ambiguous targets, dynamic children), and returns
 * the resolved child declaration + pseudo info, a bail reason, or null if not an
 * element selector pattern.
 */
function resolveElementSelectorTarget(
  selector: string,
  parentDecl: StyledDecl,
  styledDecls: StyledDecl[],
  root: DeclProcessingState["state"]["root"],
  j: JSCodeshift,
):
  | { childDecl: StyledDecl; ancestorPseudo: string | null; childPseudo: string | null }
  | ElementSelectorBailReason
  | null {
  const parsed = parseElementSelectorPattern(selector);
  if (!parsed) {
    return null;
  }
  const { tagName, ancestorPseudo, childPseudo } = parsed;

  // Bail if both ancestor and child pseudos are present (e.g., `&:focus > button:disabled`)
  // — cannot represent both in a single StyleX override
  if (ancestorPseudo && childPseudo) {
    return "bail-combined-pseudo";
  }

  // Bail if the parent component is exported — can't verify external usage
  if (isComponentExported(parentDecl.localName, root, j)) {
    return "bail-exported";
  }

  // Find all styled components with matching intrinsic tag, excluding the parent
  const matches = styledDecls.filter(
    (d) =>
      !d.isCssHelper &&
      d.localName !== parentDecl.localName &&
      d.base.kind === "intrinsic" &&
      d.base.tagName === tagName,
  );

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    return "bail-ambiguous";
  }

  // Bail if the parent has dynamic children (e.g., {children}, {props.children})
  if (hasDynamicJsxChildren(parentDecl.localName, root, j)) {
    return "bail-dynamic";
  }

  // Bail if the parent renders plain intrinsic elements matching the tag
  // (e.g., both <Icon /> and a plain <svg>) — only the styled component gets the override
  if (hasPlainIntrinsicDescendant(parentDecl.localName, tagName, matches[0]!.localName, root, j)) {
    return "bail-plain-intrinsic";
  }

  return { childDecl: matches[0]!, ancestorPseudo, childPseudo };
}

/**
 * Checks whether a component is exported from the file (named, default, or re-export).
 */
function isComponentExported(
  name: string,
  root: DeclProcessingState["state"]["root"],
  j: JSCodeshift,
): boolean {
  // `export const X = ...` or `export function X ...`
  const namedExport = root.find(j.ExportNamedDeclaration).filter((path) => {
    const decl = path.node.declaration;
    if (decl?.type === "VariableDeclaration") {
      return decl.declarations.some((d: any) => d.id?.type === "Identifier" && d.id.name === name);
    }
    if (decl?.type === "FunctionDeclaration" && (decl as any).id?.name === name) {
      return true;
    }
    // `export { X }` re-exports
    if (!decl && path.node.specifiers) {
      return path.node.specifiers.some(
        (s: any) => s.local?.name === name || s.exported?.name === name,
      );
    }
    return false;
  });
  if (namedExport.size() > 0) {
    return true;
  }

  // `export default X`
  const defaultExport = root.find(j.ExportDefaultDeclaration).filter((path) => {
    const decl = path.node.declaration;
    return decl?.type === "Identifier" && (decl as any).name === name;
  });
  return defaultExport.size() > 0;
}

/**
 * Checks whether any JSX usage of the given parent component contains a plain
 * intrinsic element matching `tagName` that is NOT the styled component. For example,
 * if parent renders both `<Icon />` (styled.svg) and a plain `<svg>`, returns true.
 */
function hasPlainIntrinsicDescendant(
  parentName: string,
  tagName: string,
  styledChildName: string,
  root: DeclProcessingState["state"]["root"],
  j: JSCodeshift,
): boolean {
  let found = false;
  root
    .find(j.JSXElement, {
      openingElement: {
        name: { type: "JSXIdentifier", name: parentName },
      },
    } as any)
    .forEach((path) => {
      if (found) {
        return;
      }
      for (const child of path.node.children ?? []) {
        if (
          child.type === "JSXElement" &&
          child.openingElement.name.type === "JSXIdentifier" &&
          child.openingElement.name.name === tagName &&
          child.openingElement.name.name !== styledChildName
        ) {
          found = true;
          return;
        }
      }
    });
  return found;
}

/**
 * Checks whether any JSX usage of the given component has dynamic children
 * ({children}, {props.children}, or non-empty JSXExpressionContainers).
 * Static JSX children (<Icon />, <div>text</div>) are OK.
 */
function hasDynamicJsxChildren(
  componentName: string,
  root: DeclProcessingState["state"]["root"],
  j: JSCodeshift,
): boolean {
  let hasDynamic = false;
  root
    .find(j.JSXElement, {
      openingElement: {
        name: { type: "JSXIdentifier", name: componentName },
      },
    } as any)
    .forEach((path) => {
      if (hasDynamic) {
        return;
      }
      for (const child of path.node.children ?? []) {
        if (child.type === "JSXExpressionContainer") {
          // Allow empty expressions (comments like {/* ... */})
          if (child.expression.type === "JSXEmptyExpression") {
            continue;
          }
          hasDynamic = true;
          return;
        }
      }
    });
  return hasDynamic;
}

/**
 * Attempts to resolve an interpolated pseudo-class selector (`&:${expr}`) via the
 * adapter's `resolveSelector`. Handles `pseudoAlias` (builds N separate style
 * objects, one per pseudo value) and `media` (merges into perPropPseudo
 * with nested media guards).
 *
 * Returns "bail" if resolution fails or the pattern isn't supported.
 */
function tryResolveInterpolatedPseudo(
  slotExpr: unknown,
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
): "bail" | void {
  const { state } = ctx;
  const { resolveSelector, resolveImportInScope } = state;

  if (!slotExpr) {
    return "bail";
  }

  // Extract root + path from the expression (works for both Identifier and MemberExpression)
  const info = extractRootAndPath(slotExpr);
  if (!info) {
    return "bail";
  }

  const imp = resolveImportInScope(info.rootName, info.rootNode);
  if (!imp) {
    return "bail";
  }

  const selectorResult = resolveSelector({
    kind: "selectorInterpolation",
    importedName: imp.importedName,
    source: imp.source,
    path: info.path.length > 0 ? info.path.join(".") : undefined,
    filePath: state.filePath,
    loc: getNodeLocStart(slotExpr) ?? undefined,
  });

  if (!selectorResult) {
    return "bail";
  }

  if (selectorResult.kind === "pseudoAlias") {
    return handlePseudoAlias(selectorResult, rule, ctx);
  }

  // "media" kind is not applicable for pseudo selectors
  return "bail";
}

/**
 * Handles `pseudoAlias` result: builds N extra style objects (one per pseudo value)
 * and registers them on `decl.pseudoAliasSelectors` for the emit phase.
 *
 * Wraps the style args in a `styleSelectorExpr` function call for runtime selection.
 */
function handlePseudoAlias(
  result: Extract<SelectorResolveResult, { kind: "pseudoAlias" }>,
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
): "bail" | void {
  // Bail when the pseudo alias is inside @media or other at-rules —
  // we can't carry the enclosing conditions into pseudo-alias style objects.
  if (rule.atRuleStack.length > 0) {
    return "bail";
  }

  const { state, decl, extraStyleObjects, styleObj, cssHelperPropValues, getComposedDefaultValue } =
    ctx;
  const { j, parseExpr, resolverImports, resolveThemeValue, resolveThemeValueFromFn } = state;

  // Process declarations into a flat bucket (populated in-place)
  const flatBucket: Record<string, unknown> = {};
  const writeResult = processDeclarationsIntoBucket(
    rule,
    flatBucket,
    j,
    decl,
    resolveThemeValue,
    resolveThemeValueFromFn,
    { bailOnUnresolved: true },
  );
  if (writeResult === "bail") {
    return "bail";
  }

  // When the pseudo block produced no static declarations (all interpolations
  // were standalone prop-conditional), try to recover by extracting the
  // condition and CSS from the raw template.
  let guard: { when: string } | undefined;
  if (Object.keys(flatBucket).length === 0) {
    const recovered = recoverStandaloneInterpolationsInPseudoBlock(rule, decl);
    if (!recovered) {
      return "bail";
    }
    Object.assign(flatBucket, recovered.cssProps);
    guard = { when: recovered.when };

    // Ensure the guard prop is dropped from DOM forwarding
    if (recovered.propName && !recovered.propName.startsWith("$")) {
      ensureShouldForwardPropDrop(decl, recovered.propName);
    }
  }

  // Build N style objects (one per pseudo value)
  const styleKeys: string[] = [];
  const styleKeySuffix = guard ? toSuffixFromProp(guard.when) : "";
  for (const pseudoName of result.values) {
    const pseudo = `:${pseudoName}`;
    const styleKey = `${decl.styleKey}${styleKeySuffix}Pseudo${capitalize(kebabToCamelCase(pseudoName))}`;
    styleKeys.push(styleKey);

    const styleObjForPseudo: Record<string, unknown> = {};
    for (const prop of Object.keys(flatBucket)) {
      const value = flatBucket[prop];
      const baseValue =
        (styleObj as Record<string, unknown>)[prop] ??
        (cssHelperPropValues.has(prop) ? getComposedDefaultValue(prop) : null);
      styleObjForPseudo[prop] = { default: baseValue, [pseudo]: value };
    }
    extraStyleObjects.set(styleKey, styleObjForPseudo);
  }

  // Parse the styleSelectorExpr
  const parsedSelectorExpr = parseExpr(result.styleSelectorExpr);
  if (!parsedSelectorExpr) {
    return "bail";
  }

  // Register on the decl for the emit phase
  decl.pseudoAliasSelectors ??= [];
  decl.pseudoAliasSelectors.push({
    styleKeys,
    styleSelectorExpr: parsedSelectorExpr,
    pseudoNames: result.values,
    ...(guard ? { guard } : {}),
  });

  // Add imports from the adapter result
  for (const impSpec of result.imports) {
    resolverImports.set(JSON.stringify(impSpec), impSpec);
  }

  decl.needsWrapperComponent = true;
}

/**
 * If a new relation override was created (array grew), tag it with cross-file metadata.
 * Used for both forward and reverse cross-file selector patterns.
 */
function tagCrossFileOverride(
  relationOverrides: RelationOverride[],
  countBefore: number,
  markerVarName: string | undefined,
  componentLocalName: string,
): void {
  if (!markerVarName || relationOverrides.length <= countBefore) {
    return;
  }
  const created = relationOverrides.at(-1);
  if (!created) {
    return;
  }
  created.crossFile = true;
  created.markerVarName = markerVarName;
  created.crossFileComponentLocalName = componentLocalName;
}

/**
 * Recovers standalone conditional interpolations from inside a pseudo-alias block.
 *
 * When Stylis drops standalone placeholders at brace depth > 0, the pseudo-alias
 * rule ends up empty. This function reads the raw CSS template to find the block,
 * extracts the arrow function condition and CSS text, and returns parsed CSS props.
 */
function recoverStandaloneInterpolationsInPseudoBlock(
  rule: DeclProcessingState["decl"]["rules"][number],
  decl: DeclProcessingState["decl"],
): { when: string; propName: string; cssProps: Record<string, unknown> } | null {
  const { rawCss, templateExpressions } = decl;
  if (!rawCss) {
    return null;
  }

  // Extract pseudo slot ID from rule selector
  const pseudoSlotMatch = rule.selector.match(PLACEHOLDER_RE);
  if (!pseudoSlotMatch) {
    return null;
  }
  const pseudoSlotId = pseudoSlotMatch[1];

  // Find the pseudo block in rawCss: `&:__SC_EXPR_<id>__` or `&&:__SC_EXPR_<id>__`
  const blockRegex = new RegExp(`&&?:\\s*__SC_EXPR_${pseudoSlotId}__\\s*\\{([^}]*)\\}`);
  const blockMatch = rawCss.match(blockRegex);
  if (!blockMatch?.[1]) {
    return null;
  }

  // Find standalone __SC_EXPR_N__ in the block content
  const standaloneSlotRegex = new RegExp(PLACEHOLDER_RE.source, "g");
  const slots: number[] = [];
  let slotMatch;
  while ((slotMatch = standaloneSlotRegex.exec(blockMatch[1])) !== null) {
    slots.push(Number(slotMatch[1]));
  }

  // Only handle single standalone interpolation for now
  if (slots.length !== 1) {
    return null;
  }

  const slotId = slots[0]!;
  const expr = templateExpressions[slotId];
  if (
    !expr ||
    typeof expr !== "object" ||
    (expr as { type?: string }).type !== "ArrowFunctionExpression"
  ) {
    return null;
  }

  const bindings = getArrowFnParamBindings(expr as any);
  if (!bindings) {
    return null;
  }

  const { parseTestInfo } = createPropTestHelpers(bindings);

  // Extract condition and CSS text from the arrow function body
  const body = (expr as { body?: unknown }).body as
    | {
        type: string;
        operator?: string;
        left?: unknown;
        right?: unknown;
        test?: unknown;
        consequent?: unknown;
        alternate?: unknown;
      }
    | undefined;
  if (!body) {
    return null;
  }

  let test: unknown;
  let cssNode: unknown;
  let needsNegation = false;

  if (body.type === "LogicalExpression" && body.operator === "&&") {
    test = body.left;
    cssNode = body.right;
  } else if (body.type === "ConditionalExpression") {
    test = body.test;
    const consequentCss = extractCssTextFromNode(body.consequent);
    const alternateCss = extractCssTextFromNode(body.alternate);
    // Both branches have CSS - bail (we can't represent both in a single guard)
    if (consequentCss && alternateCss) {
      return null;
    }
    if (consequentCss) {
      cssNode = body.consequent;
    } else if (alternateCss) {
      cssNode = body.alternate;
      needsNegation = true;
    } else {
      return null;
    }
  } else {
    return null;
  }

  const testInfo = parseTestInfo(test as ExpressionKind);
  if (!testInfo) {
    return null;
  }

  const cssText = extractCssTextFromNode(cssNode);
  if (!cssText) {
    return null;
  }

  const cssProps = parseCssDeclarationBlock(cssText);
  if (!cssProps || Object.keys(cssProps).length === 0) {
    return null;
  }

  const when = needsNegation ? negateWhen(testInfo.when) : testInfo.when;
  return { when, propName: testInfo.propName, cssProps };
}

/** Negates a `when` condition string (e.g. `$active` → `!$active`, `!$x` → `$x`). */
function negateWhen(when: string): string {
  if (when.startsWith("!")) {
    return when.slice(1);
  }
  if (when.includes(" === ")) {
    return when.replace(" === ", " !== ");
  }
  if (when.includes(" !== ")) {
    return when.replace(" !== ", " === ");
  }
  return `!${when}`;
}

/** Extracts static CSS text from a StringLiteral or zero-expression TemplateLiteral. */
function extractCssTextFromNode(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const n = node as {
    type?: string;
    value?: unknown;
    expressions?: unknown[];
    quasis?: Array<{ value?: { raw?: string } }>;
  };
  if (n.type === "StringLiteral" || (n.type === "Literal" && typeof n.value === "string")) {
    return n.value as string;
  }
  if (n.type === "TemplateLiteral" && (!n.expressions || n.expressions.length === 0)) {
    return (n.quasis ?? []).map((q) => q.value?.raw ?? "").join("");
  }
  return null;
}

/** Reverse selector pattern for a single part: `__SC_EXPR_N__:pseudo &` */
const REVERSE_SELECTOR_PART_RE = /^__SC_EXPR_\d+__:[a-z][a-z0-9()-]*\s+&$/;

/**
 * Checks if a comma-separated selector has all parts matching the reverse
 * component selector pattern (`__SC_EXPR_N__:pseudo &`). Different slot IDs
 * are allowed since Stylis assigns each `${Component}` reference its own slot.
 *
 * Example: `__SC_EXPR_0__:focus-visible &, __SC_EXPR_1__:active &`
 */
function isCommaGroupedReverseSelectorPattern(selector: string): boolean {
  if (!selector.includes(",")) {
    return false;
  }
  const parts = selector.split(",").map((p) => p.trim());
  if (parts.length < 2) {
    return false;
  }
  // All parts must match the reverse selector pattern.
  // Different slot IDs are allowed since each `${Component}` reference in the
  // template gets its own slot, even when they reference the same local variable.
  for (const part of parts) {
    if (!REVERSE_SELECTOR_PART_RE.test(part)) {
      return false;
    }
  }
  return true;
}

/**
 * Extracts all pseudo-classes from a (possibly comma-separated) reverse
 * component selector. Each part is expected to match `__SC_EXPR_N__:pseudo &`.
 *
 * Returns e.g. [":focus-visible", ":active"] for
 * `__SC_EXPR_0__:focus-visible &, __SC_EXPR_0__:active &`.
 */
function extractReverseSelectorPseudos(selector: string): string[] {
  const parts = selector.split(",").map((p) => p.trim());
  const pseudos: string[] = [];
  for (const part of parts) {
    const match = part.match(/__SC_EXPR_\d+__(:[a-z-]+(?:\([^)]*\))?)/i);
    if (match?.[1]) {
      pseudos.push(match[1]);
    }
  }
  return pseudos;
}

/**
 * Builds a `stylex.when.siblingBefore(":is(*)")` AST call expression.
 * Used for both `& + &` (adjacent) and `& ~ &` (general) CSS sibling selectors.
 *
 * The `:is(*)` pseudo is a universal match required by the StyleX Babel plugin
 * (which mandates a pseudo argument starting with `:`) but has no effect on
 * specificity or matching — it is equivalent to calling with no pseudo.
 *
 * TODO: Remove the `:is(*)` workaround if the StyleX Babel plugin adds support
 * for no-arg `siblingBefore()` calls (currently crashes in `validatePseudoSelector`).
 */
function makeSiblingKey(j: JSCodeshift) {
  return j.callExpression(
    j.memberExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("when")),
      j.identifier("siblingBefore"),
    ),
    [j.literal(":is(*)")],
  );
}

type ComputedMediaMap = Map<string, { defaultValue: unknown; entries: ComputedKeyEntry[] }>;

/**
 * Processes declarations from a self-referencing sibling rule (`& + &` or `& ~ &`)
 * into `perPropComputedMedia` entries with the appropriate sibling key expression.
 *
 * Handles both static values and interpolated (theme-resolved) values.
 * When the rule is inside a `@media` block, wraps the value in a media condition object.
 *
 * Returns "bail" if any interpolated declaration cannot be resolved.
 */
function processSiblingDeclarations(
  rule: { declarations: CssDeclarationIR[] },
  j: JSCodeshift,
  decl: { templateExpressions: unknown[]; styleKey: string },
  siblingKeyExpr: unknown,
  media: string | null,
  perPropComputedMedia: ComputedMediaMap,
  styleObj: Record<string, unknown>,
  resolveThemeValue: (expr: unknown) => unknown,
  resolveThemeValueFromFn: (expr: unknown) => unknown,
): "bail" | void {
  for (const d of rule.declarations) {
    if (d.value.kind === "static") {
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        if (out.value.kind !== "static") {
          continue;
        }
        const v = cssValueToJs(out.value, d.important, out.prop);
        const siblingValue = media ? { default: null, [media]: v } : v;
        addSiblingComputedEntry(
          perPropComputedMedia,
          out.prop,
          styleObj,
          siblingKeyExpr,
          siblingValue,
        );
      }
    } else if (d.value.kind === "interpolated" && d.property) {
      const resolveResult = resolveAllSlots(d, decl, resolveThemeValue, resolveThemeValueFromFn);
      if (resolveResult === "bail") {
        return "bail";
      }
      if (resolveResult) {
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          const interpolatedValue = buildInterpolatedValue(j, d, resolveResult);
          const siblingValue = media
            ? { default: null, [media]: interpolatedValue }
            : interpolatedValue;
          addSiblingComputedEntry(
            perPropComputedMedia,
            out.prop,
            styleObj,
            siblingKeyExpr,
            siblingValue,
          );
        }
      }
    }
  }
}

/** Adds a computed key entry for a sibling selector to the perPropComputedMedia map. */
function addSiblingComputedEntry(
  perPropComputedMedia: ComputedMediaMap,
  prop: string,
  styleObj: Record<string, unknown>,
  keyExpr: unknown,
  value: unknown,
): void {
  let entry = perPropComputedMedia.get(prop);
  if (!entry) {
    entry = { defaultValue: styleObj[prop] ?? null, entries: [] };
    perPropComputedMedia.set(prop, entry);
  }
  entry.entries.push({ keyExpr, value });
}
