# CLAUDE.md

This file provides guidance to AI coding agents when working with code in this repository.

## Self-Improvement

If you discover undocumented requirements, commands, or workflows during your work (e.g., a reviewer asks you to run something not covered here), update this file on the same PR. Keep this guide accurate and helpful for future agents.

## Project Overview

Codemod to transform styled-components to StyleX using jscodeshift.

## Commands

```bash
pnpm install
pnpm test:run    # Run tests once
pnpm check       # Run lint + tsc + test
```

## Rules

- src folder code should never depend on test-cases or test-case logic
- transformations should be safe and lossless, bail if we cannot preserve the semantics of the input
- always run "pnpm run ci" to validate changes
- when fixing bugs or addressing review comments, add a test case or unit test to document the regression and prevent future breakage
- before making any changes, explore the codebase to find ALL files that contain the pattern I'm about to describe. List every file, show the relevant code, and confirm you understand the full scope. Then propose a complete change plan covering every file.

## Code guidelines

- Prefer iteration & modularization over code duplication.
- **Unify and abstract**: Use existing primitives/helpers whenever possible. Extend or generalize shared utilities instead of adding parallel logic so the codebase uses the same primitives consistently.
- **Centralize common logic**: When adding new functionality, look for existing helper functions that can be extended rather than duplicating patterns. Key utilities like `literalToStaticValue` in `builtin-handlers.ts` handle AST node extraction and should be enhanced to support new node types rather than adding ad-hoc checks elsewhere.
- **keep all exports at the top of each file** (after imports), and keep **non-exported helpers further down**
- TypeScript: Avoid `any`; use proper types. (Some jscodeshift AST patterns are hard to type precisely—minimal, justified assertions are acceptable there.)
- Prefer type definitions; avoid type assertions (as, !) where feasible.
- Use descriptive names for variables & functions

## StyleX Constraints

StyleX does NOT support CSS shorthand properties. When transforming CSS to StyleX:

- `border` must expand to `borderWidth`, `borderStyle`, `borderColor`
- `margin`/`padding` must expand to directional properties (`marginTop`, etc.)
- `background` must map to `backgroundColor` or `backgroundImage`

**Key files for shorthand handling:**

- `src/internal/css-prop-mapping.ts` - `cssDeclarationToStylexDeclarations()` is the authoritative source for shorthand expansion
- `src/internal/lower-rules/borders.ts` - Handles interpolated border values
- Use `parseInterpolatedBorderStaticParts()` when parsing border values with dynamic expressions

When adding new CSS-to-StyleX transformations, always use these existing helpers rather than directly mapping CSS property names.

## Scripts

Run repo scripts directly with `node`, see `scripts` folder

- `scripts/debug-test.mts` - Generates `.actual.tsx` files for failing test cases to compare against expected `.output.tsx` files. Run with `node scripts/debug-test.mts`.
- `scripts/regenerate-test-case-outputs.mts` - Updates test case output files.
  - All supported test cases: `node scripts/regenerate-test-case-outputs.mts`
  - Single test case: `node scripts/regenerate-test-case-outputs.mts --only attrs`
- `scripts/verify-storybook-rendering.mts` - Verifies that input (styled-components) and output (StyleX) render with matching dimensions and content in Storybook. Self-contained: builds Storybook, starts a static file server, and auto-installs Playwright Chromium if needed. Uses pixelmatch for pixel-level image comparison.
- All test cases: `node scripts/verify-storybook-rendering.mts`
- Specific test case: `node scripts/verify-storybook-rendering.mts theme-conditionalInlineStyle`
- Only changed vs main: `node scripts/verify-storybook-rendering.mts --only-changed`
- Save diff images: `node scripts/verify-storybook-rendering.mts --save-diffs`

## Adding Test Cases

Create matching `.input.tsx` and `.output.tsx` files in `test-cases/`. Tests auto-discover all pairs and fail if any file is missing its counterpart.

Test cases that the codemod cannot transform use two prefixes to distinguish the reason:

- **`_unsupported.<case>.input.tsx`** — StyleX **architecturally cannot express** this CSS pattern (e.g., descendant/child combinators, `createGlobalStyle`, specificity hacks), or a static codemod **fundamentally cannot resolve** it at build time. These will likely never be supported.
- **`_unimplemented.<case>.input.tsx`** — StyleX **has the APIs** to express this, but the codemod **hasn't built the transform yet** (e.g., sibling selectors via `stylex.when.siblingBefore()`, cross-file component selectors via `stylex.defineMarker()`). These are planned future work.

