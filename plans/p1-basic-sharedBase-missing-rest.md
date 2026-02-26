# P1: basic-sharedBase — PositionBase drops extra HTML props

## Severity: MEDIUM

## Summary

The `PositionBase` component in `basic-sharedBase` destructures specific props but doesn't capture `...rest`, dropping all extra HTML attributes (`aria-*`, `data-*`, `id`, `role`, etc.) that styled-components would have forwarded.

## Affected Test Case

- `test-cases/basic-sharedBase.input.tsx`
- `test-cases/basic-sharedBase.output.tsx`

## Details

### Input (lines 15-20)

```tsx
const PositionBase = styled("div")<PositionProps>`
  ${(props) => (props.top ? `top: ${props.top}` : "")};
  ${(props) => (props.right ? `right: ${props.right}` : "")};
  ${(props) => (props.bottom ? `bottom: ${props.bottom}` : "")};
  ${(props) => (props.left ? `props.left` : "")};
`;
```

`styled("div")` forwards all HTML div attributes to the underlying `<div>`.

### Current Output (lines 20-41)

```tsx
function PositionBase<C extends React.ElementType = "div">(
  props: PositionProps & React.ComponentPropsWithRef<C> & { as?: C },
) {
  const { as: Component = "div", className, children, style, top, right, bottom, left } = props;

  return (
    <Component
      {...mergedSx([...], className, style)}
    >
      {children}
    </Component>
  );
}
```

**Problem:** Line 23 destructures only specific props without `...rest`. Any extra HTML attributes (e.g., `aria-label`, `data-testid`, `id`) passed to `PositionBase` are silently dropped.

### Downstream Impact

`Relative` and `Absolute` correctly spread `{...props}` to `PositionBase`:

```tsx
export function Relative(props) {
  return <PositionBase {...props} {...stylex.props(styles.relative)} />;
}
```

But since `PositionBase` itself doesn't forward `...rest`, the props never reach the DOM.

### Expected Fix

```tsx
const { as: Component = "div", className, children, style, top, right, bottom, left, ...rest } = props;

return (
  <Component
    {...rest}
    {...mergedSx([...], className, style)}
  >
    {children}
  </Component>
);
```

## Root Cause

Same underlying issue as `p0-shouldForwardProp-missing-rest.md` — the emitter doesn't always include `...rest` in the destructuring pattern. This is a variant affecting components with the polymorphic `as` prop path.

## Fix Approach

Fix alongside the P0 rest-spread issue — ensure all emitter paths capture and spread `...rest`.
