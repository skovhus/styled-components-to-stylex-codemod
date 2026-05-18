# TypeScript metadata next steps

## Context

The TypeScript compiler prepass is now first-class for `ts`/`tsx` parser runs. It builds serializable component metadata and feeds wrapper/interface emission, rule lowering, fixture tests, and same-run `sx` decisions.

This plan tracks follow-up work that should use the compiler metadata more deeply without reintroducing broad heuristics.

## Goals

- Prefer TypeScript symbols and types over regex/string matching where the compiler can answer safely.
- Improve emitted wrapper interfaces without widening public component surfaces unnecessarily.
- Emit clearer warnings when TypeScript proves the codemod cannot preserve every typed case.
- Keep non-TypeScript parser behavior supported through existing AST/heuristic paths.

## Prioritized work

### 1. Variant completeness from literal union types

Use compiler-resolved prop types such as `"info" | "warning" | "danger"` to compare the full prop domain against generated variant keys.

- If every union member has a generated static variant, emit narrow static variant lookups confidently.
- If a union member is missing, either keep a dynamic fallback or warn with the missing values.
- Apply to `variantDimensions`, enum variants, and style functions derived from prop equality checks.

### 2. TypeChecker-backed import/export resolution

Replace more regex-based import/export matching in prepass with TypeScript symbols where the parser is `ts`/`tsx`.

- Resolve aliases, namespace imports, default exports, and barrel re-exports through symbols.
- Keep existing resolver/regex logic for non-TypeScript parsers and unresolved package boundaries.
- Start with external-interface consumer matching and component-selector target resolution.

### 3. `.attrs()` required-prop narrowing

Use compiler requiredness to decide when `.attrs()` makes a required prop optional at the emitted wrapper boundary.

- If `.attrs({ foo: value })` supplies a required `foo`, omit `foo` from public wrapper props.
- If an attrs callback may not provide `foo` on every path, keep the required prop or warn.
- Preserve existing nullish-default semantics for `props.foo ?? default`.

### 4. `shouldForwardProp` and styling-prop safety

Use compiler props to decide whether style-only props are part of the wrapped component's public surface.

- If a styling prop is absent from the wrapped component type, filter/consume it more aggressively.
- If a styling prop is explicitly declared on the wrapped component, preserve forwarding unless the original styled-components config filtered it.
- Keep transient prop rename behavior aligned with compiler-proven base props.

### 5. Body-aware `sx` forwarding chains

Extend the current `sx` support beyond declared props and same-run generated outputs by proving how a component body handles `sx`.

- Detect destructured `sx` passed to an intrinsic/generated `sx`-aware target.
- Follow simple local wrapper chains where `sx` is preserved through `{...rest}` and applied by the final target.
- Avoid treating `React.ComponentProps<"button">` alone as proof that a custom component is `sx`-aware.

### 6. Requiredness-driven guard reduction

Broaden the current use of compiler optionality in dynamic style functions.

- Remove runtime nullish guards only when the compiler proves a prop is required and non-nullable.
- Keep guards for optional, nullable, or union-with-undefined props.
- Apply consistently across `styleFnFromProps`, variant dimensions, and conditional CSS helper paths.

## Validation strategy

- Add focused fixture cases under existing categories before changing broad behavior.
- Run `pnpm test:run` and `pnpm typecheck:fixtures` after each output-affecting change.
- Use full-metadata fixture comparisons to identify false positives before regenerating expected outputs.
- Keep `pnpm check` and `pnpm run ci` green before merging.
