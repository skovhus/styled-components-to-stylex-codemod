# P0: theme-curriedHelperInline — bottom border uses wrong color when position="top"

## Severity: HIGH

## Summary

In `theme-curriedHelperInline`, the `Box` component has a conditional full `border` and an unconditional `border-bottom` override. In the output, the expanded `borderColor` longhand in the conditional style overwrites the unconditional `borderBottomColor`, reversing the intended cascade.

## Affected Test Case

- `test-cases/theme-curriedHelperInline.input.tsx`
- `test-cases/theme-curriedHelperInline.output.tsx`

## Details

### Input (lines 4-8)

```tsx
const Box = styled.div<{ position: "top" | "bottom" }>`
  padding: 8px;
  border: ${(props) => (props.position === "top" ? themedBorder("labelMuted")(props) : "none")};
  border-bottom: ${(p) => borderByColor(p.theme.color.bgSub)};
`;
```

**Styled-components cascade:**

1. `border` sets all four borders (conditionally)
2. `border-bottom` always overrides the bottom border with `bgSub` color

When `position="top"`: all borders are `labelMuted` color, EXCEPT bottom which is `bgSub`.

### Current Output (lines 14-18, 39-59)

```tsx
<div
  {...stylex.props(
    styles.box,                              // borderStyle: "none"
    styles.borderBottom,                     // borderBottomColor: bgSub
    position === "top" && styles.boxPositionTop,  // borderColor: labelMuted (ALL)
  )}
>
```

```tsx
boxPositionTop: {
  borderWidth: pixelVars.thin,
  borderStyle: "solid",
  borderColor: $colors.labelMuted,  // Sets ALL border colors, including bottom
},
borderBottom: {
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: $colors.bgSub,
},
```

**Problem:** In `stylex.props()`, `boxPositionTop` is applied LAST (index 2), after `borderBottom` (index 1). So `borderColor: labelMuted` overrides `borderBottomColor: bgSub`.

**Expected:** Bottom border should always be `bgSub`, regardless of `position`.

### Correct Fix

The `borderBottom` styles should be applied AFTER the conditional `boxPositionTop`:

```tsx
stylex.props(
  styles.box,
  position === "top" && styles.boxPositionTop,
  styles.borderBottom, // Must come LAST to override
);
```

Or alternatively, `boxPositionTop` should use directional border properties excluding bottom:

```tsx
boxPositionTop: {
  borderTopWidth: pixelVars.thin,
  borderLeftWidth: pixelVars.thin,
  borderRightWidth: pixelVars.thin,
  // ... etc, excluding bottom
},
```

## Root Cause

This is closely related to the cascade ordering issue in `p0-cssHelper-passedToStylex-order.md`. The codemod doesn't preserve the relative order of CSS declarations when they're split into separate conditional vs unconditional style objects. The `border-bottom` declaration comes after `border` in the input, so it should override — but in the output the ordering is reversed.

## Fix Approach

1. When expanding shorthand properties with overrides (e.g., `border` then `border-bottom`), ensure the override style object appears later in `stylex.props()` than the shorthand expansion
2. Track the source order of CSS declarations and maintain that order in the generated `stylex.props()` call
