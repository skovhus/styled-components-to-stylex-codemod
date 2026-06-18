/**
 * Extracts theme-condition metadata from conditional test expressions and
 * resolves block-level theme conditionals into theme-conditional style objects.
 * Split out of `css-helper-conditional.ts`.
 */
import type { ExpressionKind } from "./decl-types.js";
import { isEmptyCssBranch, type ASTNodeRecord } from "../utilities/jscodeshift-utils.js";
import { rewritePropsThemeToThemeVar } from "./inline-styles.js";
import { buildThemeStyleKeys } from "../utilities/style-key-naming.js";
import { isMemberExpression } from "./utils.js";
import { literalToStaticValue } from "./types.js";
import { resolveTemplateLiteralBranch, type TemplateLiteralContext } from "./template-literals.js";
import type { CssHelperConditionalContext } from "./css-helper-conditional.js";

/**
 * Attempts to resolve a block-level theme conditional (where `isThemeAccessTest` is true)
 * by resolving both CSS branches and emitting theme-conditional style objects.
 *
 * Returns true if successfully handled, false if should fall through to bail.
 */
export function tryResolveBlockLevelThemeConditional(args: BlockThemeConditionalArgs): boolean {
  const {
    conditional,
    paramName,
    replaceParamWithProps,
    isPlainTemplateLiteral,
    isCssHelperTaggedTemplate,
    resolveStaticCssBlock,
    decl,
    extraStyleObjects,
    pseudos,
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
    warnings,
  } = args;

  const cons = conditional.consequent;
  const alt = conditional.alternate;
  const consIsEmpty = isEmptyCssBranch(cons);
  const altIsEmpty = isEmptyCssBranch(alt);

  const tplCtx: TemplateLiteralContext = {
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo: componentInfo as TemplateLiteralContext["componentInfo"],
    handlerContext,
    warnings,
    keyframesNames: args.keyframesNames,
    inlineKeyframeNameMap: args.inlineKeyframeNameMap,
  };

  const resolveTemplateNode = (
    tplNode: import("jscodeshift").TemplateLiteral,
  ): Record<string, unknown> | null => {
    const resolved = resolveTemplateLiteralBranch(tplCtx, {
      node: tplNode,
      paramName,
    });
    if (!resolved) {
      return null;
    }
    // Block-level theme conditionals cannot handle dynamic/inline entries
    if (resolved.dynamicEntries.length > 0 || resolved.inlineEntries.length > 0) {
      return null;
    }
    return resolved.style;
  };

  const resolveBranch = (node: ExpressionKind): Record<string, unknown> | null => {
    // String literal: "color: white;"
    if (
      node.type === "StringLiteral" ||
      (node.type === "Literal" && typeof (node as { value?: unknown }).value === "string")
    ) {
      const rawCss = (node as { value: string }).value;
      return resolveStaticCssBlock(rawCss);
    }
    // Template literal (with or without interpolations)
    if (isPlainTemplateLiteral(node)) {
      return resolveTemplateNode(node as import("jscodeshift").TemplateLiteral);
    }
    // css`` tagged template
    if (isCssHelperTaggedTemplate(node)) {
      return resolveTemplateNode((node as { quasi: import("jscodeshift").TemplateLiteral }).quasi);
    }
    return null;
  };

  const consStyle = consIsEmpty ? {} : resolveBranch(cons);
  const altStyle = altIsEmpty ? {} : resolveBranch(alt);

  if (consStyle === null || altStyle === null) {
    return false;
  }

  if (Object.keys(consStyle).length === 0 && Object.keys(altStyle).length === 0) {
    return false;
  }

  // Build condition expression:
  // 1. replaceParamWithProps: rewrites param refs (handles destructured ({ theme }) patterns)
  // 2. rewriteThemeToUseThemeVar: replaces `props.theme.X` → `theme.X`
  const propsCondition = replaceParamWithProps(conditional.test);
  const conditionExpr = rewritePropsThemeToThemeVar(propsCondition);

  const themeInfo = extractThemeConditionInfo(conditionExpr);
  if (!themeInfo) {
    return false;
  }
  const { themeProp } = themeInfo;

  const { trueKey, falseKey } = buildThemeStyleKeys(
    decl.styleKey,
    themeProp,
    themeInfo.comparisonValue,
  );
  const hasTrue = Object.keys(consStyle).length > 0;
  const hasFalse = Object.keys(altStyle).length > 0;
  const trueStyleKey = hasTrue ? trueKey : null;
  const falseStyleKey = hasFalse ? falseKey : null;

  // When inside a pseudo selector (e.g., &[data-state="active"]), wrap each resolved
  // property value with the pseudo selector map: { default: null, pseudo: value }
  if (pseudos?.length) {
    const wrapWithPseudo = (style: Record<string, unknown>): Record<string, unknown> => {
      const wrapped: Record<string, unknown> = {};
      for (const [prop, value] of Object.entries(style)) {
        wrapped[prop] = {
          default: null,
          ...Object.fromEntries(pseudos.map((p) => [p, value])),
        };
      }
      return wrapped;
    };
    if (trueStyleKey) {
      extraStyleObjects.set(trueStyleKey, wrapWithPseudo(consStyle));
    }
    if (falseStyleKey) {
      extraStyleObjects.set(falseStyleKey, wrapWithPseudo(altStyle));
    }
  } else {
    if (trueStyleKey) {
      extraStyleObjects.set(trueStyleKey, consStyle);
    }
    if (falseStyleKey) {
      extraStyleObjects.set(falseStyleKey, altStyle);
    }
  }

  if (!decl.needsUseThemeHook) {
    decl.needsUseThemeHook = [];
  }
  decl.needsUseThemeHook.push({
    themeProp,
    conditionExpr,
    trueStyleKey,
    falseStyleKey,
  });

  decl.needsWrapperComponent = true;
  return true;
}

