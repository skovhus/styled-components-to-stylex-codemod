/**
 * Emits wrapper components and updates exports for transformed styles.
 * Core concepts: intrinsic vs component wrappers and insertion ordering.
 */
import type { ASTNode, Collection, JSCodeshift, Property } from "jscodeshift";
import { DEFAULT_THEME_HOOK, type StyleMergerConfig, type ThemeHookConfig } from "../adapter.js";
import type { StyledDecl } from "./transform-types.js";
import { emitComponentWrappers } from "./emit-wrappers/emit-component.js";
import { emitIntrinsicWrappers } from "./emit-wrappers/emit-intrinsic.js";
import { insertEmittedWrappers } from "./emit-wrappers/insertion.js";
import { SX_PROP_TYPE_DECL, type ExportInfo } from "./emit-wrappers/types.js";
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
  themeHook?: ThemeHookConfig;
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
    themeHook,
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
    themeHook: themeHook ?? DEFAULT_THEME_HOOK,
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
    if (out.needsUseThemeImport) {
      needsUseThemeImport = true;
    }
  }

  // Inject sx prop into existing type definitions for components with external styles.
  // This handles cases where the type already exists in the file and couldn't be re-emitted.
  if (emitter.emitTypes) {
    for (const d of wrapperDecls) {
      if (!d.supportsExternalStyles) {
        continue;
      }
      const typeName = emitter.propsTypeNameFor(d.localName);
      if (!emitter.typeExistsInFile(typeName)) {
        continue;
      }
      const explicitProps = emitter.getExplicitPropNames(
        emitter.j.tsTypeReference(emitter.j.identifier(typeName)) as any,
      );
      if (explicitProps.has("sx")) {
        continue;
      }
      emitter.injectPropsIntoInterfaceBody(typeName, [SX_PROP_TYPE_DECL]);
      emitter.extendExistingTypeAlias(typeName, `{ ${SX_PROP_TYPE_DECL} }`);
    }
  }

  insertEmittedWrappers({
    emitter,
    emitted,
    needsReactTypeImport,
    needsUseThemeImport,
  });
}
