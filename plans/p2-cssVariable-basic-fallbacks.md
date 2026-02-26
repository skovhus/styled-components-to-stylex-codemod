# P2: cssVariable-basic — CSS variable fallback values moved to external file

## Severity: LOW

## Summary

CSS variables with fallback values like `var(--text-color, #333)` lose their fallback semantics when the codemod moves the fallback to `stylex.defineVars()` default values. The behavior changes because `defineVars` always defines the variable, preventing the fallback from ever triggering.

## Affected Test Case

- `test-cases/cssVariable-basic.input.tsx`
- `test-cases/cssVariable-basic.output.tsx`
- `test-cases/css-variables.stylex.ts` (generated sidecar)

## Details

### Input (lines 23-28)

```tsx
const Text = styled.p`
  color: var(--text-color, #333);
  font-size: var(--font-size, 16px);
  line-height: var(--line-height, 1.5);
`;
```

**CSS semantics:** If `--text-color` is not defined in any ancestor, the browser uses `#333` as the fallback.

### Current Output

**css-variables.stylex.ts (lines 14-18):**

```tsx
export const textVars = stylex.defineVars({
  textColor: "#333", // Fallback moved here as default
  fontSize: "16px",
  lineHeight: "1.5",
});
```

**cssVariable-basic.output.tsx (lines 35-39):**

```tsx
text: {
  color: textVars.textColor,
  fontSize: textVars.fontSize,
  lineHeight: textVars.lineHeight,
},
```

### Semantic Change

- **Input:** `--text-color` is an external CSS variable that may or may not be defined. `#333` is used only when it's undefined.
- **Output:** `textVars.textColor` is always defined (StyleX injects it via `defineVars`), with `#333` as its initial value. The concept of "fallback when undefined" no longer exists.

This is subtly different: in the input, a parent could define `--text-color` via a regular CSS stylesheet, and the component would use it. In the output, the variable is always set to `#333` unless overridden via `stylex.createTheme()`.

## Practical Impact

Low severity because:

- Most real-world usage defines the CSS variables somewhere, so the fallback rarely triggers
- The `defineVars` default effectively serves the same purpose for the common case
- The semantic difference only matters if the same CSS variable is intentionally left undefined in some contexts

## Fix Approach

This may be acceptable behavior with a documentation note. If a fix is desired:

1. Keep the fallback inline: `color: \`var(${textVars.textColor}, #333)\`` — but this defeats the purpose of StyleX's type-safe variables
2. Accept the semantic shift and document it as a known transformation behavior
3. Only externalize variables that don't have fallbacks; keep `var(--name, fallback)` as raw CSS strings
