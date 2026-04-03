# styled-components-to-stylex-codemod

Transform styled-components to StyleX.

**[Try it in the online playground](https://skovhus.github.io/styled-components-to-stylex-codemod/)** — experiment with the transform in your browser.

## Installation

```bash
npm install styled-components-to-stylex-codemod
# or
pnpm add styled-components-to-stylex-codemod
```

## Usage

Use `runTransform` to transform files matching a glob pattern:

```ts
import { runTransform, defineAdapter } from "styled-components-to-stylex-codemod";

const adapter = defineAdapter({
  // Map theme paths and CSS variables to StyleX expressions
  resolveValue(ctx) {
    return null;
  },
  // Map helper function calls to StyleX expressions
  resolveCall(ctx) {
    return null;
  },
  // Control which components accept external className/style and polymorphic `as`
  externalInterface(ctx) {
    return { style: false, as: false };
  },
  // Optional: use a helper for merging StyleX styles with external className/style
  styleMerger: null,
  // Emit sx={} JSX attributes instead of {...stylex.props()} spreads (requires StyleX ≥0.18)
  useSxProp: false,
  // Optional: customize the runtime theme hook import/call used for theme conditionals
  // Defaults to { functionName: "useTheme", importSource: { kind: "specifier", value: "styled-components" } }
  themeHook: {
    functionName: "useTheme",
    importSource: { kind: "specifier", value: "styled-components" },
  },
});

await runTransform({
  files: "src/**/*.tsx",
  consumerPaths: null, // set to a glob to enable cross-file selector support
  adapter,
  dryRun: false,
  parser: "tsx",
  formatterCommands: ["pnpm prettier --write"],
});
```

### Adapter

Adapters map your project's theme tokens, helper functions, and component patterns to StyleX equivalents. Use `runInit` to scan your codebase and generate a starter adapter with TODO placeholders:

```ts
import { runInit } from "styled-components-to-stylex-codemod";

const { adapterSource, summary } = await runInit({ files: "src/**/*.tsx" });
console.log(summary); // what was detected
// adapterSource contains a ready-to-edit adapter file
```

The generated adapter includes inline docs for every hook. Key hooks:

- `themeMapping` — declarative theme path → StyleX token mapping (first match wins)
- `resolveValue` — fallback for theme paths, CSS variables, imported values
- `resolveCall` — map helper function calls to StyleX expressions
- `resolveSelector` — map interpolated selectors
- `resolveBaseComponent` — inline `styled(Component)` into intrinsic elements
- `externalInterface` — control className/style/as prop support
- `styleMerger` — custom className/style merging helper
- `themeHook` — runtime theme hook configuration

#### Cross-file selectors (`consumerPaths`)

`consumerPaths` is required. Pass `null` to opt out, or a glob pattern to enable cross-file selector scanning.

When transforming a subset of files, other files may reference your styled components as CSS selectors (e.g. `${Icon} { fill: red }`). Pass `consumerPaths` to scan those files and wire up cross-file selectors automatically:

```ts
await runTransform({
  files: "src/components/**/*.tsx", // files to transform
  consumerPaths: "src/**/*.tsx", // additional files to scan for cross-file usage
  adapter,
});
```

- Files in **both** `files` and `consumerPaths` use the **marker sidecar** strategy (both consumer and target are transformed, using `stylex.defineMarker()`).
- Files in `consumerPaths` but **not** in `files` use the **bridge** strategy (a stable `className` is added to the converted component so unconverted consumers' selectors still work).

#### Auto-detecting external interface usage (experimental)

Instead of manually specifying which components need `styles` or `as` support, set `externalInterface: "auto"` to auto-detect usage by scanning consumer code.

> [!NOTE]
> Experimental. Requires `consumerPaths` and a successful prepass scan.
> If prepass fails, `runTransform()` throws (fail-fast) when `externalInterface: "auto"` is used.

```ts
import { runTransform, defineAdapter } from "styled-components-to-stylex-codemod";

const adapter = defineAdapter({
  // ...
  externalInterface: "auto",
});

await runTransform({
  files: "src/**/*.tsx",
  consumerPaths: "src/**/*.tsx", // required for auto-detection
  adapter,
});
```

When `externalInterface: "auto"` is set, `runTransform()` scans `files` and `consumerPaths` for `styled(Component)` calls and `<Component as={...}>` JSX usage, resolves imports back to the component definition files, and returns the appropriate `{ styles, as }` flags automatically.

If that prepass scan fails, `runTransform()` stops and throws an actionable error rather than silently falling back to non-auto behavior.

Troubleshooting prepass failures with `"auto"`:

- verify `consumerPaths` globs match the files you expect
- confirm the selected parser matches your source syntax (`parser: "tsx"`, `parser: "ts"`, etc.)
- check resolver inputs (import paths, tsconfig path aliases, and related module resolution config)
- if needed, switch to a manual `externalInterface(ctx)` function to continue migration while you fix prepass inputs

#### Base component resolution (`resolveBaseComponent`)

When your codebase has layout primitives like `<Flex>` whose behavior is purely CSS, `resolveBaseComponent` lets the codemod eliminate the runtime import and render a plain element instead:

```tsx
// Input
const Container = styled(Flex).attrs({ column: true, gap: 16 })`padding: 8px;`;

// Adapter
resolveBaseComponent(ctx) {
  if (ctx.importedName !== "Flex") return undefined;
  const sx: Record<string, string> = { display: "flex" };
  if (ctx.staticProps.column === true) sx.flexDirection = "column";
  if (typeof ctx.staticProps.gap === "number") sx.gap = `${ctx.staticProps.gap}px`;
  return { tagName: "div", consumedProps: ["column", "gap", "align"], sx };
},

// Output — Flex is gone, styles merged into stylex.create()
const styles = stylex.create({
  container: { display: "flex", flexDirection: "column", gap: "16px", padding: "8px" },
});
```

Return `mixins` instead of `sx` to reference an existing `stylex.create()` object:

```ts
return {
  tagName: "div",
  consumedProps: ["column", "gap"],
  mixins: [{ importSource: "./lib/mixins.stylex", importName: "mixins", styleKey: "flex" }],
};
// Output: <div {...stylex.props(mixins.flex, styles.container)} />
```

### Limitations

- **Flow** type generation is non-existing, works best with TypeScript or plain JS right now. Contributions more than welcome!
- **createGlobalStyle**: detected usage is reported as an **unsupported-feature** warning (StyleX does not support global styles in the same way).
- **Theme prop overrides**: passing a `theme` prop directly to styled components (e.g. `<Button theme={...} />`) is not supported and will bail with a warning.

## Migration game plan

### 1. Define your theme and mixins as StyleX

Before running the codemod, convert your theme object and shared style helpers into StyleX equivalents:

```ts
// tokens.stylex.ts — theme variables
import * as stylex from "@stylexjs/stylex";

// Before: { colors: { primary: "#0066cc" }, spacing: { sm: "8px" } }
export const colors = stylex.defineVars({ primary: "#0066cc" });
export const spacing = stylex.defineVars({ sm: "8px" });
```

```ts
// helpers.stylex.ts — shared mixins
import * as stylex from "@stylexjs/stylex";

// Before: export const truncate = () => `white-space: nowrap; overflow: hidden; ...`
export const truncate = stylex.create({
  base: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
});
```

### 2. Generate and fill in an adapter

Run `runInit` to scan your codebase and generate a starter adapter with TODO placeholders. Fill in the mappings to connect your theme tokens, helpers, and selectors to the StyleX equivalents from step 1.

### 3. Convert bottom-up (leaf components first)

When a component wraps another component that internally uses styled-components (e.g. `styled(GroupHeader)` where `GroupHeader` renders a `StyledHeader`), CSS cascade conflicts can arise after migration. Convert leaf files — the ones that don't wrap other styled-components — first, then work your way up. The codemod will bail with a warning if it detects this pattern.

### 4. Verify, iterate, clean up

Build and test your project. Review warnings — they tell you which files were skipped and why. Fix adapter gaps, re-run on remaining files, and repeat until done. [Report issues](https://github.com/skovhus/styled-components-to-stylex-codemod/issues) with input/output examples if the codemod produces incorrect results.

## License

MIT
