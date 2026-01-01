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

  /** Adapter for transforming theme values (default: CSS variables) */
  adapter?: Adapter;

  /** Plugins for resolving dynamic interpolations */
  plugins?: DynamicNodePlugin[];

  /** Hook for user customization (alternative to adapter/plugins) */
  hook?: UserHook;

  /** Dry run - don't write changes to files (default: false) */
  dryRun?: boolean;

  /** Print transformed output to stdout (default: false) */
  print?: boolean;

  /** Parser to use: "babel" | "babylon" | "flow" | "ts" | "tsx" (default: "tsx") */
  parser?: string;
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

### Custom Adapter

Adapters control how theme values are transformed. Three built-in adapters are provided:

```ts
import {
  runTransform,
  defaultAdapter,      // CSS custom properties: var(--colors-primary)
  defineVarsAdapter,   // StyleX vars: themeVars.colorsPrimary
  inlineValuesAdapter, // Inline literal values
} from "styled-components-to-stylex-codemod";

await runTransform({
  files: "src/**/*.tsx",
  adapter: defineVarsAdapter,
});
```

Create a custom adapter:

```ts
import { runTransform } from "styled-components-to-stylex-codemod";
import type { Adapter } from "styled-components-to-stylex-codemod";

const myAdapter: Adapter = {
  transformValue({ path, defaultValue }) {
    // Transform theme.colors.primary → tokens.colorsPrimary
    const varName = path.replace(/\./g, "_");
    return `tokens.${varName}`;
  },
  getImports() {
    return ["import { tokens } from './design-system.stylex';"];
  },
  getDeclarations() {
    return [];
  },
};

await runTransform({
  files: "src/**/*.tsx",
  adapter: myAdapter,
});
```

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
