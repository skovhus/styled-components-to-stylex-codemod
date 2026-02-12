# Cross-File Dependency Resolution: Tool Landscape & Recommendation

**Context:** Phase 3 of the [marker plan](2026-02-09-marker-and-when-api-support-plan-opus.md) and the [cross-file selector plan](2026-02-12-cross-file-selector.md) both need a prepass that resolves `import { Icon } from "./icon"` to an absolute file path. This document surveys the landscape and recommends a solution.

---

## The Problem

Given a styled-components file like:

```tsx
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

const Btn = styled(Button)`
  ${CollapseArrowIcon} {
    width: 18px;
  }
`;
```

The prepass needs to:

1. **Scan imports** — extract `CollapseArrowIcon` is imported from `"./lib/collapse-arrow-icon"`
2. **Resolve specifier to file path** — `"./lib/collapse-arrow-icon"` → `/abs/path/lib/collapse-arrow-icon.tsx`
3. **Handle real-world resolution patterns:**
   - Extension probing: `.ts`, `.tsx`, `.js`, `.jsx`, `/index.*`
   - `tsconfig.json` `paths` aliases (e.g., `@components/*` → `src/components/*`)
   - `tsconfig.json` project references (monorepos with composite projects)
   - `.js` extension in source → `.ts` file on disk (ESM with `moduleResolution: "bundler"` or `"node16"`)
   - Package `exports` field resolution
   - Barrel file re-exports (`index.ts`)
   - pnpm/Yarn PnP symlink resolution
   - Monorepo workspace packages (`"@scope/pkg"` → `packages/pkg/src/index.ts`)

---

## Tool Categories

### A. Module Resolvers (specifier → file path)

These take a specifier (`"./icon"`) and a context directory/file, and return an absolute file path.

| Tool                                  | Language    | Sync API | tsconfig paths | Project refs  | Yarn PnP   | Extension alias (.js→.ts) | Install size              |
| ------------------------------------- | ----------- | -------- | -------------- | ------------- | ---------- | ------------------------- | ------------------------- |
| **oxc-resolver**                      | Rust (NAPI) | Yes      | Built-in       | Built-in      | Yes        | Built-in                  | ~5 MB native binary       |
| **enhanced-resolve**                  | JS          | Yes\*    | Plugin needed  | Plugin needed | Via plugin | Via `extensionAlias`      | ~200 KB + 2 deps          |
| **TypeScript `ts.resolveModuleName`** | JS          | Yes      | Built-in       | Built-in      | No         | Built-in                  | Already a devDep (~50 MB) |
| **Node.js `require.resolve`**         | JS          | Yes      | No             | No            | Partial    | No                        | Zero deps                 |

\* enhanced-resolve sync API doesn't work when tsconfig plugin is enabled; must use async.

#### oxc-resolver (v11.17.1) — **Recommended**

- **Rust port of enhanced-resolve + tsconfig-paths-webpack-plugin + tsconfck**, all in one native binary
- Sync `resolveFileSync(filePath, specifier)` with automatic tsconfig.json discovery by traversing parent directories
- Respects `tsconfig.compilerOptions.paths`, `references`, `include`/`exclude`, `${configDir}` template
- Built-in `extensionAlias` for `.js` → `.ts`/`.tsx` mapping
- Benchmarked at **0.001 ms/resolution** (300 resolutions in 0.4ms) — 25x faster than enhanced-resolve
- Actively maintained (last publish: 2026-02-08)
- Used by: oxlint, Rspack, Rolldown, Biome
- Platform binaries via `optionalDependencies` (darwin-arm64, linux-x64-gnu, win32-x64, wasm32-wasi, etc.)

```typescript
import { ResolverFactory } from "oxc-resolver";

const resolver = new ResolverFactory({
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  conditionNames: ["import", "node"],
  mainFields: ["module", "main"],
  extensionAlias: { ".js": [".ts", ".tsx", ".js"], ".jsx": [".tsx", ".jsx"] },
  // Auto-discovers tsconfig.json when using resolveFileSync
});

// From a file context (auto-discovers nearest tsconfig.json)
const result = resolver.resolveFileSync("/abs/path/to/consumer.tsx", "./lib/icon");
// result.path === "/abs/path/to/lib/icon.tsx"
```

#### enhanced-resolve (v5.19.0)

- Webpack's battle-tested resolver, very mature
- Plugin system for custom resolution logic
- tsconfig support added in v5 via built-in option, **but only works with async API**
- Sync API works without tsconfig; needs `extensionAlias` for `.js` → `.ts`
- Benchmarked at **0.03 ms/resolution** — fast enough, but 25x slower than oxc-resolver
- 2 JS dependencies (`graceful-fs`, `tapable`)
- Used by: webpack, dependency-cruiser, many bundlers

