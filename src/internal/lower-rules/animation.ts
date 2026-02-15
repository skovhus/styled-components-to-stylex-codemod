/**
 * Handles animation declarations that reference keyframes.
 * Core concepts: parsing animation values and mapping keyframes names.
 */
import valueParser from "postcss-value-parser";
import type { StyledDecl } from "../transform-types.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";

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
}): boolean {
  const { j, decl, d, keyframesNames, styleObj } = args;
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
    styleObj.animationName = j.identifier(kf);
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

    for (const tokens of segments) {
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

      // Classify remaining tokens into animation longhand categories
      const classified = classifyAnimationTokens(tokens);
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
      styleObj.animationName = j.identifier(firstAnim.name);
    } else {
      styleObj.animationName = buildCommaTemplate(animNames);
    }
    const anyValues = (values: Array<string | null>): boolean =>
      values.some((value) => value !== null);
    const joinWithDefaults = (values: Array<string | null>, fallback: string): string =>
      values.map((value) => value ?? fallback).join(", ");

    if (anyValues(durations)) {
      styleObj.animationDuration = joinWithDefaults(durations, "0s");
    }
    if (anyValues(timings)) {
      styleObj.animationTimingFunction = joinWithDefaults(timings, "ease");
    }
    if (anyValues(delays)) {
      styleObj.animationDelay = joinWithDefaults(delays, "0s");
    }
    if (anyValues(iterations)) {
      styleObj.animationIterationCount = joinWithDefaults(iterations, "1");
    }
    if (anyValues(directions)) {
      styleObj.animationDirection = joinWithDefaults(directions, "normal");
    }
    if (anyValues(fillModes)) {
      styleObj.animationFillMode = joinWithDefaults(fillModes, "none");
    }
    if (anyValues(playStates)) {
      styleObj.animationPlayState = joinWithDefaults(playStates, "running");
    }
    if (anyValues(timelines)) {
      styleObj.animationTimeline = joinWithDefaults(timelines, "auto");
    }
    return true;
  }

  return false;
}
