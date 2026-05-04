# styled-components-to-stylex-codemod

Transform styled-components to StyleX.

**[Try it in the online playground](https://skovhus.github.io/styled-components-to-stylex-codemod/)** — experiment with the transform in your browser.

## Migration game plan

A successful migration generally follows these steps. The agent prompt below automates them; this section explains the reasoning so you can supervise.

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

### 3. Convert bottom-up (leaf components first)

When a component wraps another component that internally uses styled-components (e.g. `styled(GroupHeader)` where `GroupHeader` renders a `StyledHeader`), CSS cascade conflicts can arise after migration. Convert leaf files — the ones that don't wrap other styled-components — first, then work your way up. The codemod will bail with a warning if it detects this pattern.

### 4. Verify, iterate, clean up

Build and test your project. Review warnings — they tell you which files were skipped and why. Fix adapter gaps, re-run on remaining files, and repeat until done. [Report issues](https://github.com/skovhus/styled-components-to-stylex-codemod/issues) with input/output examples if the codemod produces incorrect results.

## Run with an AI agent

The fastest way to execute the game plan above on a real codebase is to hand it to an AI coding agent (Cursor, Claude Code, Codex, etc.) and let it install the codemod, scaffold an adapter, run a dry-run, and iterate on warnings.

Copy the prompt below into your agent and edit the bracketed `[…]` placeholders to match your project. Keep this README open in the agent's context so it can refer back to the API details.

<details>
<summary>Copy-paste agent prompt</summary>

````text
You are migrating a TypeScript/React codebase from `styled-components` to StyleX using
`styled-components-to-stylex-codemod`. The project lives at `[path/to/repo]` and uses
`[pnpm | npm | yarn]`. Source files to migrate live under `[src/**/*.tsx]`.

Work iteratively. After each step, summarize what changed and what warnings remain
before moving on.

### Step 1 — Install the codemod

Add it as a dev dependency:

  pnpm add -D styled-components-to-stylex-codemod
  # or: npm install -D styled-components-to-stylex-codemod

The host project also needs `@stylexjs/stylex` and the StyleX babel/bundler plugin
configured. If StyleX isn't set up yet, follow https://stylexjs.com/docs/learn/installation
first — the codemod assumes StyleX is already wired into the build.

### Step 2 — Define theme + shared helpers as StyleX

Before running the codemod, port the existing theme object and any shared
CSS-in-JS helpers (`truncate`, `transitionSpeed`, etc.) to StyleX so the adapter
has something to point at:

  - `tokens.stylex.ts` — theme variables via `stylex.defineVars(...)`
  - `helpers.stylex.ts` — shared mixins via `stylex.create(...)`

Read the existing theme definition at `[path/to/theme.ts]` and shared helpers at
`[path/to/helpers.ts]`, then create matching `*.stylex.ts` files. Do NOT delete
the originals yet — components still import them until the codemod runs.

### Step 3 — Scaffold the adapter and a runner script

Create `scripts/run-codemod.ts` in the host project:

  ```ts
  import { runTransform, defineAdapter } from "styled-components-to-stylex-codemod";

  const adapter = defineAdapter({
    resolveValue(ctx) {
      if (ctx.kind === "theme") {
        // map ctx.path (e.g. "color.primary") → `tokens.color_primary` or similar
        // return { expr, imports: [{ from: { kind: "specifier", value: "./tokens.stylex" }, names: [{ imported: "tokens" }] }] }
        return null;
      }
      if (ctx.kind === "cssVariable") {
        // map ctx.name (e.g. "--brand-color") → `vars.brandColor`
        return null;
      }
      return null;
    },
    resolveCall(ctx) {
      // map known helper imports (e.g. transitionSpeed) → StyleX expressions
      // return null to bail the file with a warning
      return null;
    },
    externalInterface(ctx) {
      // start with everything off; flip to true for shared/exported components
      return { styles: false, as: false, ref: false };
    },
  });

  await runTransform({
    files: "src/**/*.tsx",
    consumerPaths: null,
    adapter,
    dryRun: true, // <-- flip to false once warnings are acceptable
    parser: "tsx",
    formatterCommands: ["pnpm prettier --write"],
  });
  ```

### Step 4 — Dry-run and triage warnings

Run `tsx scripts/run-codemod.ts` (or `node --import tsx ...`) with `dryRun: true`.
The codemod prints per-file warnings explaining which interpolations or
selectors it could not handle. Categorize them:

  - "could not resolve theme path X" → extend `resolveValue` for `kind: "theme"`
  - "could not resolve helper call X" → extend `resolveCall`
  - "could not resolve imported value X" → extend `resolveValue` for `kind: "importedValue"`
  - "createGlobalStyle is unsupported" → migrate by hand
  - "wraps another styled component" → defer, convert leaves first

### Step 5 — Iterate

Extend the adapter to cover real warnings, re-run the dry-run, and repeat until
the remaining warnings are acceptable (manual follow-ups only).

### Step 6 — Run for real, bottom-up

Flip `dryRun: false` and narrow `files` to a single leaf folder first. Commit.
Build and test. Visually spot-check a few screens. Then expand `files` outward
to consumers.

For exported / shared components that other files extend with `styled(X)` or
`<X as="...">`, set `externalInterface` to return `{ styles: true, as: true }`
for those. If `consumerPaths` is configured, you can also use
`externalInterface: "auto"` to detect this automatically.

### Step 7 — Clean up

Once a folder is fully migrated:
  - delete the original `theme.ts` / `helpers.ts` if nothing imports them
  - drop `styled-components` from `package.json` once the last file is converted

### Reference

For the full adapter API (`resolveBaseComponent`, `styleMerger`, `useSxProp`,
`wrappedComponentInterface`, `themeHook`, cross-file selectors via
`consumerPaths`, etc.) read the rest of this README, especially the "Adapter"
section.
````

</details>

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
  // Optional override for sx-aware wrapped components. Auto-detection is on by
  // default when `useSxProp: true` — the codemod scans the imported component's
  // prop type for an `sx?:` member. Use this hook to override (e.g. for package
  // imports that cannot be resolved to source on disk).
  wrappedComponentInterface(ctx) {
    return undefined;
  },
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
   * Optional: inline styled(ImportedComponent) into an intrinsic element.
   * When the base component can be resolved statically, return the target
   * element, consumed props, and base StyleX declarations. Return undefined
   * to keep normal styled(Component) behavior.
   */
  resolveBaseComponent(ctx) {
    if (ctx.importSource !== "@company/ui" || ctx.importedName !== "Flex") {
      return undefined;
    }

    const sx: Record<string, string> = { display: "flex" };
    const consumedProps = ["column", "gap", "align"];

    if (ctx.staticProps.column === true) {
      sx.flexDirection = "column";
    }
    if (typeof ctx.staticProps.gap === "number") {
      sx.gap = `${ctx.staticProps.gap}px`;
    }

    return { tagName: "div", consumedProps, sx };
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

  /**
   * Emit sx={} JSX attributes instead of {...stylex.props()} spreads.
   * Requires @stylexjs/babel-plugin ≥0.18 with sxPropName enabled.
   */
  useSxProp: false,

  /**
   * Optional override for sx-aware wrapped components.
   *
   * When `useSxProp: true`, the codemod auto-detects whether an imported
   * component accepts an `sx` prop by walking its declared prop type
   * (intersections, type aliases, and interfaces in the same file). When
   * `styled(Component)` wraps an sx-aware component, the codemod emits
   * `<Component sx={styles.x} />` instead of `<Component {...stylex.props(styles.x)} />`
   * and lets the wrapped component merge className/style itself.
   *
   * Use this hook to override auto-detection for cases it can't see, such as
   * unresolvable package imports or components whose sx support is added by a
   * HOC at runtime. Returning `undefined` falls through to auto-detection.
   */
  wrappedComponentInterface(ctx) {
    if (ctx.importSource.startsWith("@company/ui/")) {
      return { acceptsSx: true };
    }
    return undefined;
  },

  /**
   * Optional: customize the runtime theme hook used when wrappers need theme booleans.
   * Defaults to useTheme from styled-components.
   */
  themeHook: {
    functionName: "useDesignTheme",
    importSource: { kind: "specifier", value: "@company/theme-hooks" },
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
- how helper calls are resolved (via `resolveCall({ ... })` returning `{ expr, imports }`, or `{ preserveRuntimeCall: true }` to keep only the original helper runtime call; `null`/`undefined` bails the file)
- which exported components should support external className/style extension and/or polymorphic `as` prop (`externalInterface`)
- how className/style merging is handled for components accepting external styling (`styleMerger`)
- which imported components already accept a StyleX `sx` prop (auto-detected from the imported component's prop type when `useSxProp: true`; can be overridden via `wrappedComponentInterface`). When detected, the codemod emits `sx={styles.x}` on the wrapped component instead of `{...stylex.props(styles.x)}`.
- which runtime theme hook import/call to use for emitted wrapper theme conditionals (`themeHook`)
- how `styled(ImportedComponent)` wrapping an external base component can be inlined into an intrinsic element with static StyleX styles (`resolveBaseComponent`)

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

Use this when you want to **replace a base component entirely** by inlining its styles. If your codebase has a layout primitive like `<Flex>` whose behavior is purely CSS, the codemod can eliminate the runtime import and render a plain `<div>` instead.

The resolver receives `ctx.importSource`, `ctx.importedName`, and `ctx.staticProps` (from `.attrs()` and JSX call sites). Return `{ tagName, consumedProps, sx }` to inline, or `undefined` to skip.

```tsx
// Input
const Container = styled(Flex).attrs({ column: true, gap: 16 })`
  padding: 8px;
`;
```

```ts
// Adapter
resolveBaseComponent(ctx) {
  if (ctx.importedName !== "Flex") return undefined;
  const sx: Record<string, string> = { display: "flex" };
  if (ctx.staticProps.column === true) sx.flexDirection = "column";
  if (typeof ctx.staticProps.gap === "number") sx.gap = `${ctx.staticProps.gap}px`;
  return { tagName: "div", consumedProps: ["column", "gap", "align"], sx };
},
```

```tsx
// Output — Flex is gone, its styles are merged into stylex.create()
const styles = stylex.create({
  container: { display: "flex", flexDirection: "column", gap: "16px", padding: "8px" },
});
```

If the base component's styles already exist as a `stylex.create()` object, return `mixins` instead of (or alongside) `sx`. The codemod imports the mixin and includes it in `stylex.props(...)`:

```ts
resolveBaseComponent(ctx) {
  return {
    tagName: "div",
    consumedProps: ["column", "gap"],
    mixins: [{ importSource: "./lib/mixins.stylex", importName: "mixins", styleKey: "flex" }],
  };
},
// Output: <div {...stylex.props(mixins.flex, styles.container)} />
```

#### Dynamic interpolations

When the codemod encounters an interpolation inside a styled template literal, it runs an internal dynamic resolution pipeline which covers common cases like:

- theme access (`props.theme...`) via `resolveValue({ kind: "theme", path })`
- indexed theme lookups (`props.theme.color[props.$bg]`) — when `ctx.indexedLookup` is true, return `{ usage: "props", dynamicArgUsage: "memberAccess" }` to emit a prebuilt per-property mixin map (e.g., `$colorMixins.backgroundColor[bg]`) instead of a dynamic style function
- imported value access (`import { zIndex } ...; ${zIndex.popover}`) via `resolveValue({ kind: "importedValue", importedName, source, path })`
- prop access (`props.foo`) and conditionals (`props.foo ? "a" : "b"`, `props.foo && "color: red;"`)
- helper calls (`transitionSpeed("slowTransition")`) via `resolveCall({ ... })` — the codemod infers usage from context:
  - With `ctx.cssProperty` (e.g., `color: ${helper()}`) → result used as CSS value in `stylex.create()`
  - Without `ctx.cssProperty` (e.g., `${helper()}`) → result used as StyleX styles in `stylex.props()`
  - Use the optional `usage: "create" | "props"` field to override the default inference
  - Use `preserveRuntimeCall: true` to keep the original helper call as a runtime style-function
    override (with or without a static fallback from `expr`)
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

## License

MIT
