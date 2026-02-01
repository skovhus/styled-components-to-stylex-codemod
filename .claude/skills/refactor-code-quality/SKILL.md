---
name: refactor-code-quality
description: Remove code duplication, extract shared patterns, and eliminate type casts and `any` types. Run after implementing new features.
---

# Refactor for Code Quality

After implementing a feature, review the changes to remove code duplication, extract shared patterns, and ensure type safety. This skill enforces the codebase's core principles of modularization and type correctness.

## When to Use

- **After implementing any new feature** - Review all changed files
- **After fixing bugs** - Check if the fix introduced duplication
- **During code review** - Identify patterns that should be shared
- **Proactively** - Periodically audit the codebase for accumulated duplication

## Process

### Step 1: Identify Changed Files

```bash
# See all files changed compared to main
git diff origin/main --name-only

# Or see recent changes in current branch
git diff HEAD~5 --name-only
```

### Step 2: Analyze for Code Duplication

Look for these patterns in the changed code:

#### 2a. Repeated Logic Blocks

Search for similar code patterns:

```bash
# Look for similar function structures
rg "function.*\(" --type ts -l

# Look for repeated patterns (example: similar conditionals)
rg "if.*===.*null" --type ts -C 2
```

**Signs of duplication:**

- Multiple functions with similar structure but different details
- Copy-pasted code blocks with minor modifications
- Switch statements or if-chains that could be data-driven
- Similar error handling patterns repeated across files

#### 2b. Parallel Logic Instead of Shared Utilities

Check if new code duplicates existing helpers:

```bash
# Find existing utility functions
rg "^export (function|const)" src/internal/ --type ts

# Check for similar patterns to what you just added
rg "<pattern-from-your-code>" src/
```

**Questions to ask:**

- Does a helper already exist that does something similar?
- Can an existing helper be extended to cover the new case?
- Should this logic be extracted to a shared utility?

### Step 3: Analyze for Type Safety Issues

#### 3a. Find `any` Types

```bash
# Search for any types in changed files
rg ": any" --type ts
rg "as any" --type ts
rg "<any>" --type ts
```

**Fix by:**

- Defining proper interfaces or type aliases
- Using generics for flexible but type-safe code
- Using `unknown` with type guards when type is truly unknown

#### 3b. Find Type Assertions

```bash
# Search for type assertions
rg " as [A-Z]" --type ts
rg "(<[A-Z][a-zA-Z]*>)" --type ts

# Search for non-null assertions
rg "!\." --type ts
rg "!\[" --type ts
rg "!;" --type ts
```

**Fix by:**

- Adding proper null checks with early returns
- Using optional chaining (`?.`) where appropriate
- Narrowing types with type guards
- Fixing the source of the type uncertainty

### Step 4: Refactor to Remove Duplication

#### 4a. Extract Shared Functions

When you find duplicated logic:

1. **Identify the common pattern** - What's the same across all instances?
2. **Identify the variations** - What differs? These become parameters.
3. **Create or extend a helper** - Place it in the appropriate module:
   - `src/internal/` for internal utilities
   - Near the code that uses it if only used in one area

**Example refactoring:**

```typescript
// BEFORE: Duplicated logic
function handleBorder(node: Node) {
  if (node.type === "Literal" && typeof node.value === "string") {
    return parseBorder(node.value);
  }
  return null;
}

function handleMargin(node: Node) {
  if (node.type === "Literal" && typeof node.value === "string") {
    return parseMargin(node.value);
  }
  return null;
}

// AFTER: Shared helper
function extractStringValue(node: Node): string | null {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return null;
}

function handleBorder(node: Node) {
  const value = extractStringValue(node);
  return value ? parseBorder(value) : null;
}

function handleMargin(node: Node) {
  const value = extractStringValue(node);
  return value ? parseMargin(value) : null;
}
```

#### 4b. Use Data-Driven Approaches

Replace repetitive conditionals with lookup tables:

```typescript
// BEFORE: Repetitive switch
switch (prop) {
  case "marginTop":
    return "mt";
  case "marginBottom":
    return "mb";
  case "marginLeft":
    return "ml";
  case "marginRight":
    return "mr";
  // ... many more cases
}

// AFTER: Data-driven
const PROP_TO_ABBREVIATION: Record<string, string> = {
  marginTop: "mt",
  marginBottom: "mb",
  marginLeft: "ml",
  marginRight: "mr",
  // ... more mappings
};

return PROP_TO_ABBREVIATION[prop];
```

### Step 5: Ensure Proper Type Definitions

#### 5a. Replace `any` with Proper Types

```typescript
// BEFORE
function process(data: any): any {
  return data.value;
}

// AFTER
interface ProcessInput {
  value: string;
}

function process(data: ProcessInput): string {
  return data.value;
}
```

#### 5b. Replace Type Assertions with Type Guards

```typescript
// BEFORE: Unsafe assertion
const element = node as Element;
element.setAttribute("class", "foo");

// AFTER: Safe type guard
function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

if (isElement(node)) {
  node.setAttribute("class", "foo");
}
```

#### 5c. Replace Non-null Assertions with Proper Checks

```typescript
// BEFORE: Unsafe non-null assertion
const parent = node.parent!;
processParent(parent);

// AFTER: Safe null check
const parent = node.parent;
if (!parent) {
  return; // or throw with a clear error message
}
processParent(parent);
```

### Step 6: Verify Changes

Run the full validation suite:

```bash
pnpm check
```

This ensures:

- No type errors introduced
- No lint violations
- All tests still pass
- No dead code created

### Step 7: Review Export Organization

Ensure exports are at the top of files (after imports):

```typescript
// imports first
import { something } from "./somewhere";

// exports immediately after
export { publicFunction, PublicType };
export type { PublicInterface };

// then implementations
function publicFunction() {
  // ...
}

// private helpers at the bottom
function privateHelper() {
  // ...
}
```

### Step 8: Commit Refactoring Separately

Keep refactoring commits separate from feature commits for cleaner history:

```bash
git add <refactored-files>
git commit -m "refactor: extract shared helper for <pattern>

- Reduces duplication in <files>
- Adds proper types for <area>
"
git push
```

## Checklist

Before considering the refactoring complete:

- [ ] No duplicated logic blocks across files
- [ ] Similar patterns use shared helpers
- [ ] No `any` types in changed code
- [ ] No type assertions (`as Type`) in changed code
- [ ] No non-null assertions (`!`) in changed code
- [ ] Exports are at the top of each file
- [ ] `pnpm check` passes
- [ ] Helper functions have descriptive names
