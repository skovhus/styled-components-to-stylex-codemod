import type { Collection } from "jscodeshift";
import type { TransformWarning } from "./transform-types.js";

function findStyledComponentsNamedImport(args: {
  styledImports: Collection<any>;
  j: any;
  importedName: string;
}): object | null {
  const { styledImports, j, importedName } = args;
  const spec = styledImports
    .find(j.ImportSpecifier, {
      imported: { type: "Identifier", name: importedName },
    } as any)
    .nodes()[0];
  return spec ?? null;
}

export function shouldSkipForThemeProvider(args: {
  root: Collection<any>;
  j: any;
  styledImports: Collection<any>;
}): boolean {
  const { root, j, styledImports } = args;

  const themeProviderImportForSkip = styledImports
    .find(j.ImportSpecifier, {
      imported: { type: "Identifier", name: "ThemeProvider" },
    } as any)
    .nodes()[0] as any;
  const themeProviderLocalForSkip =
    themeProviderImportForSkip?.local?.type === "Identifier"
      ? themeProviderImportForSkip.local.name
      : themeProviderImportForSkip?.imported?.type === "Identifier"
        ? themeProviderImportForSkip.imported.name
        : undefined;
  if (!themeProviderLocalForSkip) {
    return false;
  }
  return root.find(j.JSXIdentifier, { name: themeProviderLocalForSkip } as any).size() > 0;
}

export function collectThemeProviderSkipWarnings(args: {
  root: Collection<any>;
  j: any;
  styledImports: Collection<any>;
}): TransformWarning[] {
  const { root, j, styledImports } = args;
  const warnings: TransformWarning[] = [];

  const themeProviderImportForSkip = findStyledComponentsNamedImport({
    styledImports,
    j,
    importedName: "ThemeProvider",
  }) as any;
  const themeProviderLocalForSkip =
    themeProviderImportForSkip?.local?.type === "Identifier"
      ? themeProviderImportForSkip.local.name
      : themeProviderImportForSkip?.imported?.type === "Identifier"
        ? themeProviderImportForSkip.imported.name
        : undefined;
  if (!themeProviderLocalForSkip) {
    return warnings;
  }
  const isUsed = root.find(j.JSXIdentifier, { name: themeProviderLocalForSkip } as any).size() > 0;
  if (!isUsed) {
    return warnings;
  }

  const warning: TransformWarning = {
    type: "unsupported-feature",
    feature: "ThemeProvider",
    message:
      "ThemeProvider usage is project-specific; skipping this file (manual follow-up required).",
  };
  if (themeProviderImportForSkip?.loc) {
    warning.line = themeProviderImportForSkip.loc.start.line;
    warning.column = themeProviderImportForSkip.loc.start.column;
  }
  warnings.push(warning);
  return warnings;
}

export function collectCreateGlobalStyleWarnings(
  styledImports: Collection<any>,
): TransformWarning[] {
  const warnings: TransformWarning[] = [];

  styledImports.forEach((importPath: any) => {
    const specifiers = importPath.node.specifiers ?? [];
    for (const specifier of specifiers) {
      if (
        specifier.type === "ImportSpecifier" &&
        specifier.imported.type === "Identifier" &&
        specifier.imported.name === "createGlobalStyle"
      ) {
        const warning: TransformWarning = {
          type: "unsupported-feature",
          feature: "createGlobalStyle",
          message:
            "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries).",
        };
        if (specifier.loc) {
          warning.line = specifier.loc.start.line;
          warning.column = specifier.loc.start.column;
        }
        warnings.push(warning);
      }
    }
  });

  return warnings;
}

export function shouldSkipForCreateGlobalStyle(args: {
  styledImports: Collection<any>;
  j: any;
}): boolean {
  return !!findStyledComponentsNamedImport({
    styledImports: args.styledImports,
    j: args.j,
    importedName: "createGlobalStyle",
  });
}

export function shouldSkipForStyledCssImport(args: {
  styledImports: Collection<any>;
  j: any;
}): boolean {
  return !!findStyledComponentsNamedImport({
    styledImports: args.styledImports,
    j: args.j,
    importedName: "css",
  });
}

export function universalSelectorUnsupportedWarning(): TransformWarning {
  return {
    type: "unsupported-feature",
    feature: "universal-selector",
    message:
      "Universal selectors (`*`) are currently unsupported; skipping this file (manual follow-up required).",
  };
}