type BlockThemeConditionalArgs = Pick<
  CssHelperConditionalContext,
  | "decl"
  | "extraStyleObjects"
  | "j"
  | "filePath"
  | "parseExpr"
  | "resolveValue"
  | "resolveCall"
  | "resolveImportInScope"
  | "resolverImports"
  | "handlerContext"
  | "isCssHelperTaggedTemplate"
  | "isPlainTemplateLiteral"
  | "resolveStaticCssBlock"
  | "warnings"
  | "keyframesNames"
  | "inlineKeyframeNameMap"
> & {
  conditional: { test: ExpressionKind; consequent: ExpressionKind; alternate: ExpressionKind };
  paramName: string | null;
  replaceParamWithProps: (exprNode: ExpressionKind) => ExpressionKind;
  componentInfo: { localName: string; base: string; tagOrIdent: string };
  pseudos: string[] | null;
};

function extractThemeConditionInfo(
  node: ExpressionKind,
): { themeProp: string; comparisonValue?: string } | null {
  const rec = node as ASTNodeRecord;

  if (rec.type === "BinaryExpression") {
    const left = rec.left as ExpressionKind;
    const right = rec.right as ASTNodeRecord;
    const leftInfo = extractThemeConditionInfo(left);
    if (leftInfo && !leftInfo.comparisonValue) {
      const val = literalToStaticValue(right as unknown);
      if (val !== null && typeof val === "string") {
        return { themeProp: leftInfo.themeProp, comparisonValue: val };
      }
    }
    return leftInfo ?? extractThemeConditionInfo(right as ExpressionKind);
  }

  if (isMemberExpression(rec)) {
    const obj = rec.object as { type?: string; name?: string } | undefined;
    const prop = rec.property as { type?: string; name?: string } | undefined;
    if (obj?.type === "Identifier" && obj.name === "theme" && prop?.type === "Identifier") {
      return prop.name ? { themeProp: prop.name } : null;
    }
    return extractThemeConditionInfo(rec.object as ExpressionKind);
  }

  if (rec.type === "LogicalExpression") {
    return (
      extractThemeConditionInfo(rec.left as ExpressionKind) ??
      extractThemeConditionInfo(rec.right as ExpressionKind)
    );
  }
  if (rec.type === "UnaryExpression") {
    return extractThemeConditionInfo(rec.argument as ExpressionKind);
  }
  return null;
}
