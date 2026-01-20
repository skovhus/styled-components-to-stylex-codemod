# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Codemod to transform styled-components to StyleX using jscodeshift.

## Commands

```bash
pnpm install          # Install dependencies
pnpm test             # Run tests (watch mode)
pnpm test:run         # Run tests once (no rebuild needed - uses source directly)
pnpm typecheck        # Type check
pnpm lint:fix         # Lint with auto fixes applied
pnpm run ci           # Run lint + typecheck + test + build
pnpm storybook        # Start Storybook dev server (port 6006)
```

**Note**: Tests run against source files directly (via vitest), so `pnpm test:run` does NOT require rebuilding. Only `node scripts/debug-test.mjs` requires a prior build.

## Rules

- **keep all exports at the top of each file** (after imports), and keep **non-exported helpers further down**
- src folder code should never depend on test-cases or test-case logic
- transformations should be safe, bail if we cannot preserve the semantics of the input
- always run "pnpn run ci" to validate changes
- transform should bail out if it cannot safely transform the input

## Scripts

Run repo scripts directly with `node`.

- `scripts/debug-test.mjs` - Generates `.actual.tsx` files for failing test cases to compare against expected `.output.tsx` files. Run with `node scripts/debug-test.mjs` after `pnpm build`.
- `scripts/regenerate-test-case-outputs.mts` - Updates test case output files.
  - All supported test cases: `node scripts/regenerate-test-case-outputs.mts`
  - Single test case: `node scripts/regenerate-test-case-outputs.mts --only attrs`
  - Multiple test cases: `node scripts/regenerate-test-case-outputs.mts --only attrs,css-helper`

## Adding Test Cases

Create matching `.input.tsx` and `.output.tsx` files in `test-cases/`. Tests auto-discover all pairs and fail if any file is missing its counterpart.

Unsupported test cases can be named `_unsupported.<case>.input.tsx` and should NOT have an output file.

**Test categories:**

- **File pairing**: Verifies all test cases have matching input/output files
- **Output linting**: Runs oxlint on all output files to ensure valid code
- **Transform tests**: Verifies transform produces expected output test cases for supported cases

## Storybook Visual Testing

Storybook renders all test cases side-by-side (input with styled-components, output with StyleX) to visually verify the transformation produces identical styles.

- **Auto-discovery**: Test cases are automatically discovered from `test-cases/*.input.tsx` and `*.output.tsx` files
- **Side-by-side view**: Each test case shows "Input (styled-components)" and "Output (StyleX)" panels
- **"All" story**: Shows all test cases on a single page at `http://localhost:6006/?path=/story/test-cases--all`

Run `pnpm storybook` to start the dev server and visually compare transformations.

Use the Playwright MCP to inspect test case rendering.
