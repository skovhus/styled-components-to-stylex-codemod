# styled-components-to-stylex-codemod

Transform styled-components to StyleX.

**[Try it in the online playground](https://skovhus.github.io/styled-components-to-stylex-codemod/)** — experiment with the transform in your browser.

> [!WARNING]
>
> **Very much under construction (alpha):** this codemod is still early in development — expect rough edges! 🚧

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
      // Called for patterns like: ${(props) => props.theme.color.primary}
      // `ctx.path` is the dotted path after `theme.`
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
      // Called for CSS values containing `var(--...)`
      // Note: `fallback` is the raw fallback string inside `var(--x, <fallback>)` (if present).
      // Note: `definedValue` is populated when the transformer sees a local `--x: <value>` definition.
      const { name, fallback, definedValue } = ctx;

      // Example: lift `var(--base-size)` to StyleX vars, and optionally drop a matching local definition.
      if (name === "--base-size") {
        return {
          expr: "calcVars.baseSize",
          imports: [
            {
              from: { kind: "specifier", value: "./css-calc.stylex" },
              names: [{ imported: "calcVars" }],
            },
          ],
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
        imports: [
          {
            from: { kind: "specifier", value: "./css-variables.stylex" },
            names: [{ imported: "vars" }],
          },
        ],
      };
    }

    if (ctx.kind === "call") {
      // Called for template interpolations like: ${transitionSpeed("slowTransition")}
      // `calleeImportedName` is the imported symbol name (works even with aliasing).
      // `calleeSource` tells you where it came from:
      // - { kind: "absolutePath", value: "/abs/path" } for relative imports
      // - { kind: "specifier", value: "some-package/foo" } for package imports

      if (ctx.calleeImportedName !== "transitionSpeed") {
        return null;
      }

      // If you need to scope resolution to a particular module, you can use:
      // - ctx.calleeSource

      const arg0 = ctx.args[0];
      const key =
        arg0?.kind === "literal" && typeof arg0.value === "string"
          ? arg0.value
          : null;
      if (!key) {
        return null;
      }

      return {
        expr: `transitionSpeedVars.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./lib/helpers.stylex" },
            names: [
              { imported: "transitionSpeed", local: "transitionSpeedVars" },
            ],
          },
        ],
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
  formatterCommand: "pnpm prettier --write", // optional: format transformed files
});

console.log(result);
```

### Adapter

Adapters are the main extension point. They let you control:

- how theme paths and CSS variables are turned into StyleX-compatible JS values (`resolveValue`)
- what extra imports to inject into transformed files (returned from `resolveValue`)
- how helper calls are resolved (via `resolveValue({ kind: "call", ... })`)
- which exported components should support external className/style extension (`shouldSupportExternalStyling`)
- how className/style merging is handled for components accepting external styling (`styleMerger`)

#### Style Merger

When a component accepts external `className` and/or `style` props (e.g., via `shouldSupportExternalStyling`, or when wrapping a base component that already accepts these props), the generated code needs to merge StyleX styles with externally passed values.

> **Note:** Allowing external className/style props is generally discouraged in StyleX as it bypasses the type-safe styling system. However, it can be useful during migration to maintain compatibility with existing code that passes these props.

By default, this generates verbose inline merging code. You can provide a `styleMerger` to use a helper function instead for cleaner output:

```ts
const adapter = defineAdapter({
  resolveValue(ctx) {
    // ... value resolution logic
    return null;
  },

  shouldSupportExternalStyling(ctx) {
    return ctx.filePath.includes("/shared/components/");
  },

  // Use a custom merger function for cleaner output
  styleMerger: {
    functionName: "mergedSx",
    importSource: { kind: "specifier", value: "./lib/mergedSx" },
  },
});
```

The merger function should have this signature:

```ts
function mergedSx(
  styles: StyleXStyles,
  className?: string,
  style?: React.CSSProperties
): ReturnType<typeof stylex.props>;
```

See [`test-cases/lib/mergedSx.ts`](./test-cases/lib/mergedSx.ts) for a reference implementation.

#### External Styles Support

Transformed components are "closed" by default — they don't accept external `className` or `style` props. Use `shouldSupportExternalStyling` to control which exported components should support external styling:

```ts
const adapter = defineAdapter({
  resolveValue(ctx) {
    // ... value resolution logic
    return null;
  },

  shouldSupportExternalStyling(ctx) {
    // ctx: { filePath, componentName, exportName, isDefaultExport }

    // Example: Enable for all exports in shared components folder
    if (ctx.filePath.includes("/shared/components/")) {
      return true;
    }

    // Example: Enable for specific component names
    if (ctx.componentName === "Button" || ctx.componentName === "Card") {
      return true;
    }

    return false;
  },
});
```

When `shouldSupportExternalStyling` returns `true`, the generated component will:

- Accept `className` and `style` props
- Merge them with the StyleX-generated styles
- Forward remaining props via `...rest`

#### Dynamic interpolations

When the codemod encounters an interpolation inside a styled template literal, it runs an internal dynamic resolution pipeline which covers common cases like:

- theme access (`props.theme...`) via `resolveValue({ kind: "theme", path })`
- prop access (`props.foo`) and conditionals (`props.foo ? "a" : "b"`, `props.foo && "color: red;"`)
- simple helper calls (`transitionSpeed("slowTransition")`) via `resolveValue({ kind: "call", calleeImportedName, calleeSource, args, ... })`
- helper calls applied to prop values (e.g. `shadow(props.shadow)`) by emitting a StyleX style function that calls the helper at runtime
- conditional CSS blocks via ternary (e.g. `props.$dim ? "opacity: 0.5;" : ""`)

If the pipeline can’t resolve an interpolation:

- for some dynamic value cases, the transform preserves the value as a wrapper inline style so output keeps visual parity (at the cost of using `style={...}` for that prop)
- otherwise, the declaration containing that interpolation is **dropped** and a warning is produced (manual follow-up required)

### Limitations

- **Flow** type generation is non-existing, works best with TypeScript or plain JS right now. Contributions more than welcome!
- **ThemeProvider**: if a file imports and uses `ThemeProvider` from `styled-components`, the transform **skips the entire file** (theming strategy is project-specific).
- **createGlobalStyle**: detected usage is reported as an **unsupported-feature** warning (StyleX does not support global styles in the same way).

## License

MIT
