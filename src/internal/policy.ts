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
  });
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
      .find(j.TaggedTemplateExpression)
      .filter((p) => p.node.tag.type === "Identifier" && p.node.tag.name === cssLocalForSkip)
      .size() > 0 ||
    root
      .find(j.CallExpression)
      .filter((p) => p.node.callee.type === "Identifier" && p.node.callee.name === cssLocalForSkip)
      .size() > 0;
  if (!isUsed) {
    return warnings;
  }

  const warningType =
    "`css` helper usage from styled-components is not supported because nested css blocks are not transformed" as const;
  const usageLocs: Array<{ line: number; column: number }> = [];
  type NodeWithLoc = ASTNode & {
    loc?: {
      start?: {
        line?: number;
        column?: number;
      };
    };
  };
  const hasLoc = (node: ASTNode): node is NodeWithLoc => "loc" in node;
  const noteLoc = (node: ASTNode): void => {
    if (!hasLoc(node)) {
      return;
    }
    const loc = node.loc?.start;
    if (!loc?.line && loc?.line !== 0) {
      return;
    }
    usageLocs.push({ line: loc.line, column: loc.column ?? 0 });
  };

  root
    .find(j.TaggedTemplateExpression)
    .filter((p) => p.node.tag.type === "Identifier" && p.node.tag.name === cssLocalForSkip)
    .forEach((p) => noteLoc(p.node));
  root
    .find(j.CallExpression)
    .filter((p) => p.node.callee.type === "Identifier" && p.node.callee.name === cssLocalForSkip)
    .forEach((p) => noteLoc(p.node));

  if (usageLocs.length === 0) {
    warnings.push({
      severity: "warning",
      type: warningType,
      loc: undefined,
    });
    return warnings;
  }

  for (const loc of usageLocs) {
    warnings.push({
      severity: "warning",
      type: warningType,
      loc,
    });
  }

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
