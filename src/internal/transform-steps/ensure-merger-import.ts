import { CONTINUE, type StepResult } from "../transform-types.js";
import { isIdentifierReference } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";

/**
 * Ensures the style merger import is present when the merger function is referenced.
 */
export function ensureMergerImportStep(ctx: TransformContext): StepResult {
  const { root, j, adapter } = ctx;

  // Ensure the style merger import is present whenever the merger function is referenced.
  // This covers cases where wrapper emission uses the merger even when earlier heuristics
  // didn't mark it as required.
  if (adapter.styleMerger?.functionName && adapter.styleMerger.importSource) {
    const mergerName = adapter.styleMerger.functionName;
    const hasMergerUsage =
      root
        .find(j.Identifier, { name: mergerName } as any)
        .filter((p: any) => isIdentifierReference(p))
        .size() > 0;
    const hasMergerImport =
      root
        .find(j.ImportSpecifier, {
          imported: { type: "Identifier", name: mergerName },
        } as any)
        .size() > 0;
    const hasLocalBinding =
      root.find(j.FunctionDeclaration, { id: { name: mergerName } } as any).size() > 0 ||
      root
        .find(j.VariableDeclarator, { id: { type: "Identifier", name: mergerName } } as any)
        .size() > 0;
    if (hasMergerUsage && !hasMergerImport && !hasLocalBinding) {
      const source = adapter.styleMerger.importSource;
      if (source.kind === "specifier") {
        const decl = j.importDeclaration(
          [j.importSpecifier(j.identifier(mergerName))],
          j.literal(source.value),
        );
        const stylexImport = root.find(j.ImportDeclaration, {
          source: { value: "@stylexjs/stylex" },
        } as any);
        if (stylexImport.size() > 0) {
          stylexImport.at(stylexImport.size() - 1).insertAfter(decl);
        } else {
          const firstImport = root.find(j.ImportDeclaration).at(0);
          if (firstImport.size() > 0) {
            firstImport.insertBefore(decl);
          } else {
            root.get().node.program.body.unshift(decl);
          }
        }
        ctx.markChanged();
      }
    }
  }

  return CONTINUE;
}
