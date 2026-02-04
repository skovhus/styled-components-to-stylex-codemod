---
name: Limit external interface
overview: Update adapter external interface typing and wrapper emission to support className-only external styling, drop external style prop support, and align stylexProps/merger usage and docs accordingly while keeping inline style attributes for dynamic values.
todos:
  - id: update-external-interface
    content: Switch ExternalInterfaceResult to className-only and update adapters/docs.
    status: pending
  - id: disable-style-prop
    content: Remove external style prop handling in analysis/emission.
    status: pending
  - id: adjust-tests
    content: Update tests/fixtures for new stylexProps signature.
    status: pending
  - id: run-ci
    content: Run pnpm run ci.
    status: pending
isProject: false
---

# Limit external interface

## Key context

- `ExternalInterfaceResult` currently models `styles` (className+style) and `as` support in `src/adapter.ts`, and the analyzer reads it to set `supportsExternalStyles` and `supportsAsProp`.
- Wrapper emission decides whether to destructure/merge `className`/`style` based on `shouldAllowClassNameProp`/`shouldAllowStyleProp` and uses `emitStyleMerging` to build merge logic.

```164:175:/Users/kenneth/work/styled-components-to-stylex-codemod/src/adapter.ts
/**
 * Result type for `adapter.externalInterface(...)`.
 *
 * - `null` → no external interface support (neither styles nor `as`)
 * - `{ styles: true }` → enable className/style support AND polymorphic `as` prop
 * - `{ styles: false, as: true }` → enable only polymorphic `as` prop (no style merging)
 * - `{ styles: false, as: false }` → equivalent to `null`
 */
export type ExternalInterfaceResult = { styles: true } | { styles: false; as: boolean } | null;
```

```188:210:/Users/kenneth/work/styled-components-to-stylex-codemod/src/internal/emit-wrappers/wrapper-emitter.ts
  /**
   * Decide whether a wrapper component should accept/merge external `className`/`style`.
   */
  shouldAllowClassNameProp(d: StyledDecl): boolean {
    if (d.supportsExternalStyles) {
      return true;
    }
    if ((d as any).usedAsValue) {
      return true;
    }
    const used = this.getUsedAttrs(d.localName);
    return used.has("*") || used.has("className");
  }

  shouldAllowStyleProp(d: StyledDecl): boolean {
    if (d.supportsExternalStyles) {
      return true;
    }
    if ((d as any).usedAsValue) {
      return true;
    }
    const used = this.getUsedAttrs(d.localName);
    return used.has("*") || used.has("style");
  }
```

## Plan

- Update external interface typing and adapter docs to className-only support.

        - Change `ExternalInterfaceResult` to `{ className: true } | { className: false; as: boolean }` (no `styles` key).
        - Update inline docs/comments in `src/adapter.ts` and README sections describing `externalInterface` and style merging to reference `className` only and explicitly drop external `style` prop support.
        - Update fixture adapter and any tests/fixtures to return the new shape (replace `styles: true` with `className: true`, and replace `null` with `{ className: false, as: false }` where needed).

- Adjust analysis and wrapper emission to stop allowing external `style` props while keeping inline style attributes.

        - In `src/internal/transform-steps/analyze-before-emit.ts`, map the new `className` property to `supportsExternalStyles` and keep `as` gating; remove reliance on `styles`.
        - Update `shouldAllowStyleProp` in `src/internal/emit-wrappers/wrapper-emitter.ts` to always return `false` so external `style` is never permitted; keep inline `style` attributes generated from `inlineStyleProps`.
        - Update `emitStyleMerging` (`src/internal/emit-wrappers/style-merger.ts`) and related callers in `emit-component.ts`/`emit-intrinsic.ts` to remove the external `style` argument from the merger call (so `stylexProps(styles, className)`), while still emitting `style={{...}}` when `inlineStyleProps` exist.

- Update tests and expectations for stylexProps usage and external interface behavior.

        - Fix `src/__tests__/transform.test.ts` expectations referencing `stylexProps(..., className, style)` to the new signature and update any fixtures using `styles: true`.
        - Regenerate or update relevant test-case outputs that include external style prop merging to reflect className-only merging.

- Validation - Run `pnpm run ci` per repo rules.

## Likely touchpoints

- `/Users/kenneth/work/styled-components-to-stylex-codemod/src/adapter.ts`
- `/Users/kenneth/work/styled-components-to-stylex-codemod/src/internal/transform-steps/analyze-before-emit.ts`
- `/Users/kenneth/work/styled-components-to-stylex-codemod/src/internal/emit-wrappers/style-merger.ts`
- `/Users/kenneth/work/styled-components-to-stylex-codemod/src/internal/emit-wrappers/emit-component.ts`
- `/Users/kenneth/work/styled-components-to-stylex-codemod/src/internal/emit-wrappers/emit-intrinsic.ts`
- `/Users/kenneth/work/styled-components-to-stylex-codemod/src/internal/emit-wrappers/wrapper-emitter.ts`
- `/Users/kenneth/work/styled-components-to-stylex-codemod/src/__tests__/fixture-adapters.ts`
- `/Users/kenneth/work/styled-components-to-stylex-codemod/src/__tests__/transform.test.ts`
- `/Users/kenneth/work/styled-components-to-stylex-codemod/README.md`
