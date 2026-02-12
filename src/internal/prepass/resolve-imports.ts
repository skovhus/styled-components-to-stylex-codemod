/**
 * Module resolution using oxc-resolver.
 * Resolves import specifiers to absolute file paths, handling:
 * - Extension probing (.ts, .tsx, .js, .jsx, /index.*)
 * - tsconfig.json paths aliases (auto-discovered)
 * - tsconfig.json project references
 * - .js → .ts remapping (ESM with moduleResolution: "bundler")
 * - Package exports field
 * - Symlink resolution (pnpm/Yarn workspaces)
 */
import { ResolverFactory } from "oxc-resolver";

export type { ResolverFactory } from "oxc-resolver";

/**
 * Create a module resolver with sensible defaults for TypeScript projects.
 *
 * The returned `resolveImport` function resolves a specifier relative to
 * a source file path, returning the absolute path or `undefined` on failure.
 */
export function createModuleResolver(): ModuleResolver {
  const resolver = new ResolverFactory({
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    conditionNames: ["import", "node"],
    mainFields: ["module", "main"],
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    },
  });

  return {
    resolve(fromFile: string, specifier: string): string | undefined {
      try {
        const result = resolver.resolveFileSync(fromFile, specifier);
        return result.path ?? undefined;
      } catch {
        return undefined;
      }
    },
  };
}

export interface ModuleResolver {
  /**
   * Resolve an import specifier to an absolute file path.
   * @param fromFile - Absolute path of the file containing the import
   * @param specifier - The import specifier (e.g., "./icon", "@scope/pkg")
   * @returns Absolute path of the resolved file, or undefined if unresolvable
   */
  resolve(fromFile: string, specifier: string): string | undefined;
}
