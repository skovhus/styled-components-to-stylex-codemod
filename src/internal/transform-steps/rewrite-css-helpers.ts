import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Rewrites standalone css helper usages to StyleX style references.
 */
export function rewriteCssHelpersStep(ctx: TransformContext): StepResult {
  const { root, j, cssLocal } = ctx;
  const cssHelpers = ctx.cssHelpers;
  if (!cssHelpers) {
    return CONTINUE;
  }

  const cssHelperReplacements = cssHelpers.cssHelperReplacements ?? [];
  const cssHelperTemplateReplacements = cssHelpers.cssHelperTemplateReplacements ?? [];
  if (cssHelperReplacements.length === 0 && cssHelperTemplateReplacements.length === 0) {
    return CONTINUE;
  }

  const stylesIdentifier = ctx.stylesIdentifier ?? "styles";
  let changed = false;

  for (const { localName, styleKey } of cssHelperReplacements) {
    root
      .find(j.VariableDeclarator, {
        id: { type: "Identifier", name: localName },
      } as any)
      .forEach((p: any) => {
        const init = p.node.init as any;
        if (
          init?.type === "TaggedTemplateExpression" &&
          (!cssLocal ||
            (init.tag?.type === "Identifier" && init.tag.name === cssLocal))
        ) {
          p.node.init = j.memberExpression(
            j.identifier(stylesIdentifier),
            j.identifier(styleKey),
          );
          changed = true;
        }
      });
  }

  if (cssHelperTemplateReplacements.length > 0) {
    const replacementMap = new Map<any, string>();
    for (const rep of cssHelperTemplateReplacements) {
      replacementMap.set(rep.node, rep.styleKey);
    }
    root.find(j.TaggedTemplateExpression).forEach((p: any) => {
      const styleKey = replacementMap.get(p.node);
      if (!styleKey) {
        return;
      }
      j(p).replaceWith(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(styleKey)),
      );
      changed = true;
    });
  }

  if (changed) {
    ctx.markChanged();
  }

  return CONTINUE;
}
