# Plan: Eliminate large argument bag anti-pattern

## Problem

Core fields like `j`, `filePath`, `parseExpr`, `resolverImports` are passed individually at every call site instead of being encapsulated in a shared context. Across `src/internal/lower-rules/` alone:

| Field             | Occurrences | Files |
| ----------------- | ----------- | ----- |
| `j`               | 57          | 19    |
| `filePath`        | 69          | 13    |
| `parseExpr`       | 55          | 12    |
| `resolverImports` | 52          | 12    |

Worst offender: `css-helper-conditional.ts` has 11 occurrences of each — mostly from 6+ identical `resolveTemplateLiteralBranch({j, filePath, parseExpr, ...12 fields})` calls.

## Approach: Two context tiers

The codebase already has the right layered architecture (`TransformContext → LowerRulesState → DeclProcessingState`). The problem is that downstream functions define their **own** overlapping context types instead of accepting `DeclProcessingState` (or a Pick of it). The fix is straightforward:

### Tier 1: `DeclProcessingState` for handler factories

`createValuePatternHandlers`, `createCssHelperHandlers`, and `createCssHelperConditionalHandler` each define 18-27 field context types that are subsets of `DeclProcessingState`. Change them to accept `Pick<DeclProcessingState, ...>` instead.

### Tier 2: Small shared context for leaf functions

`resolveTemplateLiteralBranch` and `resolveTemplateLiteralValue` are called 6+ times with the same 9 shared fields. Extract a `TemplateLiteralContext` built once and reused at each call site.

---

## Phase 1: Template literal context (highest repetition)

**Files:**

- `src/internal/lower-rules/template-literals.ts` — define `TemplateLiteralContext`, update function signatures
- `src/internal/lower-rules/css-helper-conditional.ts` — build context once, update 6+ call sites
- `src/internal/lower-rules/css-helper-handlers.ts` — update 2 `resolveTemplateLiteralValue` call sites

### Step 1a: Define `TemplateLiteralContext` in `template-literals.ts`

```typescript
export type TemplateLiteralContext = {
  j: JSCodeshift;
  filePath: string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  resolveValue: Adapter["resolveValue"];
  resolveCall: Adapter["resolveCall"];
  resolveImportInScope: ResolveImportInScope;
  resolverImports: Map<string, ImportSpec>;
  componentInfo: ComponentInfo;
  handlerContext: InternalHandlerContext;
};
```

### Step 1b: Update `resolveTemplateLiteralBranch` signature

```typescript
// Before:
export function resolveTemplateLiteralBranch(args: TemplateLiteralBranchArgs)

// After:
export function resolveTemplateLiteralBranch(
  ctx: TemplateLiteralContext,
  args: { node: TemplateLiteral; paramName: string | null },
)
```

### Step 1c: Update `resolveTemplateLiteralValue` signature

```typescript
// Before:
export function resolveTemplateLiteralValue(args: TemplateLiteralValueArgs)

// After:
export function resolveTemplateLiteralValue(
  ctx: TemplateLiteralContext,
  args: { tpl: TemplateLiteral; property: string },
)
```

### Step 1d: In `css-helper-conditional.ts`, build context once

In `createCssHelperConditionalHandler`, after destructuring `args`, build:

```typescript
const tplCtx: TemplateLiteralContext = {
  j, filePath, parseExpr, resolveValue, resolveCall,
  resolveImportInScope, resolverImports, componentInfo, handlerContext,
};
```

Then all 6+ call sites become:

```typescript
// Before (12 fields):
resolveTemplateLiteralBranch({ j, node: body.right, paramName, filePath, parseExpr, resolveValue, resolveCall, resolveImportInScope, resolverImports, componentInfo, handlerContext })

// After (2 args):
resolveTemplateLiteralBranch(tplCtx, { node: body.right, paramName })
```

### Step 1e: In `css-helper-handlers.ts`, same pattern for `resolveTemplateLiteralValue`

Build `tplCtx` once, update 2 call sites.

**Run `pnpm check` to validate.**

---

## Phase 2: Handler factory contexts → Pick from DeclProcessingState

**Files:**

- `src/internal/lower-rules/decl-setup.ts` — update 3 factory call sites
- `src/internal/lower-rules/css-helper-conditional.ts` — replace `CssHelperConditionalContext` with Pick
- `src/internal/lower-rules/css-helper-handlers.ts` — replace `CssHelperHandlersContext` with Pick
- `src/internal/lower-rules/value-patterns.ts` — replace `ValuePatternContext` with Pick

### Step 2a: Replace `CssHelperConditionalContext`

```typescript
// Before (27-field standalone type):
export type CssHelperConditionalContext = { j, decl, filePath, warnings, ... 23 more };

// After (Pick from DeclProcessingState + extras from LowerRulesState):
export function createCssHelperConditionalHandler(
  dps: Pick<DeclProcessingState,
    | 'j' | 'decl' | 'filePath' | 'warnings' | 'parseExpr'
    | 'resolveValue' | 'resolveCall' | 'resolveImportInScope'
    | 'resolverImports' | 'componentInfo' | 'handlerContext'
    | 'styleObj' | 'styleFnFromProps' | 'styleFnDecls'
    | 'inlineStyleProps' | 'isCssHelperTaggedTemplate'
    | 'resolveCssHelperTemplate' | 'resolveStaticCssBlock'
    | 'isPlainTemplateLiteral' | 'isThemeAccessTest'
    | 'applyVariant' | 'dropAllTestInfoProps'
    | 'annotateParamFromJsxProp' | 'markBail'
    | 'extraStyleObjects'
  > & { resolvedStyleObjects: Map<string, unknown> }
)
```

### Step 2b: Update call site in `decl-setup.ts`

Since `createDeclProcessingState` already has all these fields as locals, we can spread or pass them directly. The simplest approach: build and return the `DeclProcessingState` object first, then pass it to the factories.

This requires restructuring `createDeclProcessingState` slightly — the factories are currently called _during_ construction (their return values become part of `DeclProcessingState`). So we'd pass `Pick` of the already-available fields.

Alternatively, define a named intermediate object:

```typescript
const shared = { j, filePath, warnings, parseExpr, resolveValue, resolveCall, ... };
createCssHelperConditionalHandler({ ...shared, decl, styleObj, ... });
```

### Step 2c: Apply same to `createValuePatternHandlers` and `createCssHelperHandlers`

Same Pick approach, replace standalone context types.

**Run `pnpm check` to validate.**

---

## Phase 3: Border handler context

**Files:**

- `src/internal/lower-rules/borders.ts` — split function signature into `(ctx, args)`
- `src/internal/lower-rules/rule-interpolated-declaration.ts` — build context once, update call site

### Step 3a: Split `tryHandleInterpolatedBorder` signature

Separate the 22 fields into shared context (built once in the loop caller) vs per-iteration args (`d`, `selector`, `atRuleStack`, `applyResolvedPropValue`).

**Run `pnpm check` to validate.**

---

## Verification

After each phase:

```bash
pnpm check   # lint + tsc + tests
```

No behavioral changes — purely structural refactoring. All existing tests must continue to pass unchanged.

## What this does NOT change

- `TransformContext` and `LowerRulesState` construction (already well-structured)
- Functions outside `src/internal/lower-rules/` (e.g., `css-vars.ts`, `transform-css-vars.ts` — moderate offenders but lower priority)
- The return shape of `DeclProcessingState` (only how it's consumed by factories)
