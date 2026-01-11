# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Codemod to transform styled-components to StyleX using jscodeshift.

## Tech Stack

- **Runtime**: Node.js >=22.20
- **Package Manager**: pnpm >=10.22.0
- **Language**: TypeScript (ESM)
- **Build**: tsdown
- **Test**: vitest
- **Lint**: oxlint
- **Visual Testing**: Storybook 10
- **Codemod Framework**: jscodeshift

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build with tsdown
pnpm test             # Run tests (watch mode)
pnpm test:run         # Run tests once (no rebuild needed - uses source directly)
pnpm typecheck        # Type check with tsc
pnpm lint             # Lint with oxlint
pnpm run ci           # Run lint + typecheck + test
pnpm storybook        # Start Storybook dev server (port 6006)
```

**Note**: Tests run against source files directly (via vitest), so `pnpm test:run` does NOT require rebuilding. Only `node scripts/debug-test.mjs` requires a prior build.

## Project Structure

```
src/
├── index.ts              # Main exports
├── transform.ts          # Transform implementation
├── __tests__/transform.test.ts     # Test runner (auto-discovers test cases)
├── run.ts                # Programmatic runner (runTransform)
└── adapter.ts            # Adapter API (value resolution + dynamic handlers)

test-cases/
├── *.input.tsx           # Input files (styled-components)
├── *.output.tsx          # Expected output files (StyleX)
├── *.stylex.ts           # StyleX theme variables (defineVars)
├── *.warnings.json       # Expected warnings for test cases
├── lib/                  # Helper files for test cases
│   ├── helpers.ts        # styled-components helpers (color, truncate)
│   ├── helpers.stylex.ts # StyleX version of helpers
│   └── colors.stylex.ts  # StyleX color variables
└── TestCases.stories.tsx # Auto-discovering Storybook stories

.storybook/
├── main.ts               # Storybook config (Vite, React, StyleX)
└── preview.ts            # Storybook preview config
```

## Scripts

- `scripts/debug-test.mjs` - Generates `.actual.tsx` files for failing test cases to compare against expected `.output.tsx` files. Run with `node scripts/debug-test.mjs` after `pnpm build`.
- `scripts/update-fixtures.mjs` - Updates fixture files.

## Adding Test Cases

Create matching `.input.tsx` and `.output.tsx` files in `test-cases/`. Tests auto-discover all pairs and fail if any file is missing its counterpart.

Unsupported fixtures can be named `_unsupported.<case>.input.tsx` and should NOT have an output file.

**Test categories:**

- **File pairing**: Verifies all test cases have matching input/output files
- **Output linting**: Runs oxlint on all output files to ensure valid code
- **Transform tests**: Verifies transform produces expected output fixtures for supported cases

## Storybook Visual Testing

Storybook renders all test cases side-by-side (input with styled-components, output with StyleX) to visually verify the transformation produces identical styles.

- **Auto-discovery**: Test cases are automatically discovered from `test-cases/*.input.tsx` and `*.output.tsx` files
- **Side-by-side view**: Each test case shows "Input (styled-components)" and "Output (StyleX)" panels
- **"All" story**: Shows all test cases on a single page at `http://localhost:6006/?path=/story/test-cases--all`

Run `pnpm storybook` to start the dev server and visually compare transformations.

## Visual Inspection with Playwright MCP

Use the Playwright MCP to inspect test case rendering:

1. Start Storybook: `pnpm storybook`
2. Navigate to `http://localhost:6006/?path=/story/test-cases--all`
3. Use Playwright MCP to take screenshots and verify input/output match visually

The "All" story shows every test case side-by-side, making it easy to compare styled-components input with StyleX output.

## StyleX Requirements

Output files must use valid StyleX syntax:

- **No CSS shorthands**: Use `backgroundColor` not `background`, `borderWidth`/`borderStyle`/`borderColor` not `border`
- **defineVars must be exported**: Theme variables must be in separate `.stylex.ts` files with named exports
- **createTheme needs base vars**: `stylex.createTheme(baseVars, overrides)` requires two arguments

## Test Cases (from styled-components docs)

| Test Case                       | Pattern                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `basic`                         | `styled.h1`, `styled.section`                                        |
| `adapting-props`                | Props interpolation with `${props => ...}`                           |
| `extending-styles`              | `styled(Component)` inheritance                                      |
| `pseudo-selectors`              | `&:hover`, `&:focus`, `&::before`                                    |
| `keyframes`                     | `keyframes` + animation                                              |
| `attrs`                         | `.attrs()` for default props                                         |
| `theming`                       | `ThemeProvider` + `props.theme`                                      |
| `css-helper`                    | `css` helper for shared styles                                       |
| `as-prop`                       | Polymorphic `as` prop                                                |
| `global-styles`                 | `createGlobalStyle`                                                  |
| `media-queries`                 | `@media (min-width: ...)` responsive styles                          |
| `nesting`                       | Child selectors `> *`, `&:not(:first-child)`                         |
| `component-selector`            | `${Link}:hover &` referencing other components                       |
| `style-objects`                 | Object syntax `styled.div({...})`                                    |
| `conditional-styles`            | Short-circuit `${props => props.x && '...'}`                         |
| `styled-component`              | `styled(CustomComponent)` with className                             |
| `transient-props`               | `$prefix` props to prevent DOM forwarding                            |
| `refs`                          | Ref forwarding to styled components                                  |
| `use-theme`                     | `useTheme` hook for accessing theme                                  |
| `with-theme`                    | `withTheme` HOC for class components                                 |
| `sibling-selectors`             | Adjacent `& + &` and general `& ~ &` sibling selectors               |
| `specificity`                   | Double ampersand `&&` and `&&&` for specificity boost                |
| `descendant-component-selector` | `${Child} { ... }` parent styling child component                    |
| `forwarded-as`                  | `forwardedAs` prop for passing `as` through HOCs                     |
| `function-theme`                | `theme={fn}` function that receives parent theme                     |
| `adhoc-theme`                   | Per-instance `theme` prop override                                   |
| `attribute-selectors`           | `&[disabled]`, `&[type="text"]`, `&[href^="https"]`                  |
| `css-variables`                 | `var(--custom-property)` CSS custom properties                       |
| `css-calc`                      | `calc()` expressions in styles                                       |
| `multiple-animations`           | Combining multiple keyframes animations                              |
| `important`                     | `!important` declarations (removed in output)                        |
| `universal-selector`            | `& *` universal descendant selector                                  |
| `complex-selectors`             | Multiple/compound selectors `&:hover, &:focus`                       |
| `string-interpolation`          | Static string interpolations `${variable}`                           |
| `should-forward-prop`           | `.withConfig({ shouldForwardProp })` prop filtering                  |
| `with-config`                   | `.withConfig({ displayName, componentId })`                          |
| `helpers`                       | Helper functions: `color()` theme accessor, `truncate()` CSS snippet |

## Transformation Goals

The codemod should handle conversions like:

- `styled.div` / `styled(Component)` → `stylex.create()` + `stylex.props()`
- Template literal CSS → StyleX object syntax
- Dynamic props/interpolations → StyleX variants or dynamic styles
- `keyframes` → `stylex.keyframes()`
- Theme values → CSS variables or `stylex.createTheme()`
- `css` helper → Plain style objects
- `.attrs()` → Inline props on element
