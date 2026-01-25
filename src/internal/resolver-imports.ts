import type { ImportSpec } from "../adapter.js";

export function addResolverImport<T extends ImportSpec>(
  resolverImports: Map<string, T>,
  imp: T | null | undefined,
): void {
  if (!imp) {
    return;
  }
  resolverImports.set(JSON.stringify(imp), imp);
}

export function addResolverImports<T extends ImportSpec>(
  resolverImports: Map<string, T>,
  imports: readonly T[] | null | undefined,
): void {
  for (const imp of imports ?? []) {
    addResolverImport(resolverImports, imp);
  }
}
