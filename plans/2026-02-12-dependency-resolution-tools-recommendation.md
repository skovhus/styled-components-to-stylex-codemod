# Cross-File Dependency Resolution

**Context:** The cross-file selector prepass needs to resolve `import { Icon } from "./icon"` to an absolute file path, handling extension probing, tsconfig paths, project references, monorepo workspaces, and `.js`→`.ts` remapping.

## Solution: `oxc-resolver` + jscodeshift

**Module resolution** uses [`oxc-resolver`](https://github.com/oxc-project/oxc-resolver) — a Rust-native (NAPI) resolver with built-in tsconfig support, sync API, and zero JS dependencies. Used by oxlint (already in this project), Rspack, Rolldown, and Biome.

**Import scanning** reuses jscodeshift (existing runtime dependency) for full AST access.

### `src/internal/prepass/resolve-imports.ts`

```typescript
import { ResolverFactory } from "oxc-resolver";

const resolver = new ResolverFactory({
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  conditionNames: ["import", "node"],
  mainFields: ["module", "main"],
  extensionAlias: { ".js": [".ts", ".tsx", ".js"], ".jsx": [".tsx", ".jsx"] },
});

export function resolveImport(fromFile: string, specifier: string): string | undefined {
  const result = resolver.resolveFileSync(fromFile, specifier);
  return result.path ?? undefined;
}
```

`resolveFileSync(filePath, specifier)` auto-discovers the nearest `tsconfig.json` by traversing parent directories, respecting `paths`, `references`, `include`/`exclude`, and `${configDir}` templates.

### `src/internal/prepass/scan-cross-file-selectors.ts`

Parses each file with jscodeshift, finds `${ImportedComponent}` references inside styled template literals, and calls `resolveImport` to get absolute paths. Returns a `CrossFileInfo` map describing which files are consumers and which are targets.

See the prototype implementation for the full API.
