# AGENTS.md

Guide for AI agents (Tinter and others) working on the **styled-components-to-stylex-codemod** repository.

## Self-Improvement

If you discover undocumented requirements, commands, or workflows during your work (e.g., a reviewer asks you to run something not covered here), update this file on the same PR. Keep this guide accurate and helpful for future agents.

## Quick Reference

| Task | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Run tests once | `pnpm test:run` |
| Full validation (lint + types + tests + knip + storybook + build) | `pnpm check` |
| Sequential CI validation | `pnpm ci` |
| Lint only | `pnpm lint` |
| Type-check only | `pnpm typecheck` |
| Build | `pnpm build` |
| Storybook dev server | `pnpm storybook` |
| Storybook build | `pnpm storybook:build` |
| Dead code detection | `pnpm knip` |
| Regenerate all test outputs | `node scripts/regenerate-test-case-outputs.mts` |
| Regenerate one test output | `node scripts/regenerate-test-case-outputs.mts --only <case>` |
| Debug failing tests (generates .actual.tsx) | `node scripts/debug-test.mts` |

Always run `pnpm check` before considering any change complete.

## Project Overview

This is a jscodeshift codemod that transforms **styled-components** code into **StyleX**. The main entry point is `src/transform.ts`. The transformation pipeline lives in `src/internal/transform-steps/` and the core rule-lowering logic is in `src/internal/lower-rules/`.

## Repository Layout

```
src/                   # Source code (never depends on test-cases/)
  transform.ts         # Main transform entry
  adapter.ts           # Adapter types for user customization
  index.ts             # Public API
  run.ts               # File-level runner
  internal/            # Implementation details
    transform-steps/   # Pipeline stages (preflight → emit → finalize)
    lower-rules/       # CSS rule processing & interpolation resolution
    emit-wrappers/     # Component code generation
    utilities/         # Shared helpers
    builtin-handlers/  # Built-in interpolation handlers
test-cases/            # .input.tsx / .output.tsx pairs (auto-discovered)
scripts/               # Dev scripts (run with `node`)
plans/                 # Implementation plans (YYYY-MM-DD-feature-name.md)
.claude/skills/        # Claude skill definitions
playground/            # Browser-based playground (Vite)
```

## Core Rules

1. **`src/` must never import from `test-cases/`** — keep production code and test fixtures fully separated.
2. **Transformations must be safe and lossless** — bail out rather than producing incorrect output. If semantics cannot be preserved, skip the declaration/file and emit a warning.
3. **Always validate with `pnpm check`** — this runs lint (oxlint + eslint), typecheck (tsc), tests (vitest), dead-code detection (knip), storybook build, and library build concurrently.
4. **Add a test case or unit test for every bug fix or review comment** — document regressions to prevent future breakage.
5. **Explore before changing** — before modifying a pattern, search the entire codebase for all occurrences. List every file and relevant code, confirm the full scope, then propose a complete change plan.

## Code Style

- **No code duplication** — prefer iteration and modularization. Extend existing helpers instead of adding parallel logic.
- **Centralize common logic** — look for existing utilities (e.g., `literalToStaticValue` in `builtin-handlers.ts`, `cssDeclarationToStylexDeclarations()` in `css-prop-mapping.ts`) before adding new logic.
- **Exports at the top** — keep all exports at the top of each file (after imports), non-exported helpers further down.
- **TypeScript strictness** — avoid `any`; use proper types. Prefer type definitions over type assertions (`as`, `!`). Minimal, justified assertions are acceptable for jscodeshift AST patterns that are hard to type precisely.
- **Descriptive names** — use clear, descriptive names for variables and functions.
- **No `void variable;` hacks** — never suppress unused-variable warnings with `void`; remove the parameter or actually use it.

## StyleX Constraints

StyleX does **not** support CSS shorthand properties. When transforming CSS:

- `border` → `borderWidth`, `borderStyle`, `borderColor`
- `margin`/`padding` → directional properties (`marginTop`, `marginRight`, etc.)
- `background` → `backgroundColor` or `backgroundImage`

**Key files for shorthand handling:**

- `src/internal/css-prop-mapping.ts` — `cssDeclarationToStylexDeclarations()` is the authoritative source for shorthand expansion
- `src/internal/lower-rules/borders.ts` — handles interpolated border values
- Use `parseInterpolatedBorderStaticParts()` when parsing border values with dynamic expressions

Always use these existing helpers rather than directly mapping CSS property names.

## Test Cases

### Structure

Test cases live in `test-cases/` as `.input.tsx` / `.output.tsx` pairs. Tests auto-discover all pairs and fail if any file is missing its counterpart.

- **Supported cases**: `<name>.input.tsx` + `<name>.output.tsx`
- **Unsupported cases**: `_unsupported.<name>.input.tsx` (no output file)

### Naming Convention

Format: `category-variation` (single `-` separator, lowerCamelCase variation).

- If a category has only one test case, omit the variation suffix.
- Use **neutral, descriptive** names — no "Lost", "Missing", "Broken".
- For unsupported files: `_unsupported.category-variation`

**Categories**: `basic`, `extending`, `attrs`, `asProp`, `conditional`, `interpolation`, `mixin`, `cssHelper`, `selector`, `theme`, `useTheme`, `wrapper`, `externalStyles`, `helper`, `cssVariable`, `mediaQuery`, `transientProp`, `shouldForwardProp`, `withConfig`, `keyframes`, `variant`, `css`, `htmlProp`, `typeHandling`, `import`, `staticProp`, `ref`, `styleObject`, `naming`, `example`

### Visual Guidelines

Every test case `App` component must render visibly in Storybook:

- Use visible CSS properties (`background-color`, `color`, `border`, `padding`)
- Give components meaningful size (40-80px minimum)
- Add text labels inside components
- Show all prop variations in the `App` component
- Use `gap` and `padding` on containers

## Workflow

### Implementing a Feature or Fix

1. Explore the codebase to understand the full scope of changes needed.
2. Write a failing test case first (test-driven development).
3. Implement the change.
4. Regenerate test outputs if needed: `node scripts/regenerate-test-case-outputs.mts --only <case>`
5. Run `pnpm check` to validate.
6. Refactor for code quality (see `.claude/skills/refactor-code-quality/SKILL.md`).
7. Run `pnpm check` again after refactoring.
8. Commit with descriptive messages and push.

### Addressing Review Comments

1. Fetch and analyze the review comments.
2. Write a failing test that reproduces the issue.
3. Fix the code and verify tests pass.
4. Run full validation with `pnpm check`.
5. Commit, push, and refactor if needed.

See `.claude/skills/address-review-comments/SKILL.md` for the full process.

### Creating a PR

See `.claude/skills/create-pr/SKILL.md` for the full process. Never commit directly to `main`.

## Storybook

Storybook renders input (styled-components) and output (StyleX) side-by-side:

- **All cases**: `http://localhost:6006/?path=/story/test-cases--all`
- **Individual case**: `http://localhost:6006/?path=/story/test-cases--<kebab-case-name>`
- **Build check**: `pnpm storybook:build`

## Plans

Store implementation plans in `plans/` as `YYYY-MM-DD-feature-name.md`.

## Skills

Located in `.claude/skills/`:

- `refactor-code-quality` — post-implementation code quality pass
- `address-review-comments` — test-driven approach to review feedback
- `create-pr` — PR creation workflow
