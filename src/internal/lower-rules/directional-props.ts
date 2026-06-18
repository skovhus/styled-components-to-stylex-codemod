/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import {
  cssDeclarationToStylexDeclarations,
  isUnsupportedBackgroundShorthandValue,
} from "../css-prop-mapping.js";
import { LOGICAL_TO_PHYSICAL, SHORTHAND_LONGHANDS } from "../stylex-shorthands.js";
import type { StyledDecl } from "../transform-types.js";
import { cssValueToJs, normalizeCssContentValue } from "../transform/helpers.js";
import { extractRootAndPath } from "../utilities/jscodeshift-utils.js";
import type { DeclProcessingState } from "./decl-setup.js";
import type { ExpressionKind } from "./decl-types.js";
import { literalToStaticValue } from "./types.js";
import type { JSCodeshift } from "jscodeshift";

export function tryHandleRuntimeConditionalStaticBranches(
  ctx: Pick<DeclProcessingState, "decl" | "state" | "applyVariant" | "getBaseStyleTarget">,
  args: {
    rule: CssRuleIR;
    allRules: readonly CssRuleIR[];
    d: CssDeclarationIR;
    media: string | undefined;
    pseudos: string[] | null;
    pseudoElement: string | null;
    attrTarget: Record<string, unknown> | null;
    resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  },
): boolean {
  const { decl, state, applyVariant, getBaseStyleTarget } = ctx;
  const { j } = state;
  const { rule, allRules, d, media, pseudos, pseudoElement, attrTarget, resolvedSelectorMedia } =
    args;
  if (
    !d.property ||
    d.value.kind !== "interpolated" ||
    rule.selector.trim() !== "&" ||
    media ||
    attrTarget ||
    pseudos?.length ||
    pseudoElement ||
    resolvedSelectorMedia
  ) {
    return false;
  }

  const parts = d.value.parts ?? [];
  const slotParts = parts.filter(
    (part: { kind?: string }): part is { kind: "slot"; slotId: number } => part.kind === "slot",
  );
  if (slotParts.length !== 1) {
    return false;
  }

  const expr = decl.templateExpressions[slotParts[0]!.slotId] as
    | {
        type?: string;
        test?: ExpressionKind;
        consequent?: ExpressionKind;
        alternate?: ExpressionKind;
      }
    | undefined;
  if (
    !expr ||
    expr.type !== "ConditionalExpression" ||
    !expr.test ||
    !expr.consequent ||
    !expr.alternate ||
    !isImportedRuntimeCondition(expr.test, state.importMap)
  ) {
    return false;
  }

  const consequentValue = literalToStaticValue(expr.consequent);
  const alternateValue = literalToStaticValue(expr.alternate);
  if (
    consequentValue === null ||
    alternateValue === null ||
    typeof consequentValue === "boolean" ||
    typeof alternateValue === "boolean"
  ) {
    return false;
  }

  const when = expressionToSource(j, expr.test);
  if (!when) {
    return false;
  }

  const buildBranchValue = (slotValue: string | number): string => {
    let value = "";
    for (const part of parts) {
      value += part.kind === "slot" ? String(slotValue) : (part.value ?? "");
    }
    return value;
  };

  const consequentStyle = buildStaticBranchStyle(d, buildBranchValue(consequentValue));
  const alternateStyle = buildStaticBranchStyle(d, buildBranchValue(alternateValue));
  if (!consequentStyle || !alternateStyle) {
    return false;
  }
  if (!sameStyleProps(consequentStyle, alternateStyle)) {
    state.bailUnsupported(decl, "Unsupported interpolation: call expression");
    return true;
  }
  if (
    !subtractLaterStaticOverrides({
      rule,
      allRules,
      currentDecl: d,
      branchStyles: [consequentStyle, alternateStyle],
    })
  ) {
    state.bailUnsupported(decl, "Unsupported interpolation: call expression");
    return true;
  }
  if (!Object.keys(consequentStyle).length && !Object.keys(alternateStyle).length) {
    // Every branch property is unconditionally overridden by a later static
    // declaration, so the conditional is dead — the later declarations carry
    // the final values.
    return true;
  }

  const target = getBaseStyleTarget();
  for (const [prop, value] of Object.entries(alternateStyle)) {
    target[prop] = value;
  }
  applyVariant({ when }, consequentStyle);
  decl.needsWrapperComponent = true;
  recordNonPropConditionRoots(decl, expr.test);
  return true;
}

