/**
 * StyleX merge-target detection and TypeScript-metadata application helpers
 * extracted from analyze-before-emit. Decides whether emitted styles can be
 * merged into an existing top-level `stylex.create({...})` object and applies
 * TypeScript-derived prop metadata to styled decls.
 */
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { applyTypeScriptMetadataToDecl } from "../utilities/typescript-metadata.js";
import {
  collectObjectPropertyKeys,
  isNameBoundInFile,
  isObjectExpression,
  isStylexCreateCall,
} from "./binding-scope-analysis.js";

export function applyTypeScriptMetadata(
  ctx: TransformContext,
  decl: StyledDecl,
  exportName: string | undefined,
): void {
  const names = exportName ? [decl.localName, exportName] : [decl.localName];
  applyTypeScriptMetadataToDecl(ctx, decl, names);
}

export function typedComponentHasProp(decl: StyledDecl, propName: string): boolean {
  if (isSpecialSurfaceProp(propName)) {
    return decl.typeScriptExplicitPropNames?.has(propName) === true;
  }
  return decl.typeScriptPropNames?.has(propName) === true;
}

export function typeAwareExternalStyleFallback(fallback: boolean): boolean {
  if (!fallback) {
    return false;
  }
  return true;
}

/** True if any skipped decl in the file extends the given component via `styled(name)`. */
export function extendedBySkippedDecl(allStyledDecls: StyledDecl[], name: string): boolean {
  return allStyledDecls.some(
    (d) => d.skipTransform && d.base.kind === "component" && d.base.ident === name,
  );
}

/**
 * Detect a single top-level `const <name> = stylex.create({...})` declaration that
 * we can merge new entries into. Returns `undefined` when there is no such decl,
 * when the object passed to `stylex.create` is not a plain object literal, when
 * there are multiple candidates (ambiguous target), when the binding name collides
 * with a surviving styled-component name, when the name is shadowed elsewhere in
 * the file (so emitted `name.key` references could bind to the wrong scope), or
 * when any existing key would collide with a style key we're about to emit.
 *
 * A collision is a conservative signal: rather than risk overwriting user-authored
 * styles or producing a duplicate property, fall back to emitting a separate
 * `stylexStyles` declaration.
 */
export function findExistingStylexStylesTarget(args: {
  ctx: TransformContext;
  styledDeclNames: Set<string>;
  /** The final set of style keys emit-styles will write into the merged object. */
  emitKeyNames: Set<string>;
}): { name: string; objectExpression: unknown; existingKeys: Set<string> } | undefined {
  const { ctx, styledDeclNames, emitKeyNames } = args;
  const { root, j } = ctx;
  const candidates: Array<{
    name: string;
    objectExpression: unknown;
    existingKeys: Set<string>;
    declaratorNode: unknown;
  }> = [];

  root.find(j.VariableDeclaration).forEach((declPath) => {
    // Only consider top-level declarations — nested ones aren't safe merge targets.
    const parentType = declPath.parentPath?.node?.type;
    if (parentType !== "Program" && parentType !== "ExportNamedDeclaration") {
      return;
    }
    for (const declarator of declPath.node.declarations) {
      if (declarator.type !== "VariableDeclarator") {
        continue;
      }
      const id = declarator.id;
      if (id?.type !== "Identifier") {
        continue;
      }
      const name = id.name;
      if (styledDeclNames.has(name)) {
        continue;
      }
      const init = declarator.init;
      if (!isStylexCreateCall(init)) {
        continue;
      }
      const arg = (init as { arguments?: unknown[] }).arguments?.[0];
      if (!isObjectExpression(arg)) {
        continue;
      }
      const existingKeys = collectObjectPropertyKeys(arg);
      if (!existingKeys) {
        // Non-literal keys (computed/spread) — can't reason about collisions, skip.
        continue;
      }
      candidates.push({ name, objectExpression: arg, existingKeys, declaratorNode: declarator });
    }
  });

  if (candidates.length !== 1) {
    return undefined;
  }
  const target = candidates[0]!;

  // Shadow check: reject if `name` is bound anywhere else in the file (nested scope
  // like a function component). Rewrite-jsx emits plain `name.key` references and
  // would silently bind to the shadowing binding instead of the top-level object.
  if (isNameBoundInFile(ctx, target.name, target.declaratorNode)) {
    return undefined;
  }

  for (const key of emitKeyNames) {
    if (target.existingKeys.has(key)) {
      return undefined;
    }
  }
  return target;
}

/**
 * Collects every style key that will be written into the merged `stylex.create`
 * object by emit-styles. Includes the top-level keys in `resolvedStyleObjects`
 * plus any keys injected by analyzeBeforeEmit (staticBooleanVariants,
 * callSiteCombinedStyles, promotedStyleProps — these are already present in
 * `resolvedStyleObjects` by the time this helper runs, but we re-derive them
 * from the decls so future additions stay in sync).
 */
export function buildEmitKeyNames(ctx: TransformContext, styledDecls: StyledDecl[]): Set<string> {
  const keys = new Set<string>();
  if (ctx.resolvedStyleObjects) {
    for (const key of ctx.resolvedStyleObjects.keys()) {
      keys.add(key);
    }
  }
  for (const decl of styledDecls) {
    keys.add(decl.styleKey);
    for (const sbv of decl.staticBooleanVariants ?? []) {
      keys.add(sbv.styleKey);
    }
    for (const cc of decl.callSiteCombinedStyles ?? []) {
      keys.add(cc.styleKey);
    }
    for (const ps of decl.promotedStyleProps ?? []) {
      if (!ps.mergeIntoBase) {
        keys.add(ps.styleKey);
      }
    }
    for (const variantKey of Object.values(decl.variantStyleKeys ?? {})) {
      keys.add(variantKey);
    }
  }
  return keys;
}

/**
 * Collects all local identifier names that will be introduced by resolver imports
 * (e.g., theme token variables like `$colors` from `tokens.stylex`).
 */
export function collectResolverImportNames(ctx: TransformContext): Set<string> {
  const names = new Set<string>();
  for (const imp of ctx.resolverImports.values()) {
    for (const n of imp.names ?? []) {
      const local = n.local ?? n.imported;
      if (local) {
        names.add(local);
      }
    }
  }
  return names;
}

function isSpecialSurfaceProp(propName: string): boolean {
  return (
    propName === "className" || propName === "style" || propName === "sx" || propName === "ref"
  );
}
