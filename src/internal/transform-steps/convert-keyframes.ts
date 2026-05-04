/**
 * Step: convert styled-components keyframes to stylex.keyframes.
 * Core concepts: keyframes detection and import updates.
 */
import { convertStyledKeyframes } from "../keyframes.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { objectToAst } from "../transform/helpers.js";

/**
 * Converts styled-components keyframes usage to stylex.keyframes and tracks created names.
 *
 * Also collects the names of pre-existing `stylex.keyframes(...)` declarations in the
 * file, so that incremental migrations (e.g. a leaves-only pass followed by a full
 * migration) can still recognize keyframe identifiers when expanding `animation`
 * shorthands in the surviving styled-components declarations.
 */
export function convertKeyframesStep(ctx: TransformContext): StepResult {
  const { styledImports, j, root } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  // Convert `styled-components` keyframes to `stylex.keyframes`.
  // Docs: https://stylexjs.com/docs/api/javascript/keyframes
  const keyframesImport = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s: any) => s.imported.type === "Identifier" && s.imported.name === "keyframes");
  const keyframesLocal =
    keyframesImport?.local?.type === "Identifier"
      ? keyframesImport.local.name
      : keyframesImport?.imported?.type === "Identifier"
        ? keyframesImport.imported.name
        : undefined;

  ctx.keyframesLocal = keyframesLocal;

  if (keyframesLocal) {
    const converted = convertStyledKeyframes({
      root,
      j,
      styledImports,
      keyframesLocal,
      objectToAst,
    });
    ctx.keyframesNames = converted.keyframesNames;
    if (converted.changed) {
      ctx.markChanged();
    }
  }

  // Pick up names of existing `const <name> = stylex.keyframes(...)` declarations
  // so subsequent transform passes still see them as keyframes when expanding
  // `animation` shorthands. This matters for incremental migration flows where a
  // previous run already converted `keyframes\`...\`` and removed the `keyframes`
  // import, but other styled-components decls in the same file still reference
  // the keyframe binding via interpolation.
  collectExistingStylexKeyframeNames(ctx);

  return CONTINUE;
}

// --- Non-exported helpers ---

function collectExistingStylexKeyframeNames(ctx: TransformContext): void {
  const { root, j } = ctx;
  root.find(j.VariableDeclarator).forEach((p) => {
    const id = p.node.id;
    if (id.type !== "Identifier") {
      return;
    }
    const init = p.node.init;
    if (
      !init ||
      init.type !== "CallExpression" ||
      init.callee.type !== "MemberExpression" ||
      init.callee.object.type !== "Identifier" ||
      init.callee.object.name !== "stylex" ||
      init.callee.property.type !== "Identifier" ||
      init.callee.property.name !== "keyframes"
    ) {
      return;
    }
    ctx.keyframesNames.add(id.name);
  });
}
