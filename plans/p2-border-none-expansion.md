# P2: border: none expansion — missing borderColor longhand

## Severity: LOW

## Summary

When `border: none` is expanded to longhand properties, the output includes `borderWidth: 0` and `borderStyle: "none"` but omits `borderColor`. While visually equivalent in most cases (since `none` style means no border is painted), the missing longhand can cause issues when a later style override sets `borderStyle` without `borderColor`.

## Affected Test Cases

Multiple test cases exhibit this pattern:

- `shouldForwardProp-basic.output.tsx` (line 119-120): `borderWidth: 0, borderStyle: "none"`
- `ref.output.tsx` (line 20-21): `borderWidth: 0, borderStyle: "none"`
- `asProp-forwarded.output.tsx` (line 49-50): `borderWidth: 0, borderStyle: "none"`
- `css-important.output.tsx` (line 48-49): `borderWidth: "0 !important", borderStyle: "none"`

None include `borderColor` in the expansion.

## Details

### Input

```css
border: none;
```

### Current Output

```tsx
borderWidth: 0,
borderStyle: "none",
// borderColor is missing
```

### Expected Output (complete expansion)

```tsx
borderWidth: 0,
borderStyle: "none",
borderColor: "initial",   // or "currentColor" per CSS spec default
```

## Why This Matters

In StyleX, styles are atomic and merged. If a component sets `border: none` (expanded) and a later override sets `borderStyle: "solid"` + `borderWidth: "1px"`, the `borderColor` from a previous style could leak through because it was never explicitly reset by the `none` expansion.

The CSS spec says `border: none` is equivalent to `border: none currentColor medium` — all three longhands are set.

## Practical Impact

Low severity because:

- `borderStyle: "none"` means no border is painted regardless of color
- The issue only manifests when partial overrides are applied in a specific order
- Most real-world usage of `border: none` is terminal (not overridden)

## Fix Approach

1. In `src/internal/css-prop-mapping.ts` or `src/internal/lower-rules/borders.ts`, update the `border: none` expansion to include all three longhands
2. Consider what value to use for borderColor: `"initial"`, `"currentColor"`, or `"transparent"` are all valid
