export { default as transform, transformWithWarnings } from "./transform.js";
export { runTransform } from "./run.js";
export type { TransformOptions, TransformWarning, TransformResult } from "./transform.js";
export type { RunTransformOptions, RunTransformResult } from "./run.js";

// Adapter exports (primary API)
export type {
  Adapter,
  ResolveContext,
  ResolveResult,
  DynamicHandler,
  DynamicNode,
  HandlerContext,
  HandlerResult,
} from "./adapter.js";
export { defineAdapter } from "./adapter.js";

// jscodeshift runner expects a module with a default export transform function.
// Point `runTransform()` at `dist/index.mjs` to keep a single build entry.
export { default } from "./transform.js";
