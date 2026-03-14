/**
 * Handles animation declarations that reference keyframes.
 * Core concepts: parsing animation values and mapping keyframes names.
 */
import valueParser from "postcss-value-parser";
import type { StyledDecl } from "../transform-types.js";
import type { StyleFnFromPropsEntry } from "./decl-types.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { getFunctionBodyExpr, literalToStaticValue } from "../utilities/jscodeshift-utils.js";
import {
  buildTemplateWithStaticParts,
  collectPropsFromArrowFn,
  unwrapArrowFunctionToPropsExpr,
} from "./inline-styles.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import { cssPropertyToIdentifier, makeCssProperty } from "./shared.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";

// --- Shared animation token classifiers ---

const TIME_RE = /^(?:\d+|\d*\.\d+)(ms|s)$/;
const TIMING_FUNCTIONS = new Set(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]);
const DIRECTIONS = new Set(["normal", "reverse", "alternate", "alternate-reverse"]);
const FILL_MODES = new Set(["none", "forwards", "backwards", "both"]);
const PLAY_STATES = new Set(["running", "paused"]);

function isTimeToken(t: string): boolean {
  return TIME_RE.test(t);
}

function isTimingFunction(t: string): boolean {
  return TIMING_FUNCTIONS.has(t) || t.startsWith("cubic-bezier(") || t.startsWith("steps(");
}

function isDirection(t: string): boolean {
  return DIRECTIONS.has(t);
}

function isFillMode(t: string): boolean {
  return FILL_MODES.has(t);
}

function isPlayState(t: string): boolean {
  return PLAY_STATES.has(t);
}

function isIterationCount(t: string): boolean {
  return t === "infinite" || /^\d+$/.test(t);
}

/**
 * Classifies animation tokens (excluding the animation name) into longhand categories.
 */
export function classifyAnimationTokens(tokens: string[]): {
  duration: string | null;
  delay: string | null;
  timing: string | null;
  direction: string | null;
  fillMode: string | null;
  playState: string | null;
  iteration: string | null;
} {
  const timeTokens = tokens.filter(isTimeToken);
  return {
    duration: timeTokens[0] ?? null,
    delay: timeTokens[1] ?? null,
    timing: tokens.find(isTimingFunction) ?? null,
    direction: tokens.find(isDirection) ?? null,
    fillMode: tokens.find(isFillMode) ?? null,
    playState: tokens.find(isPlayState) ?? null,
    iteration: tokens.find(isIterationCount) ?? null,
  };
}

