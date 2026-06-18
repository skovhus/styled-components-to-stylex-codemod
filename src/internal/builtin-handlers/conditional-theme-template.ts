/**
 * Helpers that resolve theme-bearing template literals from conditional
 * branches into split-variant styles.
 */
import { getSinglePropFromMemberExpr, isEmptyCssBranch } from "../utilities/jscodeshift-utils.js";
import { parseCssDeclarationBlockWithTemplateExpr } from "./css-parsing.js";
import { resolveTemplateLiteralWithTheme } from "./resolver-utils.js";
import type { HandlerResult, InternalHandlerContext } from "./types.js";

/**
 * Shared pipeline: resolve a template literal with theme expressions into a
 * splitVariants result. Used by both the `&&` handler and the ternary handler.
 *
 * Steps: resolve template → strip backticks → parse CSS declarations → build variant.
 */
export function resolveThemeTemplateToCssVariant(
  templateNode: unknown,
  paramName: string,
  ctx: InternalHandlerContext,
  variant: { nameHint: string; when: string },
): HandlerResult | null {
  const templateResult = resolveTemplateLiteralWithTheme(templateNode, paramName, ctx);
  if (!templateResult) {
    return null;
  }
  const templateText = templateResult.expr.slice(1, -1); // Remove backticks
  const parsed = parseCssDeclarationBlockWithTemplateExpr(templateText, ctx.api);
  if (!parsed) {
    return null;
  }
  return {
    type: "splitVariants",
    variants: [
      {
        nameHint: variant.nameHint,
        when: variant.when,
        style: parsed.styleObj,
        imports: templateResult.imports,
      },
    ],
  };
}

/**
 * Handle a ternary where one branch is a template literal with theme expressions
 * and the other is empty (undefined/null/false/""). Resolves the template literal
 * using the same approach as tryResolveConditionalCssBlock's && handler.
 */
export function tryResolveTemplateLiteralTernaryWithEmptyBranch(
  body: { test: unknown; consequent: unknown; alternate: unknown },
  paramName: string,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const { consequent, alternate } = body;
  const consType = (consequent as { type?: string })?.type;
  const altType = (alternate as { type?: string })?.type;
  const consIsTemplate = consType === "TemplateLiteral";
  const altIsTemplate = altType === "TemplateLiteral";
  const consIsEmpty = isEmptyCssBranch(consequent);
  const altIsEmpty = isEmptyCssBranch(alternate);

  if (!(consIsTemplate && altIsEmpty) && !(consIsEmpty && altIsTemplate)) {
    return null;
  }

  const testProp = getSinglePropFromMemberExpr(body.test, paramName);
  if (!testProp) {
    return null;
  }

  const templateBranch = consIsTemplate ? consequent : alternate;
  // When the truthy branch is the template, use the test prop directly.
  // When the falsy branch is the template, negate the condition.
  const when = consIsTemplate ? testProp : `!${testProp}`;
  const nameHint = consIsTemplate ? "truthy" : "falsy";

  return resolveThemeTemplateToCssVariant(templateBranch, paramName, ctx, {
    nameHint,
    when,
  });
}
