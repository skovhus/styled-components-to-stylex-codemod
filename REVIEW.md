# Code Review Notes

## What’s implemented now
- The transform only visits `styled.*` tagged templates and wraps them in a simple StyleX component, emitting a `styles` object with flattened declarations parsed by Stylis. Dynamic placeholders are inserted as `var(--__stylex_dyn_X__)` and rehydrated into template literals when they appear in property values.
- Warnings are limited to `createGlobalStyle`, component selectors detected by a heuristic (`:hover &` after an identifier), and `&&` specificity hacks.

## Gaps to address
- **Selector/at-rule loss:** `parseStyle` only collects top-level declarations and drops nested selectors, pseudo-classes, media/supports blocks, and keyframes. None of the StyleX selector or at-rule shapes are generated, so most fixtures cannot be expressed. 
- **Value conversion and adapter hooks:** Property values that contain placeholders are returned as raw ESTree nodes without going through `adapter.transformValue` or any plugin surface, so theme lookups, helper functions, and mixins are never rewritten. 
- **Tagged-template coverage:** Only `styled.*` tagged templates are handled. `css` helpers, `keyframes`, `.attrs()`, and `.withConfig()` calls are ignored, and there is no handling for style object literals.
- **Dynamic classification:** All interpolations are treated as value placeholders; selector and at-rule parameter interpolations are not distinguished, which risks invalid StyleX output and removes the ability to bail safely.
- **Wrapper behavior:** The wrapper JSX spreads `stylex.props(styles[key])` and `props` but drops `ref`, `className` interop, transient prop filtering, forwarded `as`/`forwardedAs`, and `.attrs()` defaults, which makes generated components semantically incomplete.
- **Warning coverage/reporting:** The warning surface does not include many unsupported cases (dynamic selectors/at-rules, mixins, global styles, specificity tricks beyond `&&`, prop forwarding logic, etc.), reducing developer awareness of risky conversions.
- **Tests still pending:** The transform behavior is not exercised by the fixture-based tests (marked pending), so regressions will slip through until those cases are enabled with real conversions.

## Steps that would make the codemod more solid
- Parse the flattened CSS (with safe placeholders) into a rich tree that preserves selectors, at-rules, and keyframes, then map that structure into StyleX objects instead of only top-level declarations.
- Introduce a plugin pipeline that classifies each placeholder (value vs selector vs at-rule params) and lets adapters decide whether to convert, rewrite, or bail, invoking `adapter.transformValue` for theme/utility lookups by default.
- Expand input coverage to `css` helpers, `keyframes`, style object syntax, `.attrs()`, and `.withConfig()`, with conservative defaults (emit warnings and preserve code when unsure).
- Strengthen wrapper generation to keep `ref`/`as`/`forwardedAs`/`className` interop and transient prop filtering so converted components behave like their styled-components counterparts.
- Add targeted warnings for unhandled patterns (dynamic selectors/at-rules, mixins, `createGlobalStyle`, specificity hacks, prop forwarding logic) and surface them with source locations.
- Turn on the currently skipped transform fixtures once the above behavior lands, and add golden tests for selector/at-rule reconstruction, adapter/plugin callbacks, and bailout scenarios.
