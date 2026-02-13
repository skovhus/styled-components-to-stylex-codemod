# Rendering Mismatches

**Status**: Partially resolved (2 of 5 fixed, 3 remaining as expected failures)
**Tracked in**: `scripts/verify-storybook-rendering.mts` → `EXPECTED_FAILURES`

---

## Remaining expected failures

### `asProp-forwarded` — 6.5% visual mismatch

**Root cause**: `forwardedAs` forwards polymorphism to the wrapped component, rendering as `<a>` instead of `<button>`. This matches styled-components' documented semantics (`forwardedAs` passes `as` to the inner component) but the visual output differs because styled-components internally collapses nested styled wrappers into a single element, while our transform emits a component-wrapping function that forwards `as`.

**Status**: Accepted as expected failure. The transform is semantically correct (element type changes per `forwardedAs` intent). The rendering difference is inherent to the architectural difference between styled-components' runtime class composition and our function-wrapper approach.

### `conditional-negation` — 1.0% visual mismatch

**Root cause**: Subpixel text antialiasing differences. All computed styles are identical between input and output, but different CSS class names cause microscopic rendering diffs.

**Status**: Accepted as expected failure. An empty base style is emitted so the element always gets a className from `stylex.props()`, but the different class name strings still produce slightly different sub-pixel text rendering.

### `keyframes-unionComplexity` — 1.6% visual mismatch

**Root cause**: Same subpixel text antialiasing as `conditional-negation`. All computed styles are identical.

**Status**: Accepted as expected failure.

---

## Fixed

- **`conditional-emptyStringBranch`**: Shorthand/longhand conflict normalization in `emit-styles.ts`. Detects `margin`/`padding` shorthands conflicting with longhands across style objects and expands to matching form. Also normalizes logical-vs-physical longhand conflicts (e.g., `marginBlock` vs `marginBottom`).
- **`selector-attribute`**: `[readonly]` attribute selector converted to JS prop conditional instead of `:read-only` pseudo-class (which matches too broadly). `[disabled]` stays as StyleX `:disabled` pseudo-class (semantically equivalent). Padding shorthand/longhand conflict also normalized.
