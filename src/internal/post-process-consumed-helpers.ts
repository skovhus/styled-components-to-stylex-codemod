/**
 * Removes local helper declarations that were fully consumed by interpolation lowering.
 */
import type { StyledDecl } from "./transform-types.js";
import type { TransformContext } from "./transform-context.js";

export function cleanupConsumedLocalHelpers(
  ctx: TransformContext,
  styledDecls: StyledDecl[],
): void {
  const { root, j } = ctx;

  for (const decl of styledDecls) {
    for (const helperName of decl.consumedLocalHelpers ?? []) {
      const fnPaths = root.find(j.FunctionDeclaration, { id: { name: helperName } });
      if (fnPaths.size() === 0) {
        continue;
      }

      if (isExportedFunction(fnPaths)) {
        continue;
      }

      const refs = root
        .find(j.Identifier, { name: helperName })
        .filter(
          (idPath: { node?: unknown; parentPath?: { node?: { type?: string; id?: unknown } } }) => {
            const parent = idPath.parentPath?.node;
            if (parent?.type === "FunctionDeclaration" && parent.id === idPath.node) {
              return false;
            }
            return true;
          },
        );
      if (refs.size() === 0) {
        fnPaths.forEach((p: { prune: () => void }) => p.prune());
      }
    }
  }
}

function isExportedFunction(fnPaths: {
  some: (callback: (p: { parentPath?: { node?: { type?: string } } }) => boolean) => boolean;
}): boolean {
  return fnPaths.some(
    (p) =>
      p.parentPath?.node?.type === "ExportNamedDeclaration" ||
      p.parentPath?.node?.type === "ExportDefaultDeclaration",
  );
}
