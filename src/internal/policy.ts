/**
 * Policy checks for opt-out conditions and rule gating.
 * Core concepts: createGlobalStyle warning emission.
 */
import type { Collection, ImportDeclaration, ImportSpecifier, JSCodeshift } from "jscodeshift";
import type { WarningLog } from "./logger.js";

export function collectCreateGlobalStyleWarnings(
  styledImports: Collection<ImportDeclaration>,
): WarningLog[] {
  const warnings: WarningLog[] = [];

  styledImports.forEach((importPath) => {
    const specifiers = importPath.node.specifiers ?? [];
    for (const specifier of specifiers) {
      if (
        specifier.type === "ImportSpecifier" &&
        specifier.imported.type === "Identifier" &&
        specifier.imported.name === "createGlobalStyle"
      ) {
        warnings.push({
          severity: "warning",
          type: "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries)",
          loc: specifier.loc
            ? {
                line: specifier.loc.start.line,
                column: specifier.loc.start.column ?? 0,
              }
            : undefined,
        });
      }
    }
  });

  return warnings;
}

export function shouldSkipForCreateGlobalStyle(args: {
  styledImports: Collection<ImportDeclaration>;
  j: JSCodeshift;
}): boolean {
  return !!findStyledComponentsNamedImport({
    styledImports: args.styledImports,
    j: args.j,
    importedName: "createGlobalStyle",
  });
}

function findStyledComponentsNamedImport(args: {
  styledImports: Collection<ImportDeclaration>;
  j: JSCodeshift;
  importedName: string;
}): ImportSpecifier | null {
  const { styledImports, j, importedName } = args;
  const spec = styledImports
    .find(j.ImportSpecifier)
    .filter((p) => p.node.imported.type === "Identifier" && p.node.imported.name === importedName)
    .nodes()[0];
  return spec ?? null;
}
