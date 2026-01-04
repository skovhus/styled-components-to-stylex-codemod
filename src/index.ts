// Public API is intentionally small:
// - `defineAdapter`: configure how values/handlers are resolved
// - `runTransform`: run the codemod over a set of files
export { defineAdapter } from "./adapter.js";
export { runTransform } from "./run.js";
