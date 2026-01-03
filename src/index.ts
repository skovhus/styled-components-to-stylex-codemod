export { default as transform, transformWithWarnings } from "./transform.js";
export { runTransform } from "./run.js";
export type { TransformOptions, TransformWarning, TransformResult } from "./transform.js";
export type { RunTransformOptions, RunTransformResult } from "./run.js";

// Hook exports (primary API)
export type {
  Hook,
  ValueContext,
  DynamicHandler,
  DynamicNode,
  HandlerContext,
  HandlerResult,
} from "./hook.js";
export { defineHook, builtinHandlers } from "./hook.js";
