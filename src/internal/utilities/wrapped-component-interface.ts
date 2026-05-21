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
      if (adapterResult.acceptsSx && typedInterface?.sxExcludedProperties?.length) {
        return {
          ...adapterResult,
          sxExcludedProperties: mergeUniqueStrings(
            adapterResult.sxExcludedProperties,
            typedInterface.sxExcludedProperties,
          ),
        };
      }
      return adapterResult;
    }

    return typedInterface;
  }

  return typedComponentInterfaceFor(ctx, ctx.file.path, [componentLocalName]);
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
      sxExcludedProperties: typedComponent.sxExcludedProperties,
    };
  }

  return undefined;
}

function mergeUniqueStrings(
  first: readonly string[] | undefined,
  second: readonly string[],
): string[] {
  return [...new Set([...(first ?? []), ...second])];
}
