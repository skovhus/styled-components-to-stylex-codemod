import type {
  ASTNode,
  Collection,
  ImportDeclaration,
  ImportSpecifier,
  JSCodeshift,
} from "jscodeshift";
import type { WarningLog } from "./logger.js";

export function shouldSkipForThemeProvider(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  styledImports: Collection<ImportDeclaration>;
}): boolean {
  const { root, j, styledImports } = args;

  const themeProviderImportForSkip = styledImports
    .find(j.ImportSpecifier)
    .filter(
      (p) => p.node.imported.type === "Identifier" && p.node.imported.name === "ThemeProvider",
    )
    .nodes()[0];
  const themeProviderLocalForSkip =
    themeProviderImportForSkip?.local?.type === "Identifier"
      ? themeProviderImportForSkip.local.name
      : themeProviderImportForSkip?.imported?.type === "Identifier"
        ? themeProviderImportForSkip.imported.name
        : undefined;
  if (!themeProviderLocalForSkip) {
    return false;
  }
  return (
    root
      .find(j.JSXIdentifier)
      .filter((p) => p.node.name === themeProviderLocalForSkip)
      .size() > 0
  );
}

export function collectThemeProviderSkipWarnings(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  styledImports: Collection<ImportDeclaration>;
}): WarningLog[] {
  const { root, j, styledImports } = args;
  const warnings: WarningLog[] = [];

  const themeProviderImportForSkip = findStyledComponentsNamedImport({
    styledImports,
    j,
    importedName: "ThemeProvider",
  });
  const themeProviderLocalForSkip =
    themeProviderImportForSkip?.local?.type === "Identifier"
      ? themeProviderImportForSkip.local.name
      : themeProviderImportForSkip?.imported?.type === "Identifier"
        ? themeProviderImportForSkip.imported.name
        : undefined;
  if (!themeProviderLocalForSkip) {
    return warnings;
  }
  const isUsed =
    root
      .find(j.JSXIdentifier)
      .filter((p) => p.node.name === themeProviderLocalForSkip)
      .size() > 0;
  if (!isUsed) {
    return warnings;
  }

  warnings.push({
    severity: "warning",
    type: "ThemeProvider conversion needs to be handled manually",
    loc: themeProviderImportForSkip?.loc
      ? {
          line: themeProviderImportForSkip.loc.start.line,
          column: themeProviderImportForSkip.loc.start.column ?? 0,
        }
      : undefined,
  });

  return warnings;
}

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
