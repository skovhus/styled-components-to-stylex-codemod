import { lowerRules } from "../lower-rules.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { removeInlinedCssHelperFunctions } from "../transform/css-helpers.js";
import type { ImportSource } from "../../adapter.js";
import { TransformContext } from "../transform-context.js";
import { cssValueToJs, literalToAst, toStyleKey, toSuffixFromProp } from "../transform/helpers.js";

/**
 * Lowers CSS rules into resolvable style objects and resolves dynamic values via the adapter.
 */
export function lowerRulesStep(ctx: TransformContext): StepResult {
  const { root, j, file, warnings } = ctx;
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls) {
    return CONTINUE;
  }
  const importMap =
    ctx.importMap ?? new Map<string, { importedName: string; source: ImportSource }>();
  const cssHelpers = ctx.cssHelpers ?? {
    cssHelperNames: new Set<string>(),
    cssHelperObjectMembers: new Map<string, Map<string, StyledDecl>>(),
    cssHelperFunctions: new Map<string, any>(),
  };

  const lowered = lowerRules({
    api: ctx.api,
    j,
    root,
    filePath: file.path,
    resolveValue: ctx.resolveValueSafe,
    resolveCall: ctx.resolveCallSafe,
    resolveSelector: ctx.resolveSelectorSafe,
    importMap,
    warnings,
    resolverImports: ctx.resolverImports,
    styledDecls,
    keyframesNames: ctx.keyframesNames,
    cssHelperNames: cssHelpers.cssHelperNames,
    cssHelperObjectMembers: cssHelpers.cssHelperObjectMembers,
    cssHelperFunctions: cssHelpers.cssHelperFunctions,
    stringMappingFns: ctx.stringMappingFns ?? new Map(),
    toStyleKey,
    toSuffixFromProp,
    parseExpr: ctx.parseExpr,
    cssValueToJs,
    rewriteCssVarsInStyleObject: ctx.rewriteCssVarsInStyleObject,
    literalToAst,
  });

  ctx.resolvedStyleObjects = lowered.resolvedStyleObjects;
  ctx.descendantOverrides = lowered.descendantOverrides;
  ctx.ancestorSelectorParents = lowered.ancestorSelectorParents;

  if (lowered.bail || ctx.resolveValueBailRef.value) {
    return returnResult({ code: null, warnings }, "bail");
  }

  // Now that we know the file is transformable, remove any css helper functions that were inlined.
  if (
    removeInlinedCssHelperFunctions({
      root,
      j,
      cssLocal: ctx.cssLocal,
      names: lowered.usedCssHelperFunctions,
    })
  ) {
    ctx.markChanged();
  }

  return CONTINUE;
}
