/**
 * Step: ensure style merger import exists when referenced.
 * Core concepts: identifier usage scanning and import injection.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Ensures the style merger import is present when the merger function is referenced.
 */
export function ensureMergerImportStep(ctx: TransformContext): StepResult {
  const { root, j, adapter } = ctx;

  // Ensure the style merger import is present whenever the merger function is actually called.
  // We intentionally key this off call expressions (not identifier-name matches) so local
  // bindings with the same name do not cause false-positive imports.
  if (adapter.styleMerger?.functionName && adapter.styleMerger.importSource) {
    const mergerName = adapter.styleMerger.functionName;
    const hasMergerCall =
      root
        .find(j.CallExpression, {
          callee: { type: "Identifier", name: mergerName },
        } as any)
        .size() > 0;
    const hasMergerImportBinding =
      root
        .find(j.ImportDeclaration)
        .filter((p: any) =>
          ((p.node.specifiers ?? []) as any[]).some((s: any) => {
            if (s?.type !== "ImportSpecifier") {
              return false;
            }
            return s.local?.type === "Identifier" && s.local.name === mergerName;
          }),
        )
        .size() > 0;
    const hasTopLevelBinding = hasTopLevelValueBinding(root, mergerName);

    if (hasMergerCall && !hasMergerImportBinding && !hasTopLevelBinding) {
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

function hasTopLevelValueBinding(root: any, localName: string): boolean {
  const body = root.get().node.program.body as any[];
  const hasBindingInDeclaration = (decl: any): boolean => {
    if (!decl || typeof decl !== "object") {
      return false;
    }
    if (
      (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") &&
      decl.id?.type === "Identifier" &&
      decl.id.name === localName
    ) {
      return true;
    }
    if (decl.type === "VariableDeclaration") {
      return (decl.declarations ?? []).some(
        (d: any) => d?.id?.type === "Identifier" && d.id.name === localName,
      );
    }
    return false;
  };

  for (const stmt of body) {
    if (hasBindingInDeclaration(stmt)) {
      return true;
    }
    if (stmt?.type === "ExportNamedDeclaration" || stmt?.type === "ExportDefaultDeclaration") {
      if (hasBindingInDeclaration(stmt.declaration)) {
        return true;
      }
    }
  }
  return false;
}
