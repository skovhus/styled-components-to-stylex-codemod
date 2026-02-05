import { assertNoNullNodesInArrays } from "../utilities/ast-safety.js";
import { collectStyledDecls } from "../collect-styled-decls.js";
import { extractStyledCallArgs } from "../extract-styled-call-args.js";
import { formatOutput } from "../utilities/format-output.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

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
  const styledDefaultImport =
    styledDefaultSpecifier?.local?.type === "Identifier"
      ? styledDefaultSpecifier.local.name
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
  // Skip transforming the entire file to avoid producing incorrect output.
  if (hasUniversalSelectors) {
    ctx.warnings.push({
      severity: "warning",
      type: "Universal selectors (`*`) are currently unsupported",
      loc: universalSelectorLoc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}
