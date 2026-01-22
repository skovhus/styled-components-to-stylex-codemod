# CLAUDE.md

This file provides guidance to AI coding agents when working with code in this repository.

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
- always run "pnpn run ci" to validate changes
- when fixing bugs or addressing review comments, add a test case or unit test to document the regression and prevent future breakage

## Code guidelines

- Prefer iteration & modularization over code duplication.
- **keep all exports at the top of each file** (after imports), and keep **non-exported helpers further down**
- TypeScript: Never use "any".
- Prefer type definitions; avoid type assertions (as, !).
- Use descriptive names for variables & functions

## Scripts

Run repo scripts directly with `node`, see `scripts` folder

- `scripts/debug-test.mts` - Generates `.actual.tsx` files for failing test cases to compare against expected `.output.tsx` files. Run with `node scripts/debug-test.mts`.
- `scripts/regenerate-test-case-outputs.mts` - Updates test case output files.
  - All supported test cases: `node scripts/regenerate-test-case-outputs.mts`
  - Single test case: `node scripts/regenerate-test-case-outputs.mts --only attrs`

## Adding Test Cases

Create matching `.input.tsx` and `.output.tsx` files in `test-cases/`. Tests auto-discover all pairs and fail if any file is missing its counterpart.

Unsupported test cases can be named `_unsupported.<case>.input.tsx` and should NOT have an output file.

## Storybook Visual Testing

Storybook renders all test cases side-by-side (input with styled-components, output with StyleX) to visually verify the transformation produces identical styles.

- **Auto-discovery**: Test cases are automatically discovered from `test-cases/*.input.tsx` and `*.output.tsx` files
- **"All" story**: Shows all test cases on a single page at `http://localhost:6006/?path=/story/test-cases--all`
- **Individual stories**: Each test case has its own story URL, e.g., `http://localhost:6006/?path=/story/test-cases--enum-if-chain`

Run `pnpm storybook` to start the dev server and visually compare transformations.

Use the Playwright MCP to inspect test case rendering.
