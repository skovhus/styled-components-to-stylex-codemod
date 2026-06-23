/**
 * Handles animation declarations that reference keyframes.
 * Core concepts: parsing animation values and mapping keyframes names.
 */
import valueParser from "postcss-value-parser";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind, StyleFnFromPropsEntry } from "./decl-types.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import {
  cloneAstNode,
  getFunctionBodyExpr,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";
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

/** Matches a `var(...)` CSS function call at the top level of a token. */
const VAR_TOKEN_RE = /^var\(/;

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

function isVarToken(t: string): boolean {
  return VAR_TOKEN_RE.test(t);
}

type AnimLonghandCategory =
  | "duration"
  | "delay"
  | "timing"
  | "direction"
  | "fillMode"
  | "playState"
  | "iteration";

/** Non-time longhand classifiers, in match priority order. */
const NON_TIME_CLASSIFIERS: ReadonlyArray<{
  category: Exclude<AnimLonghandCategory, "duration" | "delay">;
  predicate: (t: string) => boolean;
}> = [
  { category: "timing", predicate: isTimingFunction },
  { category: "direction", predicate: isDirection },
  { category: "fillMode", predicate: isFillMode },
  { category: "playState", predicate: isPlayState },
  { category: "iteration", predicate: isIterationCount },
];

/**
 * Returns the longhand category that a `var(...)` token's fallback hints at,
 * or null if the token has no detectable fallback type. The fallback is the
 * portion after the first comma at the top level of the var() call. `"time"`
 * indicates the token should be assigned positionally as duration/delay.
 *
 * E.g. `var(--x, 1.5s)` → `"time"`, `var(--x, ease-in)` → `"timing"`,
 * `var(--x)` or `var(--x, somethingUnknown)` → `null`.
 */
function classifyVarTokenFallback(
  token: string,
): "time" | Exclude<AnimLonghandCategory, "duration" | "delay"> | null {
  const fallback = extractVarFallback(token);
  if (!fallback) {
    return null;
  }
  if (isTimeToken(fallback)) {
    return "time";
  }
  for (const { category, predicate } of NON_TIME_CLASSIFIERS) {
    if (predicate(fallback)) {
      return category;
    }
  }
  return null;
}

/**
 * Extracts the fallback value from a `var(--name, fallback)` token.
 * Returns the trimmed fallback string, or null if there is no fallback
 * or the input is not a well-formed var() call.
 */
function extractVarFallback(token: string): string | null {
  if (!isVarToken(token) || !token.endsWith(")")) {
    return null;
  }
  const inner = token.slice(4, -1);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (ch === "," && depth === 0) {
      return inner.slice(i + 1).trim();
    }
  }
  return null;
}

/**
 * Classifies animation tokens (excluding the animation name) into longhand categories.
 *
 * `var(...)` tokens are bound to the longhand hinted by their fallback value
 * (e.g., a time literal → duration/delay, an easing keyword → timing-function).
 * When a var()'s fallback cannot be classified (e.g., `var(--x)` with no
 * fallback, or `var(--x, foo)` with an unrecognized fallback), the runtime
 * value is unknown and could resolve to any longhand category — coercing it
 * to a time slot would change semantics for valid shorthands like
 * `${kf} var(--token) 2s infinite` where `--token: ease-in`. In that case
 * this function returns `null` to signal that the caller should bail.
 */
/**
 * Split a CSS `animation` shorthand value into per-animation token groups,
 * dropping whitespace nodes. Each inner array is the tokens of one
 * comma-separated animation.
 */
export function parseAnimationSegments(value: string): string[][] {
  const parsed = valueParser(value.trim());
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
        .filter((node) => node.type !== "space")
        .map((node) => valueParser.stringify(node))
        .map((token) => token.trim())
        .filter(Boolean),
    )
    .filter((tokens) => tokens.length > 0);
}

