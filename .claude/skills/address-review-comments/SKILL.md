---
name: address-review-comments
description: Address PR review comments following test-driven approach. Use when fixing issues raised in code reviews.
---

# Address Review Comments

Address PR review comments using a test-driven approach: document the issue first, then fix it.

**Requires**: GitHub CLI (`gh`) authenticated and available.

## Process

### Step 1: Fetch Review Comments

```bash
# Get PR number for current branch
gh pr view --json number,url,reviewDecision,reviews

# Get detailed review comments
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments
```

### Step 2: Analyze Each Comment

For each review comment:

1. **Understand the issue** - What behavior is wrong or missing?
2. **Verify validity** - Is this a real bug or a misunderstanding?
3. **Identify the scope** - What code paths are affected?

### Step 3: Write a Failing Test First (Red)

**This is the critical step.** Before making any code changes, document the issue as a test:

**Prefer (in order):**

1. **Extend existing test case** - If there's a related `.input.tsx`/`.output.tsx` test case, extend it
2. **Create new test case** - If the issue warrants a separate scenario, create new test case files
3. **Add unit test** - For edge cases or internal functions, add a unit test in `src/__tests__/`

**Test case example:**

```typescript
// In src/__tests__/transform.test.ts
describe("issue description", () => {
  it("should handle the specific case mentioned in review", () => {
    const source = `
// Minimal reproduction of the issue
import styled from "styled-components";
const Component = styled.div\`...\`;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Assert the expected behavior
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("expected output");
  });
});
```

**Verify the test fails:**

```bash
pnpm test:run
```

The test should fail, confirming the issue exists.

### Step 4: Fix the Code (Green)

Now implement the fix:

1. Locate the relevant source code
2. Make the minimal change needed to fix the issue
3. Run tests to verify the fix works

```bash
pnpm test:run
```

### Step 5: Regenerate Test Case Outputs (if applicable)

If you added a new test case or modified existing ones:

```bash
# For a specific test case
node scripts/regenerate-test-case-outputs.mts --only <case-name>

# Verify the output is correct
cat test-cases/<case-name>.output.tsx
```

### Step 6: Run Full Validation

```bash
pnpm check
```

This runs:

- Linting (oxlint + eslint)
- Type checking (tsc)
- All tests (vitest)
- Knip (dead code detection)
- Storybook build (visual verification)

### Step 7: Commit and Push

```bash
git add <files>
git commit -m "fix: <description>

Addresses review comment: <brief summary>
"
git push
```

### Step 8: Run Code Quality Refactoring

After addressing review feedback, run the [refactor-code-quality](.claude/skills/refactor-code-quality/SKILL.md) skill to:

- Remove any code duplication introduced by the fix
- Extract shared patterns if applicable
- Ensure type safety (minimize `any` and type assertions)

This is especially important if the fix required changes across multiple files or added new helper functions.

```bash
# Run full validation again after refactoring
pnpm check
```
