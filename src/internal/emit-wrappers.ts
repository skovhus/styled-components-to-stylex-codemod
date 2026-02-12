/**
 * Emits wrapper components and updates exports for transformed styles.
 * Core concepts: intrinsic vs component wrappers and insertion ordering.
 */
import type { ASTNode, Collection, JSCodeshift, Property } from "jscodeshift";
import type { StyleMergerConfig } from "../adapter.js";
import type { StyledDecl } from "./transform-types.js";
import { emitComponentWrappers } from "./emit-wrappers/emit-component.js";
import { emitIntrinsicWrappers } from "./emit-wrappers/emit-intrinsic.js";
import { insertEmittedWrappers } from "./emit-wrappers/insertion.js";
import type { ExportInfo } from "./emit-wrappers/types.js";
import { WrapperEmitter } from "./emit-wrappers/wrapper-emitter.js";

export function emitWrappers(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  filePath: string;
  styledDecls: StyledDecl[];
  wrapperNames: Set<string>;
  patternProp: (keyName: string, valueId?: ASTNode) => Property;
  exportedComponents: Map<string, ExportInfo>;
  stylesIdentifier: string;
  styleMerger: StyleMergerConfig | null;
  emptyStyleKeys?: Set<string>;
  ancestorSelectorParents?: Set<string>;
}): void {
  const {
    root,
    j,
    filePath,
    styledDecls,
    wrapperNames,
    patternProp,
    exportedComponents,
    stylesIdentifier,
    styleMerger,
    emptyStyleKeys,
    ancestorSelectorParents,
  } = args;

  const wrapperDecls = styledDecls.filter((d) => d.needsWrapperComponent && !d.isCssHelper);
  if (wrapperDecls.length === 0) {
    return;
  }

  const emitter = new WrapperEmitter({
    root,
    j,
    filePath,
    wrapperDecls,
    wrapperNames,
    patternProp,
    exportedComponents,
    stylesIdentifier,
    styleMerger,
    emptyStyleKeys,
    ancestorSelectorParents,
  });

  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;
  let needsUseThemeImport = false;

  {
    const out = emitIntrinsicWrappers(emitter);
    emitted.push(...out.emitted);
    if (out.needsReactTypeImport) {
      needsReactTypeImport = true;
    }
    if (out.needsUseThemeImport) {
      needsUseThemeImport = true;
    }
  }

  {
    const out = emitComponentWrappers(emitter);
    emitted.push(...out.emitted);
    if (out.needsReactTypeImport) {
      needsReactTypeImport = true;
    }
  }

  insertEmittedWrappers({
    emitter,
    emitted,
    needsReactTypeImport,
    needsUseThemeImport,
  });
}
