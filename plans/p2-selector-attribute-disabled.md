# P2: selector-attribute — `[disabled]` → `:disabled` selector change

## Severity: LOW

## Summary

The codemod transforms the CSS attribute selector `&[disabled]` to the pseudo-class `:disabled`. While these are equivalent for form elements (`<input>`, `<button>`, `<select>`, `<textarea>`), they have different semantics for non-form elements.

## Affected Test Case

- `test-cases/selector-attribute.input.tsx`
- `test-cases/selector-attribute.output.tsx`
- `test-cases/selector-childCombinatorAttribute.input.tsx` (comment on line 2 explicitly notes the mapping)

## Details

### Input (selector-attribute.input.tsx, line 14)

```tsx
&[disabled] {
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}
```

### Current Output (selector-attribute.output.tsx, lines 66-77)

```tsx
backgroundColor: {
  default: null,
  ":disabled": "#f5f5f5",
},
color: {
  default: null,
  ":disabled": "#999",
},
cursor: {
  default: null,
  ":disabled": "not-allowed",
},
```

### Semantic Difference

- **`[disabled]`** (attribute selector): Matches any element that has the `disabled` HTML attribute, regardless of element type. Works on `<div disabled>`, `<span disabled>`, custom elements, etc.
- **`:disabled`** (pseudo-class): Only matches interactive form elements that are in a disabled state. Does NOT match `<div disabled>` or other non-form elements.

### In This Specific Test Case

The component is `styled.input`, which is a form element — so `:disabled` and `[disabled]` are functionally equivalent. The transformation is **correct for this case**.

## Practical Impact

Low severity because:

- Most `[disabled]` usage in styled-components is on form elements where `:disabled` is equivalent
- StyleX may not support arbitrary attribute selectors, making this a necessary transformation
- The `selector-childCombinatorAttribute.input.tsx` line 2 comment explicitly acknowledges: "Maps [disabled] to :disabled pseudo-class on the child styled component"

## When This Would Be a Problem

If `[disabled]` is used on a non-form element (e.g., `styled.div` with a `disabled` prop), the `:disabled` pseudo-class won't match, and the styles won't apply. The codemod should ideally:

1. Check the element type — if it's a form element, `:disabled` is safe
2. If it's a non-form element, either:
   - Use a data attribute approach: `[data-disabled]` with manual prop mapping
   - Bail out with a warning

## Fix Approach

1. For form elements (`input`, `button`, `select`, `textarea`, `fieldset`): the current `[disabled]` → `:disabled` is correct, no change needed
2. For non-form elements: add a check in the selector transformation code to warn or bail out
3. Document this as a known transformation behavior
