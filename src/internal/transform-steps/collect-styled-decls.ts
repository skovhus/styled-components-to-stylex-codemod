/**
 * Step: collect styled declarations and helper mixins.
 * Core concepts: declaration extraction and helper normalization.
 */
import { assertNoNullNodesInArrays } from "../utilities/ast-safety.js";
import { collectStyledDecls } from "../collect-styled-decls.js";
import { extractStyledCallArgs } from "../extract-styled-call-args.js";
import { getNodeLocStart } from "../utilities/jscodeshift-utils.js";
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
  const uncollectedStyledTemplateLoc = findUncollectedStyledTemplateLoc(ctx);
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
      type: "Unsupported shouldForwardProp pattern (only !prop.startsWith(), ![].includes(prop), and prop !== are supported)",
      loc: unparseableSfpDecl.loc,
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
  // Skip transforming the entire file to avoid producing incorrect output.
  if (hasUniversalSelectors && ctx.options.transformMode !== "leavesOnly") {
    ctx.warnings.push({
      severity: "warning",
      type: "Universal selectors (`*`) are currently unsupported",
      loc: universalSelectorLoc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}

function findUncollectedStyledTemplateLoc(
  ctx: TransformContext,
): { line: number; column: number } | null | undefined {
  const styledDeclNames = new Set(ctx.styledDecls?.map((decl) => decl.localName) ?? []);
  let loc: { line: number; column: number } | null | undefined;

  ctx.root.find(ctx.j.TaggedTemplateExpression).forEach((path: any) => {
    if (loc !== undefined || !ctx.isStyledTag(path.node.tag)) {
      return;
    }
    const declarator = ctx.j(path).closest(ctx.j.VariableDeclarator);
    const declaratorNode = declarator.size() > 0 ? declarator.get().node : undefined;
    if (declaratorNode?.init !== path.node) {
      return;
    }
    const id = declaratorNode.id;
    const declaratorName = id?.type === "Identifier" ? id.name : undefined;
    if (declaratorName && !styledDeclNames.has(declaratorName)) {
      loc = getNodeLocStart(path.node) ?? null;
    }
  });

  return loc;
}
