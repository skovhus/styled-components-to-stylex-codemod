import { describe, expect, it } from "vitest";
import {
  type InlineKeyframeStyleBuckets,
  type InlineKeyframePruneState,
  pruneUnusedInlineKeyframes,
} from "./inline-keyframes-liveness.js";

function makeState(): InlineKeyframePruneState {
  return {
    inlineKeyframes: new Map<string, Record<string, Record<string, unknown>>>([
      ["ants", {}],
      ["bees", {}],
    ]),
    inlineKeyframeNameMap: new Map([
      ["ants", "ants"],
      ["bees", "bees"],
    ]),
    keyframesNames: new Set(["ants", "bees"]),
  };
}

function identifier(name: string): unknown {
  return { type: "Identifier", name };
}

describe("pruneUnusedInlineKeyframes", () => {
  it("keeps keyframes referenced by emitted style values", () => {
    const state = makeState();

    pruneUnusedInlineKeyframes({
      state,
      emittedStyleValues: [{ animationName: identifier("ants") }],
      styledDecls: [],
    });

    expect([...(state.inlineKeyframes?.keys() ?? [])]).toEqual(["ants"]);
    expect([...(state.inlineKeyframeNameMap?.entries() ?? [])]).toEqual([["ants", "ants"]]);
    expect([...state.keyframesNames]).toEqual(["ants"]);
  });

  it("keeps keyframes referenced by transformed variant styles", () => {
    const state = makeState();
    const decl: InlineKeyframeStyleBuckets = {
      skipTransform: false,
      staticBooleanVariants: [
        {
          propName: "animate",
          styleKey: "beesVariant",
          styles: { animationName: identifier("bees") },
        },
      ],
    };

    pruneUnusedInlineKeyframes({
      state,
      emittedStyleValues: [],
      styledDecls: [decl],
    });

    expect([...(state.inlineKeyframes?.keys() ?? [])]).toEqual(["bees"]);
    expect([...(state.inlineKeyframeNameMap?.entries() ?? [])]).toEqual([["bees", "bees"]]);
    expect([...state.keyframesNames]).toEqual(["bees"]);
  });
});
