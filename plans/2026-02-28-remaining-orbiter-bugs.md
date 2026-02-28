# Remaining Orbiter Codemod Bugs

After the first round of fixes, 4 of the original 7 test-case bugs remain.
All 4 are reproduced as diff failures in `test-cases/`.

## Status

| #   | Bug                                                       | Test Case                          | Status    |
| --- | --------------------------------------------------------- | ---------------------------------- | --------- |
| 1   | `ScrollableDiv` missing `tabIndex` destructuring          | `attrs-tabIndex`                   | **FIXED** |
| 2   | String-based `size` passed as CSS value instead of px     | `extending-helperSizing`           | **OPEN**  |
| 3   | Duplicate `containerOpen` + missing `pointerEvents`       | `conditional-pointerEventsOpacity` | **FIXED** |
| 4   | Alignment + child selector logic dropped entirely         | `conditional-alignChildSizing`     | **OPEN**  |
| 5   | Hover `backgroundColor` dropped in pseudo-element         | `selector-pseudoElementHover`      | **OPEN**  |
| 6   | Animation applied to all paths instead of `:nth-child(2)` | `keyframes-scopedNthChild`         | **FIXED** |
| 7   | `gutter` prop leaked to `<Flex>`                          | `attrs-tabIndex`                   | **OPEN**  |
| 9   | Empty `stylex.props()` calls                              | `attrs-componentPropOnly`          | **FIXED** |

---

## Bug #2: String size passed as CSS value

**Test case:** `extending-helperSizing`
**Orbiter file:** `AvatarContainer.tsx`

### Root cause

When a local helper function (e.g. `avatarSizeToCSS(size)`) returns CSS from a
string-typed prop (e.g. `AvatarSize = "small" | "medium" | "large"`), the codemod
creates a dynamic style function that passes the raw string as a CSS value:

```tsx
// Buggy output
avatarContainerWidth: (size: AvatarSize) => ({ width: size });
// Produces: width: "small" — invalid CSS
```

### Expected fix

The codemod should either:

1. Inline the helper's lookup map and use the resolved numeric value
2. Generate code that calls the helper to get pixel values

```tsx
// Correct output
avatarContainerWidth: (width: number) => ({ width });
// Called as: styles.avatarContainerWidth(sizeMap[size])
```

---

## Bug #4: Alignment + child selector logic dropped

**Test case:** `conditional-alignChildSizing`
**Orbiter file:** `CollapsingContainer.tsx`

### Root cause

When a conditional interpolation contains a `& > div { ... }` child selector,
the codemod drops the entire conditional block. The `align` prop is destructured
but never used in the output, and no alignment styles are generated.

### Expected fix

The codemod should:

1. Extract the non-child-selector properties (`display: flex`, `align-items`) as
   conditional StyleX styles
2. Leave a comment/TODO for the child selector part (since StyleX cannot style
   children directly)

```tsx
// Correct output
containerAlignNotTop: { display: "flex" },
containerAlignCenter: { alignItems: "center" },
containerAlignBottom: { alignItems: "flex-end" },
containerChildWidth: { /* & > div { width: 100% } — needs manual conversion */ },
containerChildHeight: { /* & > div { height: 100% } — needs manual conversion */ },
```

---

## Bug #5: Hover backgroundColor dropped in pseudo-element

**Test case:** `selector-pseudoElementHover`
**Orbiter file:** `RangeInput.tsx`

### Root cause

When `color()` helper calls (resolved via the `resolveCall` adapter) are used
inside a pseudo-element's `:hover` block, the codemod generates:

```tsx
// Buggy output — backgroundColor is flat, no hover variant
"::-webkit-slider-thumb": {
  backgroundColor: $colors.controlPrimary,  // ← missing hover
  transitionDuration: {
    default: null,
    ":hover": "0s",                          // ← this one works
  },
}
```

The `transitionDuration` hover works correctly, but `backgroundColor` hover is
dropped. This suggests the adapter-resolved values interfere with the
pseudo-class merging logic.

### Expected fix

```tsx
backgroundColor: {
  default: $colors.controlPrimary,
  ":hover": $colors.controlPrimaryHover,
},
```

---

## Bug #7: `gutter` prop leaked to Flex

**Test case:** `attrs-tabIndex`
**Orbiter file:** `Scrollable.tsx`

### Root cause

The codemod generates `gutter={gutter}` on the `<Flex>` component, but `Flex`
does not accept a `gutter` prop. The `gutter` value is only used in the StyleX
dynamic style (`scrollableFlexScrollbarGutter`), so passing it as a JSX prop
is incorrect — it leaks to the DOM.

### Expected fix

Remove `gutter={gutter}` from the `<Flex>` JSX props. The gutter is already
applied via `styles.scrollableFlexScrollbarGutter(props.gutter)`.
