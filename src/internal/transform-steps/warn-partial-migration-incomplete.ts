/**
 * Step: warn when partial migration leaves styled-components declarations behind.
 * Core concepts: partial migration diagnostics and converted declaration accounting.
 */
import { PARTIAL_MIGRATION_INCOMPLETE_WARNING } from "../logger.js";
import type { TransformContext } from "../transform-context.js";
import { CONTINUE, type StepResult, type StyledDecl } from "../transform-types.js";

export function warnPartialMigrationIncompleteStep(ctx: TransformContext): StepResult {
  if (!shouldWarnForPartialMigration(ctx)) {
    return CONTINUE;
  }

  const skippedDecls = collectSkippedStyledDeclarations(ctx.styledDecls);
  const convertedDecls = collectConvertedStyleDeclarations(ctx.styledDecls);
  if (skippedDecls.length === 0 || convertedDecls.length === 0) {
    return CONTINUE;
  }

  ctx.warnings.push({
    severity: "warning",
    type: PARTIAL_MIGRATION_INCOMPLETE_WARNING,
    loc: skippedDecls[0]?.loc,
    context: {
      skippedDeclarationCount: skippedDecls.length,
      skippedDeclarations: declarationNames(skippedDecls),
      convertedDeclarationCount: convertedDecls.length,
      convertedDeclarations: declarationNames(convertedDecls),
    },
  });

  return CONTINUE;
}

const MAX_PARTIAL_MIGRATION_WARNING_NAMES = 20;

function shouldWarnForPartialMigration(ctx: TransformContext): boolean {
  return ctx.hasChanges && ctx.options.allowPartialMigration === true;
}

function collectSkippedStyledDeclarations(styledDecls: StyledDecl[] | undefined): StyledDecl[] {
  return (
    styledDecls?.filter(
      (decl) => decl.skipTransform && !decl.isCssHelper && !decl.isDirectJsxResolution,
    ) ?? []
  );
}

function collectConvertedStyleDeclarations(styledDecls: StyledDecl[] | undefined): StyledDecl[] {
  return styledDecls?.filter((decl) => !decl.skipTransform && !decl.isCssHelper) ?? [];
}

function declarationNames(decls: StyledDecl[]): string[] {
  return decls.slice(0, MAX_PARTIAL_MIGRATION_WARNING_NAMES).map((decl) => decl.localName);
}