/**
 * Records the root identifiers of an imported runtime condition on the decl so
 * wrapper emission treats them as module-scope bindings rather than component
 * props (which matters for lowercase roots like `browser.isTouchDevice`).
 */
function recordNonPropConditionRoots(decl: StyledDecl, test: ExpressionKind): void {
  const roots = (decl.nonPropConditionRoots ??= new Set<string>());
  const visit = (expr: ExpressionKind): void => {
    if (expr.type === "LogicalExpression") {
      visit(expr.left as ExpressionKind);
      visit(expr.right as ExpressionKind);
      return;
    }
    if (expr.type === "UnaryExpression") {
      visit(expr.argument as ExpressionKind);
      return;
    }
    const info = extractRootAndPath(expr);
    if (info && info.path.length > 0) {
      roots.add(info.rootName);
    }
  };
  visit(test);
}

function buildStaticBranchStyle(
  d: CssDeclarationIR,
  rawValue: string,
): Record<string, unknown> | null {
  if (d.property === "background" && isUnsupportedBackgroundShorthandValue(rawValue)) {
    return null;
  }

  const staticDecl: CssDeclarationIR = {
    ...d,
    value: { kind: "static", value: rawValue },
    valueRaw: rawValue,
  };
  const style: Record<string, unknown> = {};
  for (const out of cssDeclarationToStylexDeclarations(staticDecl)) {
    if (out.value.kind !== "static") {
      return null;
    }
    let value = cssValueToJs(out.value, d.important, out.prop);
    if (out.prop === "content" && typeof value === "string") {
      value = normalizeCssContentValue(value);
    }
    style[out.prop] = value;
  }
  return Object.keys(style).length ? style : null;
}

function sameStyleProps(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = new Set(Object.keys(right));
  return leftKeys.length === rightKeys.size && leftKeys.every((key) => rightKeys.has(key));
}

/**
 * Removes branch properties that are unconditionally overridden by later static
 * declarations in the same selector context, so the runtime variant cannot
 * invert the original CSS cascade. Partially overridden directional props are
 * narrowed to the longhands that survive the override (e.g. `marginBlock`
 * overridden by a later `margin-top` becomes `marginBlockEnd`).
 *
 * Returns false when a later overlapping declaration cannot be subtracted
 * safely (conditional at-rule context, dynamic value, property-less helper, or
 * a multi-token branch value that cannot be split per longhand) — the caller
 * must bail in that case.
 */
