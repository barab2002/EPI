#!/usr/bin/env bash
# Installs an hourly cron entry for scripts/resume.sh. REQUIRES explicit owner approval
# (ACCESS_REQUIREMENTS C10). Without --approved it only prints what it would install.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MINUTE="${EPI_RESUME_MINUTE:-17}"
LINE="$MINUTE * * * * cd $ROOT && /usr/bin/env bash scripts/resume.sh >/dev/null 2>&1 # epi-resume"
if [ "${1:-}" != "--approved" ]; then
  echo "Not installing (no --approved flag). Would add this crontab line:"
  echo "  $LINE"
  exit 0
fi
command -v crontab >/dev/null || { echo "crontab not available; use a systemd timer instead" >&2; exit 2; }
( crontab -l 2>/dev/null | grep -v '# epi-resume' || true; echo "$LINE" ) | crontab -
echo "Installed hourly resume at minute $MINUTE. Disable with scripts/stop_scheduler.sh"
