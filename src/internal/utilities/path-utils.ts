/**
 * Shared path utilities for symlink resolution and path normalization.
 */
import { realpathSync } from "node:fs";
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
