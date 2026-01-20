---
name: create-pr
description: Create pull requests. Use when opening PRs, writing PR descriptions, or preparing changes for review.
---

# Create Pull Request

Create pull requests.

**Requires**: GitHub CLI (`gh`) authenticated and available.

## Prerequisites

Before creating a PR, ensure all changes are committed.

```bash
# Check for uncommitted changes
git status --porcelain
```

If the output shows any uncommitted changes (modified, added, or untracked files that should be included), ask whether they should be committed before proceding.

## Process

### Step 1: Verify Branch State

```bash
# Check current branch and status
git status
git log master..HEAD --oneline
```

Ensure:

- All changes are committed
- Branch is up to date with remote
- Changes are rebased on master if needed

### Step 2: Analyze Changes

Review what will be included in the PR:

```bash
# See all commits that will be in the PR
git log master..HEAD

# See the full diff
git diff master...HEAD
```

Understand the scope and purpose of all changes before writing the description.

### Step 3: Write the PR Description

Follow this structure:

```markdown
<brief description of what the PR does>

<why these changes are being made - the motivation>

<alternative approaches considered, if any>

<any additional context reviewers need>
```

**Do NOT include:**

- "Test plan" sections
- Checkbox lists of testing steps
- Redundant summaries of the diff

**Do include:**

- Clear explanation of what and why
- Context that isn't obvious from the code
- Notes on specific areas that need careful review

### Step 4: Create the PR

```bash
gh pr create --title "<type>(<scope>): <description>" --body "$(cat <<'EOF'
<description body here>
EOF
)"
```

**Title format** follows commit conventions:

- `feat(scope): Add new feature`
- `fix(scope): Fix the bug`
- `ref: Refactor something`
- `chore: Minor change`
