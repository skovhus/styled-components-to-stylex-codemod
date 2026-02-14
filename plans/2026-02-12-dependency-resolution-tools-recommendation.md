# Cross-File Styled-Components Selector Resolution

## The Problem

In styled-components, you can use one component as a CSS selector inside another component's styles:

```tsx
import { Icon } from "./icon";

const Button = styled.button`
  ${Icon} {
    width: 18px;
  }
  &:hover ${Icon} {
    transform: rotate(180deg);
  }
`;
```

At runtime, styled-components resolves `${Icon}` to Icon's generated CSS class (`.sc-abc123`), producing a descendant selector like `.sc-button .sc-abc123 { width: 18px }`.

When **both components are in the same file**, the codemod already handles this — it uses StyleX's `stylex.when.ancestor()` and `stylex.defaultMarker()` APIs. But when **Icon comes from a different file** (via `import`), the codemod had no way to know that `Icon` is a styled-component in another file. It would bail with "Unsupported selector: unknown component selector."

This PR adds the infrastructure to resolve those cross-file imports, detect them as component selectors, and transform them using `stylex.defineMarker()`.

---

## How to enable it (user-facing)

When calling `runTransform`, pass a `consumerPaths` glob alongside `files`:

```ts
await runTransform({
  files: "packages/app/src/**/*.tsx", // files to transform
  consumerPaths: "packages/**/*.tsx", // additional files to scan for selector usage
  adapter: myAdapter,
});
```

- **`files`** — The files being transformed (converted from styled-components to StyleX).
- **`consumerPaths`** (new, optional) — Additional files to scan for `${ImportedComponent}` selector usage. Files only in `consumerPaths` trigger a bridge strategy for incremental migration; files in both trigger the marker strategy.

If `consumerPaths` is not provided, the prepass still runs automatically when `files` matches more than one file.

---

## How it works internally

The implementation has two phases: a **prepass** that runs once before any files are transformed, and **per-file transform modifications** that use the prepass results.

### Phase 1: Prepass (runs once)

```
runTransform()
  │
  ├── Resolve file globs → absolute paths
  │
  ├── Create module resolver (oxc-resolver)
  │     • Extension probing: .ts, .tsx, .js, .jsx, /index.*
  │     • tsconfig.json paths + project references (auto-discovered)
  │     • .js → .ts remapping (ESM moduleResolution: "bundler")
  │     • pnpm/Yarn workspace symlink resolution
  │     • package.json exports field
  │
  ├── scanCrossFileSelectors(filesToTransform, consumerPaths, resolver)
  │     For each file:
  │       1. Quick bail: skip if source doesn't contain "styled-components"
  │       2. Parse with jscodeshift → full AST
  │       3. buildImportMap: localName → { source, importedName }
  │       4. findStyledImportName: find `import styled from "styled-components"`
  │       5. findComponentSelectorLocals: find ${Identifier} in selector context
  │       6. For each selector local that's an import:
  │            resolver.resolve(filePath, specifier) → absolute target path
  │
  └── Result: CrossFileInfo
        • selectorUsages: Map<consumerPath, usages[]>
        • componentsNeedingStyleAcceptance: Map<targetPath, Set<exportedName>>
        • componentsNeedingBridge: Map<targetPath, Set<exportedName>>
```

**Key files:**

- `src/internal/prepass/resolve-imports.ts` — `oxc-resolver` wrapper
- `src/internal/prepass/scan-cross-file-selectors.ts` — scanner

### Phase 2: Per-file transform

The global `CrossFileInfo` is passed through jscodeshift options. Each file's transform extracts its own slice:

```
transform(file, api, options)
  │
  ├── extractCrossFileInfoForFile(file.path, options)
  │     Looks up this file's path in the global CrossFileInfo maps.
  │     Produces a per-file CrossFileInfo: { selectorUsages, componentsNeedingStyleAcceptance }
  │
  ├── TransformContext stores:
  │     • crossFileSelectorUsages — usages where this file is the consumer
  │     • crossFileStyleAcceptance — components this file exports that need style props
  │     • crossFileMarkers — marker variable names (populated during lower-rules)
  │
  ├── LowerRulesState adds:
  │     • crossFileSelectorsByLocal — Map<localName, usage> for fast lookup
  │     • crossFileMarkers — Map<parentStyleKey, markerVarName>
  │
  └── Pipeline steps that changed:
```

#### process-rules.ts — The core change

Previously, at the `${Child}` selector handling point:

```
if (!childDecl) {
  bail("unknown component selector");  // ← stopped here for cross-file
}
```

Now:

```
if (!childDecl) {
  crossFileUsage = state.crossFileSelectorsByLocal.get(otherLocal);
  if (!crossFileUsage) {
    bail("unknown component selector");  // still bail for truly unknown
  }
}

// Proceed with override logic using synthetic child style key
childStyleKey = childDecl ? childDecl.styleKey : toStyleKey(otherLocal);
overrideStyleKey = `${toStyleKey(otherLocal)}In${decl.localName}`;

// Register a defineMarker for the parent
if (crossFileUsage) {
  markerVarName = `__${decl.localName}Marker`;
  state.crossFileMarkers.set(decl.styleKey, markerVarName);
  // Tag the RelationOverride as cross-file
  created.crossFile = true;
  created.markerVarName = markerVarName;
  created.crossFileChildLocalName = otherLocal;
}
```

