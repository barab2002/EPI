#!/usr/bin/env bash
# Removes the EPI hourly resume cron entry (safe to run when none is installed).
set -euo pipefail
if command -v crontab >/dev/null && crontab -l 2>/dev/null | grep -q '# epi-resume'; then
  crontab -l | grep -v '# epi-resume' | crontab -
  echo "EPI resume scheduler removed."
else
  echo "No EPI resume scheduler installed."
fi
