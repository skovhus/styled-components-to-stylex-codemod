import type { JSCodeshift } from "jscodeshift";

export type DescendantOverride = {
  parentStyleKey: string;
  childStyleKey: string;
  overrideStyleKey: string;
};

export type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
