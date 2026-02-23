/**
 * Public entry point for the codemod API.
 * Core concepts: adapter configuration and transform execution.
 */
export { defineAdapter } from "./adapter.js";
export type { AdapterInput } from "./adapter.js";
export { runTransform } from "./run.js";
