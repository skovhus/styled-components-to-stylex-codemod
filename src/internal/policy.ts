import type { Collection } from "jscodeshift";
import type { TransformWarning } from "./transform-types.js";

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
  const { styledImports, j } = args;
  const createGlobalStyleImportForSkip = styledImports
    .find(j.ImportSpecifier, {
      imported: { type: "Identifier", name: "createGlobalStyle" },
    } as any)
    .nodes()[0];
  return !!createGlobalStyleImportForSkip;
}

export function universalSelectorUnsupportedWarning(): TransformWarning {
  return {
    type: "unsupported-feature",
    feature: "universal-selector",
    message:
      "Universal selectors (`*`) are currently unsupported; skipping this file (manual follow-up required).",
  };
}
