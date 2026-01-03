# styled-components-to-stylex-codemod

Transform styled-components to StyleX automatically.

## Installation

```bash
npm install styled-components-to-stylex-codemod
# or
pnpm add styled-components-to-stylex-codemod
```

## Usage

Create a transform script with a custom adapter to control how your styled-components code is converted to StyleX:

```typescript
// run-transform.ts
import { runTransform, createAdapter } from "styled-components-to-stylex-codemod";

const adapter = createAdapter({
  transformValue({ path }) {
    // Convert theme paths to your StyleX variable naming convention
    // e.g., "colors.primary" → "themeVars.colors_primary"
    return `themeVars.${path.replace(/\./g, "_")}`;
  },
  getImports() {
    // Add imports needed by transformed code
    return ["import { themeVars } from './theme.stylex';"];
  },
  getDeclarations() {
    // Add any module-level declarations (rarely needed)
    return [];
  },
});

await runTransform({
  files: "src/**/*.tsx",
  adapter,
  dryRun: true, // Set to false to write changes
});
```

Run with:

```bash
npx tsx run-transform.ts
```

### Options

| Option    | Type                                              | Default   | Description                            |
| --------- | ------------------------------------------------- | --------- | -------------------------------------- |
| `files`   | `string \| string[]`                              | (required)| Glob pattern(s) for files to transform |
| `adapter` | `Adapter`                                         | (required)| Adapter for value transformations      |
| `dryRun`  | `boolean`                                         | `false`   | Don't write changes to files           |
| `print`   | `boolean`                                         | `false`   | Print transformed output to stdout     |
| `parser`  | `"babel" \| "babylon" \| "flow" \| "ts" \| "tsx"` | `"tsx"`   | jscodeshift parser to use              |

### Result

```typescript
interface RunTransformResult {
  errors: number;      // Files that had errors
  unchanged: number;   // Files that were unchanged
  skipped: number;     // Files that were skipped
  transformed: number; // Files that were transformed
  timeElapsed: number; // Total time in seconds
}
```

## Adapter System

The adapter controls how styled-components values are converted to StyleX. You should always provide an adapter configured for your project's theme system.

### Creating an Adapter

Use `createAdapter` to build an adapter with your project's conventions:

```typescript
import { runTransform, createAdapter } from "styled-components-to-stylex-codemod";

const adapter = createAdapter({
  transformValue({ path, defaultValue, valueType }) {
    // Convert theme paths to your StyleX variables
    // valueType is 'theme' | 'helper' | 'interpolation'
    return `tokens.${path.replace(/\./g, "_")}`;
  },

  getImports() {
    // Imports added to every transformed file
    return ["import { tokens } from '@my-org/design-tokens';"];
  },

  getDeclarations() {
    // Module-level declarations (rarely needed)
    return [];
  },

  // Optional: Handle CSS variables specially
  resolveCssVariable(name, fallback) {
    // Convert var(--color-primary) to your theme system
    const camelName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return {
      code: `tokens.${camelName}`,
      imports: ["import { tokens } from '@my-org/design-tokens';"],
    };
  },

  // Optional: Handle theme path access
  resolveThemePath(pathParts) {
    // Convert props.theme.colors.primary to your theme system
    const varName = pathParts.join("_");
    return {
      code: `tokens.${varName}`,
      imports: ["import { tokens } from '@my-org/design-tokens';"],
    };
  },
});

await runTransform({
  files: "src/**/*.tsx",
  adapter,
  dryRun: true,
});
```

### Adapter Interface

```typescript
interface Adapter {
  /**
   * Transform a simple value reference to StyleX-compatible code.
   * Called for theme accessors and simple interpolations.
   */
  transformValue(context: AdapterContext): string;

  /**
   * Handle a dynamic interpolation node.
   * Called for each ${...} expression in template literals.
   * Return undefined to delegate to the handlers array or use default handling.
   */
  handleDynamicNode?(context: DynamicNodeContext): DynamicNodeDecision | undefined;

  /**
   * Additional handlers to try after handleDynamicNode.
   * Handlers are called in order; first non-undefined response wins.
   */
  handlers?: DynamicNodeHandler[];

  /**
   * What to do when no handler claims the node.
   * - 'bail': Skip with warning (default)
   * - 'inline-comment': Insert TODO comment in output
   * - 'throw': Fail the transform
   */
  fallbackBehavior?: FallbackBehavior;

  /**
   * Generate imports to add to the file.
   */
  getImports(): string[];

  /**
   * Generate module-level declarations.
   */
  getDeclarations(): string[];

  /**
   * Resolve a CSS variable reference to StyleX-compatible code.
   * Called when encountering var(--name) or var(--name, fallback) in CSS values.
   * Return undefined to keep the original var() syntax.
   */
  resolveCssVariable?(name: string, fallback?: string): CssVariableResolution | undefined;

  /**
   * Resolve a theme path to StyleX-compatible code.
   * Called for props.theme.x.y access patterns.
   * Return undefined to use default handling.
   */
  resolveThemePath?(pathParts: string[]): CssVariableResolution | undefined;
}
```

