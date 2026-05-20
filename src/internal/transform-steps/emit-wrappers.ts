/**
 * Step: emit wrapper components for eligible styled declarations.
 * Core concepts: intrinsic vs component wrappers and insertion ordering.
 */
import type { ASTNode, JSCodeshift } from "jscodeshift";
import { DEFAULT_THEME_HOOK } from "../../adapter.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { emitComponentWrappers } from "../emit-wrappers/emit-component.js";
import { emitIntrinsicWrappers } from "../emit-wrappers/emit-intrinsic.js";
import { insertEmittedWrappers } from "../emit-wrappers/insertion.js";
import { WrapperEmitter } from "../emit-wrappers/wrapper-emitter.js";
import { importSourceToModuleSpecifier } from "../utilities/import-source.js";

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

  const themeHook = ctx.adapter.themeHook ?? DEFAULT_THEME_HOOK;
  const themeHookLocalName = resolveThemeHookLocalName(ctx, themeHook);
  const emitter = new WrapperEmitter({
    root: ctx.root,
    j: ctx.j,
    filePath: ctx.file.path,
    localSource: ctx.file.source,
    wrapperDecls,
    wrapperNames: ctx.wrapperNames,
    patternProp: ctx.patternProp,
    exportedComponents: ctx.exportedComponents,
    stylesIdentifier: ctx.stylesIdentifier ?? "styles",
    styleMerger: ctx.adapter.styleMerger,
    themeHook,
    themeHookLocalName,
    emptyStyleKeys: ctx.emptyStyleKeys,
    ancestorSelectorParents: ctx.ancestorSelectorParents,
    crossFileMarkers: ctx.crossFileMarkers,
    siblingMarkerKeys: ctx.siblingMarkerKeys,
    parentsNeedingDefaultMarker: ctx.parentsNeedingDefaultMarker,
    useSxProp: ctx.adapter.useSxProp,
    importMap: ctx.importMap,
    sourceOverrides: ctx.options.transformedFileSources,
    typeScriptMetadata: ctx.options.crossFileInfo?.typeScriptMetadata,
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

function resolveThemeHookLocalName(
  ctx: TransformContext,
  themeHook: typeof DEFAULT_THEME_HOOK,
): string {
  const { root, j } = ctx;
  const moduleSpecifier = importSourceToModuleSpecifier(themeHook.importSource, ctx.file.path);
  const existingThemeHookLocal = root
    .find(j.ImportDeclaration, { source: { value: moduleSpecifier } } as any)
    .filter((path: any) => path.node.importKind !== "type")
    .find(j.ImportSpecifier)
    .filter((specifierPath: any) => {
      const importedName = specifierPath.node.imported?.name ?? specifierPath.node.imported?.value;
      return importedName === themeHook.functionName;
    })
    .nodes()
    .map((specifier: any) => specifier.local?.name ?? themeHook.functionName)
    .find((localName: string | undefined): localName is string => Boolean(localName));

  if (existingThemeHookLocal) {
    return existingThemeHookLocal;
  }

  if (!hasValueBinding(ctx, themeHook.functionName)) {
    return themeHook.functionName;
  }

  const baseLocalName = `useStyled${capitalizeIdentifier(themeHook.functionName.replace(/^use/, ""))}`;
  return findAvailableLocalName(ctx, baseLocalName);
}

function hasValueBinding(ctx: TransformContext, localName: string): boolean {
  const { root, j } = ctx;
  return (
    hasImportBinding(j, root, localName) ||
    root.find(j.VariableDeclarator, { id: { type: "Identifier", name: localName } } as any).size() >
      0 ||
    root
      .find(j.FunctionDeclaration, { id: { type: "Identifier", name: localName } } as any)
      .size() > 0 ||
    root.find(j.ClassDeclaration, { id: { type: "Identifier", name: localName } } as any).size() > 0
  );
}

function hasImportBinding(
  j: JSCodeshift,
  root: TransformContext["root"],
  localName: string,
): boolean {
  return (
    root
      .find(j.ImportDeclaration)
      .filter((path: any) => path.node.importKind !== "type")
      .filter((path: any) =>
        ((path.node.specifiers ?? []) as any[]).some((specifier: any) => {
          if (specifier?.importKind === "type") {
            return false;
          }
          return specifier.local?.type === "Identifier" && specifier.local.name === localName;
        }),
      )
      .size() > 0
  );
}

function findAvailableLocalName(ctx: TransformContext, baseLocalName: string): string {
  if (!hasValueBinding(ctx, baseLocalName)) {
    return baseLocalName;
  }

  let suffix = 2;
  for (;;) {
    const candidate = `${baseLocalName}${suffix}`;
    if (!hasValueBinding(ctx, candidate)) {
      return candidate;
    }
    suffix++;
  }
}

function capitalizeIdentifier(value: string): string {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : "Theme";
}