```typescript
import { create } from "enhanced-resolve";

const resolveSync = create.sync({
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
});

const result = resolveSync("/abs/path/to/src", "./lib/icon");
// result === "/abs/path/to/src/lib/icon.tsx"
```

**Limitation:** Sync API + tsconfig paths don't work together. Would need async resolver or manual `tsconfig-paths` integration.

#### TypeScript `ts.resolveModuleName`

- The "ground truth" for TypeScript module resolution — handles every edge case TypeScript itself handles
- Requires loading the full TypeScript compiler (~50 MB, already a devDependency)
- Has a caching API (`createModuleResolutionCache`) for repeated resolution from the same directory
- Benchmarked at **0.001 ms/resolution with cache** — extremely fast when cached
- Handles `moduleResolution: "bundler"` natively, including `.js` → `.ts` remapping
- Does NOT handle Yarn PnP or package manager-specific resolution

```typescript
import ts from "typescript";

const configPath = ts.findConfigFile(dir, ts.sys.fileExists, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
const cache = ts.createModuleResolutionCache(dir, (s) => s.toLowerCase(), parsed.options);

const result = ts.resolveModuleName(
  "./lib/icon",
  "/abs/consumer.tsx",
  parsed.options,
  ts.sys,
  cache,
);
// result.resolvedModule.resolvedFileName === "/abs/lib/icon.tsx"
```

**Downside:** TypeScript is a devDependency, not a runtime dependency. Making the codemod depend on the full TS compiler at runtime is heavy. Also, `ts.resolveModuleName` doesn't handle non-TS resolution patterns (e.g., webpack aliases, package.json `exports` with custom conditions).

### B. Import Scanners (find imports in a file)

| Tool                  | Speed         | Named import extraction | Template literal detection | Already a dep?    |
| --------------------- | ------------- | ----------------------- | -------------------------- | ----------------- |
| **jscodeshift (AST)** | ~5 ms/file    | Full AST                | Yes                        | Yes (runtime dep) |
| **es-module-lexer**   | ~0.04 ms/file | Statement text only\*   | No                         | No                |
| **oxc-parser**        | ~0.2 ms/file  | Full AST                | Yes                        | No                |

\* es-module-lexer gives the import statement text (`import { Icon } from './icon'`), not parsed bindings. Named imports can be extracted with a regex, but it's fragile for complex patterns.

**For the prepass:** jscodeshift is already a runtime dependency and gives us full AST access. The prepass scans at most a few hundred files. At ~5ms/file, scanning 500 files takes ~2.5 seconds — perfectly acceptable. Adding es-module-lexer would save ~2 seconds but adds a dependency and loses AST fidelity.

### C. Full Dependency Graph Tools

These are higher-level tools that build complete dependency graphs.

| Tool                         | Resolution engine            | Configurable? | Programmatic API | Use case                        |
| ---------------------------- | ---------------------------- | ------------- | ---------------- | ------------------------------- |
| **dependency-cruiser** (v17) | enhanced-resolve + acorn     | Very          | Yes              | Validation rules, visualization |
| **madge** (v8)               | dependency-cruiser or custom | Moderate      | Yes              | Circular dependency detection   |
| **Turbo trace**              | SWC + custom                 | No            | No               | Turborepo file tracing          |

**These are overkill for our needs.** They solve a broader problem (full project graph, circular deps, rule validation). We only need targeted resolution: "given this import specifier in this file, what's the absolute path?" Pulling in dependency-cruiser brings acorn, enhanced-resolve, commander, prompts, and 15+ transitive dependencies.

---

## Monorepo Considerations

Real-world styled-components codebases often live in monorepos. Key patterns:

1. **Workspace packages:** `import { Icon } from "@myorg/icons"` → resolves via `package.json` `exports` or workspace symlinks
2. **tsconfig project references:** Each package has its own `tsconfig.json` extending a root config; `references` field links them
3. **Path aliases:** `@components/*` → `../../packages/components/src/*` via tsconfig `paths`
4. **Barrel re-exports:** `packages/icons/src/index.ts` re-exports `export { CollapseArrowIcon } from "./collapse-arrow-icon"`

### How each resolver handles these:

| Pattern              | oxc-resolver                     | enhanced-resolve              | TypeScript                    |
| -------------------- | -------------------------------- | ----------------------------- | ----------------------------- |
| Workspace symlinks   | Follows symlinks by default      | `symlinks: true` (default)    | Via project references        |
| tsconfig paths       | `resolveFileSync` auto-discovers | Needs plugin or manual config | Built-in                      |
| Project references   | `references: 'auto'`             | Not built-in                  | Built-in                      |
| package.json exports | `conditionNames` config          | `conditionNames` config       | `moduleResolution: "bundler"` |
| Barrel re-exports    | Resolves to barrel file\*        | Resolves to barrel file\*     | Resolves to barrel file\*     |

