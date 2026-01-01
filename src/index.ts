export { default as transform, transformWithWarnings } from "./transform.js";
export { runTransform } from "./run.js";
export type { Adapter, AdapterContext } from "./adapter.js";
export type { TransformOptions, TransformWarning, TransformResult } from "./transform.js";
export type { RunTransformOptions, RunTransformResult } from "./run.js";
export { defaultAdapter, defineVarsAdapter, inlineValuesAdapter } from "./adapter.js";
