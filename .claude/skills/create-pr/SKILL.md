---
name: create-pr
description: Create pull requests. Use when opening PRs, writing PR descriptions, or preparing changes for review.
---

# Create Pull Request

Create pull requests.

**Requires**: GitHub CLI (`gh`) authenticated and available.

## Process

### Step 1: Check Current Branch

```bash
git branch --show-current
```

**IMPORTANT**: If you are on `main` or `master`, you MUST create a feature branch before committing:

```bash
# Create and switch to a feature branch
git checkout -b feat/<descriptive-name>
```

Use a descriptive branch name like:

- `feat/add-user-authentication`
- `fix/null-pointer-in-parser`
- `refactor/extract-helper-functions`

**Never commit directly to main/master when preparing a PR.**

### Step 2: Stage and Commit Changes

```bash
# Check for uncommitted changes
git status --porcelain
```

If there are uncommitted changes, stage and commit them:

```bash
git add <files>
git commit -m "<type>(<scope>): <description>"
```

### Step 3: Push Branch and Verify State

```bash
# Push branch to remote (creates it if needed)
git push -u origin $(git branch --show-current)

# Verify commits that will be in the PR
git log origin/main..HEAD --oneline
```

Ensure:

- All changes are committed
- Branch is pushed to remote
- You're not on main/master

### Step 4: Analyze Changes

Review what will be included in the PR:

```bash
# See all commits that will be in the PR
git log origin/main..HEAD

# See the full diff
git diff origin/main...HEAD
```

Understand the scope and purpose of all changes before writing the description.

### Step 5: Write the PR Description

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

### Step 6: Create the PR

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
