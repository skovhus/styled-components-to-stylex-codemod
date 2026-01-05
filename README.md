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

const result = await runTransform({
  files: "src/**/*.tsx",
  adapter,
  dryRun: false,
  parser: "tsx", // "babel" | "babylon" | "flow" | "ts" | "tsx"
});

console.log(result);
```

### Adapter

Adapters are the main extension point. They let you control:

- how theme paths and CSS variables are turned into StyleX-compatible JS values (`resolveValue`)
- what extra imports to inject into transformed files (returned from `resolveValue`)
- how to handle dynamic interpolations inside template literals (`handlers`)

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
