# Orbiter Codemod Bug Fixes

Bugs discovered by running the codemod against the `orbiter/` directory in the Linear monorepo. Each bug has a corresponding test case that reproduces the issue as a diff failure.

All 7 test cases fail with `AssertionError` (diff mismatch), not bail-outs — the codemod produces output, but it's incorrect.

---

## Test failures

### 1. `attrs-tabIndex` — `.attrs()` tabIndex lost in second component when mergedSx is active

**Bugs:** #1 (Critical — ReferenceError) + #7 (Medium — gutter leaked to Flex)

**Adapter config:** `externalInterface` returns `{ styles: true, as: false }` for this test case (added `"attrs-tabIndex."` to the list in `fixture-adapters.ts`).

**Root cause:** When the `mergedSx` code path is active (external interface enables `styles: true`), the codemod emits `className, children, style, sx` in the destructuring. For `.attrs((props) => ({ tabIndex: props.tabIndex ?? 0 }))`, the codemod adds `tabIndex` to the first component's destructuring but **misses it in the second component**. The second component then references `tabIndex` as an undefined variable (`tabIndex={tabIndex ?? 0}`).

**Diff summary:**

```
- const { className, children, style, sx, $applyBackground, gutter, tabIndex, ...rest } = props;
+ const { className, children, style, sx, $applyBackground, gutter, ...rest } = props;
                                                                     ^^^^^^^^^
                                                                     tabIndex missing
```

Additionally, the first component (`ScrollableFlex`) incorrectly passes `gutter={gutter}` as a prop to `<Flex>`, leaking it to the DOM. The gutter styling is already handled via `styles.scrollableFlexScrollbarGutter(props.gutter)`.

**Fix area:** `src/internal/emit-wrappers/` — the `.attrs()` prop extraction logic. When the mergedSx wrapper path is taken, ensure all attrs-derived props are added to the destructuring for every component in the file, not just the first one. Also, props consumed only by styles (like `gutter`) should not be forwarded as component props when the target is a component (not an intrinsic element).

---

### 2. `extending-helperSizing` — Local helper function call dropped entirely

**Bug:** #2 (Critical — avatars have no dimensions)

**Root cause:** The codemod encounters `${(props) => avatarSizeToCSS(props.size)}` — a local helper function call in a template interpolation. Since `avatarSizeToCSS` is defined locally (not an imported module), `resolveCall` is never invoked. The codemod silently drops the interpolation instead of converting it to dynamic StyleX styles.

**Diff summary:**

```
Expected:
  styles.avatarContainerWidth(size),
  styles.avatarContainerHeight(size),

  avatarContainerWidth: (width: AvatarSize) => ({ width: `${width}px` }),
  avatarContainerHeight: (height: AvatarSize) => ({ height: `${height}px` }),

Actual:
  (no width/height styles at all)
  (size not destructured, falls through to ...rest → invalid HTML attr)
```

**Fix area:** The template interpolation handler needs to detect local helper function calls that return CSS strings. Options:

- Parse the helper function body to extract CSS properties and convert them to dynamic StyleX styles
- Add an adapter hook for local helper resolution (similar to `resolveCall` but for file-local functions)
- At minimum, warn when a local function call is dropped rather than silently ignoring it

---

### 3. `conditional-pointerEventsOpacity` — Duplicate style reference + missing pointerEvents

**Bug:** #3 (Critical — content always unclickable)

**Root cause:** When a `styled(Component)` has multiple conditional interpolations that share the same condition (`$open`), the codemod emits the conditional style reference twice — once as a function call (correct) and once as a bare reference (incorrect). Additionally, `pointerEvents` is not included in the conditional dynamic style.

The input has four interpolations all keyed on `$open`:

```css
opacity: ${props => props.$open ? 1 : 0};
transition-delay: ${props => props.$open ? props.$delay : 0}ms;
pointer-events: ${props => props.$open ? "inherit" : "none"};
transition: opacity ${props => props.$duration}ms;
```

**Diff summary:**

```
Expected:
  styles.containerTransition($duration),
  $open ? styles.containerOpen({ $delay }) : undefined,

  containerOpen: (props) => ({
    opacity: 1,
    pointerEvents: "inherit",
    transitionDelay: `${props.$delay}ms`,
  }),

Actual:
  styles.containerTransition(props.$duration),
  $open ? styles.containerOpen({ $delay }) : undefined,   // function call
  $open ? styles.containerOpen : undefined,                // bare reference (BUG: duplicate)

  containerOpen: (props) => ({
    opacity: 1,
    transitionDelay: `${props.$delay}ms`,
    // pointerEvents MISSING
  }),
```

**Fix area:** The conditional style grouping logic in `src/internal/lower-rules/`. When multiple CSS properties share the same condition expression, they should be merged into a single conditional dynamic style. The current logic appears to split some properties into a second reference without calling the function.

---

### 4. `conditional-alignChildSizing` — Conditional alignment logic completely dropped

**Bug:** #4 (High — content alignment broken)

**Root cause:** Complex conditional logic that changes `display` and `align-items` based on a prop value is not converted to StyleX. The codemod drops the entire conditional block:

```css
${props => props.align !== "top"
  ? `display: flex; align-items: ${props.align === "center" ? "center" : "flex-end"};`
  : ""}
```

This is a multi-property conditional interpolation with nested ternary logic. The codemod doesn't know how to map a single prop condition to multiple CSS property variants.

**Diff summary:**

