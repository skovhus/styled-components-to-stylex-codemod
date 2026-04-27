/**
 * Step: emit wrapper components for eligible styled declarations.
 * Core concepts: intrinsic vs component wrappers and insertion ordering.
 */
import type { ASTNode } from "jscodeshift";
import { DEFAULT_THEME_HOOK } from "../../adapter.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { emitComponentWrappers } from "../emit-wrappers/emit-component.js";
import { emitIntrinsicWrappers } from "../emit-wrappers/emit-intrinsic.js";
import { insertEmittedWrappers } from "../emit-wrappers/insertion.js";
import { WrapperEmitter } from "../emit-wrappers/wrapper-emitter.js";

/**
 * Emits wrapper components for styled declarations that must remain as components.
 */
export function emitWrappersStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls || !ctx.wrapperNames || !ctx.exportedComponents) {
    return CONTINUE;
  }

  const wrapperDecls = styledDecls.filter(
    (d) => d.needsWrapperComponent && !d.isCssHelper && !d.skipTransform,
  );
  if (wrapperDecls.length === 0) {
    return CONTINUE;
  }

  const emitter = new WrapperEmitter({
    root: ctx.root,
    j: ctx.j,
    filePath: ctx.file.path,
    wrapperDecls,
    wrapperNames: ctx.wrapperNames,
    patternProp: ctx.patternProp,
    exportedComponents: ctx.exportedComponents,
    stylesIdentifier: ctx.stylesIdentifier ?? "styles",
    styleMerger: ctx.adapter.styleMerger,
    themeHook: ctx.adapter.themeHook ?? DEFAULT_THEME_HOOK,
    emptyStyleKeys: ctx.emptyStyleKeys,
    ancestorSelectorParents: ctx.ancestorSelectorParents,
    crossFileMarkers: ctx.crossFileMarkers,
    siblingMarkerKeys: ctx.siblingMarkerKeys,
    parentsNeedingDefaultMarker: ctx.parentsNeedingDefaultMarker,
    useSxProp: ctx.adapter.useSxProp,
    importMap: ctx.importMap,
    wrappedComponentInterface: ctx.adapter.wrappedComponentInterface?.bind(ctx.adapter),
  });

  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;
  let needsUseThemeImport = false;

  for (const out of [emitIntrinsicWrappers(emitter), emitComponentWrappers(emitter)]) {
    emitted.push(...out.emitted);
    if (out.needsReactTypeImport) {
      needsReactTypeImport = true;
    }
    if (out.needsUseThemeImport) {
      needsUseThemeImport = true;
    }
  }

  insertEmittedWrappers({
    emitter,
    emitted,
    needsReactTypeImport,
    needsUseThemeImport,
  });

  return CONTINUE;
}
