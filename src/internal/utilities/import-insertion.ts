/**
 * Helpers for inserting `import` declarations into a program body in a
 * deterministic position.
 */
import type { ASTNode, Collection, ImportDeclaration } from "jscodeshift";

/**
 * Return the index of the LAST top-level `ImportDeclaration` in `body`, or -1
 * when there are none.
 */
export function findLastImportIndex(body: ReadonlyArray<{ type?: string } | undefined | null>): number {
  let last = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i]?.type === "ImportDeclaration") {
      last = i;
    }
  }
  return last;
}

/**
 * Insert `decl` after the last existing import in `body`. When the body has no
 * imports, inserts at index 0 (top of file).
 */
export function insertAfterLastImport(
  body: Array<{ type?: string }>,
  decl: { type?: string },
): void {
  const lastImportIdx = findLastImportIndex(body);
  const insertAt = lastImportIdx >= 0 ? lastImportIdx + 1 : 0;
  body.splice(insertAt, 0, decl);
}

/**
 * Insert `decl` near other imports, preferring placement immediately after the
 * `@stylexjs/stylex` import when one is present. Falls back to "after the last
 * import" and finally to "top of file".
 */
export function insertImportDeclarationNearStylex(
  root: Collection<ASTNode>,
  decl: ImportDeclaration,
): void {
  const body = root.get().node.program.body as Array<{
    type?: string;
    source?: { value?: unknown };
  }>;
  const stylexIdx = body.findIndex(
    (s) => s?.type === "ImportDeclaration" && s.source?.value === "@stylexjs/stylex",
  );
  if (stylexIdx >= 0) {
    body.splice(stylexIdx + 1, 0, decl as unknown as { type?: string });
    return;
  }
  insertAfterLastImport(body, decl as unknown as { type?: string });
}