```
Expected:
  const { children, align, ...rest } = props;
  <div {...rest} {...stylex.props(
    styles.container,
    align !== "top" && styles.containerAlignNotTop,
    align === "center" ? styles.containerAlignCenter : align !== "top" ? styles.containerAlignBottom : undefined,
  )} />

  containerAlignNotTop: { display: "flex" },
  containerAlignCenter: { alignItems: "center" },
  containerAlignBottom: { alignItems: "flex-end" },

Actual:
  (align not destructured, falls through to ...rest → invalid HTML attr)
  (no alignment styles generated)
```

**Fix area:** Template interpolation handler — needs to handle multi-property conditional blocks where the interpolation returns a CSS string containing multiple properties. At minimum, detect and emit dynamic styles for each property in the conditional block.

---

### 5. `selector-pseudoElementHover` — Hover styles placed on wrong element

**Bug:** #5 (High — wrong element changes color on hover)

**Root cause:** When `:hover` is nested inside a pseudo-element (`&::-webkit-slider-thumb`), the codemod hoists the hover state to the root element instead of keeping it scoped within the pseudo-element.

```css
&::-webkit-slider-thumb {
  background-color: #bf4f74;
  &:hover {
    background-color: #ff6b9d;
  }
}
```

StyleX doesn't support nested pseudo-selectors inside pseudo-elements. The correct approach would be to combine the selectors or note this as a limitation.

**Diff summary:**

```
Expected:
  "::-webkit-slider-thumb": {
    backgroundColor: {
      default: "#bf4f74",
      ":hover": "#ff6b9d",
    },
    transitionDuration: {
      default: null,
      ":hover": "0s",
    },
  }

Actual:
  backgroundColor: {
    default: "#ccc",
    ":hover": "#ff6b9d",   // BUG: on root, not on thumb
  },
  "::-webkit-slider-thumb": {
    backgroundColor: "#bf4f74",
    // no :hover here
  }
```

**Fix area:** Pseudo-element + pseudo-class nesting in `src/internal/lower-rules/`. When a pseudo-class (`:hover`) is nested inside a pseudo-element (`::-webkit-slider-thumb`), the properties should remain scoped to the pseudo-element with the pseudo-class as a nested condition.

---

### 6. `keyframes-scopedNthChild` — Animation applied to all elements instead of scoped

**Bug:** #6 (High — both SVG paths animate instead of just the second)

**Root cause:** When animation properties are defined inside a selector like `&:nth-child(2)`, the codemod only scopes `transformOrigin` to the `:nth-child(2)` condition but places `animationName`, `animationDuration`, etc. unconditionally on the base style.

```css
&:nth-child(2) {
  transform-origin: center;
  animation: ${bounce} 1s ease-in-out infinite;
}
```

**Diff summary:**

```
Expected:
  animatedPath: {
    fill: "currentColor",
    animationName: { default: null, ":nth-child(2)": bounce },
    animationDuration: { default: null, ":nth-child(2)": "1s" },
    animationTimingFunction: { default: null, ":nth-child(2)": "ease-in-out" },
    animationIterationCount: { default: null, ":nth-child(2)": "infinite" },
    transformOrigin: { default: null, ":nth-child(2)": "center" },
  }

Actual:
  animatedPath: {
    fill: "currentColor",
    animationName: bounce,                    // unconditional (BUG)
    animationDuration: "1s",                  // unconditional (BUG)
    animationTimingFunction: "ease-in-out",   // unconditional (BUG)
    animationIterationCount: "infinite",      // unconditional (BUG)
    transformOrigin: { default: null, ":nth-child(2)": "center" },  // correct
  }
```

**Fix area:** `src/internal/lower-rules/` — the `animation` shorthand expansion. When the shorthand `animation: name duration timing count` is inside a selector scope like `:nth-child(2)`, all expanded longhand properties must inherit that scope, not just `transformOrigin`.

---

### 7. `attrs-componentPropOnly` — Empty `stylex.props()` and `stylex.create({})` emitted

**Bug:** #9 (Low — pointless empty calls)

**Root cause:** `styled(Text).attrs({ variant: "title2" })` with an empty CSS template literal. The attrs should be inlined as component props and no StyleX code should be emitted. Instead, the codemod wraps the component in a function that spreads `{...stylex.props()}` (no arguments) and creates `const styles = stylex.create({})` (empty object).

**Diff summary:**

```
Expected:
  <Text variant="title2">Hello World</Text>
  (no stylex import, no styles object)

Actual:
  import * as stylex from "@stylexjs/stylex";
  function Title(props) {
    return <Text variant="title2" {...rest} {...stylex.props()} />;
  }
  const styles = stylex.create({});
```

**Fix area:** Empty template detection in the component emitter. When a styled-component has `.attrs()` but an empty CSS template (no properties), the codemod should inline the attrs as props and skip StyleX wrapper generation entirely.

---

## Priority order for fixes

1. **Bug #1** (`attrs-tabIndex`) — ReferenceError at runtime, clear regression
2. **Bug #3** (`conditional-pointerEventsOpacity`) — Content unclickable, affects UX
3. **Bug #2** (`extending-helperSizing`) — Avatars lose dimensions
4. **Bug #6** (`keyframes-scopedNthChild`) — Animation scope broken
5. **Bug #5** (`selector-pseudoElementHover`) — Wrong element styled on hover
6. **Bug #4** (`conditional-alignChildSizing`) — Alignment logic dropped
7. **Bug #9** (`attrs-componentPropOnly`) — Cosmetic, no runtime error

## Running the tests

```bash
# Run all failing tests
npx vitest run -t "attrs-tabIndex|attrs-componentPropOnly|conditional-alignChildSizing|conditional-pointerEventsOpacity|extending-helperSizing|keyframes-scopedNthChild|selector-pseudoElementHover"

# Run a specific test
npx vitest run -t "'attrs-tabIndex.output.tsx'"

# Run full suite (expect 7 failures, 1153 passing)
npx vitest run
```
