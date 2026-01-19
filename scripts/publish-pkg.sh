set -euo pipefail

# check if main branch is the current branch
if [ "$(git branch --show-current)" != "main" ]; then
  echo "Error: not on main branch"
  exit 1
fi

# check if main branch is clean
if ! git diff-index --quiet HEAD --; then
  echo "Error: main branch is not clean"
  exit 1
fi

pnpm version patch -m "chore(release): v%s [skip ci]"

pnpm publish --no-git-checks

git push origin HEAD:main --follow-tags
