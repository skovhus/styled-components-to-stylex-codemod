# Cross-File Dependency Resolution

**Status:** Implemented. Module resolution uses `oxc-resolver`, import scanning uses `jscodeshift`.

## Architecture

### Prepass: scan + resolve

```
src/internal/prepass/resolve-imports.ts    — oxc-resolver wrapper (ResolverFactory)
src/internal/prepass/scan-cross-file-selectors.ts — AST scanner + resolver → CrossFileInfo
```

1. `createModuleResolver()` builds a `ResolverFactory` with extension probing, tsconfig auto-discovery, and `.js`→`.ts` remapping
2. `scanCrossFileSelectors(filesToTransform, consumerPaths, resolver)` parses each file with jscodeshift, finds `${ImportedComponent}` in styled templates, resolves import specifiers to absolute paths
3. Returns `CrossFileInfo`: `selectorUsages`, `componentsNeedingStyleAcceptance`, `componentsNeedingBridge`

### Transport: options → context → state

```
run.ts          — runs prepass, passes global CrossFileInfo via jscodeshift options
transform.ts    — extracts per-file slice into TransformOptions.crossFileInfo
TransformContext — stores crossFileSelectorUsages, crossFileStyleAcceptance, crossFileMarkers
LowerRulesState  — crossFileSelectorsByLocal lookup, crossFileMarkers tracking
```

### Transform: cross-file selector handling

**`process-rules.ts`** — At the `!childDecl` bail point, checks `crossFileSelectorsByLocal`. If the unknown component is a known cross-file import:

- Proceeds with override logic (same as same-file `${Child}` handling)
- Uses a synthetic child style key based on the local name
- Registers a `defineMarker()` variable for the parent component
- Tags the `RelationOverride` as `crossFile` with `markerVarName`

**`relation-overrides.ts`** — `makeAncestorKey(pseudo, markerVarName?)` passes the marker as a second argument to `stylex.when.ancestor()` for cross-file overrides.

**`emit-styles step`** — Emits `const __ParentMarker = stylex.defineMarker()` declarations at module scope.

**`rewrite-jsx.ts`** — For cross-file parents: uses marker variable instead of `defaultMarker()`. For cross-file children: adds `{...stylex.props(styles.overrideKey)}` spread to imported component JSX.

### Example transform

```tsx
// Input
import { Icon } from "./icon";
const Btn = styled(Button)`
  ${Icon} {
    width: 18px;
  }
  &:hover ${Icon} {
    transform: rotate(180deg);
  }
`;

// Output
const __BtnMarker = stylex.defineMarker();
// ...
<button {...stylex.props(styles.btn, __BtnMarker)}>
  <Icon {...stylex.props(styles.iconInBtn)} />
</button>;

const styles = stylex.create({
  btn: {
    /* ... */
  },
  iconInBtn: {
    width: "18px",
    transform: {
      default: null,
      [stylex.when.ancestor(":hover", __BtnMarker)]: "rotate(180deg)",
    },
  },
});
```