export function classifyAnimationTokens(tokens: string[]): {
  duration: string | null;
  delay: string | null;
  timing: string | null;
  direction: string | null;
  fillMode: string | null;
  playState: string | null;
  iteration: string | null;
} | null {
  const result: Record<AnimLonghandCategory, string | null> = {
    duration: null,
    delay: null,
    timing: null,
    direction: null,
    fillMode: null,
    playState: null,
    iteration: null,
  };

  const assignTime = (t: string): boolean => {
    if (result.duration === null) {
      result.duration = t;
      return true;
    }
    if (result.delay === null) {
      result.delay = t;
      return true;
    }
    return false;
  };

  for (const t of tokens) {
    if (isVarToken(t)) {
      const hinted = classifyVarTokenFallback(t);
      if (hinted === null) {
        // Unknown var() type — runtime value could be anything. Bail.
        return null;
      }
      if (hinted === "time") {
        if (!assignTime(t)) {
          return null;
        }
        continue;
      }
      if (result[hinted] !== null) {
        // Conflicting var() with same hinted longhand already assigned. Bail.
        return null;
      }
      result[hinted] = t;
      continue;
    }
    if (isTimeToken(t)) {
      assignTime(t);
      continue;
    }
    for (const { category, predicate } of NON_TIME_CLASSIFIERS) {
      if (result[category] === null && predicate(t)) {
        result[category] = t;
        break;
      }
    }
  }

  return result;
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
  keyframesAliases?: Map<string, string>;
  applyResolvedPropValue?: (
    prop: string,
    value: unknown,
    commentSource: { leading?: string; trailingLine?: string } | null,
  ) => void;
  bailUnsupportedUnknownVar?: () => void;
}): boolean {
  const { j, decl, d, keyframesNames, styleObj, styleFnDecls, styleFnFromProps } = args;
  const { keyframesAliases } = args;
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
      return keyframesAliases?.get(expr.name) ?? expr.name;
    }
    return null;
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
    const durations: AnimLonghandValue[] = [];
    const timings: Array<string | null> = [];
    const delays: AnimLonghandValue[] = [];
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

      // The animation-name can appear anywhere in the shorthand (e.g.
      // `animation: 300ms ${fade} linear`), so locate the keyframes slot token
      // instead of assuming it comes first.
      const nameIdx = tokens.findIndex((t) => {
        const slotMatch = t.match(/^__SC_EXPR_(\d+)__$/);
        return slotMatch ? getKeyframeFromSlot(Number(slotMatch[1])) !== null : false;
      });
      if (nameIdx === -1) {
        return false;
      }
      const nameTok = tokens.splice(nameIdx, 1)[0]!;
      const m = nameTok.match(/^__SC_EXPR_(\d+)__$/)!;
      const kf = getKeyframeFromSlot(Number(m[1]))!;
      animNames.push({ kind: "ident", name: kf });

      // Track ALL time tokens (static and interpolated) with their original indices.
      // CSS animation shorthand: first time = duration, second time = delay.
      type TimeSlot =
        | { kind: "static"; value: string; originalIndex: number }
        | { kind: "interpolated"; slotId: number; unit: string; originalIndex: number };
      const timeSlots: TimeSlot[] = [];

      // First pass: collect all time tokens with original indices.
      // `var(...)` tokens are bound to time slots only when their fallback is
      // a time literal; var() with non-time fallbacks is left for the longhand
      // classifier; var() with no classifiable fallback bails (we cannot know
      // its runtime category — see classifyAnimationTokens for details).
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
          continue;
        }
        if (isTimeToken(token)) {
          timeSlots.push({ kind: "static", value: token, originalIndex: i });
          continue;
        }
        if (isVarToken(token)) {
          const hinted = classifyVarTokenFallback(token);
          if (hinted === null) {
            args.bailUnsupportedUnknownVar?.();
            return false;
          }
          if (hinted === "time") {
            timeSlots.push({ kind: "static", value: token, originalIndex: i });
          }
        }
      }

      // Sort by original index to preserve CSS shorthand order
      timeSlots.sort((a, b) => a.originalIndex - b.originalIndex);

      // Remove tokens already assigned to time slots so the longhand
      // classifier does not double-count them.
      const consumedIndices = new Set(timeSlots.map((s) => s.originalIndex));
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (consumedIndices.has(i) || INTERPOLATED_TIME_RE.test(tokens[i]!)) {
          tokens.splice(i, 1);
        }
      }

      // Classify remaining (non-interpolated) tokens into animation longhand categories
      const classified = classifyAnimationTokens(tokens);
      if (!classified) {
        args.bailUnsupportedUnknownVar?.();
        return false;
      }

      // Reset duration/delay from classified — we'll reassign based on original order.
      let durationValue: AnimLonghandValue = null;
      let delayValue: AnimLonghandValue = null;

      // Assign time tokens to duration/delay based on original CSS shorthand order
      for (let i = 0; i < timeSlots.length && i < 2; i++) {
        const slot = timeSlots[i]!;
        const longhand: "animationDuration" | "animationDelay" =
          i === 0 ? "animationDuration" : "animationDelay";

        if (slot.kind === "static") {
          if (longhand === "animationDuration") {
            durationValue = slot.value;
          } else {
            delayValue = slot.value;
          }
        } else {
          const expr = (decl as any).templateExpressions[slot.slotId] as any;
          const fallbackValue = computeInterpolatedTimeFallback(decl, slot.slotId, slot.unit);
          const maybeStaticExpr = buildInterpolatedTimeExpression(j, decl, slot.slotId, slot.unit);
          const timeValue = maybeStaticExpr ?? fallbackValue ?? `0${slot.unit}`;

          if (longhand === "animationDuration") {
            durationValue = timeValue;
          } else {
            delayValue = timeValue;
          }

          if (expr?.type === "ArrowFunctionExpression") {
            interpolatedAnimTimes.push({
              slotId: slot.slotId,
              unit: slot.unit,
              longhand,
              fallbackValue,
              segmentIndex,
            });
          }
        }
      }

      durations.push(durationValue);
      delays.push(delayValue);
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
    const anyValues = (values: Array<string | ExpressionKind | null>): boolean =>
      values.some((value) => value !== null);
    const joinWithDefaults = (
      values: Array<string | ExpressionKind | null>,
      fallback: string,
    ): string | ExpressionKind => buildCommaSeparatedValues(j, values, fallback);

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