export function subtractLaterStaticOverrides(args: {
  rule: CssRuleIR;
  allRules: readonly CssRuleIR[];
  currentDecl: CssDeclarationIR;
  branchStyles: Array<Record<string, unknown>>;
  ignoreUnsafeOverlaps?: boolean;
}): boolean {
  const { rule, allRules, currentDecl, branchStyles, ignoreUnsafeOverlaps = false } = args;
  const currentIndex = rule.declarations.indexOf(currentDecl);
  if (currentIndex === -1) {
    return true;
  }
  const laterContexts: Array<{
    declarations: readonly CssDeclarationIR[];
    unconditional: boolean;
  }> = [{ declarations: rule.declarations.slice(currentIndex + 1), unconditional: true }];
  const currentRuleIndex = allRules.indexOf(rule);
  if (currentRuleIndex !== -1) {
    for (const laterRule of allRules.slice(currentRuleIndex + 1)) {
      if (laterRule.selector !== rule.selector) {
        continue;
      }
      laterContexts.push({
        declarations: laterRule.declarations,
        unconditional: sameAtRuleStack(laterRule.atRuleStack, rule.atRuleStack),
      });
    }
  }

  const branchProps = (): string[] => [
    ...new Set(branchStyles.flatMap((style) => Object.keys(style))),
  ];
  for (const context of laterContexts) {
    for (const laterDecl of context.declarations) {
      if (!laterDecl.property) {
        // Property-less interpolation (e.g. a helper mixin) may set anything.
        if (branchProps().length) {
          return false;
        }
        continue;
      }
      // A later `border`/`border-<side>` shorthand resets the style/color
      // sub-properties it omits, but cssDeclarationToStylexDeclarations only
      // reports the explicit longhands (e.g. just borderTopWidth for
      // `border-top: 1px`). Subtracting those would leave the branch's
      // borderStyle/borderColor in place, drawing a border the cascade reset
      // away — bail when such a shorthand overlaps a branch property.
      if (isBorderShorthandProperty(laterDecl.property)) {
        const borderProps = new Set(
          cssDeclarationToStylexDeclarations(laterDecl).map((out) => out.prop),
        );
        if (
          branchProps().some((prop) =>
            [...borderProps].some((borderProp) => stylexPropsOverlap(prop, borderProp)),
          )
        ) {
          return false;
        }
        continue;
      }
      if (laterDecl.property.trim() === "background") {
        const overlapped = branchProps().filter((prop) => prop.startsWith("background"));
        if (!overlapped.length) {
          continue;
        }
        // A background shorthand resets both image and color layers, even when
        // cssDeclarationToStylexDeclarations() maps the authored value to one longhand.
        if (currentDecl.important && !laterDecl.important) {
          if (ignoreUnsafeOverlaps) {
            continue;
          }
          return false;
        }
        if (!context.unconditional || laterDecl.value.kind !== "static") {
          if (ignoreUnsafeOverlaps) {
            continue;
          }
          return false;
        }
        for (const branch of branchStyles) {
          for (const prop of overlapped) {
            delete branch[prop];
          }
        }
        continue;
      }
      for (const out of cssDeclarationToStylexDeclarations(laterDecl)) {
        const overrideProp = out.prop;
        const overlapped = branchProps().filter((prop) => stylexPropsOverlap(prop, overrideProp));
        if (!overlapped.length) {
          continue;
        }
        // An earlier `!important` declaration wins over a later non-important one
        // regardless of source order. Subtracting it would drop the conditional
        // branch and let the later declaration clobber the base, inverting the
        // cascade — bail instead so the important branches are preserved.
        if (currentDecl.important && !laterDecl.important) {
          if (ignoreUnsafeOverlaps) {
            continue;
          }
          return false;
        }
        if (!context.unconditional || laterDecl.value.kind !== "static") {
          if (ignoreUnsafeOverlaps) {
            continue;
          }
          return false;
        }
        for (const branch of branchStyles) {
          if (!subtractOverrideFromBranch(branch, overlapped, overrideProp)) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

function sameAtRuleStack(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, i) => entry === right[i]);
}

/** True for the `border` / `border-<side>` shorthands (not the longhands). */
function isBorderShorthandProperty(property: string): boolean {
  return /^border(?:-(?:top|right|bottom|left))?$/.test(property.trim());
}

function subtractOverrideFromBranch(
  branch: Record<string, unknown>,
  overlappedProps: string[],
  overrideProp: string,
): boolean {
  const overridePhysical = new Set(physicalLonghandExpansion(overrideProp));
  const overrideIsLogical = isLogicalDirectionalProp(overrideProp);
  for (const branchProp of overlappedProps) {
    if (!(branchProp in branch)) {
      continue;
    }
    const branchPhysical = physicalLonghandExpansion(branchProp);
    const remainder = branchPhysical.filter((prop) => !overridePhysical.has(prop));
    if (remainder.length === branchPhysical.length) {
      // Related (same directional group) but physically disjoint — no override.
      continue;
    }
    // A logical directional longhand (e.g. `marginInline`/`marginBlock`) maps to
    // physical sides differently per writing mode, so its overlap with a fixed
    // physical side is only knowable for horizontal-tb. Without the element's
    // `writing-mode`, a mixed logical/physical override is ambiguous — bail
    // rather than subtract using a hard-coded axis assumption.
    if (isLogicalDirectionalProp(branchProp) !== overrideIsLogical) {
      return false;
    }
    const value = branch[branchProp];
    delete branch[branchProp];
    if (!remainder.length) {
      continue;
    }
    if (!isSingleCssToken(value)) {
      return false;
    }
    for (const physical of remainder) {
      // Same representation on both sides: a logical override leaves a logical
      // survivor, a physical override a physical one.
      const name =
        overrideIsLogical && LOGICAL_TO_PHYSICAL[branchProp]
          ? logicalFormForPhysical(branchProp, physical)
          : physical;
      if (!name) {
        return false;
      }
      branch[name] = value;
    }
  }
  return true;
}

/**
 * True for a logical directional longhand whose physical side(s) depend on the
 * writing mode — `marginInline`, `paddingBlockEnd`, `scrollMarginInlineStart`,
 * etc. The physical-neutral full shorthands (`margin`, `padding`) and physical
 * sides (`marginTop`) are not logical.
 */
function isLogicalDirectionalProp(prop: string): boolean {
  return LOGICAL_TO_PHYSICAL[prop] !== undefined;
}

/** Physical longhands covered by a StyleX directional/border property. */
function physicalLonghandExpansion(prop: string): string[] {
  const group = SHORTHAND_LONGHANDS[prop];
  if (group) {
    return [...group.physical];
  }
  const logical = LOGICAL_TO_PHYSICAL[prop];
  if (logical) {
    return [...logical];
  }
  const borderMatch = prop.match(/^border(Top|Right|Bottom|Left)?(Width|Style|Color)$/);
  if (borderMatch) {
    const side = borderMatch[1];
    const kind = borderMatch[2]!;
    return side ? [prop] : ["Top", "Right", "Bottom", "Left"].map((s) => `border${s}${kind}`);
  }
  return [prop];
}

/** Maps a physical longhand back to the Start/End form of a logical branch prop. */
function logicalFormForPhysical(logicalProp: string, physical: string): string | null {
  for (const [name, physicalProps] of Object.entries(LOGICAL_TO_PHYSICAL)) {
    if (
      physicalProps.length === 1 &&
      physicalProps[0] === physical &&
      name.startsWith(logicalProp)
    ) {
      return name;
    }
  }
  return null;
}

function isSingleCssToken(value: unknown): boolean {
  if (typeof value === "number") {
    return true;
  }
  return typeof value === "string" && value.trim() !== "" && !/\s/.test(value.trim());
}

function stylexPropsOverlap(left: string, right: string): boolean {
  const leftRelated = relatedDirectionalProps(left);
  const rightRelated = relatedDirectionalProps(right);
  return [...leftRelated].some((prop) => rightRelated.has(prop));
}

function relatedDirectionalProps(prop: string): Set<string> {
  const related = new Set([prop]);
  const addDirectionalGroup = (shorthand: string): void => {
    const group = SHORTHAND_LONGHANDS[shorthand];
    if (!group) {
      return;
    }
    related.add(shorthand);
    for (const item of [...group.logical, ...group.physical]) {
      related.add(item);
    }
  };

  const directGroup = SHORTHAND_LONGHANDS[prop];
  if (directGroup) {
    addDirectionalGroup(prop);
  }
  for (const [logical, physical] of Object.entries(LOGICAL_TO_PHYSICAL)) {
    if (prop === logical || physical.includes(prop)) {
      const shorthand = Object.entries(SHORTHAND_LONGHANDS).find(([, group]) =>
        group.logical.includes(logical),
      )?.[0];
      if (shorthand) {
        addDirectionalGroup(shorthand);
      }
    }
  }
  addRelatedBorderLonghands(prop, related);
  return related;
}

function addRelatedBorderLonghands(prop: string, related: Set<string>): void {
  const borderMatch = prop.match(/^border(?:(Top|Right|Bottom|Left))?(Width|Style|Color)$/);
  const kind = borderMatch?.[2];
  if (!kind) {
    return;
  }
  related.add(`border${kind}`);
  for (const side of ["Top", "Right", "Bottom", "Left"]) {
    related.add(`border${side}${kind}`);
  }
}

function isImportedRuntimeCondition(
  expr: ExpressionKind,
  importMap: ReadonlyMap<string, unknown>,
): boolean {
  const info = extractRootAndPath(expr);
  if (info && info.path.length > 0 && importMap.has(info.rootName)) {
    return true;
  }
  if (expr.type === "LogicalExpression" && expr.operator === "&&") {
    return (
      isImportedRuntimeCondition(expr.left as ExpressionKind, importMap) &&
      isImportedRuntimeCondition(expr.right as ExpressionKind, importMap)
    );
  }
  if (expr.type === "UnaryExpression" && expr.operator === "!") {
    return isImportedRuntimeCondition(expr.argument as ExpressionKind, importMap);
  }
  return false;
}

function expressionToSource(j: JSCodeshift, expr: ExpressionKind): string | null {
  try {
    return j(expr).toSource();
  } catch {
    return null;
  }
}

export function hasSourceOrderedThemeStyleOverlap(
  decl: StyledDecl,
  extraStyleObjects: ReadonlyMap<string, Record<string, unknown>>,
  cssText: string | undefined,
): boolean {
  const themeProps = new Set<string>();
  for (const entry of decl.needsUseThemeHook ?? []) {
    if (entry.sourceOrder === undefined) {
      continue;
    }
    collectStyleObjectProps(extraStyleObjects.get(entry.trueStyleKey ?? ""), themeProps);
    collectStyleObjectProps(extraStyleObjects.get(entry.falseStyleKey ?? ""), themeProps);
  }
  return cssTextMayOverlapStylexProps(cssText, themeProps);
}

function collectStyleObjectProps(
  style: Record<string, unknown> | undefined,
  props: Set<string>,
): void {
  if (!style) {
    return;
  }
  for (const prop of Object.keys(style)) {
    props.add(prop);
  }
}

function cssTextMayOverlapStylexProps(
  cssText: string | undefined,
  props: ReadonlySet<string>,
): boolean {
  if (props.size === 0) {
    return false;
  }
  if (!cssText) {
    return true;
  }

  const chunks = cssText
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return true;
  }

  for (const chunk of chunks) {
    const match = chunk.match(/^([^:]+):([\s\S]+)$/);
    if (!match?.[1] || !match[2]) {
      return true;
    }
    const property = match[1].trim();
    const valueRaw = match[2].trim();
    if (laterDeclarationMayResetStylexProps(property, props)) {
      return true;
    }
    for (const out of cssDeclarationToStylexDeclarations({
      property,
      value: { kind: "static", value: valueRaw },
      important: false,
      valueRaw,
    })) {
      if (hasOverlappingStylexProp(props, out.prop)) {
        return true;
      }
    }
  }

  return false;
}

export function hasLaterDeclarationForStylexProps(
  current: CssDeclarationIR,
  rules: readonly CssRuleIR[],
  props: ReadonlySet<string>,
): boolean {
  if (props.size === 0) {
    return false;
  }

  let sawCurrent = false;
  for (const rule of rules) {
    for (const candidate of rule.declarations) {
      if (candidate === current) {
        sawCurrent = true;
        continue;
      }
      if (!isDeclarationAfter(current, candidate, sawCurrent)) {
        continue;
      }
      if (!candidate.property) {
        return true;
      }
      if (laterDeclarationMayResetStylexProps(candidate.property, props)) {
        return true;
      }
      for (const out of cssDeclarationToStylexDeclarations(candidate)) {
        if (hasOverlappingStylexProp(props, out.prop)) {
          return true;
        }
      }
    }
  }

  return false;
}

function isDeclarationAfter(
  current: CssDeclarationIR,
  candidate: CssDeclarationIR,
  sawCurrent: boolean,
): boolean {
  if (current.sourceOrder !== undefined && candidate.sourceOrder !== undefined) {
    return candidate.sourceOrder > current.sourceOrder;
  }
  return sawCurrent;
}

function hasOverlappingStylexProp(props: ReadonlySet<string>, candidate: string): boolean {
  for (const prop of props) {
    if (stylexPropsOverlap(prop, candidate)) {
      return true;
    }
  }
  return false;
}

function laterDeclarationMayResetStylexProps(
  cssProperty: string,
  props: ReadonlySet<string>,
): boolean {
  const property = cssProperty.trim();
  if (property === "background") {
    return hasStylexPropWithPrefix(props, "background");
  }
  if (!isBorderShorthandProperty(property)) {
    return false;
  }
  const side = property.match(/^border-(top|right|bottom|left)$/)?.[1];
  return hasBorderResetOverlap(props, side);
}

function hasStylexPropWithPrefix(props: ReadonlySet<string>, prefix: string): boolean {
  for (const prop of props) {
    if (prop.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function hasBorderResetOverlap(props: ReadonlySet<string>, side: string | undefined): boolean {
  const sidePrefix = side ? `border${side.charAt(0).toUpperCase()}${side.slice(1)}` : "border";
  for (const prop of props) {
    if (!/^border(?:Top|Right|Bottom|Left)?(?:Width|Style|Color)$/.test(prop)) {
      continue;
    }
    if (!side || prop.startsWith(sidePrefix) || /^border(?:Width|Style|Color)$/.test(prop)) {
      return true;
    }
  }
  return false;
}
