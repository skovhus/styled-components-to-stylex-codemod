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
export {
  defineHook,
  defaultHook,
  defineVarsHook,
  inlineValuesHook,
  defaultResolveValue,
  builtinHandlers,
} from "./hook.js";

// Backwards compatibility (deprecated)
export type { Adapter, AdapterContext, DynamicNodePlugin, PluginContext, PluginResult } from "./hook.js";
export { defaultAdapter, defineVarsAdapter, inlineValuesAdapter, builtinPlugins } from "./hook.js";
