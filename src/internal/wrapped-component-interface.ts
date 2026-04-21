/**
 * Shared helper for the adapter `wrappedComponentInterface` hook.
 *
 * Resolves the imported component for a `styled(Component)` declaration via
 * the import map and asks the adapter whether the wrapped component accepts
 * a StyleX `sx` prop. Used by both the wrapper-emitter (full wrapper components)
 * and the JSX-rewrite step (inlined re-styles).
 */
import type { Adapter, ImportSource } from "../adapter.js";

export function isWrappedComponentSxAware(args: {
  adapter: Pick<Adapter, "useSxProp" | "wrappedComponentInterface">;
  importMap: ReadonlyMap<string, { importedName: string; source: ImportSource }> | undefined;
  componentLocalName: string;
  filePath: string;
}): boolean {
  const { adapter, importMap, componentLocalName, filePath } = args;
  if (!adapter.useSxProp || !adapter.wrappedComponentInterface || !importMap) {
    return false;
  }
  const importInfo = importMap.get(componentLocalName);
  if (!importInfo) {
    return false;
  }
  const result = adapter.wrappedComponentInterface({
    importSource: importInfo.source.value,
    importedName: importInfo.importedName,
    filePath,
  });
  return result?.acceptsSx === true;
}
