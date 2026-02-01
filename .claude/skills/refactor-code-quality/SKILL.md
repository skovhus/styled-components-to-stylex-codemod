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

### Step 1: Identify All Changed Files on Branch

```bash
# See all files changed on this branch compared to main
git diff origin/main --name-only

# See the full diff of all changes on the branch
git diff origin/main
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
# Find existing utility functions in src/
rg "^export (function|const)" src/ --type ts

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

**Note:** jscodeshift's AST types can make some patterns difficult to type precisely. In cases where jscodeshift's type definitions are incomplete or overly broad, a well-placed type assertion may be acceptable if it improves code clarity. Prefer narrowing with type guards when possible, but don't contort the code just to avoid a single assertion in AST manipulation code.

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

#### 4b. Use Data-Driven Approaches

Replace repetitive conditionals (switch statements, if-chains) with lookup tables or maps.

### Step 5: Ensure Proper Type Definitions

- **Replace `any`** with proper interfaces, type aliases, or generics where feasible
- **Replace type assertions (`as`)** with type guards that narrow types safely
- **Replace non-null assertions (`!`)** with proper null checks and early returns

Note: Some jscodeshift AST patterns are difficult to type precisely. Accept minimal, well-placed assertions when they improve clarity over convoluted type gymnastics.

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

Ensure exports are at the top of files (after imports), with non-exported helpers further down.

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
- [ ] No unnecessary `any` types (some jscodeshift patterns may require them)
- [ ] Type assertions minimized and justified (AST manipulation may need some)
- [ ] No unnecessary non-null assertions (`!`)
- [ ] Exports are at the top of each file
- [ ] `pnpm check` passes
- [ ] Helper functions have descriptive names
