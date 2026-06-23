/**
 * Step: inline prop-conditional css`` helpers into their consuming styled components.
 * Core concepts: a standalone `css` helper whose template branches on component props
 * (e.g. `width: ${(p) => (p.$big ? "100px" : "50px")}`) cannot be lowered to a single
 * shared StyleX style key, so it cannot be referenced as a mixin. Instead we splice the
 * helper's CSS declarations directly into each consumer at the `${helper}` reference site,
 * remapping the helper's interpolation slots onto the consumer. The consumer's normal rule
 * lowering then handles the prop conditional the same way it would for an inline declaration.
 *
 * Inlining is intentionally conservative: only a helper that is a single top-level `&` block
 * with no chained mixin references is spliced. Helpers with nested selectors/at-rules or
 * chained `${otherMixin}` references would require source-order-aware merging into the
 * consumer to preserve the CSS cascade, so they are left for the existing mixin bail instead.
 */
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type { StyledDecl } from "../transform-types.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { cloneAstNode } from "../utilities/jscodeshift-utils.js";
import {
  collectPropsFromArrowFn,
  collectPropsFromArrowFnDestructured,
} from "../lower-rules/inline-styles.js";
import { cssPropertyToStylexProp } from "../css-prop-mapping.js";
import { LOGICAL_TO_PHYSICAL } from "../stylex-shorthands.js";

/**
 * Inlines prop-conditional css`` helpers into consumers so their prop-dependent
 * styles are preserved. Helpers that cannot be safely inlined are left untouched
 * (their `${helper}` reference falls through to the existing mixin bail).
 */
export function inlinePropConditionalCssHelpersStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls;
  const cssHelperNames: Set<string> | undefined = ctx.cssHelpers?.cssHelperNames;
  if (!styledDecls || !cssHelperNames || cssHelperNames.size === 0) {
    return CONTINUE;
  }

  const declByLocalName = new Map<string, StyledDecl>();
  for (const decl of styledDecls) {
    declByLocalName.set(decl.localName, decl);
  }

  // Helpers whose every reference was inlined: their declarations can be emptied.
  const fullyInlinedHelpers = new Set<string>();
  // Helpers that have at least one reference we could not inline (must keep them intact).
  const retainedHelpers = new Set<string>();

  for (const consumer of styledDecls) {
    if (consumer.isCssHelper) {
      continue;
    }
    for (const reference of collectInlinableHelperReferences(consumer, declByLocalName)) {
      const helperDecl = reference.helperDecl;
      if (
        !inlinablePropDependentDeclaration(helperDecl) ||
        inlineWouldContend(reference, consumer)
      ) {
        retainedHelpers.add(helperDecl.localName);
        continue;
      }
      if (inlineHelperReference(consumer, reference)) {
        fullyInlinedHelpers.add(helperDecl.localName);
        ctx.markChanged();
      } else {
        retainedHelpers.add(helperDecl.localName);
      }
    }
  }

  // A helper referenced inside *another* helper is never inlined here (helper consumers are
  // skipped above), so that `${inner}` reference still lives in the outer helper's rules. The
  // referenced helper must therefore be retained — emptying its rules would make a component that
  // uses the outer helper silently lose the inner helper's prop-conditional styles. Retaining it
  // instead leaves the outer reference to fall through to the existing mixin bail.
  for (const decl of styledDecls) {
    if (!decl.isCssHelper) {
      continue;
    }
    for (const rule of decl.rules) {
      for (const declaration of rule.declarations) {
        const referencedName = referencedHelperName(declaration, decl);
        if (referencedName && declByLocalName.get(referencedName)?.isCssHelper) {
          retainedHelpers.add(referencedName);
        }
      }
    }
  }

  // Empty the rules of fully-inlined helpers so they lower to nothing (no dead style keys).
  // The decls are deliberately kept in `styledDecls`: lowerRulesStep's skipped-decl safety
  // check relies on them remaining in `removedHelperLocalNames` to bail when a preserved
  // consumer in partial migration still references the extracted helper source.
  for (const decl of styledDecls) {
    if (
      decl.isCssHelper &&
      fullyInlinedHelpers.has(decl.localName) &&
      !retainedHelpers.has(decl.localName)
    ) {
      decl.rules = [];
    }
  }

  return CONTINUE;
}

