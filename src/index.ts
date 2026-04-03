/**
 * Public entry point for the codemod API.
 * Core concepts: adapter configuration and transform execution.
 */
export { defineAdapter } from "./adapter.js";
export type { AdapterInput, ImportSource, MarkerFileContext } from "./adapter.js";
export { runInit } from "./init.js";
export type { InitOptions, InitResult } from "./init.js";
export { runTransform } from "./run.js";
