# P1: mixin-imported — mixin/static property cascade order reversed

## Severity: MEDIUM

## Summary

In `mixin-imported`, when a styled-component applies a static property then a mixin (or vice versa), the output reverses the cascade order in `stylex.props()`.

## Affected Test Case

- `test-cases/mixin-imported.input.tsx`
- `test-cases/mixin-imported.output.tsx`

## Details

### Input: ElementWithImportedMixin

```tsx
const ElementWithImportedMixin = styled.div`
  color: red; // Static property — applied FIRST
  ${TruncateText}// Mixin — applied SECOND (overrides color if it sets color)
`;
```

In CSS, later declarations override earlier ones. So `TruncateText` should take priority over `color: red` if there's a conflict.

### Current Output

```tsx
<div {...stylex.props(helpers.truncate, styles.elementWithImportedMixin)}>
```

**Problem:** `helpers.truncate` (the mixin) is applied FIRST, then `styles.elementWithImportedMixin` (static props) is applied SECOND. In `stylex.props()`, later arguments win — so the static `color: red` now overrides the mixin, which is the **opposite** of the input behavior.

### Expected Output

```tsx
<div {...stylex.props(styles.elementWithImportedMixin, helpers.truncate)}>
```

Or if there are static properties both before AND after the mixin, they need to be split into separate style objects (same pattern as `p0-cssHelper-passedToStylex-order.md`).

## Root Cause

This is the same underlying issue as `p0-cssHelper-passedToStylex-order.md` — the codemod doesn't preserve the interleaving order between static styles and external style references (helpers/mixins) when generating `stylex.props()` arguments.

## Fix Approach

Should be fixed together with the cssHelper ordering issue. The solution needs to:

1. Track the position of each CSS declaration (static) and each interpolated expression (mixin/helper) in the template literal
2. Preserve that relative order in the generated `stylex.props()` call
3. Split static properties into multiple style objects if they're interleaved with helpers
