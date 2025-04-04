#!/bin/bash
set -e

# Check if version argument is provided
if [ -z "$1" ]; then
  echo "Usage: ./release.sh <version> [patch|minor|major]"
  exit 1
fi

VERSION=$1
BUMP_TYPE=${2:-patch}

# Bump version
npm version $BUMP_TYPE --no-git-tag-version

# Update changelog (placeholder - you might want to automate this)
echo "Updating changelog..."
# TODO: Add your changelog generation command here

# Commit changes
git add package.json
git commit -m "chore: release v$VERSION"

# Create tag
git tag -a "v$VERSION" -m "Release v$VERSION"

# Push everything
git push origin main
git push origin "v$VERSION"

echo "Release v$VERSION prepared and pushed!"
echo "GitHub Actions will now handle the actual release and npm publish."
