/**
 * Utilities for partial-migration skip policy.
 * Core concepts: imported styled roots and member-expression roots.
 */
import type { TransformContext } from "../transform-context.js";
import type { StyledDecl } from "../transform-types.js";

export function shouldSkipPartialImportedComponentRoot(
  ctx: TransformContext,
  decl: StyledDecl,
): boolean {
  if (ctx.options.allowPartialMigration !== true) {
    return false;
  }
  if (decl.base.kind !== "component") {
    return false;
  }
  return isImportedComponentIdent(ctx, decl.base.ident);
}

export function isImportedComponentIdent(ctx: TransformContext, ident: string): boolean {
  const importMap = ctx.importMap;
  if (!importMap) {
    return false;
  }
  const rootName = ident.split(".")[0];
  return !!rootName && importMap.has(rootName);
}
