# Rendering Mismatches

**Status**: Partially resolved (3 of 5 fixed, 2 remaining as expected failures)
**Tracked in**: `scripts/verify-storybook-rendering.mts` → `EXPECTED_FAILURES`

---

## Remaining expected failures

### `conditional-negation` — 1.0% visual mismatch

**Root cause**: Subpixel text antialiasing differences. All computed styles are identical between input and output, but different CSS class names cause microscopic rendering diffs.

**Status**: Accepted as expected failure. An empty base style is emitted so the element always gets a className from `stylex.props()`, but the different class name strings still produce slightly different sub-pixel text rendering.

### `keyframes-unionComplexity` — 1.6% visual mismatch

**Root cause**: Same subpixel text antialiasing as `conditional-negation`. All computed styles are identical.

**Status**: Accepted as expected failure.

---

## Fixed

- **`asProp-forwarded`**: Removed global `forwardedAs -> as` preflight rewriting for wrapper callsites. Component wrappers now preserve `forwardedAs` usage and type it explicitly (`forwardedAs?: React.ElementType`) so transformed output matches styled-components rendering for wrapper chains.
- **`conditional-emptyStringBranch`**: Shorthand/longhand conflict normalization in `emit-styles.ts`. Detects `margin`/`padding` shorthands conflicting with longhands across style objects and expands to matching form. Also normalizes logical-vs-physical longhand conflicts (e.g., `marginBlock` vs `marginBottom`).
- **`selector-attribute`**: `[readonly]` attribute selector converted to JS prop conditional instead of `:read-only` pseudo-class (which matches too broadly). `[disabled]` stays as StyleX `:disabled` pseudo-class (semantically equivalent). Padding shorthand/longhand conflict also normalized.
