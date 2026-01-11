import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Node ESM loader:
 * - Allows running `src/*.ts` directly under Node by rewriting relative `.js` specifiers
 *   (used in our source TS) to `.ts` when that file exists.
 *
 * Example:
 *   import "./internal/ast-safety.js"   -> "./internal/ast-safety.ts"
 */
export async function resolve(specifier, context, nextResolve) {
  const parentURL = context.parentURL;

  // Only rewrite relative `.js` imports coming from our source tree.
  if (
    parentURL?.startsWith(pathToFileURL(process.cwd()).href) &&
    specifier.startsWith(".") &&
    specifier.endsWith(".js")
  ) {
    const tryExts = [".ts", ".tsx", ".mts"];
    for (const ext of tryExts) {
      const candidate = new URL(specifier.replace(/\.js$/, ext), parentURL);
      try {
        await access(fileURLToPath(candidate));
        return { url: candidate.href, shortCircuit: true };
      } catch {
        // continue
      }
    }
  }

  return nextResolve(specifier, context);
}
