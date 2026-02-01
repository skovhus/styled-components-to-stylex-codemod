# Agent Guidelines

This file provides workflow guidelines for AI agents working on this codebase. All agents should follow these steps to ensure consistent, high-quality contributions.

## Post-Implementation Workflow

After implementing any feature, fixing a bug, or making significant changes, agents MUST complete these steps:

### 1. Validate Changes

```bash
pnpm check
```

Ensure all linting, type checking, and tests pass before proceeding.

### 2. Run Code Quality Refactoring

**REQUIRED**: Use the [refactor-code-quality](.claude/skills/refactor-code-quality/SKILL.md) skill to:

- Remove code duplication
- Extract shared patterns to reusable helpers
- Eliminate `any` types
- Remove type assertions (`as Type`)
- Remove non-null assertions (`!`)

This step ensures the codebase maintains its principles of modularization and type safety.

### 3. Commit and Push

Make atomic commits with descriptive messages:

```bash
git add <files>
git commit -m "<type>(<scope>): <description>"
git push
```

## Available Skills

| Skill | When to Use |
|-------|-------------|
| [refactor-code-quality](skills/refactor-code-quality/SKILL.md) | After implementing any feature - remove duplication and ensure type safety |
| [address-review-comments](skills/address-review-comments/SKILL.md) | When addressing PR review comments using test-driven approach |
| [create-pr](skills/create-pr/SKILL.md) | When creating pull requests |

## Code Quality Standards

From [CLAUDE.md](../CLAUDE.md):

- **No code duplication** - Prefer iteration and modularization
- **Unify and abstract** - Use existing helpers; extend rather than duplicate
- **No `any` types** - Always use proper type definitions
- **No type assertions** - Avoid `as` and `!`; use type guards instead
- **Exports at top** - Keep exports after imports, helpers below

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT WORKFLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Implement Feature/Fix                                       │
│         │                                                       │
│         ▼                                                       │
│  2. Run: pnpm check                                             │
│         │                                                       │
│         ▼                                                       │
│  3. Use: refactor-code-quality skill  ◄─── REQUIRED             │
│         │                                                       │
│         ▼                                                       │
│  4. Run: pnpm check (again)                                     │
│         │                                                       │
│         ▼                                                       │
│  5. Commit & Push                                               │
│         │                                                       │
│         ▼                                                       │
│  6. Create PR (if ready) ──► Use: create-pr skill               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
