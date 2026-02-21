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

export interface ModuleResolver {
  /**
   * Resolve an import specifier to an absolute file path.
   * @param fromFile - Absolute path of the file containing the import
   * @param specifier - The import specifier (e.g., "./icon", "@scope/pkg")
   * @returns Absolute path of the resolved file, or undefined if unresolvable
   */
  resolve(fromFile: string, specifier: string): string | undefined;
}

/** Configurable options for module resolution. */
interface ResolverConfig {
  extensions?: string[];
  conditionNames?: string[];
  mainFields?: string[];
  extensionAlias?: Record<string, string[]>;
  tsconfig?: "auto";
}

/**
 * Shared resolver config for TypeScript projects.
 *
 * - `.tsx` before `.ts` so React component files win when both exist
 * - `"types"` condition for type-aware resolution; `"default"` as fallback
 * - `tsconfig: "auto"` auto-discovers the nearest tsconfig.json per file
 *   for path alias resolution
 * - `extensionAlias` handles ESM `.js`→`.ts` remapping AND `.ts`→`.tsx`
 *   fallback for package.json `"exports"` wildcards
 */
const DEFAULT_CONFIG: ResolverConfig = {
  extensions: [".tsx", ".ts", ".jsx", ".js"],
  conditionNames: ["import", "types", "default"],
  mainFields: ["module", "main"],
  extensionAlias: {
    ".js": [".ts", ".tsx", ".js"],
    ".jsx": [".tsx", ".jsx"],
    ".ts": [".ts", ".tsx"],
  },
  tsconfig: "auto",
};

/**
 * Create a module resolver with configurable options.
 *
 * The returned `resolve` function resolves a specifier relative to
 * a source file path, returning the absolute path or `undefined` on failure.
 */
export function createModuleResolver(config: ResolverConfig = DEFAULT_CONFIG): ModuleResolver {
  const resolver = new ResolverFactory(config);

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
