# P0: shouldForwardProp / variant-recipe — missing `...rest` drops HTML attributes

## Severity: HIGH

## Summary

Multiple components in `shouldForwardProp-basic.output.tsx` and `variant-recipe.output.tsx` destructure only the styled props but never capture or spread `...rest`, silently dropping all HTML attributes (`aria-*`, `data-*`, `onClick`, `disabled`, `type`, etc.).

## Affected Test Cases

- `test-cases/shouldForwardProp-basic.output.tsx` — Button, Box, Card
- `test-cases/variant-recipe.output.tsx` — Button

## Details

### shouldForwardProp-basic: Button (lines 10-24)

**Input:** `styled.button` with `shouldForwardProp` filtering `color`/`size` — all other HTML button attrs pass through.

**Current output:**

```tsx
function Button(props: ButtonProps) {
  const { children, color, size } = props;
  return (
    <button {...stylex.props(styles.button, ...)}>
      {children}
    </button>
  );
}
```

**Problem:** Only destructures `{ children, color, size }`. No `...rest` spread — `aria-label`, `onClick`, `disabled`, `type`, `tabIndex`, etc. are all silently dropped.

**Expected:** `const { children, color, size, ...rest } = props;` and `<button {...rest} {...stylex.props(...)}>`.

### shouldForwardProp-basic: Box (lines 47-61)

**Input:** `styled.div` with `shouldForwardProp` filtering `$`-prefixed props.

**Current output:**

```tsx
type BoxProps = React.PropsWithChildren<{ $background?: string; $padding?: string }>;
function Box(props: BoxProps) {
  const { children, $background, $padding } = props;
  return <div {...stylex.props(...)}>{children}</div>;
}
```

**Problem:** Type uses `React.PropsWithChildren` instead of `Omit<React.ComponentProps<"div">, ...>`, AND no `...rest` spread.

### shouldForwardProp-basic: Card (lines 70-85)

Same pattern — destructures only `{ children, variant, elevation, rounded }`, drops `...rest`.

### variant-recipe: Button (lines 15-30)

**Current output:**

```tsx
function Button(props: ButtonProps) {
  const { children, size = "small", color = "secondary", disabled } = props;
  return (
    <button disabled={disabled} {...stylex.props(...)}>
      {children}
    </button>
  );
}
```

**Problem:** Type correctly includes `Omit<React.ComponentProps<"button">, ...>`, but only `disabled` is manually forwarded. All other HTML attrs dropped.

## Contrast: Working Components

The **Link** component in `shouldForwardProp-basic` (lines 32-38) correctly uses `const { children, isActive, ...rest } = props;` and `<a {...rest} ...>`. So the codemod already knows how to do this — it's inconsistently applied.

## Root Cause

The emitter sometimes omits `...rest` in the destructuring when generating function components from intrinsic styled components. The logic that decides whether to include rest-spread appears to have gaps.

## Fix Approach

1. Identify the emitter code responsible for generating the destructuring pattern and rest-spread
2. Ensure all intrinsic-element styled components capture and spread `...rest`
3. For `shouldForwardProp` with `isPropValid`, additional filtering may be needed (see separate plan `p1-shouldForwardProp-isPropValid.md`)
4. Fix the `Box` type to use `Omit<React.ComponentProps<"div">, "className" | "style">` instead of `React.PropsWithChildren`
5. Regenerate affected test case outputs
