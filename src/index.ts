export { default as transform, transformWithWarnings } from "./transform.js";
export { runTransform } from "./run.js";
export type { TransformOptions, TransformWarning, TransformResult } from "./transform.js";
export type { RunTransformOptions, RunTransformResult } from "./run.js";

// Adapter exports (primary API)
export type {
  Adapter,
  ValueContext,
  DynamicHandler,
  DynamicNode,
  HandlerContext,
  HandlerResult,
} from "./adapter.js";
export { defineAdapter, builtinHandlers } from "./adapter.js";
