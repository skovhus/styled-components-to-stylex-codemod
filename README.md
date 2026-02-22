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

<details>
<summary>Full adapter example</summary>

```ts
import { runTransform, defineAdapter } from "styled-components-to-stylex-codemod";

const adapter = defineAdapter({
  /**
   * Resolve dynamic values in styled template literals to StyleX expressions.
   * Called for theme access (`props.theme.x`), CSS variables (`var(--x)`),
   * and imported values. Return `{ expr, imports }` or `null` to skip.
   */
  resolveValue(ctx) {
    if (ctx.kind === "theme") {
      const varName = ctx.path.replace(/\./g, "_");
      return {
        expr: `tokens.${varName}`,
        imports: [
          {
            from: { kind: "specifier", value: "./design-system.stylex" },
            names: [{ imported: "tokens" }],
          },
        ],
      };
    }

    if (ctx.kind === "cssVariable") {
      const toCamelCase = (s: string) =>
        s.replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

      return {
        expr: `vars.${toCamelCase(ctx.name)}`,
        imports: [
          {
            from: { kind: "specifier", value: "./css-variables.stylex" },
            names: [{ imported: "vars" }],
          },
        ],
      };
    }

    return null;
  },

  /**
   * Resolve helper function calls in template interpolations.
   * e.g. `${transitionSpeed("slow")}` → `transitionSpeedVars.slow`
   * Return `{ expr, imports }` or `null` to bail the file with a warning.
   */
  resolveCall(ctx) {
    const arg0 = ctx.args[0];
    const key = arg0?.kind === "literal" && typeof arg0.value === "string" ? arg0.value : null;
    if (ctx.calleeImportedName !== "transitionSpeed" || !key) {
      return null;
    }

    return {
      expr: `transitionSpeedVars.${key}`,
      imports: [
        {
          from: { kind: "specifier", value: "./lib/helpers.stylex" },
          names: [{ imported: "transitionSpeed", local: "transitionSpeedVars" }],
        },
      ],
    };
  },

  /**
   * Control which exported components accept external className/style
   * and/or polymorphic `as` prop. Return `{ styles, as }` flags.
   */
  externalInterface(ctx) {
    if (ctx.filePath.includes("/shared/components/")) {
      return { styles: true, as: true };
    }
    return { styles: false, as: false };
  },

  /**
   * When `externalInterface` enables styles, use a helper to merge
   * StyleX styles with external className/style props.
   * See test-cases/lib/mergedSx.ts for a reference implementation.
   */
  styleMerger: {
    functionName: "mergedSx",
    importSource: { kind: "specifier", value: "./lib/mergedSx" },
  },
});

await runTransform({
  files: "src/**/*.tsx",
  consumerPaths: null,
  adapter,
  dryRun: false,
  parser: "tsx",
  formatterCommands: ["pnpm prettier --write"],
});
```

</details>

### Adapter

Adapters are the main extension point, see full example above. They let you control:

- how theme paths, CSS variables, and imported values are turned into StyleX-compatible JS values (`resolveValue`)
- what extra imports to inject into transformed files (returned from `resolveValue`)
- how helper calls are resolved (via `resolveCall({ ... })` returning `{ expr, imports }`; `null`/`undefined` bails the file)
- which exported components should support external className/style extension and/or polymorphic `as` prop (`externalInterface`)
- how className/style merging is handled for components accepting external styling (`styleMerger`)

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

#### Dynamic interpolations

When the codemod encounters an interpolation inside a styled template literal, it runs an internal dynamic resolution pipeline which covers common cases like:

- theme access (`props.theme...`) via `resolveValue({ kind: "theme", path })`
- imported value access (`import { zIndex } ...; ${zIndex.popover}`) via `resolveValue({ kind: "importedValue", importedName, source, path })`
- prop access (`props.foo`) and conditionals (`props.foo ? "a" : "b"`, `props.foo && "color: red;"`)
- helper calls (`transitionSpeed("slowTransition")`) via `resolveCall({ ... })` — the codemod infers usage from context:
  - With `ctx.cssProperty` (e.g., `color: ${helper()}`) → result used as CSS value in `stylex.create()`
  - Without `ctx.cssProperty` (e.g., `${helper()}`) → result used as StyleX styles in `stylex.props()`
  - Use the optional `usage: "create" | "props"` field to override the default inference
- if `resolveCall` returns `null` or `undefined`, the transform **bails the file** and logs a warning
- helper calls applied to prop values (e.g. `shadow(props.shadow)`) by emitting a StyleX style function that calls the helper at runtime
- conditional CSS blocks via ternary (e.g. `props.$dim ? "opacity: 0.5;" : ""`)

If the pipeline can't resolve an interpolation:

- for some dynamic value cases, the transform preserves the value as a wrapper inline style so output keeps visual parity (at the cost of using `style={...}` for that prop)
- otherwise, the declaration containing that interpolation is **dropped** and a warning is produced (manual follow-up required)

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

### 2. Write an adapter and run the codemod

The adapter maps your project's `props.theme.*` access, CSS variables, and helper calls to the StyleX equivalents from step 1. See [Usage](#usage) for the full API.

### 3. Verify, iterate, clean up

Build and test your project. Review warnings — they tell you which files were skipped and why. Fix adapter gaps, re-run on remaining files, and repeat until done. [Report issues](https://github.com/skovhus/styled-components-to-stylex-codemod/issues) with input/output examples if the codemod produces incorrect results.

## License

MIT
