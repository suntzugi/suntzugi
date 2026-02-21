#!/bin/bash
# log-draft-edit.sh — Logs a timestamped entry whenever a draft .md is updated.
#
# Usage:
#   ./scripts/log-draft-edit.sh <slug> [message]
#
# Examples:
#   ./scripts/log-draft-edit.sh my-time-has-come
#   ./scripts/log-draft-edit.sh my-time-has-come "rewrote opening paragraph"
#
# Each draft gets its own log at texts/drafts/.history/<slug>.log
# The "Last edited" line in the .md is also updated automatically.

set -euo pipefail

SLUG="${1:?Usage: log-draft-edit.sh <slug> [message]}"
MSG="${2:-edit}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
DRAFT="$ROOT/texts/drafts/$SLUG.md"
HISTORY_DIR="$ROOT/texts/drafts/.history"
LOG="$HISTORY_DIR/$SLUG.log"

if [ ! -f "$DRAFT" ]; then
  echo "error: draft not found: $DRAFT" >&2
  exit 1
fi

mkdir -p "$HISTORY_DIR"

# Timestamp in PT
TIMESTAMP="$(TZ='America/Los_Angeles' date '+%Y-%m-%d %H:%M %Z')"

# Append to log
echo "$TIMESTAMP — $MSG" >> "$LOG"

# Update "Last edited" line in the .md
TODAY="$(TZ='America/Los_Angeles' date '+%B %d, %Y' | sed 's/ 0/ /')"
if grep -q '^Last edited:' "$DRAFT"; then
  sed -i '' "s/^Last edited:.*$/Last edited: $TODAY/" "$DRAFT"
else
  # Insert after "Written:" line if it exists
  if grep -q '^Written:' "$DRAFT"; then
    sed -i '' "/^Written:/a\\
Last edited: $TODAY" "$DRAFT"
  fi
fi

echo "logged: $TIMESTAMP — $MSG → $LOG"
