# Plan: Embrace StyleX Markers and `stylex.when.*` API

## Background

The codemod already uses `stylex.when.ancestor()` and `stylex.defaultMarker()` for the `&:hover ${Child}` pattern (see `selector-descendantComponent` test case). This plan extends that to cover sibling selectors, inverse ancestor selectors, and cross-file component selectors.

**API facts** (verified against `@stylexjs/stylex@0.17.5` types):

- All `stylex.when.*` functions: **both args optional** — `(pseudo?: string, marker?: MapNamespace<...>)`
- For unconditional matching (`& + &`), **omit the pseudo entirely** — don't use `:is(*)`
- `defaultMarker()` and `defineMarker()` both return `MapNamespace<...>` — they **compose** in `stylex.props()` and are independent (default observed without second arg, named observed with specific marker)
- Same-file unconditional descendant overrides use **flat values** in the override style key (JSX application already scopes them); `stylex.when.ancestor()` is only needed for pseudo-conditional parts
- **Open question:** Confirm the Babel plugin accepts `stylex.when.*()` with no pseudo at build time. TypeScript types allow it, but test early.

---

## Summary

| Phase   | Unlocks                                                        | Complexity |
| ------- | -------------------------------------------------------------- | ---------- |
| 0       | `selector-specificity`                                         | Low        |
| 1       | `selector-component`                                           | Low        |
| 2       | `selector-sibling`, `selector-adjacentSiblingDestructure`      | Medium     |
| 3       | `selector-crossFileComponent`, `interpolation-componentAsIcon` | Med-high   |
| 4 (fut) | `selector-childCombinatorAttribute` (static ownership only)    | Medium     |
| 5 (fut) | `selector-universal`, `selector-universalInterpolation`        | High       |
| 6 (fut) | Partial: `selector-nesting`, `selector-complex`                | Med-high   |

**Core phases (0-3): 8 of 26 unsupported files unlocked.**

Remaining unsupported: `selector-dynamicPseudoElement` (StyleX limitation), `selector-componentDescendant` (multi-level chains), `example-popoverHighlight` (runtime selector), plus 10 non-selector files (theme, HOC, mixin, etc.).

**Order:** Phase 0 → 1 → 2 → 3. Phases 4-6 are future work and should not block the core rollout.

---

## Phase 0: Specificity Hacks (`&&`, `&&&`)

Strip extra `&` nesting selectors, emit styles on the base style object, add a comment noting the change.

**Done when:** `_unsupported.selector-specificity` promoted with stable `.output.tsx`.

---

## Phase 1: `${Component}:hover &` — Ancestor-Pseudo-Targets-Self

**Unlocks:** `_unsupported.selector-component`

```tsx
// input                              // output
${Link}:hover & {                     fill: {
  fill: rebeccapurple;        →         default: null,
}                                       [stylex.when.ancestor(":hover")]: "rebeccapurple",
                                      }
                                      // Link gets stylex.defaultMarker()
```

This is the inverse of the already-supported `&:hover ${Child}` — both emit `stylex.when.ancestor(':pseudo')` on the element that changes appearance.

**Changes:**

1. **`detect-unsupported-patterns.ts`**: Remove bail for `${Component}:hover &` when component is a known local styled component
2. **`process-rules.ts`**: Add branch for `__SC_EXPR_N__:pseudo &` — register self as override target, add referenced component to `ancestorSelectorParents`
3. **`rewrite-jsx.ts`**: Ensure referenced component gets `stylex.defaultMarker()` even when it's not the declaring component
4. **Rename refactor**: Rename `descendantOverride*` → `relationOverride*` across the codebase (pure rename, no behavioral change — prepares naming for Phases 2-3)

**Done when:** Test case promoted, rename complete, `pnpm check` passes, Storybook verified.

---

## Phase 2: Sibling Selectors (`& + &`, `& ~ &`)

**Unlocks:** `_unsupported.selector-sibling`, `_unsupported.selector-adjacentSiblingDestructure`

```tsx
// input                              // output
& + & { color: red; }        →       color: { default: "blue", [stylex.when.siblingBefore()]: "red" }
& ~ & { background: yellow; }→       backgroundColor: { default: null, [stylex.when.anySibling()]: "yellow" }
                                      // Each instance gets stylex.defaultMarker()
```

