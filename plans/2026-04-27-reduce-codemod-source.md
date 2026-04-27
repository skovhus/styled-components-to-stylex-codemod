# Reduce codemod source code

The `src/` tree is ~64k LOC excluding tests. After reading the whole pipeline, I see the biggest wins are not "fewer features" or splitting mega‑files (those carry risk and rarely save lines), but instead:

- **dedupe small helpers that are copy/pasted across the pipeline**, and
- **collapse the thinnest `transform-steps/*.ts` wrappers** that exist only because the architecture grew incrementally.

Splitting the largest files (analyze-before-emit, process-rules, rule-interpolated-declaration) would be churn for cognitive‑load gains, not LOC gains. Skipping those here.

## What stays as-is

- Mega functions in `analyze-before-emit.ts`, `lower-rules/process-rules.ts`, `lower-rules/rule-interpolated-declaration.ts`, `builtin-handlers/conditionals.ts`, `wrapper-emitter.ts`, `emit-styles.ts`, `emit-wrappers/emit-component.ts`. Any rearrangement risks subtle regressions and saves no lines.
- `prepass/run-prepass.ts` (987 lines) — well-bounded entry point.
- Test files (out of scope).

## Phase 1 — low-risk dedup & glue collapse

These are mechanical and well-covered by the 1770-test suite.

### P1.1 Centralize `ImportSource → module specifier`

`importSourceToModuleSpecifier(source, filePath)` is duplicated three times with slight variations:

- `src/internal/transform-steps/emit-styles.ts` (`importSourceToModuleSpecifier`)
- `src/internal/transform-steps/post-process.ts` (`toModuleSpecifier` arrow)
- `src/internal/transform-steps/ensure-merger-import.ts` (`toModuleSpecifier` with extra validation)

Extract to `src/internal/utilities/import-source.ts` and reuse. The validation in `ensure-merger-import.ts` becomes a separate `assertValidImportSource` predicate.

Estimated savings: ~40 LOC, risk: low.

### P1.2 Drop the `transform-*.ts` "facade" layer

Files `src/internal/transform-utils.ts`, `transform-parse-expr.ts`, `transform-resolve-value.ts`, `transform-css-vars.ts`, `transform-import-map.ts` are *all* small modules that exist only because `TransformContext` constructed thunks over them. Several have a single caller.

Concretely:

- `transform-utils.ts` (`patternProp`, `getStaticPropertiesFromImport`) → fold into `transform-context.ts` (or a new tiny `transform-context-helpers.ts`); `patternProp` is also referenced 60+ times — rename the import alias rather than ripping it out.
- `transform-parse-expr.ts` (33 LOC) → the only direct external caller is `builtin-handlers/conditionals.ts`, which can use `ctx.parseExpr` if we plumb it. Keep the module but stop double-naming via `parseExprImpl`.
- `transform-import-map.ts` is called from exactly one step. Move the file into `transform-steps/build-import-map.ts` (the step file itself).
- `transform-resolve-value.ts` and `transform-css-vars.ts` are large enough to keep, but rename to drop the `transform-` prefix and put them into `internal/` proper.

Estimated savings: ~30 LOC and ~5 fewer files. Risk: low.

### P1.3 Collapse trivial step ↔ impl pairs

`emit-wrappers.ts` (125 LOC, top-level) is called by `transform-steps/emit-wrappers.ts` (41 LOC) and nowhere else. Same for `emit-styles.ts` (1126 LOC) ↔ `transform-steps/emit-styles.ts`, and `lower-rules.ts` (373 LOC) ↔ `transform-steps/lower-rules.ts`.

For these, keep the impl file as the authoritative module but **promote it to be the step**: the step function lives there alongside the implementation. Removes one file and one import per pair.

Concretely:

- `transform-steps/emit-wrappers.ts` is only an arg-shuffler. Move `emit-wrappers.emitWrappers(...)` body into the step and delete the wrapper module's separate `args` interface.
- `transform-steps/lower-rules.ts` does real work (partial-migration policy, helper removal). Keep both files but stop re-importing `lowerRules` through a separate module — call it directly from the step and delete `internal/lower-rules.ts`'s separate file by making the step file the home of the orchestration.
- `transform-steps/emit-styles.ts` has ~100 lines of unrelated AST walking for resolver aliases + defineMarker. Move that into `internal/emit-styles/markers.ts` and `internal/emit-styles/resolver-aliases.ts`.

Estimated savings: ~80 LOC + 2 fewer files. Risk: low–medium (need to keep `args` plumbing in sync).

### P1.4 Drop the unused/private `transform.ts` shorthand `process-rules.ts` re-exports

Spot-checked from `ts-prune`:

- `src/internal/transform-types.ts:55` `StepReturnReason` only used internally.
- `src/internal/builtin-handlers/types.ts:472,480,488,493` four context types only used internally.
- `src/internal/emit-wrappers/emit-intrinsic-helpers.ts:35` `EmitIntrinsicHelpers` internal only.
- `src/internal/emit-wrappers/types.ts:25` `WrapperPropDefaultValue` internal only.

Demote `export` → local. Doesn't reduce LOC much but reduces the public-internal API surface and simplifies refactors.

Estimated savings: 0 LOC, risk: zero.

## Phase 2 — medium effort, medium risk (deferred)

Not in this PR. Listing for completeness so we can iterate later:

- Split `analyze-before-emit.ts` into `analyze-before-emit/{step,export-graph,promotable-props,transient-props,merge-target}.ts`. **Net saving: 0 LOC** but materially better navigability.
- Extract a single `findStylexPropsCallsAndMerge` utility shared by `rewrite-jsx.ts` (`postProcessTransformedAst`) and `transform-steps/rewrite-jsx.ts`. Estimated savings: 50–150 LOC, risk: high.
- Move public types from `adapter.ts` (972 LOC) into `internal/adapter-types.ts` and re-export. Organizational only.

## Phase 3 — large effort, high risk (deferred)

- Rearchitect `lower-rules/process-rules.ts` and `lower-rules/rule-interpolated-declaration.ts` (~6.2k LOC combined) into a visitor pattern. Probably worthwhile but cross-cutting.
- Replace `builtin-handlers.ts` ↔ `builtin-handlers/` split with a single folder. Cosmetic.

## Approach

Phase 1 is mechanical and well-tested. Phase 2 and 3 are deferred. Validate via `pnpm check` (lint + tsc + test + knip + storybook + build + format).
