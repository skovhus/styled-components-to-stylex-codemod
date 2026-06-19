/**
 * Step: collect styled declarations and helper mixins.
 * Core concepts: declaration extraction and helper normalization.
 */
import { assertNoNullNodesInArrays } from "../utilities/ast-safety.js";
import { collectStyledDecls } from "../collect-styled-decls.js";
import { extractStyledCallArgs } from "../extract-styled-call-args.js";
import { findUncollectedStyledTemplateLoc } from "../utilities/uncollected-styled-template.js";
import { formatOutput } from "../utilities/format-output.js";
import { UNSUPPORTED_SHOULD_FORWARD_PROP_WARNING } from "../logger.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { applyTypeScriptMetadataToDecl } from "../utilities/typescript-metadata.js";

/**
 * Collects styled declarations and merges extracted css helper declarations.
 */
export function collectStyledDeclsStep(ctx: TransformContext): StepResult {
  const { styledImports, root, j, cssLocal } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  // We can have styled-components usage without a default import (e.g. only `keyframes` or `css`).
  // Don't early-return; instead apply what we can.
  const styledDefaultSpecifier = styledImports.find(j.ImportDefaultSpecifier).nodes()[0];
  const namedStyledSpecifier = !styledDefaultSpecifier
    ? styledImports
        .find(j.ImportSpecifier)
        .filter(
          (p: any) => p.node.imported?.type === "Identifier" && p.node.imported.name === "styled",
        )
        .nodes()[0]
    : undefined;
  const styledDefaultImport =
    styledDefaultSpecifier?.local?.type === "Identifier"
      ? styledDefaultSpecifier.local.name
      : namedStyledSpecifier?.local?.type === "Identifier"
        ? namedStyledSpecifier.local.name
        : undefined;
  ctx.styledDefaultImport = styledDefaultImport;

  // Pre-process: extract CallExpression arguments from styled() calls into separate variables.
  // This transforms patterns like styled(motion.create(Component)) into:
  //   const MotionComponent = motion.create(Component);
  //   styled(MotionComponent)
  // which can then be handled by the normal styled(Identifier) collection path.
  if (extractStyledCallArgs({ root, j, styledDefaultImport })) {
    ctx.markChanged();
  }

  const collected = collectStyledDecls({
    root,
    j,
    styledDefaultImport,
    cssLocal,
  });

  const styledDecls = collected.styledDecls;
  for (const decl of styledDecls) {
    applyTypeScriptMetadataToDecl(ctx, decl, [decl.localName]);
  }
  let hasUniversalSelectors = collected.hasUniversalSelectors;
  let universalSelectorLoc = collected.universalSelectorLoc;

  const cssHelpers = ctx.cssHelpers;
  if (cssHelpers?.cssHelperDecls?.length > 0) {
    styledDecls.push(...cssHelpers.cssHelperDecls);
    styledDecls.sort((a: any, b: any) => {
      const aIdx = a.declIndex ?? Number.POSITIVE_INFINITY;
      const bIdx = b.declIndex ?? Number.POSITIVE_INFINITY;
      if (aIdx !== bIdx) {
        return aIdx - bIdx;
      }
      return 0;
    });
  }

  ctx.styledDecls = styledDecls;
  const uncollectedStyledTemplateLoc = findUncollectedStyledTemplateLoc({
    root: ctx.root,
    j: ctx.j,
    isStyledTag: ctx.isStyledTag,
    styledDecls: ctx.styledDecls,
  });
  if (
    ctx.options.transformMode !== "leavesOnly" &&
    !(ctx.options.allowPartialMigration ?? false) &&
    uncollectedStyledTemplateLoc !== undefined
  ) {
    ctx.warnings.push({
      severity: "warning",
      type: "Higher-order styled factory wrappers (e.g. hoc(styled)) are not supported",
      loc: uncollectedStyledTemplateLoc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  // Check for unparseable shouldForwardProp - bail to avoid semantic changes
  const unparseableSfpDecl = styledDecls.find(
    (d) => !d.skipTransform && d.hasUnparseableShouldForwardProp,
  );
  if (unparseableSfpDecl && ctx.options.transformMode !== "leavesOnly") {
    ctx.warnings.push({
      severity: "warning",
      type: UNSUPPORTED_SHOULD_FORWARD_PROP_WARNING,
      loc: unparseableSfpDecl.loc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  const unsupportedFunctionAttrsDecl = styledDecls.find(
    (d) =>
      !d.skipTransform &&
      d.attrsInfo?.sourceKind === "function" &&
      d.attrsInfo.hasUnsupportedValues,
  );
  if (unsupportedFunctionAttrsDecl && ctx.options.transformMode !== "leavesOnly") {
    ctx.warnings.push({
      severity: "warning",
      type: "Unsupported .attrs() callback pattern",
      loc: unsupportedFunctionAttrsDecl.loc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  // If we didn't find any styled declarations but performed other edits (e.g. keyframes conversion),
  // we'll still emit output without injecting StyleX styles.
  if (styledDecls.length === 0) {
    return returnResult(
      {
        code: ctx.hasChanges
          ? formatOutput(
              (assertNoNullNodesInArrays(root.get().node),
              root.toSource({
                quote: "double",
                trailingComma: true,
                reuseWhitespace: false,
              })),
            )
          : null,
        warnings: ctx.warnings,
      },
      "skip",
    );
  }

  if (cssHelpers?.cssHelperHasUniversalSelectors) {
    hasUniversalSelectors = true;
    if (!universalSelectorLoc) {
      universalSelectorLoc = cssHelpers.cssHelperUniversalSelectorLoc;
    }
  }

  ctx.hasUniversalSelectors = hasUniversalSelectors;
  ctx.universalSelectorLoc = universalSelectorLoc;

  // Universal selectors (`*`) are currently unsupported (too many edge cases to map to StyleX safely).
  // With partial migration enabled, preserve only the declarations that contain them; otherwise keep
  // the legacy whole-file bail.
  if (hasUniversalSelectors && ctx.options.transformMode !== "leavesOnly") {
    ctx.warnings.push({
      severity: "warning",
      type: "Universal selectors (`*`) are currently unsupported",
      loc: universalSelectorLoc,
    });
    if (ctx.options.allowPartialMigration === true) {
      for (const decl of styledDecls) {
        if (decl.hasUniversalSelector) {
          decl.skipTransform = true;
        }
      }
      return CONTINUE;
    }
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}