Both prefixes should **NOT** have an output file. Both are excluded from supported test runs, Storybook, and the playground.

### Promoting Bail-Out Test Cases

When promoting an `_unsupported` or `_unimplemented` test case to a supported one (adding codemod support for a previously unsupported pattern):

- **Preserve the original input code**: Keep the original styled-component definition and CSS as-is. The codemod must handle the original input. You may extend the test case (e.g., add more CSS properties or variations), but do not modify or remove the original code.
- Remove `@expected-warning` comments and update descriptive comments as needed (these are not semantic changes).
- It is OK to minimally improve the `App` component for visibility (e.g., adding text content to an empty `<Box />`), since that doesn't change the styled-component transformation being tested.
- Create the matching `.output.tsx` using `node scripts/regenerate-test-case-outputs.mts --only <case>`.

### Test Case Naming Convention

Test cases follow a `category-variation` naming scheme:

- **Category**: The feature area being tested (e.g., `attrs`, `conditional`, `wrapper`, `theme`)
- **Variation**: A lowerCamelCase suffix describing the specific scenario (e.g., `polymorphicAs`, `complexTernary`)
- **Separator**: A single `-` between category and variation
- If a category has only one test case, no variation suffix is needed (e.g., `ref`, `styleObject`, `withConfig`)
- Use **neutral, descriptive** names — avoid bug-sounding words like "Lost", "NotResolved", "Missing", "Broken"

Examples: `attrs-polymorphicAs`, `conditional-enumIfChain`, `wrapper-basic`, `theme-destructure`

For bail-out files, keep the appropriate prefix (`_unsupported.` or `_unimplemented.`) and apply the same `category-variation` scheme after it: `_unsupported.selector-complex`, `_unimplemented.selector-sibling`

**Categories**: `basic`, `extending`, `attrs`, `asProp`, `conditional`, `interpolation`, `mixin`, `cssHelper`, `selector`, `theme`, `useTheme`, `wrapper`, `externalStyles`, `helper`, `cssVariable`, `mediaQuery`, `transientProp`, `shouldForwardProp`, `withConfig`, `keyframes`, `variant`, `css`, `htmlProp`, `typeHandling`, `import`, `staticProp`, `ref`, `styleObject`, `naming`, `example`

### Test Case Visual Guidelines

Every test case `App` component must render **visibly** in Storybook so input and output can be compared side-by-side:

- Use **visible CSS properties**: `background-color`, `color`, `border`, `padding` — not SVG-only props like `fill` on `div` elements
- Give components **meaningful size**: at least 40-80px so they're easy to spot in the debug frame
- Add **text labels** inside components to identify each variation (e.g. "On", "Off", "Default")
- Show **all prop variations** in `App`: enabled, disabled, default/no-prop, different enum values
- Use `gap` and `padding` on the container so items aren't cramped
- Verify in Storybook (`pnpm storybook`) that both input and output render identically

## Storybook Visual Testing

Storybook renders all test cases side-by-side (input with styled-components, output with StyleX) to visually verify the transformation produces identical styles.

- **Auto-discovery**: Test cases are automatically discovered from `test-cases/*.input.tsx` and `*.output.tsx` files
- **"All" story**: Shows all test cases on a single page at `http://localhost:6006/?path=/story/test-cases--all`
- **Individual stories**: Each test case has its own story URL, e.g., `http://localhost:6006/?path=/story/test-cases--enum-if-chain`

Run `pnpm storybook` to start the dev server and visually compare transformations.

To verify rendering programmatically, run `node scripts/verify-storybook-rendering.mts`. The script is self-contained: it builds Storybook, starts a static file server, and auto-installs Playwright Chromium. Use `--only-changed` to check only test cases changed on the current branch, or `--save-diffs` to save diff images for mismatches.

## Skills

Skills are located in `.claude/skills/`.

## Plans

- Store implementation plans in `plans/` as markdown files
- Name format: `YYYY-MM-DD-feature-name.md`

## Post-Implementation Workflow

After implementing any feature or fix, agents MUST:

1. **Validate changes**: Run `pnpm check` to ensure all linting, type checking, and tests pass
2. **Run code quality refactoring**: Use the [refactor-code-quality](.claude/skills/refactor-code-quality/SKILL.md) skill to:
   - Remove code duplication and extract shared patterns
   - Minimize `any` types (some jscodeshift patterns may require them)
   - Minimize type assertions (`as Type`) and non-null assertions (`!`)
3. **Validate again**: Run `pnpm check` after refactoring
4. **Commit and push**: Make atomic commits with descriptive messages
