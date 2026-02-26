# P0: css-important — `!important` not propagated to all expanded border longhands

## Severity: HIGH

## Summary

When `border: none !important` is expanded to longhand properties, only `borderWidth` gets the `!important` flag. `borderStyle` (and potentially `borderColor`) lose it.

## Affected Test Case

- `test-cases/css-important.input.tsx`
- `test-cases/css-important.output.tsx`

## Details

### Input

```tsx
const OverrideButton = styled.button`
  background: #bf4f74 !important;
  color: white !important;
  border: none !important;
  padding: 8px 16px;
  border-radius: 4px;
`;
```

### Current Output (lines 48-49)

```tsx
overrideButton: {
  backgroundColor: "#bf4f74 !important",  // ✓ correct
  color: "white !important",              // ✓ correct
  borderWidth: "0 !important",            // ✓ correct
  borderStyle: "none",                    // ✗ MISSING !important
  paddingBlock: "8px",
  paddingInline: "16px",
  borderRadius: "4px",
},
```

### Expected Output

```tsx
borderWidth: "0 !important",
borderStyle: "none !important",           // Should include !important
```

## Broader Pattern

This likely affects ALL shorthand expansions where `!important` is present — not just `border`. Check:

- `margin: X !important` → do all `marginTop`/`marginRight`/etc. get `!important`?
- `padding: X !important` → do all `paddingBlock`/`paddingInline` get `!important`?
- `background: X !important` → does `backgroundColor` get `!important`?

## Root Cause

The shorthand expansion logic in `src/internal/css-prop-mapping.ts` (`cssDeclarationToStylexDeclarations()`) or the border-specific handler in `src/internal/lower-rules/borders.ts` likely strips or doesn't propagate the `!important` flag when decomposing a shorthand value into longhands.

The `!important` is probably parsed off the value string before expansion, then only re-appended to the first expanded property.

## Fix Approach

1. In the shorthand expansion code, detect `!important` in the original value
2. After expanding to longhands, append `!important` to ALL expanded property values
3. Add test coverage for `!important` with other shorthands (margin, padding, background)
