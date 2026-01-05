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
import {
  runTransform,
  defineAdapter,
} from "styled-components-to-stylex-codemod";

const adapter = defineAdapter({
  resolveValue(ctx) {
    if (ctx.kind !== "theme") return null;
    return {
      expr: `tokens.${ctx.path.replace(/\./g, "_")}`,
      imports: ["import { tokens } from './design-system.stylex';"],
    };
  },
});

const result = await runTransform({
  files: "src/**/*.tsx",
  adapter,
});

console.log(`Transformed ${result.transformed} files`);
```

### Options

```ts
interface RunTransformOptions {
  /** Glob pattern(s) for files to transform */
  files: string | string[];

  /**
   * Adapter for customizing the transform.
   * Controls value resolution (and resolver-provided imports) and custom handlers.
   */
  adapter: Adapter;

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
  adapter,
  dryRun: true,
  print: true, // prints transformed output to stdout
});
```

### Custom Adapter

Adapters are the main extension point. They let you control:

- how theme paths and CSS variables are turned into StyleX-compatible JS values (`resolveValue`)
- what extra imports to inject into transformed files (returned from `resolveValue`)
- how to handle dynamic interpolations inside template literals (`handlers`)

#### `Adapter` interface (what you can customize)

```ts
export interface Adapter {
  /**
   * Resolve theme paths and CSS variables to StyleX-compatible values.
   *
   * Called by built-in handlers for patterns like:
   *   ${(props) => props.theme.colors.primary}
   *
   * Also used for CSS `var(--...)` tokens inside static CSS values.
   *
   * Return an object containing:
   * - `expr`: JS expression string to inline into output
   * - `imports`: import statements required by `expr`
   * - `dropDefinition?`: (CSS variables only) drop local `--x: ...` definitions when true
   */
  resolveValue: (
    context:
      | { kind: "theme"; path: string }
      | {
          kind: "cssVariable";
          name: string;
          fallback?: string;
          definedValue?: string;
        }
  ) => { expr: string; imports: string[]; dropDefinition?: boolean } | null;

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

- `adapter.handlers` (your custom handlers, in array order)
- internal built-in handlers (always enabled), which cover common cases like:
  - theme access (`props.theme...`)
  - prop access (`props.foo`)
  - conditionals (`props.foo ? "a" : "b"`, `props.foo && "color: red;"`)

If no handler can resolve an interpolation:

- for `withConfig({ shouldForwardProp })` wrappers, the transform preserves the value as an inline style so output keeps visual parity
- otherwise, the declaration containing that interpolation is **dropped** and a warning is produced (manual follow-up required)

#### Create a custom adapter (theme path → tokens)

```ts
import {
  runTransform,
  defineAdapter,
} from "styled-components-to-stylex-codemod";

const adapter = defineAdapter({
  resolveValue(ctx) {
    if (ctx.kind === "theme") {
      // Example: theme.colors.primary -> tokens.colors_primary
      const varName = ctx.path.replace(/\./g, "_");
      return {
        expr: `tokens.${varName}`,
        imports: ["import { tokens } from './design-system.stylex';"],
      };
    }
    if (ctx.kind === "cssVariable") {
      // Example: var(--spacing-sm) -> vars.spacingSm
      if (ctx.name === "--spacing-sm") {
        return {
          expr: "vars.spacingSm",
          imports: ['import { vars } from "./tokens.stylex";'],
        };
      }
    }
    return null;
  },
});

await runTransform({
  files: "src/**/*.tsx",
  adapter,
});
```

#### Complete adapter example (handles every `ctx.kind`)

This example shows how to handle **both** `ctx.kind` variants (`"theme"` and `"cssVariable"`), including `fallback`, `definedValue`, and `dropDefinition`. It’s intentionally similar to the adapters used in `src/__tests__/fixture-adapters.ts`.

```ts
import { defineAdapter } from "styled-components-to-stylex-codemod";

export const adapter = defineAdapter({
  resolveValue(ctx) {
    if (ctx.kind === "theme") {
      // Called for patterns like: ${(props) => props.theme.colors.primary}
      // `ctx.path` is the dotted path after `theme.`
      const varName = ctx.path.replace(/\./g, "_");
      return {
        expr: `tokens.${varName}`,
        imports: ['import { tokens } from "./design-system.stylex";'],
      };
    }

    if (ctx.kind === "cssVariable") {
      // Called for CSS values containing `var(--...)`
      // Note: `fallback` is the raw fallback string inside `var(--x, <fallback>)` (if present).
      // Note: `definedValue` is populated when the transformer sees a local `--x: <value>` definition.
      const { name, fallback, definedValue } = ctx;

      // Example: lift `var(--base-size)` to StyleX vars, and optionally drop a matching local definition.
      if (name === "--base-size") {
        return {
          expr: "calcVars.baseSize",
          imports: ['import { calcVars } from "./css-calc.stylex";'],
          ...(definedValue === "16px" ? { dropDefinition: true } : {}),
        };
      }

      // Generic mapping: `--kebab-case` -> `vars.kebabCase`
      // e.g. `--color-primary` -> `vars.colorPrimary`
      const toCamelCase = (cssVarName: string) =>
        cssVarName
          .replace(/^--/, "")
          .split("-")
          .filter(Boolean)
          .map((part, i) =>
            i === 0 ? part : part[0]?.toUpperCase() + part.slice(1)
          )
          .join("");

      // If you care about fallbacks, you can use `fallback` here to decide whether to resolve or not.
      void fallback;
      return {
        expr: `vars.${toCamelCase(name)}`,
        imports: ['import { vars } from "./css-variables.stylex";'],
      };
    }

    return null;
  },
});
```

### Notes / Limitations

- **ThemeProvider**: if a file imports and uses `ThemeProvider` from `styled-components`, the transform **skips the entire file** (theming strategy is project-specific).
- **createGlobalStyle**: detected usage is reported as an **unsupported-feature** warning (StyleX does not support global styles in the same way).

### Transform Result

```ts
interface RunTransformResult {
  errors: number; // Files that had errors
  unchanged: number; // Files that were unchanged
  skipped: number; // Files that were skipped
  transformed: number; // Files that were transformed
  timeElapsed: number; // Total time in seconds
}
```

## License

MIT
