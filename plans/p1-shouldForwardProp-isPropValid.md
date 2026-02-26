# P1: shouldForwardProp-basic — Link loses isPropValid DOM attribute filtering

## Severity: MEDIUM

## Summary

The `Link` component in `shouldForwardProp-basic` uses `isPropValid(prop) && prop !== "isActive"` as its `shouldForwardProp`. The codemod output destructures `isActive` but spreads all remaining props via `...rest` without applying `isPropValid` filtering.

## Affected Test Case

- `test-cases/shouldForwardProp-basic.input.tsx`
- `test-cases/shouldForwardProp-basic.output.tsx`

## Details

### Input (lines 17-27)

```tsx
const Link = styled.a.withConfig({
  shouldForwardProp: (prop) => isPropValid(prop) && prop !== "isActive",
})<{ isActive?: boolean }>`
  color: ${(props) => (props.isActive ? "#BF4F74" : "#333")};
  ...
`;
```

`isPropValid` from `@emotion/is-prop-valid` filters out any prop that is not a valid HTML DOM attribute. This prevents custom/framework props from leaking to the DOM and causing React warnings.

### Current Output (lines 32-38)

```tsx
function Link(props: LinkProps) {
  const { children, isActive, ...rest } = props;
  return (
    <a {...rest} {...stylex.props(styles.link, isActive ? styles.linkActive : undefined)}>
      {children}
    </a>
  );
}
```

**Problem:** `{...rest}` spreads everything that isn't `children` or `isActive` onto `<a>`. If any non-DOM-valid prop is passed (e.g. from a parent component), it goes straight to the DOM — the `isPropValid` filtering is lost.

### Practical Impact

- This is medium severity because in practice, most callers of `Link` will only pass valid HTML attrs
- However, in component library patterns where components are passed through HOCs or composed, non-DOM props can leak
- React will emit console warnings for unknown DOM attributes

## Fix Approach

Options (in order of preference):

1. **Runtime filter**: Import `isPropValid` and filter rest props before spreading:

   ```tsx
   const filteredRest = Object.fromEntries(
     Object.entries(rest).filter(([key]) => isPropValid(key))
   );
   <a {...filteredRest} {...stylex.props(...)}>
   ```

2. **Static analysis**: If the codemod can determine all possible non-DOM props at build time, explicitly destructure and discard them.

3. **Comment warning**: Add a `// TODO: isPropValid filtering removed` comment if runtime filtering is deemed too expensive.

Option 1 preserves the original semantics most faithfully.
