# styled-components-to-stylex-codemod

Transform styled-components to StyleX.

**[Try it in the online playground](https://skovhus.github.io/styled-components-to-stylex-codemod/)** — experiment with the transform in your browser.

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

The adapter maps your project's `props.theme.*` access, CSS variables, and helper calls to the StyleX equivalents from step 1. See [Basic usage](#basic-usage) for the full API.

### 3. Convert bottom-up (leaf components first)

When a component wraps another component that internally uses styled-components (e.g. `styled(GroupHeader)` where `GroupHeader` renders a `StyledHeader`), CSS cascade conflicts can arise after migration. Convert leaf files — the ones that don't wrap other styled-components — first, then work your way up. The codemod will bail with a warning if it detects this pattern.

Run [`analyzeMigrationPlan`](#planning-manual-conversions) to get the ordered, bottom-up list of files to convert by hand first.

### 4. Verify, iterate, clean up

Build and test your project. Review warnings — they tell you which files were skipped and why. Fix adapter gaps, re-run on remaining files, and repeat until done. [Report issues](https://github.com/skovhus/styled-components-to-stylex-codemod/issues) with input/output examples if the codemod produces incorrect results.

## Agent prompt for configuring a migration

Copy this into an agent working in the repository you want to migrate:

````prompt
You are helping migrate this repository from styled-components to StyleX with
`styled-components-to-stylex-codemod`.

Work in small, reviewable steps:

1. Inspect the project before changing files.
   - Identify the package manager and install command.
   - Find styled-components usage, theme access patterns, CSS variables, helper
     functions used inside template interpolations, shared mixins, and existing
     StyleX setup.
   - Identify a leaf component/file glob to migrate first. Prefer components
     that do not wrap other styled-components.

2. Install the codemod and any missing StyleX runtime/build dependencies the
   project needs.
   - Use the repository's package manager.
   - Keep dependency changes separate and explain why each package is needed.

3. Create a local codemod runner, for example
   `scripts/run-styled-components-to-stylex.mts`, using this shape:

   ```ts
   import { defineAdapter, runTransform } from "styled-components-to-stylex-codemod";

   const adapter = defineAdapter({
     resolveValue(ctx) {
       // Map props.theme.*, CSS variables, and imported constants to StyleX
       // variables or other static StyleX-compatible expressions.
       return undefined;
     },
     resolveCall(ctx) {
       // Map helper calls used in styled template interpolations to StyleX
       // mixins/values, or return { preserveRuntimeCall: true } when safe.
       return undefined;
     },
     resolveSelector(ctx) {
       // Map imported selector helpers such as media query or pseudo aliases.
       return undefined;
     },
     externalInterface(ctx) {
       // Return { styles: true, as: true, ref: true } for exported components
       // that must keep accepting className/style, polymorphic `as`, or refs.
       return { styles: false, as: false, ref: false };
     },
     styleMerger: null,
     useSxProp: false,
     wrappedComponentInterface(ctx) {
       return undefined;
     },
     themeHook: {
       functionName: "useTheme",
       importSource: { kind: "specifier", value: "styled-components" },
     },
   });

   await runTransform({
     files: "src/**/*.tsx",
     consumerPaths: "src/**/*.tsx",
     adapter,
     dryRun: true,
     parser: "tsx",
     formatterCommands: ["pnpm prettier --write"],
   });
   ```

4. Configure the adapter for this codebase.
   - `resolveValue`: map theme paths (`props.theme.color.primary`), CSS
     variables (`var(--token)`), and imported values to StyleX variables.
   - `resolveCall`: map project style helpers to StyleX mixins or values.
   - `resolveSelector`: map imported media-query or pseudo selector helpers.
   - `externalInterface`: preserve `className`/`style`, `as`, and `ref` support
     for public components. Use `externalInterface: "auto"` only when
     `consumerPaths` covers the consumers and the prepass succeeds.
   - `styleMerger`: provide the project's helper for combining StyleX styles
     with external `className`/`style` when public components need it.
   - `useSxProp` and `wrappedComponentInterface`: enable only if the project
     uses StyleX `sx` props and the Babel plugin is configured for them.
   - `themeHook`: point wrapper theme conditionals at the project's runtime
     theme hook if it is not `useTheme` from styled-components.
   - `resolveBaseComponent`: add this only for base UI primitives that can be
     safely replaced with intrinsic elements and static StyleX styles.

5. Run a dry run first.
   - Keep `dryRun: true`.
   - Run the runner against the smallest useful file glob.
   - Read every warning. Update the adapter instead of hand-editing output
     when the warning describes a repeatable project pattern.

6. Run the real transform only after the dry run is clean enough to review.
   - Set `dryRun: false`.
   - Keep the migration scoped to the selected leaf files.
   - Run the project's formatter, typecheck, lint, tests, and Storybook or
     visual checks if available.
   - Inspect the diff for dropped declarations, inline-style fallbacks, public
     component API changes, and cross-file selector bridge/marker behavior.

7. Iterate bottom-up.
   - Commit the runner/adapter and each migrated slice separately.
   - Expand the `files` glob only after the previous slice is reviewed.
   - Preserve warnings or TODOs for any file that needs manual follow-up.
````

## API and configuration reference

### Installation

```bash
npm install styled-components-to-stylex-codemod
# or
pnpm add styled-components-to-stylex-codemod
```

### Basic usage

Use `runTransform` to transform files matching a glob pattern:

```ts
import { runTransform, defineAdapter } from "styled-components-to-stylex-codemod";

const adapter = defineAdapter({
  // Map theme paths and CSS variables to StyleX expressions
  resolveValue(ctx) {
    return undefined;
  },
  // Map helper function calls to StyleX expressions
  resolveCall(ctx) {
    return undefined;
  },
  // Map imported selector helpers such as media query or pseudo aliases
  resolveSelector(ctx) {
    return undefined;
  },
  // Control which components accept external className/style, polymorphic `as`, and refs
  externalInterface(ctx) {
    return { styles: false, as: false, ref: false };
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
   * and imported values. Return `{ expr, imports }` or `undefined` to skip.
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

    return undefined;
  },

  /**
   * Resolve helper function calls in template interpolations.
   * e.g. `${transitionSpeed("slow")}` → `transitionSpeedVars.slow`
   * Return `{ expr, imports }` or `undefined` to bail the file with a warning.
   */
  resolveCall(ctx) {
    const arg0 = ctx.args[0];
    const key = arg0?.kind === "literal" && typeof arg0.value === "string" ? arg0.value : null;
    if (ctx.calleeImportedName !== "transitionSpeed" || !key) {
      return undefined;
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
   * Resolve imported values used in selector position, such as media query
   * helpers or pseudo-class aliases. Return `undefined` to bail the file.
   */
  resolveSelector(ctx) {
    return undefined;
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
   * Control which exported components accept external className/style,
   * polymorphic `as`, and/or refs. Return `{ styles, as, ref }` flags.
   */
  externalInterface(ctx) {
    if (ctx.filePath.includes("/shared/components/")) {
      return { styles: true, as: true, ref: true };
    }
    return { styles: false, as: false, ref: false };
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

### Planning manual conversions

`analyzeMigrationPlan` runs the codemod in analysis-only mode (it never writes files) and returns the bottom-up ordered list of files you must convert by hand — the genuine blockers the codemod can't convert — each with its consumer count, the exports to convert, direct auto-migration payoff, secondary blocker-chain context, and the bail reasons. `formatMigrationPlan` renders it as a report with direct unlocks emphasized first so raw chain involvement is not mistaken for files unlocked by one blocker alone.

```ts
import { analyzeMigrationPlan, formatMigrationPlan } from "styled-components-to-stylex-codemod";

const plan = await analyzeMigrationPlan({
  files: "src/**/*.tsx",
  consumerPaths: "src/**/*.tsx",
  adapter, // the same adapter you pass to runTransform
});

console.log(formatMigrationPlan(plan));
```

Try it against this repo's own fixtures with `node scripts/migration-plan.mts`.

### Adapter

Adapters are the main extension point, see full example above. They let you control:

- how theme paths, CSS variables, and imported values are turned into StyleX-compatible JS values (`resolveValue`)
- what extra imports to inject into transformed files (returned from `resolveValue`)
- how helper calls are resolved (via `resolveCall({ ... })` returning `{ expr, imports }`, or `{ preserveRuntimeCall: true }` to keep only the original helper runtime call; `undefined` bails the file)
- how imported media-query or pseudo selector helpers are resolved (`resolveSelector`)
- which exported components should support external className/style extension, polymorphic `as`, and/or refs (`externalInterface`)
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

Instead of manually specifying which components need `styles`, `as`, or `ref` support, set `externalInterface: "auto"` to auto-detect usage by scanning consumer code.

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

When `externalInterface: "auto"` is set, `runTransform()` scans `files` and `consumerPaths` for `styled(Component)` calls plus JSX usage such as `<Component as={...}>`, `ref`, `className`, and `style`, resolves imports back to the component definition files, and returns the appropriate `{ styles, as, ref }` flags automatically.

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
- if `resolveCall` returns `undefined`, the transform **bails the file** and logs a warning
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
