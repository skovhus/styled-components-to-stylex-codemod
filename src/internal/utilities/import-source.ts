/**
 * Helpers for converting an `ImportSource` into the textual specifier used in
 * an emitted `import` declaration, and into a writable absolute file path.
 */
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { ImportSource } from "../../adapter.js";

/**
 * Convert an `ImportSource` to a module specifier string for use in import declarations.
 * - `kind: "specifier"` → returned as-is.
 * - `kind: "absolutePath"` → returned as a relative path from `filePath`'s directory,
 *   prefixed with `./` when needed.
 *
 * Pass `stripTsExtension: true` to drop a trailing `.ts`/`.tsx` from the relative
 * specifier (e.g. when emitting an import to a sidecar `.stylex.ts` file).
 */
export function importSourceToModuleSpecifier(
  source: ImportSource,
  filePath: string,
  options: { stripTsExtension?: boolean } = {},
): string {
  if (source.kind === "specifier") {
    return source.value;
  }
  const baseDir = dirname(filePath);
  let rel = relative(baseDir, source.value).split(sep).join("/");
  if (options.stripTsExtension) {
    rel = rel.replace(/\.tsx?$/, "");
  }
  if (!rel.startsWith(".")) {
    rel = `./${rel}`;
  }
  return rel;
}

/**
 * Resolve an `ImportSource` to an absolute file path for writing the sidecar file.
 * - `kind: "absolutePath"` → returned as-is.
 * - `kind: "specifier"` → resolved relative to `filePath`'s directory; appends `.ts`
 *   when the result has no `.{j,t}sx?` extension.
 */
export function importSourceToAbsolutePath(source: ImportSource, filePath: string): string {
  if (source.kind === "absolutePath") {
    return source.value;
  }
  const baseDir = dirname(filePath);
  let resolved = join(baseDir, source.value);
  if (!/\.[jt]sx?$/.test(resolved)) {
    resolved += ".ts";
  }
  return resolved;
}

/**
 * Throws if `source` is structurally invalid for use as a module reference,
 * with a `label` prefixed for caller context. Used by the merger import step
 * which validates user-provided adapter configuration at use-time.
 */
export function assertValidImportSource(source: ImportSource, label: string): void {
  if (typeof source.value !== "string" || source.value.trim() === "") {
    throw new Error(
      `Invalid ${label}: expected non-empty string, got ${JSON.stringify(source.value)}`,
    );
  }
  if (source.kind === "absolutePath" && !isAbsolute(source.value)) {
    throw new Error(
      `Invalid ${label}: expected absolute path, got ${JSON.stringify(source.value)}`,
    );
  }
}
