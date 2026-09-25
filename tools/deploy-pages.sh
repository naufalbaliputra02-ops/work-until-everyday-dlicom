#!/usr/bin/env bash
# Publish game/ to the gh-pages branch (GitHub Pages: Settings → Pages →
# "Deploy from a branch" → gh-pages / root).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SRC_SHA=$(git rev-parse --short HEAD)
WT=$(mktemp -d)
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT

if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch -q origin gh-pages
  git worktree add -q -B gh-pages "$WT" origin/gh-pages
else
  git worktree add -q --orphan -b gh-pages "$WT"
fi
find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r game/index.html game/style.css game/manifest.webmanifest game/src game/assets "$WT"/
touch "$WT/.nojekyll"
cd "$WT"
git add -A
if git diff --cached --quiet; then
  echo "gh-pages already up to date"
else
  git commit -qm "Deploy game from $SRC_SHA"
  git push -q origin HEAD:gh-pages
  echo "deployed $SRC_SHA to gh-pages"
fi
