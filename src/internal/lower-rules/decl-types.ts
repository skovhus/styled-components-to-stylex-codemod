/**
 * Shared type aliases used across lower-rules helpers.
 * Core concepts: common expression and test metadata types.
 */
import type { JSCodeshift } from "jscodeshift";

export type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

/**
 * Type for variant test condition info.
 */
export type TestInfo = { when: string; propName: string; allPropNames?: string[] };
