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

### Custom Hook

Hooks control how theme values are resolved and how dynamic interpolations are handled.
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

Create a custom hook:

```ts
import { runTransform } from "styled-components-to-stylex-codemod";
import { defineHook } from "styled-components-to-stylex-codemod";

const myHook = defineHook({
  resolveValue({ path, defaultValue }) {
    // Transform theme.colors.primary → tokens.colorsPrimary
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
