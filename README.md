# styled-components-to-stylex-codemod

Transform styled-components to StyleX.

## Installation

```bash
npm install styled-components-to-stylex-codemod
# or
pnpm add styled-components-to-stylex-codemod
```

## Usage

Use `runTransform` to transform files matching a glob pattern:

```ts
import { runTransform } from "styled-components-to-stylex-codemod";

const result = await runTransform({
  files: "src/**/*.tsx",
});

console.log(`Transformed ${result.transformed} files`);
```

### Options

```ts
interface RunTransformOptions {
  /** Glob pattern(s) for files to transform */
  files: string | string[];

  /**
   * Hook for customizing the transform.
   * Controls value resolution, imports, declarations, and custom handlers.
   */
  hook?: Hook;

  /** Dry run - don't write changes to files (default: false) */
  dryRun?: boolean;

  /** Print transformed output to stdout (default: false) */
  print?: boolean;

  /** Parser to use (default: "tsx") */
  parser?: "babel" | "babylon" | "flow" | "ts" | "tsx";
}
```

### Dry Run

Preview changes without modifying files:

```ts
await runTransform({
  files: "src/**/*.tsx",
  dryRun: true,
  print: true, // prints transformed output to stdout
});
```

### Custom Hook

Hooks are the main extension point. They let you control:

- how theme paths are turned into StyleX-compatible JS values (`resolveValue`)
- what extra imports/declarations to inject into transformed files (`imports`, `declarations`)
- how to handle dynamic interpolations inside template literals (`handlers`)

Three built-in hooks are provided:

```ts
import {
  runTransform,
  defaultHook,      // CSS custom properties: var(--colors-primary)
  defineVarsHook,   // StyleX vars: themeVars.colorsPrimary
  inlineValuesHook, // Inline literal values
} from "styled-components-to-stylex-codemod";

await runTransform({
  files: "src/**/*.tsx",
  hook: defineVarsHook,
});
```

#### `Hook` interface (what you can customize)

```ts
export interface Hook {
  /**
   * Resolve a theme/token path to a StyleX-compatible value.
   *
   * Called by built-in handlers for patterns like:
   *   ${(props) => props.theme.colors.primary}
   *
   * `path` is the member path after `theme`, e.g. "colors.primary".
   * Return a JS expression string, e.g. "themeVars.colorsPrimary" or "'var(--colors-primary)'".
   */
  resolveValue?: (context: {
    path: string;
    defaultValue?: string;
    valueType: "theme" | "helper" | "interpolation";
  }) => string;

  /** Extra imports to inject into transformed files */
  imports?: string[];

  /** Extra module-level declarations to inject into transformed files */
  declarations?: string[];

  /**
   * Custom handlers for dynamic expressions (template interpolations).
   * These run BEFORE built-in handlers.
   */
  handlers?: Array<{
    name: string;
    handle: (node: unknown, ctx: unknown) => unknown | null;
  }>;
}
```

#### How handler ordering works

When the codemod encounters an interpolation inside a styled template literal, it tries handlers in this order:

- `hook.handlers` (your custom handlers, in array order)
- built-in handlers (`builtinHandlers()`), which cover common cases like:
  - theme access (`props.theme...`)
  - prop access (`props.foo`)
  - conditionals (`props.foo ? "a" : "b"`, `props.foo && "color: red;"`)

If no handler can resolve an interpolation:

- for `withConfig({ shouldForwardProp })` wrappers, the transform preserves the value as an inline style so output keeps visual parity
- otherwise, the declaration containing that interpolation is **dropped** and a warning is produced (manual follow-up required)

#### Create a custom hook (theme path → tokens)

```ts
import { runTransform, defineHook } from "styled-components-to-stylex-codemod";

const myHook = defineHook({
  resolveValue({ path, defaultValue }) {
    // Example: theme.colors.primary -> tokens.colors_primary
    // NOTE: return a JS expression string.
    const varName = path.replace(/\./g, "_");
    return `tokens.${varName}`;
  },
  imports: ["import { tokens } from './design-system.stylex';"],
});

await runTransform({
  files: "src/**/*.tsx",
  hook: myHook,
});
```

#### Create a custom handler (advanced)

Most projects won’t need custom handlers. If you do, handlers let you convert an interpolation into:

- a resolved value (inline into the generated style object)
- a style function (generated helper + call site wiring)
- split variants (turn a conditional into base + conditional style keys)

If you want to implement handlers, start by importing the types:

```ts
import type { DynamicHandler, DynamicNode, HandlerContext } from "styled-components-to-stylex-codemod";
```

Then add handlers to your hook:

```ts
import { defineHook } from "styled-components-to-stylex-codemod";

export default defineHook({
  handlers: [
    {
      name: "my-handler",
      handle(node: any, ctx: any) {
        // Return null to let the next handler try.
        // Return a handler result object to tell the transform what to emit.
        return null;
      },
    },
  ],
});
```

### Notes / Limitations

- **ThemeProvider**: if a file imports and uses `ThemeProvider` from `styled-components`, the transform **skips the entire file** (theming strategy is project-specific).
- **createGlobalStyle**: detected usage is reported as an **unsupported-feature** warning (StyleX does not support global styles in the same way).

### Transform Result

```ts
interface RunTransformResult {
  errors: number;      // Files that had errors
  unchanged: number;   // Files that were unchanged
  skipped: number;     // Files that were skipped
  transformed: number; // Files that were transformed
  timeElapsed: number; // Total time in seconds
}
```

## Single File Transform

For programmatic single-file transforms without the jscodeshift runner:

```ts
import { transform } from "styled-components-to-stylex-codemod";
import type { API, FileInfo } from "jscodeshift";

// Use with jscodeshift API
const output = transform(fileInfo, api, options);
```

## License

MIT
