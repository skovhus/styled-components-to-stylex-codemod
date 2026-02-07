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
import { runTransform, defineAdapter } from "styled-components-to-stylex-codemod";

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
          .map((part, i) => (i === 0 ? part : part[0]?.toUpperCase() + part.slice(1)))
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

    return null;
  },

  resolveCall(ctx) {
    // Called for template interpolations like: ${transitionSpeed("slowTransition")}
    // `calleeImportedName` is the imported symbol name (works even with aliasing).
    // `calleeSource` tells you where it came from:
    // - { kind: "absolutePath", value: "/abs/path" } for relative imports
    // - { kind: "specifier", value: "some-package/foo" } for package imports
    //
    // The codemod determines how to use the result based on context:
    // - If `ctx.cssProperty` exists (e.g., `border: ${helper()}`) → result is used as a CSS value
    // - If `ctx.cssProperty` is undefined (e.g., `${helper()}`) → result is used as a StyleX style object
    //
    // Use `ctx.cssProperty` to return the appropriate expression for the context.
    // Optionally return `style` with a raw StyleX style object when helper styles
    // need to be inlined (e.g., nested selectors/pseudos). The style object should
    // be plain JSON-compatible values (strings/numbers/booleans/null) and nested
    // pseudo/media maps. Invalid style objects will cause the transform to bail.

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

  externalInterface() {
    return null;
  },

  styleMerger: null,
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

- how theme paths, CSS variables, and imported values are turned into StyleX-compatible JS values (`resolveValue`)
- what extra imports to inject into transformed files (returned from `resolveValue`)
- how helper calls are resolved (via `resolveCall({ ... })` returning `{ expr, imports }`; `null`/`undefined` bails the file)
- optionally inline helper styles with `resolveCall({ ... })` returning `style` for nested selectors
- which exported components should support external className/style extension and/or polymorphic `as` prop (`externalInterface`)
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

  resolveCall() {
    return null;
  },

  externalInterface(ctx) {
    if (ctx.filePath.includes("/shared/components/")) {
      return { styles: true };
    }
    return null;
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
  style?: React.CSSProperties,
): ReturnType<typeof stylex.props>;
```

See [`test-cases/lib/mergedSx.ts`](./test-cases/lib/mergedSx.ts) for a reference implementation.

#### External Interface (Styles and Polymorphic `as` Support)

Transformed components are "closed" by default — they don't accept external `className` or `style` props, and exported components only get `as` support when it is used inside the file. Use `externalInterface` to control which exported components should support these features:

```ts
const adapter = defineAdapter({
  resolveValue(ctx) {
    // ... value resolution logic
    return null;
  },

  resolveCall() {
    return null;
  },

  externalInterface(ctx) {
    // ctx: { filePath, componentName, exportName, isDefaultExport }

    // Example: Enable styles (and `as`) for all exports in shared components folder
    if (ctx.filePath.includes("/shared/components/")) {
      return { styles: true };
    }

    // Example: Enable only `as` prop (no style merging)
    if (ctx.componentName === "Typography") {
      return { styles: false, as: true };
    }

    // Disable both (default)
    return null;
  },

  styleMerger: null,
});
```

The `externalInterface` method returns:

- `null` — no external interface (neither className/style nor `as` prop)
- `{ styles: true }` — accept className/style props AND polymorphic `as` prop
- `{ styles: false, as: true }` — accept only polymorphic `as` prop (no style merging)
- `{ styles: false, as: false }` — equivalent to `null`

When `styles: true`, the generated component will:

- Accept `className` and `style` props
- Merge them with the StyleX-generated styles
- Forward remaining props via `...rest`
- Accept polymorphic `as` prop (required for style merging to work correctly)

When `{ styles: false, as: true }`, the generated component will accept a polymorphic `as` prop but won't include className/style merging.

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

If the pipeline can’t resolve an interpolation:

- for some dynamic value cases, the transform preserves the value as a wrapper inline style so output keeps visual parity (at the cost of using `style={...}` for that prop)
- otherwise, the declaration containing that interpolation is **dropped** and a warning is produced (manual follow-up required)

### Limitations

- **Flow** type generation is non-existing, works best with TypeScript or plain JS right now. Contributions more than welcome!
- **ThemeProvider**: if a file imports and uses `ThemeProvider` from `styled-components`, the transform **skips the entire file** (theming strategy is project-specific).
- **createGlobalStyle**: detected usage is reported as an **unsupported-feature** warning (StyleX does not support global styles in the same way).

## License

MIT