export function tryHandleAnimation(args: {
  j: any;
  decl: StyledDecl;
  d: any;
  keyframesNames: Set<string>;
  styleObj: Record<string, unknown>;
  styleFnDecls: Map<string, unknown>;
  styleFnFromProps: StyleFnFromPropsEntry[];
  filePath: string;
  avoidNames?: Set<string>;
  applyResolvedPropValue?: (
    prop: string,
    value: unknown,
    commentSource: { leading?: string; trailingLine?: string } | null,
  ) => void;
}): boolean {
  const { j, decl, d, keyframesNames, styleObj, styleFnDecls, styleFnFromProps } = args;
  const applyProp =
    args.applyResolvedPropValue ??
    ((prop: string, value: unknown) => {
      styleObj[prop] = value;
    });
  // Handle keyframes-based animation declarations before handler pipeline.
  if (!keyframesNames.size) {
    return false;
  }
  const prop = (d.property ?? "").trim();
  if (!prop) {
    return false;
  }

  const stylexProp = cssDeclarationToStylexDeclarations(d)[0]?.prop;
  if (!stylexProp) {
    return false;
  }

  const getKeyframeFromSlot = (slotId: number): string | null => {
    const expr = (decl as any).templateExpressions[slotId] as any;
    if (expr?.type === "Identifier" && keyframesNames.has(expr.name)) {
      return expr.name;
    }
    return null;
  };

  const parseAnimationSegments = (raw: string): string[][] => {
    const parsed = valueParser(raw);
    const segments: valueParser.Node[][] = [];
    let current: valueParser.Node[] = [];

    for (const node of parsed.nodes) {
      if (node.type === "div" && node.value === ",") {
        if (current.length > 0) {
          segments.push(current);
        }
        current = [];
        continue;
      }
      current.push(node);
    }
    if (current.length > 0) {
      segments.push(current);
    }

    return segments
      .map((nodes) =>
        nodes
          .filter((n) => n.type !== "space")
          .map((n) => valueParser.stringify(n))
          .map((t) => t.trim())
          .filter(Boolean),
      )
      .filter((tokens) => tokens.length > 0);
  };

  const buildCommaTemplate = (
    names: Array<{ kind: "ident"; name: string } | { kind: "text"; value: string }>,
  ) => {
    // Prefer template literal for identifier keyframes: `${a}, ${b}`
    const exprs: any[] = [];
    const quasis: any[] = [];
    let q = "";
    for (let i = 0; i < names.length; i++) {
      const n = names[i]!;
      if (i > 0) {
        q += ", ";
      }
      if (n.kind === "ident") {
        quasis.push(j.templateElement({ raw: q, cooked: q }, false));
        exprs.push(j.identifier(n.name));
        q = "";
      } else {
        q += n.value;
      }
    }
    quasis.push(j.templateElement({ raw: q, cooked: q }, true));
    return j.templateLiteral(quasis, exprs);
  };

  // animation-name: ${kf}
  if (stylexProp === "animationName" && d.value.kind === "interpolated") {
    const slot = d.value.parts.find((p: any) => p.kind === "slot");
    if (!slot) {
      return false;
    }
    const kf = getKeyframeFromSlot(slot.slotId);
    if (!kf) {
      return false;
    }
    applyProp("animationName", j.identifier(kf), null);
    return true;
  }

  // animation: ${kf} 2s linear infinite; or with commas
  if (prop === "animation" && typeof d.valueRaw === "string") {
    const segments = parseAnimationSegments(d.valueRaw);
    if (!segments.length) {
      return false;
    }

    const animNames: Array<{ kind: "ident"; name: string } | { kind: "text"; value: string }> = [];
    const durations: Array<string | null> = [];
    const timings: Array<string | null> = [];
    const delays: Array<string | null> = [];
    const iterations: Array<string | null> = [];
    const directions: Array<string | null> = [];
    const fillModes: Array<string | null> = [];
    const playStates: Array<string | null> = [];
    const timelines: Array<string | null> = [];

    // Track interpolated time tokens (e.g., __SC_EXPR_1__ms) for style function emission
    const interpolatedAnimTimes: InterpolatedAnimTime[] = [];

    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const tokens = segments[segmentIndex]!;
      if (!tokens.length) {
        return false;
      }

      const nameTok = tokens.shift()!;
      const m = nameTok.match(/^__SC_EXPR_(\d+)__$/);
      if (!m) {
        return false;
      }
      const kf = getKeyframeFromSlot(Number(m[1]));
      if (!kf) {
        return false;
      }
      animNames.push({ kind: "ident", name: kf });

      // Track ALL time tokens (static and interpolated) with their original indices.
      // CSS animation shorthand: first time = duration, second time = delay.
      type TimeSlot =
        | { kind: "static"; value: string; originalIndex: number }
        | { kind: "interpolated"; slotId: number; unit: string; originalIndex: number };
      const timeSlots: TimeSlot[] = [];

      // First pass: collect all time tokens with original indices
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;
        const interpMatch = token.match(INTERPOLATED_TIME_RE);
        if (interpMatch) {
          timeSlots.push({
            kind: "interpolated",
            slotId: Number(interpMatch[1]),
            unit: interpMatch[2]!,
            originalIndex: i,
          });
        } else if (isTimeToken(token)) {
          timeSlots.push({ kind: "static", value: token, originalIndex: i });
        }
      }

      // Sort by original index to preserve CSS shorthand order
      timeSlots.sort((a, b) => a.originalIndex - b.originalIndex);

      // Remove interpolated time tokens from the array for classifyAnimationTokens
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (INTERPOLATED_TIME_RE.test(tokens[i]!)) {
          tokens.splice(i, 1);
        }
      }

      // Classify remaining (non-interpolated) tokens into animation longhand categories
      const classified = classifyAnimationTokens(tokens);

      // Reset duration/delay from classified — we'll reassign based on original order
      classified.duration = null;
      classified.delay = null;

      // Assign time tokens to duration/delay based on original CSS shorthand order
      for (let i = 0; i < timeSlots.length && i < 2; i++) {
        const slot = timeSlots[i]!;
        const longhand: "animationDuration" | "animationDelay" =
          i === 0 ? "animationDuration" : "animationDelay";

        if (slot.kind === "static") {
          if (longhand === "animationDuration") {
            classified.duration = slot.value;
          } else {
            classified.delay = slot.value;
          }
        } else {
          const fallbackValue = computeInterpolatedTimeFallback(decl, slot.slotId, slot.unit);

          if (longhand === "animationDuration") {
            classified.duration = fallbackValue ?? `0${slot.unit}`;
          } else {
            classified.delay = fallbackValue ?? `0${slot.unit}`;
          }

          interpolatedAnimTimes.push({
            slotId: slot.slotId,
            unit: slot.unit,
            longhand,
            fallbackValue,
            segmentIndex,
          });
        }
      }

      durations.push(classified.duration);
      delays.push(classified.delay);
      timings.push(classified.timing);
      directions.push(classified.direction);
      fillModes.push(classified.fillMode);
      playStates.push(classified.playState);
      iterations.push(classified.iteration);

      // Timeline detection (complex — not covered by shared classifiers)
      const timeline = tokens.find((t) => {
        if (t === "auto") {
          return true;
        }
        if (t.startsWith("scroll(") || t.startsWith("view(")) {
          return true;
        }
        if (!/^[a-zA-Z_][\w-]*$/.test(t)) {
          return false;
        }
        // Exclude placeholder-containing tokens (already handled above)
        if (PLACEHOLDER_TOKEN_RE.test(t)) {
          return false;
        }
        return (
          !isTimingFunction(t) &&
          !isDirection(t) &&
          !isFillMode(t) &&
          !isPlayState(t) &&
          !isIterationCount(t) &&
          !isTimeToken(t) &&
          t !== "inherit" &&
          t !== "initial" &&
          t !== "unset" &&
          t !== "revert" &&
          t !== "revert-layer"
        );
      });
      timelines.push(timeline ?? null);
    }

    const firstAnim = animNames[0];
    if (animNames.length === 1 && firstAnim && firstAnim.kind === "ident") {
      applyProp("animationName", j.identifier(firstAnim.name), null);
    } else {
      applyProp("animationName", buildCommaTemplate(animNames), null);
    }
    const anyValues = (values: Array<string | null>): boolean =>
      values.some((value) => value !== null);
    const joinWithDefaults = (values: Array<string | null>, fallback: string): string =>
      values.map((value) => value ?? fallback).join(", ");

    if (anyValues(durations)) {
      applyProp("animationDuration", joinWithDefaults(durations, "0s"), null);
    }
    if (anyValues(timings)) {
      applyProp("animationTimingFunction", joinWithDefaults(timings, "ease"), null);
    }
    if (anyValues(delays)) {
      applyProp("animationDelay", joinWithDefaults(delays, "0s"), null);
    }
    if (anyValues(iterations)) {
      applyProp("animationIterationCount", joinWithDefaults(iterations, "1"), null);
    }
    if (anyValues(directions)) {
      applyProp("animationDirection", joinWithDefaults(directions, "normal"), null);
    }
    if (anyValues(fillModes)) {
      applyProp("animationFillMode", joinWithDefaults(fillModes, "none"), null);
    }
    if (anyValues(playStates)) {
      applyProp("animationPlayState", joinWithDefaults(playStates, "running"), null);
    }
    if (anyValues(timelines)) {
      applyProp("animationTimeline", joinWithDefaults(timelines, "auto"), null);
    }

    // Emit style functions for interpolated animation time tokens
    emitInterpolatedAnimTimeFunctions(
      j,
      decl,
      interpolatedAnimTimes,
      styleFnDecls,
      styleFnFromProps,
      durations,
      delays,
      args.avoidNames,
    );

    return true;
  }

  return false;
}

