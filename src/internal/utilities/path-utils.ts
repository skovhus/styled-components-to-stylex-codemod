/**
 * Shared path utilities for symlink resolution and path normalization.
 */
import { existsSync, realpathSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

/**
 * Resolve a file path to its real (symlink-resolved) absolute path.
 * Falls back to pathResolve if realpathSync fails (e.g. file doesn't exist yet).
 */
export function toRealPath(filePath: string): string {
  const resolved = pathResolve(filePath);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * Returns `true` for ESM/CJS module specifiers that should be resolved
 * relative to the importing file (e.g. `./foo`, `../bar`, `.`, `..`). Bare
 * specifiers like `react` or `@scope/pkg` return `false`. Backslash-prefixed
 * forms are accepted to match how authoring tools sometimes emit Windows
 * paths into source.
 */
export function isRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith(".\\") ||
    specifier.startsWith("..\\")
  );
}

/**
 * Resolve a source file path to an existing implementation file when possible,
 * accepting extensionless imports and index modules before resolving symlinks.
 */
export function resolveExistingFilePath(filePath: string): string {
  const resolved = resolveExistingSourceFilePath(filePath);
  if (!existsSync(resolved)) {
    return resolved;
  }
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function resolveExistingSourceFilePath(filePath: string): string {
  const resolved = pathResolve(filePath);
  if (existsSync(resolved)) {
    return resolved;
  }
  for (const extension of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]) {
    const candidate = `${resolved}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return resolved;
}
