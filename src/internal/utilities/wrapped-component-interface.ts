/**
 * Shared lookup for the public styling interface of a wrapped component.
 * Core concepts: adapter overrides, imported metadata, and local TypeScript metadata.
 */
import type { WrappedComponentInterfaceResult } from "../../adapter.js";
import type { TransformContext } from "../transform-context.js";
import { findTypeScriptComponentMetadata } from "./typescript-metadata.js";

export function wrappedComponentInterfaceFor(
  ctx: TransformContext,
  componentLocalName: string,
): WrappedComponentInterfaceResult | undefined {
  if (!ctx.adapter.useSxProp) {
    return undefined;
  }

  const importInfo = ctx.importMap?.get(componentLocalName);
  if (importInfo) {
    const typedInterface =
      importInfo.source.kind === "absolutePath"
        ? typedComponentInterfaceFor(
            ctx,
            importInfo.source.value,
            importInfo.importedName === "default"
              ? [componentLocalName, importInfo.importedName]
              : [importInfo.importedName],
          )
        : undefined;
    const adapterResult = ctx.adapter.wrappedComponentInterface?.({
      localName: componentLocalName,
      importSource: importInfo.source.value,
      importedName: importInfo.importedName,
      filePath: ctx.file.path,
    });
    if (adapterResult !== undefined) {
      return mergeWrappedComponentInterface(adapterResult, typedInterface);
    }

    return typedInterface;
  }

  return typedComponentInterfaceFor(ctx, ctx.file.path, [componentLocalName]);
}

export function mergeWrappedComponentInterface(
  adapterResult: WrappedComponentInterfaceResult,
  typedInterface: WrappedComponentInterfaceResult | undefined,
): WrappedComponentInterfaceResult {
  if (!adapterResult.acceptsSx || !hasTypedSxMetadata(typedInterface)) {
    return adapterResult;
  }
  return {
    ...adapterResult,
    ...(typedInterface.sxTarget ? { sxTarget: typedInterface.sxTarget } : {}),
    sxExcludedProperties: mergeUniqueStrings(
      adapterResult.sxExcludedProperties,
      typedInterface.sxExcludedProperties ?? [],
    ),
    sxAllowedProperties: mergeAllowedPropertyLists(
      adapterResult.sxAllowedProperties,
      typedInterface.sxAllowedProperties,
    ),
  };
}

/**
 * Checks if the typed interface has any sx metadata to merge with the adapter result.
 * This includes sxTarget (even without property constraints), property exclusions,
 * or allowed property lists.
 */
function hasTypedSxMetadata(
  typedInterface: WrappedComponentInterfaceResult | undefined,
): typedInterface is WrappedComponentInterfaceResult {
  if (!typedInterface) {
    return false;
  }
  return (
    typedInterface.sxTarget !== undefined ||
    (typedInterface.sxExcludedProperties?.length ?? 0) > 0 ||
    typedInterface.sxAllowedProperties !== undefined
  );
}

function typedComponentInterfaceFor(
  ctx: TransformContext,
  filePath: string,
  componentNames: readonly string[],
): WrappedComponentInterfaceResult | undefined {
  const typedComponent = findTypeScriptComponentMetadata(
    ctx.options.crossFileInfo?.typeScriptMetadata,
    filePath,
    componentNames,
  );
  if (typedComponent?.supportsSxProp) {
    return {
      acceptsSx: true,
      ...(typedComponent.sxTarget ? { sxTarget: typedComponent.sxTarget } : {}),
      sxExcludedProperties: typedComponent.sxExcludedProperties,
      sxAllowedProperties: typedComponent.sxAllowedProperties,
    };
  }

  return undefined;
}

function mergeAllowedPropertyLists(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined,
): string[] | undefined {
  if (first === undefined) {
    return second === undefined ? undefined : [...second];
  }
  if (second === undefined) {
    return [...first];
  }
  const secondSet = new Set(second);
  return first.filter((name) => secondSet.has(name));
}

function mergeUniqueStrings(
  first: readonly string[] | undefined,
  second: readonly string[],
): string[] {
  return [...new Set([...(first ?? []), ...second])];
}
