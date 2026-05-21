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
    const adapterResult = ctx.adapter.wrappedComponentInterface?.({
      localName: componentLocalName,
      importSource: importInfo.source.value,
      importedName: importInfo.importedName,
      filePath: ctx.file.path,
    });
    if (adapterResult !== undefined) {
      return adapterResult;
    }

    if (importInfo.source.kind === "absolutePath") {
      const names =
        importInfo.importedName === "default"
          ? [componentLocalName, importInfo.importedName]
          : [importInfo.importedName];
      const typedComponent = findTypeScriptComponentMetadata(
        ctx.options.crossFileInfo?.typeScriptMetadata,
        importInfo.source.value,
        names,
      );
      if (typedComponent?.supportsSxProp) {
        return {
          acceptsSx: true,
          sxExcludedProperties: typedComponent.sxExcludedProperties,
        };
      }
    }

    return undefined;
  }

  const typedComponent = findTypeScriptComponentMetadata(
    ctx.options.crossFileInfo?.typeScriptMetadata,
    ctx.file.path,
    [componentLocalName],
  );
  if (typedComponent?.supportsSxProp) {
    return {
      acceptsSx: true,
      sxExcludedProperties: typedComponent.sxExcludedProperties,
    };
  }

  return undefined;
}
