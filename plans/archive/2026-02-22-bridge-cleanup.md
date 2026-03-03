# Plan: Clean up stale bridge artifacts when consumers are later transformed

## Problem

When a styled-component target is transformed while its consumer stays as styled-components, the codemod creates **bridge artifacts**:

1. **Target file**: A deterministic `className` baked into the element (e.g. `sc2sx-BridgeIcon-285af2b1`) + a `GlobalSelector` export
2. **Consumer file**: Import of `BridgeIconGlobalSelector` and selector rewrite `${BridgeIconGlobalSelector}`

When the consumer is **later** transformed (in a subsequent codemod run), it switches to the marker-based path (`stylex.defineMarker()` + `stylex.when.ancestor()`). But the bridge artifacts from the first run are never cleaned up:

- The `GlobalSelector` export remains on the target
- The bridge `className` remains hardcoded on the target element
- If there are other unconverted consumers, removing these prematurely would break them

## Scenario walkthrough

```
Run 1: transform target.tsx only (consumer.tsx in consumerPaths)
  → target.tsx gets bridge className + GlobalSelector export
  → consumer.tsx is patched: ${Icon} → ${IconGlobalSelector}

Run 2: transform both target.tsx and consumer.tsx
  → consumer.tsx is now fully transformed (marker path)
  → target.tsx still has the stale bridge className + GlobalSelector export
  → No one references IconGlobalSelector anymore (or maybe other consumers still do)
```

## Design

### When to clean up

Bridge artifacts on a target should be removed when **no remaining unconverted consumer** references that component as a cross-file selector. The prepass already computes `componentsNeedingGlobalSelectorBridge` (target → set of component names needed by unconverted consumers). If a component that previously had a bridge is no longer in that set, its bridge artifacts are stale.

### What to clean up

For each stale bridge component on a target file:

1. **Remove the `GlobalSelector` export** — `export const FooGlobalSelector = ".sc2sx-Foo-...";`
2. **Remove the bridge className** from the element — the `sc2sx-Foo-...` class in the className join expression
3. **Clean up consumer imports** — remove `FooGlobalSelector` from import statements of any consumer that was just transformed (it now uses the marker path)

### Implementation approach

#### Phase 1: Detect stale bridges (in `run.ts`, post-transform)

After the per-file transform completes:

1. Collect the set of components that **still** need bridges: `componentsNeedingGlobalSelectorBridge` from the prepass result (this only includes unconverted consumers)
2. For each transformed target file, check if it has existing bridge artifacts (a `GlobalSelector` export and/or `sc2sx-` className) for components **not** in the still-needed set
3. Those are stale and should be cleaned up

Detection can use a simple AST scan or regex on the already-transformed target source:

- `export const <Name>GlobalSelector = ".sc2sx-` → bridge export present
- Cross-reference with `componentsNeedingGlobalSelectorBridge`: if the target file is **not** in that map (or the component name is not in the set), the bridge is stale

#### Phase 2: Remove stale artifacts from target files

Create a new post-transform step (or extend existing logic in `run.ts`):

```
cleanStaleBridgeArtifacts(targetPath, staleComponentNames)
```

For each stale component name:

1. **Remove the `GlobalSelector` export statement** — find and delete the `export const <Name>GlobalSelector = "..."` declaration (including the `@deprecated` JSDoc comment above it)
2. **Remove the bridge className from the element** — find the `sc2sx-<Name>-<hash>` string in the className construction and remove it. The className join pattern looks like:
   ```tsx
   className={["sc2sx-Foo-abc123", sx.className].filter(Boolean).join(" ")}
   ```
   When the bridge class is removed, simplify back to just `{...sx}` (no manual className merge)

This can be done via jscodeshift AST manipulation (more robust) or string-based patching (simpler, since the patterns are deterministic).

#### Phase 3: Clean up consumer imports

For consumers that were just transformed (they're in `filesToTransform` and the transform succeeded), remove any leftover `GlobalSelector` imports. The transform itself produces marker-based code, so any `GlobalSelector` import is dead. This cleanup can happen:

- During the transform itself (the per-file transform could strip `GlobalSelector` imports it recognizes as bridge artifacts)
- Or as a post-transform pass (simpler, avoids complicating the per-file transform)

### Edge cases

1. **Multiple consumers, only some transformed**: If target has 3 consumers and only 2 are transformed, the bridge must stay for the remaining unconverted consumer. The prepass correctly tracks this — `componentsNeedingGlobalSelectorBridge` only lists components still needed by unconverted consumers.

2. **Target re-transformed**: If the target is re-run through the codemod, it's already StyleX — the codemod should skip it (no `styled-components` import). The bridge artifacts would persist as dead code. The cleanup should handle this case by scanning for `GlobalSelector` exports even on already-transformed files.

3. **Bridge className used in tests or external code**: The `@deprecated` JSDoc is the signal. Cleanup should log a warning, not silently remove. Consider a `--cleanup-bridges` flag or making it opt-in initially.

4. **Sidecar `.stylex.ts` files**: Marker sidecars are created for the marker path. If a target previously had no sidecar (bridge-only) and now needs one (marker path), the sidecar is created during the normal transform. No special handling needed.

### File changes

| File                                       | Change                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `src/run.ts`                               | Add post-transform bridge cleanup phase after line ~469                                               |
| `src/internal/bridge-cleanup.ts` (new)     | `cleanStaleBridgeArtifacts()` — remove GlobalSelector exports and bridge classNames from target files |
| `src/__tests__/cross-file-prepass.test.ts` | Add tests for the cleanup scenario                                                                    |

### Testing

1. **Unit test**: Transform a target with bridge artifacts, then re-run with the consumer now in `filesToTransform` — verify bridge artifacts are removed from the target
2. **Integration test**: Two-pass scenario:
   - Pass 1: transform target only → bridge created
   - Pass 2: transform both → bridge cleaned up, marker path used
3. **Partial cleanup test**: 3 consumers, transform 2 → bridge stays for the remaining 1

## Alternatives considered

### A. Do nothing (status quo)

Bridge artifacts are dead code but harmless. The `@deprecated` JSDoc signals intent. Downside: accumulated dead code across a large migration, confusing for developers reading the output.

### B. Separate cleanup script

A standalone `cleanup-bridges` script that scans for stale `GlobalSelector` exports. Simpler to implement but requires manual invocation and doesn't integrate with the codemod workflow.

### C. knip / dead code analysis

Rely on existing dead code tools to flag unused `GlobalSelector` exports. Works but doesn't remove the className from the element, which is the more impactful artifact (runtime cost of an unnecessary class).

## Recommendation

Implement Phase 1 + 2 (detect + remove from target). Phase 3 (consumer import cleanup) is lower priority since the transform already produces correct code — the stale import is just dead code that linters/knip can catch.
