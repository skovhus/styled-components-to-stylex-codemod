# Rendering Mismatches

**Status**: Open
**Tracked in**: `scripts/verify-storybook-rendering.mts` → `EXPECTED_FAILURES`

Five test cases have known rendering differences between the styled-components input and the StyleX output.
These are excluded from CI failures but should be fixed.

---

## 1. `conditional-emptyStringBranch` — dimension mismatch (522×246 vs 522×230)

**Root cause**: Shorthand/longhand conflict in StyleX's atomic CSS.

The base style has `marginBottom: "8px"` (from `margin-bottom: 8px`). The conditional style has `margin: "24px"` (from `margin: 24px`). In regular CSS the shorthand resets all directions, overriding `margin-bottom`. In StyleX's atomic CSS system, `margin` and `marginBottom` generate independent atomic classes, and the override doesn't reliably resolve.

**Fix approach**: Ensure base and conditional styles use the same property form. Two options:

- **A — Post-processing pass**: After collecting all style properties for a component, detect shorthand/longhand conflicts across style objects and normalize to a consistent form.
- **B — Hoist longhands into shorthand**: When a conditional block contains `margin: 24px`, remove any individual margin longhands (like `marginBottom`) from the base style and fold them into a single `margin` shorthand in the base. The base would become `margin: "8px"` (bottom-only), or better: `marginBottom: "8px"` stays and the conditional expands `margin: 24px` into 4 longhands at the point it's emitted in the conditional handler.

The expansion approach was attempted (single-value → `marginTop/Right/Bottom/Left` or `marginBlock/marginInline`) but any expansion of static values created regressions when dynamic values (CSS variables, theme tokens) in other test cases stayed as shorthand `padding: pixelVars.thin` in `stylex.create()`. StyleX's compiler expands those shorthands internally using an unknown property form, creating mismatches.

**Recommended approach**: Option A — a normalization pass that runs after all style properties are collected. For each component, if style object A has `marginBottom: X` and style object B has `margin: Y`, expand B's `margin` into `marginTop/Right/Bottom/Left` longhands. This is safe because it only expands shorthands that conflict with existing longhands in the same component.

---

## 2. `selector-attribute` — 0.6% visual mismatch

**Root cause**: Same shorthand/longhand conflict, plus `background` shorthand nuance.

Two sub-issues:

1. **Padding**: Base input style has `paddingBlock: "8px", paddingInline: "12px"` (from `padding: 8px 12px`). The checkbox/radio conditional has `padding: 0` (from `padding: 0`). The shorthand `padding: 0` in `stylex.create()` doesn't reliably override the logical `paddingBlock/paddingInline` properties.
2. **Background**: Although `backgroundImage: "none"` is now emitted for `background` shorthands, the browser's disabled-input appearance may involve more than just `background-image` (e.g., system appearance, gradient overlays).

**Fix approach**: Same normalization pass as issue 1 for the padding conflict. For the background issue, consider emitting `appearance: "none"` alongside background overrides for disabled/readonly states, or investigate if the remaining diff is solely from padding.

---

## 3. `asProp-forwarded` — 6.5% visual mismatch

**Root cause**: `mergedSx` runtime style composition differs from styled-components' compile-time CSS class composition for `styled(Component)` + `forwardedAs` patterns.

In styled-components, `styled(Button)` creates a single element with combined CSS from both `Button` and `ButtonWrapper`, applied via stylesheet-ordered classes. In the output, `ButtonWrapper` passes `{...stylex.props(styles.buttonWrapper)}` to `Button`, which merges via `mergedSx(styles.button, className, style)`. The two sets of atomic classes may interact differently with user-agent styles than styled-components' combined approach.

**Fix approach**: Investigate whether the visual difference comes from:

- **Class composition order**: StyleX atomic classes from two separate `stylex.props` calls may have different specificity/order than a single combined call. Try composing both style objects in a single `stylex.props` call.
- **Missing style reset**: The `<a>` element rendered by `forwardedAs` may have user-agent styles that styled-components overrides via its combined CSS but the separate `mergedSx` approach doesn't.

Concrete experiment: change the output so `ButtonWrapper` composes styles directly rather than passing through `mergedSx`:

```tsx
function ButtonWrapper(props) {
  const { as: Component = "button", children, ...rest } = props;
  return (
    <Component {...rest} {...stylex.props(styles.button, styles.buttonWrapper)}>
      {children}
    </Component>
  );
}
```

This avoids the `mergedSx` intermediate and may resolve the composition difference.

---

## 4. `conditional-negation` — 1.0% visual mismatch

**Root cause**: Subpixel text rendering difference.

The Tooltip component renders as a bare `<div>` (no className) when `$open` is true, while styled-components always attaches a generated CSS class (even for empty styles). The presence vs absence of a class attribute can trigger different browser font rendering paths.

**Fix approach**: Two options:

- **A — Always emit a base style**: When a styled component has only conditional styles and no base styles, emit an empty (or semantically neutral) base style so the element always gets a className from `stylex.props`. For example `tooltip: {}` or `tooltip: { display: "block" }` (no-op for divs).
- **B — Accept the diff**: At 1.0% this is at the subpixel level and may not be worth a codemod change. Could increase the pixelmatch threshold for this case, though a per-case threshold isn't currently supported.

Recommended: Option A, since it's a small change and makes the output more predictable.

---

## 5. `keyframes-unionComplexity` — 1.6% visual mismatch

**Root cause**: Layout shift from wrapper-function composition vs `styled(Component)` extension.

The `StyledLoaderCaret` wraps `LoaderCaret` via a function component that passes styles through props + `mergedSx`. In styled-components, `styled(LoaderCaret)` directly extends the base component's CSS. The wrapper approach may produce slightly different computed styles due to how `mergedSx` orders inline styles vs class-based styles, causing the flex container to distribute space differently.

**Fix approach**: Similar to issue 3 — investigate whether composing styles in a single `stylex.props` call (rather than through `mergedSx`) resolves the layout difference. The root issue may be shared with `asProp-forwarded`.

---

## Cross-cutting: shorthand/longhand normalization

Issues 1 and 2 share the same root cause. A post-processing normalization pass would fix both:

1. After collecting all style objects for a component, build a map of all CSS property names per style object.
2. For each shorthand (e.g., `margin`, `padding`) in any style object, check if conflicting longhands (e.g., `marginBottom`, `paddingBlock`) exist in other style objects of the same component.
3. If a conflict is found, expand the shorthand into longhands that match the form used by the conflicting properties.

This avoids the issue of expanding ALL shorthands (which conflicts with StyleX's internal expansion) and only targets the specific cases where a conflict exists.
