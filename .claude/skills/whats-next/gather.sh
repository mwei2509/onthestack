#!/usr/bin/env bash
# Prints the repo's live work state for the whats-next skill. Read-only.
set -euo pipefail
cd "$(git rev-parse --path-format=absolute --git-common-dir)/.."
git fetch -q origin

echo "## Open PRs (base, then files changed)"
gh pr list --state open --json number,title,headRefName,baseRefName \
  --jq '.[] | "#\(.number) \(.headRefName) -> \(.baseRefName): \(.title)"' |
while read -r line; do
  echo "$line"
  n=${line%% *}; n=${n#\#}
  gh pr view "$n" --json files --jq '.files[].path' | sed 's/^/    /'
done

echo
echo "## Recently merged"
gh pr list --state merged --limit 15 \
  --json number,title,mergedAt --jq '.[] | "#\(.number) \(.mergedAt[0:16]) \(.title)"'

echo
echo "## Open issues"
gh issue list --state open --limit 100 --json number,title,labels \
  --jq '.[] | "#\(.number) [\([.labels[].name]|join(","))] \(.title)"'

echo
echo "## Worktrees (branch, uncommitted files, last commit, PR state)"
git worktree list --porcelain | awk '/^worktree/{print $2}' | tail -n +2 |
while read -r wt; do
  b=$(git -C "$wt" branch --show-current)
  dirty=$(git -C "$wt" status --porcelain | wc -l | tr -d ' ')
  last=$(git -C "$wt" log -1 --format=%cr)
  pr=$(gh pr list --head "$b" --state all --limit 1 --json number,state --jq '.[0] // empty | "#\(.number) \(.state)"' 2>/dev/null)
  echo "$b  dirty=$dirty  last=$last  pr=${pr:-none}"
  if [ "$dirty" -gt 0 ]; then git -C "$wt" status --porcelain | sed 's/^/    /'; fi
done
