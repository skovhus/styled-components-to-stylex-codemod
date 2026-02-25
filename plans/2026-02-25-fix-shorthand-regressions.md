# Fix Render Test Regressions from PR #231

## Context

PR #231 introduced three visual rendering regressions in Storybook test cases:

1. **theme-isDarkWrapper** (52.9% pixel mismatch) — Output had `background` instead of `backgroundColor`
2. **conditional-dataStateActiveTheme** (0.9% pixel mismatch) — Same `background` shorthand issue
3. **conditional-logicalAndTemplateLiteral** (2px height difference) — `border` shorthand not expanded

## Root Causes

### Issue 1: `background` → `backgroundColor` mapping missing in theme boolean handler

**File**: `src/internal/lower-rules/rule-interpolated-declaration.ts:730`

The theme boolean conditional handler (`splitThemeBooleanVariants`) called `cssPropertyToStylexProp("background")` which returns `"background"` (just camelCase). The static declaration path uses `cssDeclarationToStylexDeclarations()` which correctly maps `background` → `backgroundColor`, but the theme boolean path bypassed this.

**Fix**: After `cssPropertyToStylexProp(res.cssProp)`, check if the CSS prop is `background` and use `resolveBackgroundStylexProp()` instead.

### Issue 2: `border` shorthand not expanded in static template literal path

**File**: `src/internal/lower-rules/template-literals.ts:242-272`

PR #231 added `resolveThemeFromPropsMember` which enabled bare `props.theme.color.X` member expressions to resolve inside template literals. Before this, `resolveTemplateLiteralBranch` returned `null` for these expressions, causing them to be handled by a different code path that did expand border shorthands.

Now the template literal IS resolved (all slots static), but `cssDeclarationToStylexDeclarations(d)` for interpolated `border` returns `[{ prop: "border" }]` without expansion. The border expansion using `parseInterpolatedBorderStaticParts` only existed in the dynamic path, not the static path.

**Fix**: In the static all-static path, add border shorthand expansion using `parseInterpolatedBorderStaticParts` and background handling via `resolveBackgroundStylexProp`, before falling through to the generic `cssDeclarationToStylexDeclarations(d)` loop.

## Changes Made

### 1. `src/internal/lower-rules/rule-interpolated-declaration.ts`

- Added import for `resolveBackgroundStylexProp`
- Theme boolean handler now uses `resolveBackgroundStylexProp(d?.valueRaw ?? "")` for `background` CSS prop

### 2. `src/internal/lower-rules/template-literals.ts`

- Added import for `resolveBackgroundStylexProp`
- Static template literal path now:
  - Expands `border` shorthand via `parseInterpolatedBorderStaticParts()`
  - Maps `background` via `resolveBackgroundStylexProp()`
  - Falls through to `cssDeclarationToStylexDeclarations()` for other properties

### 3. Regenerated test case outputs

- `theme-isDarkWrapper.output.tsx` — `background` → `backgroundColor`
- `conditional-dataStateActiveTheme.output.tsx` — `background` → `backgroundColor`
- `conditional-logicalAndTemplateLiteral.output.tsx` — `border` → `borderWidth`/`borderStyle`/`borderColor`

## Remaining Shorthand Gaps

The root cause is ad-hoc shorthand handling scattered across code paths. Many use `cssPropertyToStylexProp()` (just camelCases) instead of `cssDeclarationToStylexDeclarations()` (expands shorthands):

| Location                                       | Gap                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `css-prop-mapping.ts:196-197`                  | `cssDeclarationToStylexDeclarations()` passes through interpolated `border` as-is |
| `finalize-decl.ts:167-180`                     | Ancestor selector overrides only handle `background`, not `border`                |
| `keyframes.ts:84-87, 219-223`                  | Keyframe properties only expand `background`                                      |
| `rule-interpolated-declaration.ts:731`         | Theme boolean — fixed for `background`, other shorthands pass through             |
| `selector-componentMultiSlot.output.tsx:29-32` | Existing bug: `border:` in `stylex.create()`                                      |

## Verification

- `pnpm check` — all tests, types, lint pass
- Visual rendering verification — all 3 test cases pass with 0 pixel difference
