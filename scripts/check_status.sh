#!/usr/bin/env bash
# Reports whether an unattended resume would be allowed right now. Exit 0 = may resume,
# 10 = skip (active session / nothing to do), 20 = blocked (needs a human).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 20
say() { printf '[check_status] %s\n' "$*"; }

if pgrep -x claude >/dev/null 2>&1 || pgrep -f 'claude-code' >/dev/null 2>&1; then
  say "an interactive Claude Code session is active — skip"; exit 10
fi
[ -f docs/RESUME.md ] || { say "docs/RESUME.md missing — blocked"; exit 20; }
if grep -qiE '^\s*status:\s*(blocked|awaiting approval|complete)' docs/RESUME.md; then
  say "RESUME.md says blocked/awaiting approval/complete — skip"; exit 10
fi
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { say "not a git repo — blocked"; exit 20; }
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "main" ] && { say "on protected main — blocked (work happens on feature branches)"; exit 20; }
if [ -n "$(git status --porcelain)" ]; then
  say "uncommitted changes present on $branch — blocked (a human should inspect)"; exit 20
fi
ahead=$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo "?")
say "branch=$branch commits-not-pushed=$ahead; checkpoint present — may resume"
exit 0
