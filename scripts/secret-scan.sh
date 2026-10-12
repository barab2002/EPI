#!/usr/bin/env bash
# Fallback secret scan used until an approved scanner (e.g. gitleaks) is installed.
# Scans tracked + staged files for common credential patterns. Exit 1 on findings.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if command -v gitleaks >/dev/null 2>&1; then
  exec gitleaks detect --no-banner --redact --source .
fi
patterns=(
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'glpat-[0-9A-Za-z_-]{20,}'
  'ghp_[0-9A-Za-z]{36}'
  'github_pat_[0-9A-Za-z_]{40,}'
  'AKIA[0-9A-Z]{16}'
  'xox[baprs]-[0-9A-Za-z-]{10,}'
  '(password|passwd|secret|token|api[_-]?key)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'$<{][^"'"'"']{7,}["'"'"']'
)
files=$(git ls-files -co --exclude-standard | grep -vE '(^|/)(pnpm-lock\.yaml|node_modules/)|\.md$' || true)
found=0
for p in "${patterns[@]}"; do
  if [ -n "$files" ] && echo "$files" | xargs -d '\n' grep -nIEi -- "$p" 2>/dev/null | grep -v 'secret-scan:allow'; then
    found=1
  fi
done
if [ "$found" -ne 0 ]; then
  echo "secret-scan: FAIL — possible secrets above (append 'secret-scan:allow' only for proven test placeholders)" >&2
  exit 1
fi
echo "secret-scan: PASS (fallback grep scanner; gitleaks not installed)"