#### relation-overrides.ts — Marker in when.ancestor()

`makeAncestorKey` now accepts an optional marker variable name:

```ts
// Same-file (no marker):
stylex.when.ancestor(":hover");

// Cross-file (with marker):
stylex.when.ancestor(":hover", __ButtonMarker);
```

The marker is looked up from `RelationOverride.markerVarName`.

#### emit-styles step — defineMarker declaration

Emits `const __ButtonMarker = stylex.defineMarker()` at module scope, after imports.

#### rewrite-jsx.ts — JSX wiring

Two additions to the existing relation override visitor:

1. **Parent elements**: For cross-file parents, uses the marker variable instead of `defaultMarker()`:

   ```tsx
   // Same-file:
   <button {...stylex.props(styles.button, stylex.defaultMarker())}>
   // Cross-file:
   <button {...stylex.props(styles.button, __ButtonMarker)}>
   ```

2. **Child elements**: For imported cross-file children (which don't have a `stylex.props()` call yet), adds a spread:
   ```tsx
   // Before:
   <CollapseArrowIcon />
   // After:
   <CollapseArrowIcon {...stylex.props(styles.collapseArrowIconInButton)} />
   ```

### Data flow diagram

```
┌─────────────────────────────────────────────────────────┐
│ runTransform()                                          │
│                                                         │
│  files glob ──→ filePaths[]                            │
│  consumerPaths glob ──→ consumerFilePaths[]            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Prepass                                           │  │
│  │  oxc-resolver ──→ ModuleResolver                  │  │
│  │  scanCrossFileSelectors() ──→ CrossFileInfo       │  │
│  │    (global: all files → all usages)               │  │
│  └──────────────────────────────────────────────────┘  │
│           │                                             │
│           ▼                                             │
│  jscodeshift options.crossFilePrepassResult             │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Per-file transform (for each file in filePaths)   │  │
│  │                                                    │  │
│  │  extractCrossFileInfoForFile(file.path)            │  │
│  │    → per-file CrossFileInfo slice                  │  │
│  │                                                    │  │
│  │  TransformContext.crossFileSelectorUsages          │  │
│  │           │                                        │  │
│  │           ▼                                        │  │
│  │  LowerRulesState.crossFileSelectorsByLocal         │  │
│  │           │                                        │  │
│  │           ▼                                        │  │
│  │  process-rules: detect ${Import} selectors         │  │
│  │    → RelationOverride { crossFile, markerVarName } │  │
│  │    → crossFileMarkers map                          │  │
│  │           │                                        │  │
│  │           ▼                                        │  │
│  │  relation-overrides: when.ancestor(pseudo, marker) │  │
│  │  emit-styles: const __Marker = defineMarker()      │  │
│  │  rewrite-jsx: spread overrides onto imported child │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Example transform

**Input:**

```tsx
import styled from "styled-components";
import { Icon } from "./icon";

const Button = styled.button`
  gap: 8px;
  ${Icon} {
    width: 18px;
  }
  &:hover ${Icon} {
    transform: rotate(180deg);
  }
`;

export const App = () => (
  <Button>
    <Icon />
    Toggle
  </Button>
);
```

**Output:**

```tsx
import * as stylex from "@stylexjs/stylex";
import { Icon } from "./icon";

const __ButtonMarker = stylex.defineMarker();

export const App = () => (
  <button {...stylex.props(styles.button, __ButtonMarker)}>
    <Icon {...stylex.props(styles.iconInButton)} />
    Toggle
  </button>
);

const styles = stylex.create({
  button: { display: "flex", gap: "8px" },
  iconInButton: {
    width: "18px",
    transform: {
      default: null,
      [stylex.when.ancestor(":hover", __ButtonMarker)]: "rotate(180deg)",
    },
  },
});
```

### New dependency

**`oxc-resolver`** — Rust-native module resolver (NAPI binding). Handles tsconfig paths, project references, `.js`→`.ts` remapping, pnpm/Yarn workspace symlinks, and package.json `exports` fields. Used by oxlint, Rspack, Rolldown, Biome. Zero JS dependencies, ~5MB native binary with WASM fallback.

### Test coverage (28 cross-file tests)

| Category          | Tests                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Module resolution | relative, barrel, .js extension, unresolvable, node_modules                                                         |
| Scanner detection | basic, barrel, multi-line imports, aliased imports, renamed styled, value vs selector, two parents, bridge scenario |
| Monorepo          | workspace barrel import, subpath export, full transform                                                             |
| Transform e2e     | defineMarker emission, same-file regression, aliased import, two parents, base-only selector                        |
