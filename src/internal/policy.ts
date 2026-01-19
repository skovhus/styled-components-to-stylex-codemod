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

  const warning: WarningLog = {
    severity: "warning",
    type: "unsupported-feature",
    message: "ThemeProvider usage is project-specific",
  };
  if (themeProviderImportForSkip?.loc) {
    warning.loc = {
      line: themeProviderImportForSkip.loc.start.line,
      column: themeProviderImportForSkip.loc.start.column ?? 0,
    };
  }
  warnings.push(warning);
  return warnings;
}

export function collectCssHelperSkipWarnings(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  styledImports: Collection<ImportDeclaration>;
}): WarningLog[] {
  const { root, j, styledImports } = args;
  const warnings: WarningLog[] = [];

  const cssImportForSkip = findStyledComponentsNamedImport({
    styledImports,
    j,
    importedName: "css",
  }) as any;
  const cssLocalForSkip =
    cssImportForSkip?.local?.type === "Identifier"
      ? cssImportForSkip.local.name
      : cssImportForSkip?.imported?.type === "Identifier"
        ? cssImportForSkip.imported.name
        : undefined;
  if (!cssLocalForSkip) {
    return warnings;
  }

  const isUsed =
    root
      .find(j.TaggedTemplateExpression, {
        tag: { type: "Identifier", name: cssLocalForSkip },
      } as any)
      .size() > 0 ||
    root
      .find(j.CallExpression, { callee: { type: "Identifier", name: cssLocalForSkip } } as any)
      .size() > 0;
  if (!isUsed) {
    return warnings;
  }

  const warning: WarningLog = {
    severity: "warning",
    type: "unsupported-feature",
    message: "`css` helper usage from styled-components is not supported",
  };
  if (cssImportForSkip?.loc) {
    warning.loc = {
      line: cssImportForSkip.loc.start.line,
      column: cssImportForSkip.loc.start.column ?? 0,
    };
  }
  warnings.push(warning);
  return warnings;
}

export function collectCreateGlobalStyleWarnings(
  styledImports: Collection<ImportDeclaration>,
): WarningLog[] {
  const warnings: WarningLog[] = [];

  styledImports.forEach((importPath: any) => {
    const specifiers = importPath.node.specifiers ?? [];
    for (const specifier of specifiers) {
      if (
        specifier.type === "ImportSpecifier" &&
        specifier.imported.type === "Identifier" &&
        specifier.imported.name === "createGlobalStyle"
      ) {
        const warning: WarningLog = {
          severity: "warning",
          type: "unsupported-feature",
          message:
            "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries).",
        };
        if (specifier.loc) {
          warning.loc = {
            line: specifier.loc.start.line,
            column: specifier.loc.start.column ?? 0,
          };
        }
        warnings.push(warning);
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

export function universalSelectorUnsupportedWarning(
  loc?: { line: number; column: number } | null,
): WarningLog {
  return {
    severity: "warning",
    type: "unsupported-feature",
    message: "Universal selectors (`*`) are currently unsupported",
    ...(loc ? { loc } : {}),
  };
}

function findStyledComponentsNamedImport(args: {
  styledImports: Collection<ImportDeclaration>;
  j: JSCodeshift;
  importedName: string;
}): ImportSpecifier | null {
  const { styledImports, j, importedName } = args;
  const spec = styledImports
    .find(j.ImportSpecifier, {
      imported: { type: "Identifier", name: importedName },
    } as any)
    .nodes()[0];
  return spec ?? null;
}
