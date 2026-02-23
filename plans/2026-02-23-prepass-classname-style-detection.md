# Prepass className/style Prop Detection

## Context

When running the codemod with `externalInterface: "auto"`, the prepass only detects `styles: true` from `styled(Component)` calls in consumer files. It doesn't detect when consumer files (like `.stories.tsx`) pass `className` or `style` props to an imported styled component.

These consumer files are skipped entirely because they don't contain `styled-components` or `as[={]` — the rg pre-filter and Phase 1 loop both skip them.

**Example**: `ContainPaint.stories.tsx` renders `<ContainPaint style={{...}}>` but doesn't import `styled-components`. The prepass never sets `styles: true` for `ContainPaint`, so the generated wrapper lacks className/style merging.

## Changes

### `src/internal/prepass/run-prepass.ts`

Add a "Phase 1.5" targeted scan between Phase 1 and Phase 2:

1. **New state** (line ~141): `classNameStyleUsages: Map<string, Set<string>>` — maps component names to consumer file paths

2. **New Phase 1.5 block** (after line 250, before Phase 2):
   - Collect all styled component names from `styledDefFiles`
   - Use a targeted `rg` search for files containing those component names (reuses `deduplicateParentDirs` and `shellQuote`)
   - Read matching files not already in `fileContents` cache
   - Regex scan: `<(Name1|Name2)\b[^<>]*(className|style)\s*[={]` with `gs` flags
   - Also scan already-cached files for same-file detection
   - Helper: `buildClassNameStyleRe(names)` — builds the dynamic regex
   - Helper: `rgClassNameStyleFilter(files, names)` — targeted rg search (skip if >200 names)

3. **Phase 2 integration** (after as-prop block, ~line 297): Iterate `styledDefFiles`, match against `classNameStyleUsages`, verify export via `fileExports()`, verify import via `fileImportsFrom()`, set `ensure(defFile, name).styles = true`. Same pattern as as-prop resolution.

4. **Summary log update** — Add className/style count to prepass output line

### `src/__tests__/extract-external-interface.test.ts`

Add test cases:

- Cross-file: consumer passes `className=` or `style=` to imported styled component
- Consumer file with NO `styled-components` import (the critical case — skipped by Phase 1)
- Non-exported component should NOT get `styles: true`
- Multiline JSX: `<Component\n  className="...">`

## Verification

1. `pnpm run ci` — all tests, lint, typecheck, build pass
2. New prepass tests validate cross-file className/style detection
3. `DEBUG_CODEMOD=1` can be used to inspect prepass results
