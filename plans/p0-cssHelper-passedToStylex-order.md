# P0: cssHelper-passedToStylex — static/helper style interleaving order reversed

## Severity: HIGH

## Summary

When a styled-component interleaves static CSS properties with helper function calls (e.g., `scrollFadeMaskStyles()`), the codemod extracts all static properties into a single `stylex.create()` object and places it first in `stylex.props()`. This reverses the CSS cascade order, making static properties get overridden by helpers when the original intent was the opposite.

## Affected Test Case

- `test-cases/cssHelper-passedToStylex.input.tsx`
- `test-cases/cssHelper-passedToStylex.output.tsx`

## Details

### Container Component

**Input (lines 6-11):**

```tsx
const Container = styled.div`
  display: flex;
  flex-direction: column;
  ${scrollFadeMaskStyles(18, "both")} // Helper styles come 3rd
  padding: 16px; // Static style comes AFTER helper
`;
```

In styled-components, later declarations override earlier ones. So `padding: 16px` overrides anything set by the helper.

**Current output (line 9-10):**

```tsx
<div {...stylex.props(styles.container, scrollFadeMaskStyles(18, "both"))}>{children}</div>
```

```tsx
container: {
  display: "flex",
  flexDirection: "column",
  padding: "16px",  // All static styles grouped into one object, applied FIRST
},
```

**Problem:** In `stylex.props()`, later arguments win. The helper is applied LAST, so it can override `padding: 16px`. The original code had `padding` come after the helper.

### ComplexFade Component

**Input (lines 19-24):**

```tsx
const ComplexFade = styled.div`
  position: relative; // Before first helper
  ${scrollFadeMaskStyles(12, "top")} // First helper
  background: white; // Between helpers
  ${scrollFadeMaskStyles(12, "bottom")}// Second helper
`;
```

**Current output:**

```tsx
<div {...stylex.props(
  styles.complexFade,                     // ALL static styles first
  scrollFadeMaskStyles(12, "top"),
  scrollFadeMaskStyles(12, "bottom"),
)}>
```

**Problem:** `position: relative` and `background: white` are both in `styles.complexFade` (applied first). The original interleaving where `background: white` was between the two helpers is lost.

## Root Cause

The codemod collects all static CSS properties into a single `stylex.create()` style object and puts it first in `stylex.props()`. It doesn't preserve the interleaving order between static properties and dynamic helper calls.

## Fix Approach

To preserve cascade order, static properties that appear at different positions relative to helper calls need to be split into separate style objects:

1. Track the position of each static property and each helper call in the template literal
2. Group consecutive static properties into separate style objects when they're separated by helper calls
3. Emit `stylex.props(styles.containerBefore, helper(...), styles.containerAfter)` to preserve ordering

For Container, the correct output would be:

```tsx
stylex.props(styles.containerBase, scrollFadeMaskStyles(18, "both"), styles.containerAfterHelper);
```

Where `containerBase` has `display`/`flexDirection` and `containerAfterHelper` has `padding`.