// --- Non-exported helpers ---

type HelperReference = {
  /** The rule in the consumer that contains the `${helper}` reference declaration. */
  rule: CssRuleIR;
  /** The reference declaration object (located by identity to survive splices). */
  referenceDecl: CssDeclarationIR;
  /** The css helper declaration referenced by `${helper}`. */
  helperDecl: StyledDecl;
};

/**
 * Finds property-less `${helper}` references (single-slot identifier interpolations)
 * that sit in the consumer's top-level `&` rule. Only top-level references are returned;
 * references nested under selectors/at-rules are left for the existing bail path because
 * merging a helper's own declarations under another selector is not generally safe.
 */
function collectInlinableHelperReferences(
  consumer: StyledDecl,
  declByLocalName: Map<string, StyledDecl>,
): HelperReference[] {
  const references: HelperReference[] = [];
  for (const rule of consumer.rules) {
    if (rule.selector.trim() !== "&" || rule.atRuleStack.length > 0) {
      continue;
    }
    for (const referenceDecl of rule.declarations) {
      const helperName = referencedHelperName(referenceDecl, consumer);
      if (!helperName) {
        continue;
      }
      const helperDecl = declByLocalName.get(helperName);
      if (helperDecl?.isCssHelper) {
        references.push({ rule, referenceDecl, helperDecl });
      }
    }
  }
  return references;
}

/** Returns the helper identifier name if `d` is a standalone `${identifier}` interpolation. */
function referencedHelperName(d: CssDeclarationIR, consumer: StyledDecl): string | null {
  if (d.property || d.value.kind !== "interpolated") {
    return null;
  }
  const parts = d.value.parts;
  if (parts.length !== 1 || parts[0]?.kind !== "slot") {
    return null;
  }
  const expr = consumer.templateExpressions[parts[0].slotId] as { type?: string; name?: string };
  return expr?.type === "Identifier" && typeof expr.name === "string" ? expr.name : null;
}

/**
 * Returns the helper's single prop-dependent declaration when the helper is structurally
 * inlinable — otherwise null. Inlinable means it carries a prop-based interpolation (the case
 * the mixin path bails on) and is shaped so its declarations can be spliced into the consumer's
 * `&` block:
 *
 *  - private (not exported / preserved for cross-file use),
 *  - every rule is the top-level `&` block (no nested selectors, no at-rules),
 *  - no chained mixin references (a property-less `${otherMixin}` / `${parts.reset}` slot)
 *    — those compose as separate style keys whose ordering we cannot preserve by splicing, and
 *  - exactly one prop-dependent declaration. That single dynamic entry is the case the mixin
 *    path bails on, and it has no intra-helper ordering ambiguity. Zero means a plain mixin
 *    (handled by the shared-style-key path); two or more dynamic entries are emitted as
 *    styleFns/variants whose precedence depends on per-declaration source order, which the
 *    splice (which stamps the single reference order on every inlined declaration) cannot
 *    preserve.
 *
 * Whether the inline is *override-safe* is decided per reference by `inlineWouldContend`, which
 * is independent of how the value lowers.
 */
function inlinablePropDependentDeclaration(helperDecl: StyledDecl): CssDeclarationIR | null {
  if (helperDecl.isExported || helperDecl.preserveCssHelperDeclaration) {
    return null;
  }
  let propDependentDeclaration: CssDeclarationIR | null = null;
  let propDependentCount = 0;
  for (const rule of helperDecl.rules) {
    if (rule.selector.trim() !== "&" || rule.atRuleStack.length > 0) {
      return null;
    }
    for (const declaration of rule.declarations) {
      if (!declaration.property) {
        return null;
      }
      if (declarationReadsProps(declaration, helperDecl.templateExpressions)) {
        propDependentCount += 1;
        propDependentDeclaration = declaration;
      }
    }
  }
  return propDependentCount === 1 ? propDependentDeclaration : null;
}

