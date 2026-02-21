#!/bin/bash
# watch-drafts.sh — Watches texts/drafts/ for .md changes and auto-logs edits.
#
# Usage:
#   ./scripts/watch-drafts.sh
#
# Requires: fswatch (brew install fswatch)
# Logs every save to texts/drafts/.history/<slug>.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
DRAFTS="$ROOT/texts/drafts"

if ! command -v fswatch &>/dev/null; then
  echo "fswatch not found. Install with: brew install fswatch" >&2
  exit 1
fi

echo "watching $DRAFTS for .md changes..."

fswatch -0 --include '\.md$' --exclude '.*' "$DRAFTS" | while IFS= read -r -d '' file; do
  SLUG="$(basename "$file" .md)"
  "$SCRIPT_DIR/log-draft-edit.sh" "$SLUG" "auto-detected save"
done
