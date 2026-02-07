# Cursor Notes

### Playground: URL parameters

The playground UI is fully URL-driven (no local-only UI state for view toggles), so you can deep-link to a specific test case and presentation mode.

#### Full-screen rendering (previews only)

To show **only the rendered previews** (no code editors) for a given test case, use:

- `testCase=<name>`: selects the test case
- `hideCode` (presence-only): hides editors and makes the rendering panel fill the page

Example:

- `/styled-components-to-stylex-codemod/?testCase=wrapper-noChildren&hideCode`

Notes:

- `hideCode` implicitly enables rendering (you don’t need `showRendering`).
- `_unsupported.*` fixtures are intentionally not rendered in the playground.

#### Other toggles

- Rendering is **enabled by default**.
- `showRendering=0` (explicit value): disable the rendering panel while keeping editors visible
- `showConfig` (presence-only): show the adapter configuration panel

Example:

- `/styled-components-to-stylex-codemod/?testCase=wrapper-noChildren&showConfig`
- `/styled-components-to-stylex-codemod/?testCase=wrapper-noChildren&showRendering=0`

#### Legacy params

Older links may include `view=rendering`, `render=1`, or `config=1`. These are still recognized on load, but the playground will rewrite the URL to the canonical params above.
