#!/usr/bin/env bash
# One bounded unattended continuation attempt. Usage: scripts/resume.sh [--dry-run]
# Uses only the documented Claude Code CLI (`claude -p`). Never bypasses usage limits:
# a limit/auth/network error is logged and retried at most EPI_RESUME_MAX_FAILURES times.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$ROOT/.epi/scheduler"; mkdir -p "$STATE"
LOG="$STATE/resume.log"; LOCK="$STATE/resume.lock"; FAILS="$STATE/failures"
MAX_FAILS="${EPI_RESUME_MAX_FAILURES:-3}"
MAX_MINUTES="${EPI_RESUME_MAX_MINUTES:-50}"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }

exec 9>"$LOCK"
flock -n 9 || { log "another resume is running — skip"; exit 0; }

fails=$(cat "$FAILS" 2>/dev/null || echo 0)
if [ "$fails" -ge "$MAX_FAILS" ]; then
  log "stopped: $fails consecutive failures (limit $MAX_FAILS). Reset by deleting $FAILS after review."; exit 3
fi

bash "$ROOT/scripts/check_status.sh" >>"$LOG" 2>&1; rc=$?
[ $rc -eq 10 ] && { log "skip (see check_status)"; exit 0; }
[ $rc -ne 0 ] && { log "blocked (see check_status) — human needed"; exit 2; }

PROMPT='Resume EPI work. Read CLAUDE.md, docs/RESUME.md, docs/NEXT_ACTIONS.md. Continue only the next safe, unblocked task on the current feature branch, run its tests, commit and push, update checkpoint docs, then stop. Stop immediately at any approval boundary.'
if [ $DRY -eq 1 ]; then
  log "DRY-RUN: would run: timeout ${MAX_MINUTES}m claude -p <resume prompt> (cwd $ROOT)"; exit 0
fi
command -v claude >/dev/null || { log "claude CLI not installed — blocked"; exit 2; }
log "starting continuation (max ${MAX_MINUTES} min)"
if (cd "$ROOT" && timeout "${MAX_MINUTES}m" claude -p "$PROMPT") >>"$LOG" 2>&1; then
  echo 0 >"$FAILS"; log "continuation finished"
else
  echo $((fails + 1)) >"$FAILS"
  log "continuation failed (exit $?); failure $((fails + 1))/$MAX_FAILS — will retry next hour if under limit"
fi