// --- Interpolated animation time helpers ---

/** Matches placeholder tokens with optional time unit suffix (e.g., `__SC_EXPR_1__ms`). */
const INTERPOLATED_TIME_RE = /^__SC_EXPR_(\d+)__(ms|s)$/;

/** Matches any placeholder token (with or without suffix) to exclude from timeline detection. */
const PLACEHOLDER_TOKEN_RE = /__SC_EXPR_\d+__/;

type InterpolatedAnimTime = {
  slotId: number;
  unit: string;
  longhand: "animationDuration" | "animationDelay";
  fallbackValue: string | null;
  segmentIndex: number;
};

/**
 * Computes a static fallback value from an interpolated expression's default.
 * E.g., `(props) => props.$fadeInDuration ?? 200` with unit `ms` → `"200ms"`.
 */
function computeInterpolatedTimeFallback(
  decl: StyledDecl,
  slotId: number,
  unit: string,
): string | null {
  const expr = (decl as any).templateExpressions[slotId] as any;
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return null;
  }
  const bodyExpr = getFunctionBodyExpr(expr);
  if (bodyExpr?.type === "LogicalExpression" && bodyExpr.operator === "??") {
    const staticVal = literalToStaticValue(bodyExpr.right);
    if (staticVal !== null) {
      return `${staticVal}${unit}`;
    }
  }
  return null;
}

/**
 * Emits dynamic style functions for interpolated animation time tokens.
 * For each interpolated token, creates a style function like:
 *   `fadeInContainerAnimationDuration: (animationDuration: string) => ({ animationDuration })`
 * and pushes a `styleFnFromProps` entry with a `callArg` that wraps the unwrapped
 * expression with the static unit suffix.
 *
 * For multi-animation shorthands, the callArg preserves the full comma-separated list
 * of durations/delays, with the interpolated segment being dynamic.
 *
 * When multiple segments share the same longhand and jsxProp, they are grouped into
 * a single style function with a combined callArg that interpolates all segments.
 */