| CSS                | StyleX                        |
| ------------------ | ----------------------------- |
| `& + &` (adjacent) | `stylex.when.siblingBefore()` |
| `& ~ &` (general)  | `stylex.when.anySibling()`    |

**Changes:**

1. **`selectors.ts`**: Add `{ kind: "adjacentSibling" }` and `{ kind: "generalSibling" }` to `ParsedSelector`. Remove blanket `hasCombinator` bail for `+`/`~` between nesting selectors.
2. **`process-rules.ts`**: Emit self-referencing style using `stylex.when.siblingBefore` / `stylex.when.anySibling`. Component is both observer and observed.
3. **`descendant-overrides.ts`**: Add `makeSiblingBeforeKey` / `makeAnySiblingKey` builders alongside existing `makeAncestorKey`.
4. **`rewrite-jsx.ts`**: Add `stylex.defaultMarker()` to the component's own `stylex.props()` call.

**`&.something ~ &` open question:** Whether `stylex.when.anySibling('.something')` works (class as pseudo arg) needs runtime testing. Fallback: use `defineMarker()` applied conditionally.

**Done when:** Both test cases promoted, `pnpm check` passes, Storybook verified.

---

## Phase 3: Cross-File Component Selectors with `defineMarker`

**Unlocks:** `_unsupported.selector-crossFileComponent`, `_unsupported.interpolation-componentAsIcon`

```tsx
// input                                        // output (same file)
import { Icon } from "./icon";                  const iconMarker = stylex.defineMarker();
const Btn = styled(Button)`                     // TODO: Apply iconMarker to <Icon> — add to stylex.props()
  ${Icon} { width: 18px; }
  &:hover ${Icon} { transform: rotate(180deg); }  width: { default: null, [stylex.when.ancestor(undefined, iconMarker)]: "18px" }
`;                                                 transform: { default: null, [stylex.when.ancestor(":hover", iconMarker)]: "rotate(180deg)" }
```

Strategy: **same-file `defineMarker()`** + TODO comment for source file. Keeps the transform single-file and side-effect-free.

**Changes:**

1. **Marker generation**: Emit `const marker = stylex.defineMarker()` in the consuming file when a cross-file component is used as a selector
2. **`process-rules.ts`**: Don't bail on imported component selectors — generate override styles using `stylex.when.ancestor(pseudo, marker)`
3. **TODO comment**: Emit actionable comment directing user to apply the marker in the source file
4. **Abstraction**: Put marker resolution behind a `resolveMarker(component)` helper so cross-file strategies (shared marker files, adapter hooks) can be swapped in later without touching lowering or JSX rewrite code

**Done when:** Both test cases promoted, marker resolution abstracted, `pnpm check` passes.

---

## Future Work (Phases 4-6)

Not blocking the core rollout. Tackled independently afterward.

- **Phase 4** (`selector-childCombinatorAttribute`): Only handle static-ownership cases where the target child is a direct JSX child in the same file. Bail with actionable warning for semantic mismatches.
- **Phase 5** (`selector-universal`, `selector-universalInterpolation`): Pattern-match subcategories (flex/grid child sizing, reset patterns, hover propagation). High complexity, heuristic-heavy.
- **Phase 6** (`selector-nesting`, `selector-complex` — partial): Generate child style objects + TODO comments for JSX wiring. Inherently partial.

---

## Safety Policy

Bail with an actionable warning (specific pattern + reason) when:

- StyleX output would change runtime behavior (semantic mismatch)
- Component needing a marker is opaque/imported and JSX can't be rewritten (emit TODO, don't silently drop)
- Selector mixes unsupported dimensions without deterministic lowering
- Pattern requires class semantics (`&.active`, `.child`) not representable via markers

---

## Verification

After each phase:

```bash
pnpm check
node scripts/verify-storybook-rendering.mts --only-changed
```

For each promoted test case: rename `_unsupported.X.input.tsx` → `X.input.tsx`, create `.output.tsx`, remove `@expected-warning`, verify no regressions (especially `selector-descendantComponent`).