function buildCommaSeparatedValues(
  j: any,
  values: Array<string | ExpressionKind | null>,
  fallback: string,
): string | ExpressionKind {
  const parts = values.map((value) => value ?? fallback);
  const first = parts[0];
  if (
    parts.length === 1 ||
    (first != null && typeof first === "string" && parts.every((part) => part === first))
  ) {
    const firstPart = parts[0]!;
    return typeof firstPart === "string" ? firstPart : cloneAstNode(firstPart);
  }
  const quasis: any[] = [];
  const exprs: ExpressionKind[] = [];
  let text = "";

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      text += ", ";
    }
    const part = parts[i]!;
    if (typeof part === "string") {
      text += part;
      continue;
    }
    quasis.push(j.templateElement({ raw: text, cooked: text }, false));
    exprs.push(cloneAstNode(part));
    text = "";
  }

  if (exprs.length === 0) {
    return text;
  }
  quasis.push(j.templateElement({ raw: text, cooked: text }, true));
  return j.templateLiteral(quasis, exprs);
}

// --- Interpolated animation time helpers ---

/** Matches placeholder tokens with optional time unit suffix (e.g., `__SC_EXPR_1__ms`). */
const INTERPOLATED_TIME_RE = /^__SC_EXPR_(\d+)__(ms|s)$/;

/** Matches any placeholder token (with or without suffix) to exclude from timeline detection. */
const PLACEHOLDER_TOKEN_RE = /__SC_EXPR_\d+__/;

type AnimLonghandValue = string | ExpressionKind | null;

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

function buildInterpolatedTimeExpression(
  j: any,
  decl: StyledDecl,
  slotId: number,
  unit: string,
): ExpressionKind | null {
  const expr = (decl as any).templateExpressions[slotId] as any;
  if (!expr || expr.type === "ArrowFunctionExpression") {
    return null;
  }
  const staticVal = literalToStaticValue(expr);
  if (staticVal !== null) {
    return j.stringLiteral(`${staticVal}${unit}`);
  }
  return buildTemplateWithStaticParts(j, cloneAstNode(expr), "", unit);
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
  durations: AnimLonghandValue[],
  delays: AnimLonghandValue[],
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
  valuesList: AnimLonghandValue[],
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
      const value = valuesList[i] ?? defaultFallback;
      if (typeof value === "string") {
        prefix += value;
      } else {
        quasis.push(j.templateElement({ raw: prefix, cooked: prefix }, false));
        exprs.push(cloneAstNode(value));
        prefix = "";
      }
    }
  }

  if (exprs.length === 0) {
    return prefix;
  }
  quasis.push(j.templateElement({ raw: prefix, cooked: prefix }, true));
  return j.templateLiteral(quasis, exprs);
}
