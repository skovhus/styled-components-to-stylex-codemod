#!/bin/sh
set -eu

echo "🔍 Checking branch..."
# check if main branch is the current branch
if [ "$(git branch --show-current)" != "main" ]; then
  echo "❌ Error: not on main branch"
  exit 1
fi
echo "✓ On main branch"

echo "🔍 Checking working tree..."
# check if main branch is clean
if ! git diff-index --quiet HEAD --; then
  echo "❌ Error: main branch is not clean"
  exit 1
fi
echo "✓ Working tree is clean"

npm login

echo ""
echo "📦 Bumping version..."
pnpm version patch -m "chore(release): v%s [skip ci]"

echo ""
echo "🚀 Publishing to npm..."
pnpm publish --no-git-checks

echo ""
echo "📤 Pushing to origin..."
git push origin HEAD:main --follow-tags

VERSION="v$(node -p "require('./package.json').version")"

echo ""
echo "📝 Creating GitHub release for $VERSION..."
gh release create "$VERSION" --generate-notes

echo ""
echo "✅ Done!"