\* All resolvers resolve to the barrel `index.ts`, not the re-exported file. To trace through barrel files, you'd need to parse the barrel file's exports — but this is a separate concern from resolution and is NOT needed for Phase 3 (the consumer file sees `import { X } from "./barrel"` and we resolve `./barrel` to the barrel file).

---

## Recommendation

### Use `oxc-resolver` for module resolution

**Why oxc-resolver over the alternatives:**

1. **All-in-one:** tsconfig paths, project references, extension aliases, Yarn PnP — all built-in, no plugins needed
2. **Sync API with tsconfig support:** `resolveFileSync(filePath, specifier)` auto-discovers the nearest tsconfig.json. enhanced-resolve's sync API doesn't support tsconfig.
3. **Blazing fast:** 0.001ms/resolution. For a prepass scanning 1,000 files with ~10 imports each, that's 10ms of resolution time. Not that we need this speed, but it means resolution is never a bottleneck.
4. **Proven in production:** Used by oxlint (which this project already uses!), Rspack, Rolldown, Biome
5. **Actively maintained:** Published 4 days ago, frequent releases
6. **Correct semantics:** Implements Node.js ESM and CJS resolution algorithms per spec

**Why not enhanced-resolve:**

- Sync API doesn't support tsconfig paths (must use async)
- Would need additional plugins/config for full tsconfig support
- Otherwise a solid choice — if we already depended on webpack, this would be fine

**Why not TypeScript resolver:**

- Makes `typescript` a runtime dependency (~50 MB) instead of just devDependency
- Doesn't handle non-TS resolution patterns (webpack aliases, custom conditions)
- Excellent as a validation layer, poor as a primary dependency for a published codemod

**Why not a full graph tool (dependency-cruiser, madge):**

- Massive dependency tree for a targeted need
- We don't need graph analysis, just point-to-point resolution

### Use jscodeshift for import scanning (no new dependency)

The prepass parses files to find:

1. Import declarations and their specifiers
2. Which imported names appear inside tagged template literals (styled-components CSS)

jscodeshift already provides full AST access and is a runtime dependency. The prepass runs once at startup over the file set. Performance is more than adequate.

### Architecture sketch

```typescript
// src/internal/prepass/resolve-imports.ts
import { ResolverFactory } from "oxc-resolver";

const resolver = new ResolverFactory({
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  conditionNames: ["import", "node"],
  mainFields: ["module", "main"],
  extensionAlias: { ".js": [".ts", ".tsx", ".js"], ".jsx": [".tsx", ".jsx"] },
  // tsconfig auto-discovered via resolveFileSync
});

export function resolveImport(fromFile: string, specifier: string): string | undefined {
  try {
    const result = resolver.resolveFileSync(fromFile, specifier);
    return result.path ?? undefined;
  } catch {
    return undefined; // Unresolvable import — bail gracefully
  }
}
```

```typescript
// src/internal/prepass/scan-cross-file-selectors.ts
// Uses jscodeshift to parse each file, find styled template literals,
// extract component references, and call resolveImport to get absolute paths.
```

### Dependency impact

- **New runtime dependency:** `oxc-resolver` (~5 MB native binary, zero JS dependencies)
- **No new parse dependency:** reuse jscodeshift
- **Total new deps:** 1 package (with platform-specific optional deps for the native binary)

### Risks and mitigations

| Risk                                            | Mitigation                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native binary doesn't exist for target platform | oxc-resolver has a `wasm32-wasi` fallback; also supports 20 platforms                                                                                                        |
| Resolution behavior diverges from TypeScript    | oxc-resolver passes enhanced-resolve's full test suite and tracks TS closely; we can add integration tests comparing against `ts.resolveModuleName`                          |
| tsconfig auto-discovery picks wrong config      | `resolveFileSync` traverses from the file's location, matching TypeScript's behavior. For edge cases, the `ResolverFactory` accepts an explicit `tsconfig.configFile` option |
| Barrel file re-exports need tracing             | Phase 3 doesn't need this — resolution to the barrel file is sufficient. If needed later, we'd parse the barrel file with jscodeshift                                        |

---

## Summary

| Concern                                | Tool                           | Rationale                                                               |
| -------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Module resolution (specifier → path)   | **oxc-resolver**               | Fastest, all-in-one tsconfig + monorepo support, sync API, zero JS deps |
| Import scanning (find imports in file) | **jscodeshift** (existing dep) | Already a runtime dep, full AST, fast enough for prepass                |
| Dependency graph analysis              | **Not needed**                 | Point-to-point resolution is sufficient for cross-file selectors        |