function emitInterpolatedAnimTimeFunctions(
  j: any,
  decl: StyledDecl,
  interpolatedTimes: InterpolatedAnimTime[],
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: StyleFnFromPropsEntry[],
  durations: Array<string | null>,
  delays: Array<string | null>,
  avoidNames?: Set<string>,
): void {
  // Pre-validate and collect metadata for each interpolated time entry
  const validEntries: Array<{
    interp: InterpolatedAnimTime;
    jsxProp: string;
    unwrappedExpr: any;
  }> = [];

  for (const interp of interpolatedTimes) {
    const expr = (decl as any).templateExpressions[interp.slotId] as any;
    if (!expr || expr.type !== "ArrowFunctionExpression") {
      continue;
    }

    const propsUsed = collectPropsFromArrowFn(expr);
    for (const p of propsUsed) {
      if (p.startsWith("$")) {
        ensureShouldForwardPropDrop(decl, p);
      }
    }

    const unwrapped = unwrapArrowFunctionToPropsExpr(j, expr);
    if (!unwrapped) {
      continue;
    }

    const jsxProp = [...propsUsed][0];
    if (jsxProp) {
      validEntries.push({ interp, jsxProp, unwrappedExpr: unwrapped.expr });
    }
  }

  // Group entries by (longhand, jsxProp) so that segments sharing the same
  // CSS property and component prop produce a single style function.
  const groups = new Map<string, typeof validEntries>();
  for (const entry of validEntries) {
    const groupKey = `${entry.interp.longhand}:${entry.jsxProp}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = [];
      groups.set(groupKey, group);
    }
    group.push(entry);
  }

  for (const group of groups.values()) {
    const { longhand } = group[0]!.interp;
    const { jsxProp } = group[0]!;
    const valuesList = longhand === "animationDuration" ? durations : delays;

    const interpSegments = group.map((entry) => ({
      expr: entry.unwrappedExpr,
      unit: entry.interp.unit,
      segmentIndex: entry.interp.segmentIndex,
    }));

    const callArg = buildMultiAnimationCallArg(j, interpSegments, valuesList, "0s");

    const cssPropId = cssPropertyToIdentifier(longhand, avoidNames);
    const fnKey = styleKeyWithSuffix(decl.styleKey, longhand);
    if (!styleFnDecls.has(fnKey)) {
      const param = j.identifier(cssPropId);
      (param as any).typeAnnotation = j.tsTypeAnnotation(j.tsStringKeyword());
      const body = j.objectExpression([makeCssProperty(j, longhand, cssPropId)]);
      styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
    }

    styleFnFromProps.push({ fnKey, jsxProp, callArg });
    decl.needsWrapperComponent = true;
  }
}

/**
 * Builds a call argument for multi-animation shorthands.
 * For single animation, returns a simple template like `${$duration ?? 200}ms`.
 * For multi-animation, returns a template like `${$duration ?? 200}ms, 1s`
 * that preserves all animation durations/delays, interpolating all dynamic segments.
 */
function buildMultiAnimationCallArg(
  j: any,
  interpSegments: Array<{ expr: any; unit: string; segmentIndex: number }>,
  valuesList: Array<string | null>,
  defaultFallback: string,
): any {
  // Single animation with single interpolation: use simple template
  if (valuesList.length === 1 && interpSegments.length === 1) {
    const seg = interpSegments[0]!;
    return buildTemplateWithStaticParts(j, seg.expr, "", seg.unit);
  }

  // Build a map from segment index to its interpolated expression
  const interpBySegment = new Map<number, { expr: any; unit: string }>();
  for (const seg of interpSegments) {
    interpBySegment.set(seg.segmentIndex, { expr: seg.expr, unit: seg.unit });
  }

  // Multi-animation: build template with full list
  const quasis: any[] = [];
  const exprs: any[] = [];

  let prefix = "";
  for (let i = 0; i < valuesList.length; i++) {
    if (i > 0) {
      prefix += ", ";
    }

    const interp = interpBySegment.get(i);
    if (interp) {
      quasis.push(j.templateElement({ raw: prefix, cooked: prefix }, false));
      exprs.push(interp.expr);
      prefix = interp.unit;
    } else {
      prefix += valuesList[i] ?? defaultFallback;
    }
  }

  quasis.push(j.templateElement({ raw: prefix, cooked: prefix }, true));
  return j.templateLiteral(quasis, exprs);
}
