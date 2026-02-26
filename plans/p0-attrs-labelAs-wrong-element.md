# P0: attrs-labelAs — Label renders `<span>` instead of `<label>`

## Severity: HIGH

## Summary

In `attrs-labelAs`, the `Label` component uses `.attrs({ as: "label" })` to render as a `<label>` element. The codemod output passes `as="label"` to the `Text` wrapper, but `Text` ignores the `as` prop and always renders `<span>`.

## Affected Test Case

- `test-cases/attrs-labelAs.input.tsx`
- `test-cases/attrs-labelAs.output.tsx`

## Details

### Input (lines 20-23)

```tsx
export const Label = styled(Text).attrs({ as: "label" })<{ htmlFor?: string }>`
  cursor: pointer;
  user-select: none;
`;
```

The `.attrs({ as: "label" })` tells styled-components to render `Text` as a `<label>` element.

### Current Output

**Text component (lines 12-16):**

```tsx
function Text(props: React.ComponentProps<"span"> & TextProps) {
  const { className, children, style } = props;
  return <span {...mergedSx(styles.text, className, style)}>{children}</span>;
}
```

**Label component (lines 27-28):**

```tsx
export function Label(props: LabelProps) {
  return <Text {...props} as="label" {...stylex.props(styles.label)} />;
}
```

**Problem:** `Text` always renders `<span>` (hardcoded on line 15). It doesn't read or use the `as` prop. So `Label` passes `as="label"` but it's ignored — the rendered element is `<span>`, not `<label>`.

### Expected Behavior

One of:

1. **Text should be polymorphic:** Accept an `as` prop and use it to determine the element type
2. **Label should render directly:** Instead of wrapping `Text`, render `<label>` directly with the merged styles

Option 2 is probably more correct for the codemod since it avoids making `Text` polymorphic when it wasn't designed to be:

```tsx
export function Label(props: LabelProps) {
  const { children, htmlFor, className, style, ...rest } = props;
  return (
    <label htmlFor={htmlFor} {...rest} {...mergedSx([styles.text, styles.label], className, style)}>
      {children}
    </label>
  );
}
```

## Root Cause

The codemod handles `.attrs({ as: "element" })` by passing it as a prop to the wrapped component, but doesn't verify whether the wrapped component actually supports polymorphic rendering via `as`. When the base component is also codemod-generated (and not polymorphic), the `as` prop is silently ignored.

## Fix Approach

1. When processing `.attrs({ as: "element" })` on `styled(Component)`, check if `Component` supports `as`
2. If `Component` is a same-file styled component that was transformed to a non-polymorphic function, inline the element type change
3. Alternatively, make the wrapped component polymorphic when `as` is used by a downstream component