### Dynamic Node Handlers

For advanced use cases, add custom handlers for specific interpolation patterns:

```typescript
import {
  runTransform,
  createAdapter,
  defaultHandlers,
  type DynamicNodeHandler,
} from "styled-components-to-stylex-codemod";

// Custom handler for a specific pattern
const myCustomHandler: DynamicNodeHandler = (context) => {
  // Only handle specific patterns
  if (context.helperName === "myThemeHelper") {
    return {
      action: "convert",
      value: `myThemeVars.${context.propPath?.join("_")}`,
      imports: ["import { myThemeVars } from './my-theme';"],
    };
  }
  // Return undefined to let other handlers try
  return undefined;
};

const adapter = createAdapter({
  transformValue({ path }) {
    return `'var(--${path.replace(/\./g, "-")})'`;
  },
  getImports: () => [],
  getDeclarations: () => [],
  // Add your custom handler before the defaults
  handlers: [myCustomHandler, ...defaultHandlers],
});
```

### Handler Decision Types

Handlers can return different decision types:

```typescript
type DynamicNodeDecision =
  | { action: "convert"; value: string | number; imports?: string[] }
  | { action: "rewrite"; code: string; imports?: string[] }
  | { action: "bail"; reason: string }
  | { action: "variant"; baseValue: string | number; variants: VariantStyle[]; propName: string }
  | { action: "dynamic-fn"; paramName: string; paramType?: string; valueExpression: string };
```

| Action       | Description                                              |
| ------------ | -------------------------------------------------------- |
| `convert`    | Convert to a static StyleX value                         |
| `rewrite`    | Rewrite the expression to different code                 |
| `bail`       | Skip transformation with a warning                       |
| `variant`    | Generate StyleX variant styles for conditional values    |
| `dynamic-fn` | Generate a dynamic style function                        |

### Built-in Handlers

The codemod includes built-in handlers for common patterns:

| Handler                    | Pattern                                        |
| -------------------------- | ---------------------------------------------- |
| `staticValueHandler`       | `${variable}`, `${object.property}`            |
| `keyframesHandler`         | `animation: ${rotate} 2s linear`               |
| `conditionalHandler`       | `${props => props.$primary ? 'a' : 'b'}`       |
| `logicalHandler`           | `${props => props.$active && 'transform: ...'}`|
| `themeAccessHandler`       | `${props => props.theme.colors.primary}`       |
| `propAccessHandler`        | `${props => props.$padding}`                   |
| `helperHandler`            | `${helperFn()}`, `` ${css`...`} ``             |
| `componentSelectorHandler` | `${OtherComponent}:hover &`                    |

## Supported Patterns

| Pattern                     | Status | Notes                                      |
| --------------------------- | ------ | ------------------------------------------ |
| `styled.element`            | ✅     | All HTML elements                          |
| `styled(Component)`         | ✅     | Component extension                        |
| Template literal CSS        | ✅     | Full CSS support                           |
| Object syntax               | ✅     | `styled.div({ ... })`                      |
| Prop interpolations         | ✅     | Converted to variants                      |
| Pseudo-selectors            | ✅     | `:hover`, `:focus`, `:active`, etc.        |
| Pseudo-elements             | ✅     | `::before`, `::after`                      |
| Media queries               | ✅     | `@media (min-width: ...)`                  |
| Keyframes                   | ✅     | `keyframes` → `stylex.keyframes()`         |
| `.attrs()`                  | ✅     | Converted to inline props                  |
| Transient props (`$prop`)   | ✅     | Proper prop filtering                      |
| `as` prop                   | ✅     | Polymorphic components                     |
| `shouldForwardProp`         | ✅     | Via `.withConfig()`                        |
| CSS variables               | ✅     | `var(--name)` preserved or transformed     |
| `css` helper                | ✅     | Shared style objects                       |
| Nesting                     | ✅     | Child selectors, combinators               |
| Theme access                | ✅     | Via adapter system                         |
| `createGlobalStyle`         | ⚠️     | Warning emitted, manual migration needed   |
| Component selectors         | ⚠️     | `${Component}` in selectors needs refactor |

## Requirements

- Node.js >= 22.20
- TypeScript/JavaScript source files

## License

MIT