/**
 * Splicing is override-safe only when the set of properties the helper sets is disjoint from
 * every other declaration in the merged block. When a property has a single contributor, however
 * the inlined value lowers (variant or style function) the result matches styled-components; when
 * two declarations contend, their relative precedence depends on the lowering path, which the
 * splice cannot guarantee — so bail. This checks:
 *
 *  - helper-internal overlap: two helper declarations touching the same leaf (e.g.
 *    `color: ${dyn}; color: red`) have order-dependent precedence the splice may invert;
 *  - helper-vs-consumer overlap: any helper property (its prop-dependent one *or* a static, which
 *    could override an earlier dynamic consumer declaration) overlapping a consumer declaration;
 *  - any property-less consumer declaration — a sibling mixin (`${reset}`) or dynamic block whose
 *    emitted properties are unknown here.
 *
 * Every consumer rule is scanned (not just the reference's), so a later top-level `&` rule or a
 * nested selector/at-rule the consumer authors is included.
 */
function inlineWouldContend(reference: HelperReference, consumer: StyledDecl): boolean {
  const helperDeclarations = reference.helperDecl.rules.flatMap((rule) => rule.declarations);
  for (let i = 0; i < helperDeclarations.length; i += 1) {
    for (let j = i + 1; j < helperDeclarations.length; j += 1) {
      if (propertiesConflict(helperDeclarations[i]!.property, helperDeclarations[j]!.property)) {
        return true;
      }
    }
  }
  for (const rule of consumer.rules) {
    for (const declaration of rule.declarations) {
      if (declaration === reference.referenceDecl) {
        continue;
      }
      if (!declaration.property) {
        return true;
      }
      if (helperDeclarations.some((hd) => propertiesConflict(hd.property, declaration.property))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether two CSS properties can set a common atomic StyleX longhand — i.e. they are equal, or
 * one is a shorthand whose expansion overlaps the other. Each property is expanded to its set of
 * atomic leaf longhands (a shorthand to its leaves, a longhand to itself) and the sets are
 * intersected. This correctly distinguishes overlapping families (`borderColor` vs
 * `borderTopColor`) from disjoint ones (`borderRadius` vs `border`, `width` vs `padding`).
 *
 * Backstop for shorthands the leaf table does not model: most CSS shorthands name their longhands
 * with their own camelCase prefix (`font` → `fontVariantNumeric`, `overscrollBehavior` →
 * `overscrollBehaviorX`). When the table cannot vouch for *both* properties (one is neither a known
 * shorthand nor a known leaf), a word-prefix relationship is treated as contention so an unmodeled
 * shorthand/longhand pair conservatively bails. Fully-modeled families skip this (so `border` and
 * `borderRadius`, which share the `border` prefix but are disjoint, still inline).
 */
function propertiesConflict(a: string, b: string): boolean {
  const stylexA = cssPropertyToStylexProp(a);
  const stylexB = cssPropertyToStylexProp(b);
  const leavesA = leafLonghands(stylexA);
  const leavesB = leafLonghands(stylexB);
  for (const leaf of leavesA) {
    if (leavesB.has(leaf)) {
      return true;
    }
  }
  if (isModeledProperty(stylexA) && isModeledProperty(stylexB)) {
    return false;
  }
  return isWordPrefix(stylexA, stylexB) || isWordPrefix(stylexB, stylexA);
}

/** Whether the leaf table reliably classifies a StyleX property (a known shorthand or leaf). */
function isModeledProperty(stylexProp: string): boolean {
  return KNOWN_SHORTHANDS.has(stylexProp) || KNOWN_LEAVES.has(stylexProp);
}

/** Whether `prefix` is `full` truncated at a camelCase word boundary (`font` ⊂ `fontVariant`). */
function isWordPrefix(prefix: string, full: string): boolean {
  if (full.length <= prefix.length || !full.startsWith(prefix)) {
    return false;
  }
  const next = full[prefix.length] ?? "";
  return next !== next.toLowerCase() && next === next.toUpperCase();
}

/**
 * The atomic physical StyleX longhands a property can set. A shorthand expands to its leaves; a
 * longhand resolves to itself. A logical longhand resolves to *both* physical sides on its axis
 * (e.g. `marginInlineStart` → `marginLeft` and `marginRight`) because the writing direction is
 * unknown — in RTL `inline-start` is the right side — so a logical declaration conservatively
 * contends with either physical side it could map to.
 */
function leafLonghands(stylexProp: string): Set<string> {
  // Collapse legacy CSS aliases to their canonical StyleX property first, so an aliased pair
  // (`word-wrap`/`overflow-wrap`, `grid-gap`/`gap`) shares leaves and is detected as contending.
  const canonical = CSS_ALIASES[stylexProp] ?? stylexProp;
  // A logical atomic longhand maps to both physical sides of its axis; this must take precedence
  // over the codemod's `LOGICAL_TO_PHYSICAL`, which resolves to a single side (LTR only).
  if (LOGICAL_LEAF_TO_PHYSICAL[canonical]) {
    return new Set(LOGICAL_LEAF_TO_PHYSICAL[canonical]);
  }
  const leaves = SHORTHAND_LEAVES[canonical] ?? LOGICAL_TO_PHYSICAL[canonical] ?? [canonical];
  return new Set(leaves.flatMap(physicalLeaves));
}

/**
 * Legacy CSS property aliases → their canonical StyleX property. `cssPropertyToStylexProp` only
 * camelCases authored names, so an alias and its modern name read as disjoint leaves unless
 * collapsed here. This is the standard set of legacy name aliases: `word-wrap` for `overflow-wrap`;
 * `grid-gap`/`grid-row-gap`/`grid-column-gap` for `gap`/`row-gap`/`column-gap`; and
 * `page-break-before`/`page-break-after`/`page-break-inside` for `break-before`/`break-after`/
 * `break-inside`.
 */
const CSS_ALIASES: Record<string, string> = {
  wordWrap: "overflowWrap",
  gridGap: "gap",
  gridRowGap: "rowGap",
  gridColumnGap: "columnGap",
  pageBreakBefore: "breakBefore",
  pageBreakAfter: "breakAfter",
  pageBreakInside: "breakInside",
};

/**
 * Maps a logical atomic longhand to every physical longhand it could map to under any writing
 * mode and direction. Flow-relative sides are not just RTL-swapped: in vertical writing modes the
 * block axis is horizontal and the inline axis is vertical, so a logical side can land on *any*
 * physical side. The mapping is therefore the full physical family, which is conservative but safe.
 */
function physicalLeaves(stylexProp: string): string[] {
  return LOGICAL_LEAF_TO_PHYSICAL[stylexProp] ?? [stylexProp];
}

const PHYSICAL_SIDES = ["Top", "Right", "Bottom", "Left"] as const;
const BORDER_KINDS = ["Width", "Style", "Color"] as const;
const ALL_INSET_SIDES = ["top", "right", "bottom", "left"];
const ALL_RADIUS_CORNERS = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
];

/** Logical atomic longhand → every physical longhand it could map to under any writing mode. */
const LOGICAL_LEAF_TO_PHYSICAL: Record<string, string[]> = {
  // Logical sizes map to either physical dimension: `inline-size` is `width` in horizontal-tb but
  // `height` in vertical writing modes, so each contends with both.
  inlineSize: ["width", "height"],
  blockSize: ["width", "height"],
  minInlineSize: ["minWidth", "minHeight"],
  minBlockSize: ["minWidth", "minHeight"],
  maxInlineSize: ["maxWidth", "maxHeight"],
  maxBlockSize: ["maxWidth", "maxHeight"],
  containIntrinsicInlineSize: ["containIntrinsicWidth", "containIntrinsicHeight"],
  containIntrinsicBlockSize: ["containIntrinsicWidth", "containIntrinsicHeight"],
  overflowBlock: ["overflowX", "overflowY"],
  overflowInline: ["overflowX", "overflowY"],
  overscrollBehaviorBlock: ["overscrollBehaviorX", "overscrollBehaviorY"],
  overscrollBehaviorInline: ["overscrollBehaviorX", "overscrollBehaviorY"],
  // A logical corner can map to any physical corner depending on writing-mode and direction
  // (e.g. `start-start` is a bottom corner in vertical-rl), so it contends with all.
  borderStartStartRadius: ALL_RADIUS_CORNERS,
  borderStartEndRadius: ALL_RADIUS_CORNERS,
  borderEndStartRadius: ALL_RADIUS_CORNERS,
  borderEndEndRadius: ALL_RADIUS_CORNERS,
};
for (const axis of ["Block", "Inline"] as const) {
  for (const end of ["Start", "End"] as const) {
    for (const base of ["margin", "padding", "scrollMargin", "scrollPadding"]) {
      LOGICAL_LEAF_TO_PHYSICAL[`${base}${axis}${end}`] = PHYSICAL_SIDES.map(
        (side) => `${base}${side}`,
      );
    }
    LOGICAL_LEAF_TO_PHYSICAL[`inset${axis}${end}`] = ALL_INSET_SIDES;
    for (const kind of BORDER_KINDS) {
      LOGICAL_LEAF_TO_PHYSICAL[`border${axis}${end}${kind}`] = PHYSICAL_SIDES.map(
        (side) => `border${side}${kind}`,
      );
    }
  }
}

/**
 * StyleX shorthand → its atomic leaf longhands (in physical form). Used to decide whether two
 * declarations contend for the same property. Mid-level shorthands (`borderTop`, `borderColor`,
 * `borderBlock`) are included so intersection captures partial overlap (e.g. `border` vs
 * `borderTopColor`). Directional families (margin/padding/inset/border) are generated for both
 * their physical and logical names; logical leaves are normalized to physical via `toPhysicalLeaf`.
 */
const SHORTHAND_LEAVES: Record<string, string[]> = {
  gap: ["rowGap", "columnGap"],
  overflow: ["overflowX", "overflowY"],
  overscrollBehavior: ["overscrollBehaviorX", "overscrollBehaviorY"],
  containIntrinsicSize: ["containIntrinsicWidth", "containIntrinsicHeight"],
  textEmphasis: ["textEmphasisStyle", "textEmphasisColor"],
  mask: [
    "maskImage",
    "maskMode",
    "maskRepeat",
    "maskPosition",
    "maskClip",
    "maskOrigin",
    "maskSize",
    "maskComposite",
  ],
  offset: ["offsetPath", "offsetDistance", "offsetRotate", "offsetAnchor", "offsetPosition"],
  borderRadius: [
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
  ],
  borderImage: [
    "borderImageSource",
    "borderImageSlice",
    "borderImageWidth",
    "borderImageOutset",
    "borderImageRepeat",
  ],
  outline: ["outlineWidth", "outlineStyle", "outlineColor"],
  font: [
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "lineHeight",
    "fontFamily",
  ],
  background: [
    "backgroundColor",
    "backgroundImage",
    "backgroundPositionX",
    "backgroundPositionY",
    "backgroundSize",
    "backgroundRepeat",
    "backgroundOrigin",
    "backgroundClip",
    "backgroundAttachment",
  ],
  backgroundPosition: ["backgroundPositionX", "backgroundPositionY"],
  flex: ["flexGrow", "flexShrink", "flexBasis"],
  flexFlow: ["flexDirection", "flexWrap"],
  placeItems: ["alignItems", "justifyItems"],
  placeContent: ["alignContent", "justifyContent"],
  placeSelf: ["alignSelf", "justifySelf"],
  gridArea: ["gridRowStart", "gridColumnStart", "gridRowEnd", "gridColumnEnd"],
  gridColumn: ["gridColumnStart", "gridColumnEnd"],
  gridRow: ["gridRowStart", "gridRowEnd"],
  gridTemplate: ["gridTemplateRows", "gridTemplateColumns", "gridTemplateAreas"],
  grid: [
    "gridTemplateRows",
    "gridTemplateColumns",
    "gridTemplateAreas",
    "gridAutoRows",
    "gridAutoColumns",
    "gridAutoFlow",
  ],
  columns: ["columnWidth", "columnCount"],
  columnRule: ["columnRuleWidth", "columnRuleStyle", "columnRuleColor"],
  transition: [
    "transitionProperty",
    "transitionDuration",
    "transitionTimingFunction",
    "transitionDelay",
  ],
  animation: [
    "animationName",
    "animationDuration",
    "animationTimingFunction",
    "animationDelay",
    "animationIterationCount",
    "animationDirection",
    "animationFillMode",
    "animationPlayState",
  ],
  textDecoration: [
    "textDecorationLine",
    "textDecorationStyle",
    "textDecorationColor",
    "textDecorationThickness",
  ],
  // `white-space` is a CSS Text L4 shorthand for `white-space-collapse` and `text-wrap-mode`;
  // `text-wrap` is a shorthand for `text-wrap-mode` and `text-wrap-style`.
  whiteSpace: ["whiteSpaceCollapse", "textWrapMode"],
  textWrap: ["textWrapMode", "textWrapStyle"],
  listStyle: ["listStyleType", "listStylePosition", "listStyleImage"],
};

// Generate the directional families. Physical shorthands expand to their physical leaves; logical
// shorthands (block/inline) expand to the full physical family because the flow-relative axis can
// map to either physical axis under some writing mode (conservative but safe).
const borderLeaf = (side: string, kind: string): string => `border${side}${kind}`;
const ALL_BORDER_LEAVES = PHYSICAL_SIDES.flatMap((side) =>
  BORDER_KINDS.map((kind) => borderLeaf(side, kind)),
);
for (const base of ["margin", "padding", "scrollMargin", "scrollPadding"]) {
  const allSides = PHYSICAL_SIDES.map((side) => `${base}${side}`);
  SHORTHAND_LEAVES[base] = allSides;
  SHORTHAND_LEAVES[`${base}Block`] = allSides;
  SHORTHAND_LEAVES[`${base}Inline`] = allSides;
}
SHORTHAND_LEAVES.inset = ALL_INSET_SIDES;
SHORTHAND_LEAVES.insetBlock = ALL_INSET_SIDES;
SHORTHAND_LEAVES.insetInline = ALL_INSET_SIDES;
// The `border` shorthand resets `border-image` to its initial value (but not `border-radius`),
// so it contends with the border-image longhands too.
SHORTHAND_LEAVES.border = [...ALL_BORDER_LEAVES, ...SHORTHAND_LEAVES.borderImage!];
SHORTHAND_LEAVES.borderBlock = ALL_BORDER_LEAVES;
SHORTHAND_LEAVES.borderInline = ALL_BORDER_LEAVES;
for (const side of PHYSICAL_SIDES) {
  SHORTHAND_LEAVES[`border${side}`] = BORDER_KINDS.map((kind) => borderLeaf(side, kind));
}
for (const kind of BORDER_KINDS) {
  const allOfKind = PHYSICAL_SIDES.map((side) => borderLeaf(side, kind));
  SHORTHAND_LEAVES[`border${kind}`] = allOfKind;
  SHORTHAND_LEAVES[`borderBlock${kind}`] = allOfKind;
  SHORTHAND_LEAVES[`borderInline${kind}`] = allOfKind;
}
for (const axis of ["Block", "Inline"] as const) {
  for (const end of ["Start", "End"] as const) {
    SHORTHAND_LEAVES[`border${axis}${end}`] = ALL_BORDER_LEAVES;
  }
}

// StyleX properties the leaf table reliably classifies: every shorthand key and every atomic leaf.
const KNOWN_SHORTHANDS = new Set(Object.keys(SHORTHAND_LEAVES));
const KNOWN_LEAVES = new Set<string>();
for (const leaves of Object.values(SHORTHAND_LEAVES)) {
  for (const leaf of leaves) {
    KNOWN_LEAVES.add(leaf);
  }
}
for (const leaves of Object.values(LOGICAL_LEAF_TO_PHYSICAL)) {
  for (const leaf of leaves) {
    KNOWN_LEAVES.add(leaf);
  }
}

/** True when a declaration's interpolated value reads a non-theme component prop. */
function declarationReadsProps(
  declaration: CssDeclarationIR,
  templateExpressions: readonly unknown[],
): boolean {
  if (declaration.value.kind !== "interpolated") {
    return false;
  }
  for (const part of declaration.value.parts) {
    if (part.kind === "slot" && expressionReadsNonThemeProps(templateExpressions[part.slotId])) {
      return true;
    }
  }
  return false;
}

/** Mirrors the mixin-bail detection: an arrow/function interpolation that reads non-theme props. */
function expressionReadsNonThemeProps(expr: unknown): boolean {
  const node = expr as { type?: string } | undefined;
  if (!node || (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression")) {
    return false;
  }
  const propsUsed = new Set([
    ...collectPropsFromArrowFn(node as never),
    ...collectPropsFromArrowFnDestructured(node as never),
  ]);
  propsUsed.delete("theme");
  return propsUsed.size > 0;
}

/**
 * Splices the helper's `&`-block declarations into the consumer at the reference site,
 * remapping the helper's interpolation slots onto freshly-appended consumer template
 * expressions. Returns false (without mutating) when the reference is no longer present.
 */
function inlineHelperReference(consumer: StyledDecl, reference: HelperReference): boolean {
  const { rule, referenceDecl, helperDecl } = reference;
  const declIndex = rule.declarations.indexOf(referenceDecl);
  if (declIndex === -1) {
    return false;
  }
  const slotOffset = consumer.templateExpressions.length;
  const inheritedSourceOrder = referenceDecl.sourceOrder;

  // isInlinableHelper guarantees every helper rule is the top-level `&` block.
  const inlinedDecls = helperDecl.rules.flatMap((helperRule) =>
    helperRule.declarations.map((d) => remapDeclaration(d, slotOffset, inheritedSourceOrder)),
  );

  for (const expr of helperDecl.templateExpressions) {
    consumer.templateExpressions.push(cloneAstNode(expr));
  }
  rule.declarations.splice(declIndex, 1, ...inlinedDecls);
  return true;
}

/** Deep-clones a CSS declaration, offsetting every interpolation slot id by `slotOffset`. */
function remapDeclaration(
  d: CssDeclarationIR,
  slotOffset: number,
  sourceOrder: number | undefined,
): CssDeclarationIR {
  const value: CssDeclarationIR["value"] =
    d.value.kind === "interpolated"
      ? {
          kind: "interpolated",
          parts: d.value.parts.map((part) =>
            part.kind === "slot"
              ? { kind: "slot", slotId: part.slotId + slotOffset }
              : { kind: "static", value: part.value },
          ),
        }
      : { kind: "static", value: d.value.value };
  // Inherit the reference declaration's source order so the spliced declarations take the
  // `${helper}` reference's cascade position, rather than the helper's own internal order.
  return {
    ...d,
    value,
    valueRaw: offsetPlaceholders(d.valueRaw, slotOffset),
    sourceOrder,
  };
}

/** Rewrites `__SC_EXPR_<n>__` placeholders in a raw value string by adding `slotOffset`. */
function offsetPlaceholders(valueRaw: string, slotOffset: number): string {
  return valueRaw.replace(
    /__SC_EXPR_(\d+)__/g,
    (_, n: string) => `__SC_EXPR_${Number(n) + slotOffset}__`,
  );
}
