/**
 * Module resolution using oxc-resolver (optional dependency).
 *
 * Provides `createModuleResolver()` for the cross-file prepass and
 * `loadResolverFactory()` shared with `consumer-analyzer.ts`, so both
 * call sites share the same optional-dependency loading logic.
 *
 * Capabilities when oxc-resolver is installed:
 * - Extension probing (.ts, .tsx, .js, .jsx, /index.*)
 * - tsconfig.json paths aliases (auto-discovered)
 * - tsconfig.json project references
 * - .js → .ts remapping (ESM with moduleResolution: "bundler")
 * - Package exports field
 * - Symlink resolution (pnpm/Yarn workspaces)
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* ── Exported types ──────────────────────────────────────────────────── */

export interface ModuleResolver {
  /**
   * Resolve an import specifier to an absolute file path.
   * @param fromFile - Absolute path of the file containing the import
   * @param specifier - The import specifier (e.g., "./icon", "@scope/pkg")
   * @returns Absolute path of the resolved file, or undefined if unresolvable
   */
  resolve(fromFile: string, specifier: string): string | undefined;
}

interface OxcResolverResult {
  error?: unknown;
  path?: string;
}

interface OxcResolverInstance {
  resolveFileSync(fromFilePath: string, specifier: string): OxcResolverResult;
}

interface OxcResolverOptions {
  extensions: string[];
  conditionNames: string[];
  mainFields: string[];
  extensionAlias: Record<string, string[]>;
  tsconfig?: "auto";
}

interface OxcResolverFactory {
  new (options: OxcResolverOptions): OxcResolverInstance;
}

/* ── Exported functions ──────────────────────────────────────────────── */

/**
 * Create a module resolver with sensible defaults for TypeScript projects.
 *
 * The returned `resolve` function resolves a specifier relative to
 * a source file path, returning the absolute path or `undefined` on failure.
 *
 * Requires the optional dependency `oxc-resolver`. Throws with an
 * actionable install message if it is not installed.
 */
export function createModuleResolver(): ModuleResolver {
  const ResolverFactory = loadResolverFactory();
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

/**
 * Load the `ResolverFactory` constructor from the optional `oxc-resolver`
 * dependency. Throws a descriptive error when the package is not installed.
 *
 * Shared between the cross-file prepass and `createExternalInterface`.
 */
export function loadResolverFactory(): OxcResolverFactory {
  try {
    const module = require(OPTIONAL_RESOLVER_DEPENDENCY) as OxcResolverModule;
    if (typeof module.ResolverFactory !== "function") {
      throw new Error(
        `Invalid optional dependency \`${OPTIONAL_RESOLVER_DEPENDENCY}\`: missing \`ResolverFactory\` export.`,
      );
    }
    return module.ResolverFactory;
  } catch (error) {
    if (isMissingModuleError(error, OPTIONAL_RESOLVER_DEPENDENCY)) {
      process.stderr.write(`${MISSING_RESOLVER_ERROR_MESSAGE}\n`);
      throw new Error(MISSING_RESOLVER_ERROR_MESSAGE, { cause: error });
    }
    throw error;
  }
}

/* ── Non-exported helpers ────────────────────────────────────────────── */

const OPTIONAL_RESOLVER_DEPENDENCY = "oxc-resolver";
const MISSING_RESOLVER_ERROR_MESSAGE = [
  "[styled-components-to-stylex-codemod] The optional dependency `oxc-resolver` is required for this feature.",
  "Install it with:",
  "  npm install oxc-resolver",
  "  # or",
  "  pnpm add oxc-resolver",
].join("\n");

interface OxcResolverModule {
  ResolverFactory?: OxcResolverFactory;
}

function isMissingModuleError(error: unknown, moduleName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const moduleError = error as Error & { code?: string };
  if (moduleError.code !== "MODULE_NOT_FOUND") {
    return false;
  }
  return (
    moduleError.message.includes(`'${moduleName}'`) ||
    moduleError.message.includes(`"${moduleName}"`)
  );
}
