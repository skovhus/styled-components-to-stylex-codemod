/**
 * Regex helpers for inspecting a module's default export by source text.
 *
 * These operate on raw source strings (not the AST) so they can be shared by
 * both prepass and transform-step layers without import-graph coupling.
 */

/**
 * Returns the local name of a PascalCase default export, supporting both
 * `export default Name` and `export { Name as default }` forms. Returns
 * `undefined` when no PascalCase default export is found.
 */
export function findDefaultExportedLocalName(source: string): string | undefined {
  return (
    source.match(/\bexport\s+default\s+([A-Z][A-Za-z0-9]*)\b/)?.[1] ??
    source.match(/\bexport\s*\{[^}]*\b([A-Z][A-Za-z0-9]*)\s+as\s+default\b[^}]*\}/)?.[1]
  );
}
