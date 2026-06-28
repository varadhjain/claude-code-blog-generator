#!/bin/bash
#
# ccblog weekly compound-engineering batch.
# Runs reflect + four propose-X commands against the last 7 days, counts new
# files written under ~/.ccblog/, and emails a digest via Resend.
#
# Triggered by ~/Library/LaunchAgents/com.varadh.ccblog-weekly-batch.plist
# (Sunday 9pm America/New_York). Run manually via:
#     bash scripts/weekly-batch.sh
#
# Logs to /tmp/ccblog-weekly-batch.log so launchd output stays readable.

set -uo pipefail

# Hard-pin tool paths — launchd's PATH is minimal and Homebrew node is invisible
# to the default cron PATH (per CLAUDE.md launchd rule).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Workspace root (W12): PSW_ROOT env override, else derived from this script's
# location (scripts/ is one level under the repo, repo is one level under root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSW_ROOT="${PSW_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
REPO_DIR="$PSW_ROOT/blog-post-generator"
INVESTING_ENV="$PSW_ROOT/investing/.env"
CCBLOG_ROOT="$HOME/.ccblog"
LOG_DIR="$HOME/.ccblog/weekly-batch-logs"
mkdir -p "$LOG_DIR"
DATE_STAMP="$(date +%Y-%m-%d)"
RUN_LOG="$LOG_DIR/${DATE_STAMP}.log"
MARKER="$LOG_DIR/.last-run.marker"

# Resend creds live in investing/.env (per workspace convention).
if [ -f "$INVESTING_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$INVESTING_ENV"
  set +a
fi
: "${RESEND_API_KEY:?RESEND_API_KEY not set — check $INVESTING_ENV}"

cd "$REPO_DIR"

# Snapshot mtime BEFORE running so we can diff "what's new this run".
PREV_MARKER="$MARKER"
NEW_MARKER_FILE="$(mktemp)"
touch -d "1 hour ago" "$NEW_MARKER_FILE"  # "new" = changed in this run window

echo "==== ccblog weekly batch — $(date) ====" | tee -a "$RUN_LOG"

run_step() {
  local label="$1"
  shift
  echo "" | tee -a "$RUN_LOG"
  echo "---- $label ----" | tee -a "$RUN_LOG"
  if "$@" 2>&1 | tee -a "$RUN_LOG"; then
    return 0
  else
    echo "[!] $label exited non-zero (continuing)" | tee -a "$RUN_LOG"
    return 0  # never abort — we want the email even on partial failure
  fi
}

run_step "reflect"          npx ts-node src/cli/index.ts reflect --since 7d --tone honest
run_step "propose-skills"   npx ts-node src/cli/index.ts propose-skills --since 7d
run_step "propose-memories" npx ts-node src/cli/index.ts propose-memories --since 7d
run_step "propose-claude-md" npx ts-node src/cli/index.ts propose-claude-md --since 7d
run_step "anti-patterns"    npx ts-node src/cli/index.ts anti-patterns --since 7d

# Collect every file written/modified under ~/.ccblog/{reflections,skill-proposals,
# memory-proposals,claude-md-proposals,anti-patterns}/ since this run started.
NEW_FILES=()
for dir in reflections skill-proposals memory-proposals claude-md-proposals anti-patterns; do
  full="$CCBLOG_ROOT/$dir"
  [ -d "$full" ] || continue
  while IFS= read -r f; do
    NEW_FILES+=("$f")
  done < <(find "$full" -type f -newer "$NEW_MARKER_FILE" \( -name "*.md" -o -name "*.txt" \) 2>/dev/null)
done

# Pull the freshest reflection body (full file, not just summary).
REFLECTION_BODY=""
LATEST_REFLECTION="$(ls -t "$CCBLOG_ROOT/reflections"/*.md 2>/dev/null | head -1 || true)"
if [ -n "$LATEST_REFLECTION" ] && [ -f "$LATEST_REFLECTION" ]; then
  REFLECTION_BODY="$(cat "$LATEST_REFLECTION")"
fi

# Compose the email body. Plain text — keeps it grep-able later.
EMAIL_FILE="$(mktemp)"
{
  echo "ccblog weekly compound-engineering digest — week of $DATE_STAMP"
  echo "================================================================"
  echo ""
  echo "Files written this run (${#NEW_FILES[@]}):"
  if [ "${#NEW_FILES[@]}" -eq 0 ]; then
    echo "  (none — either no patterns met the ≥2-session bar, or scripts failed; check $RUN_LOG)"
  else
    for f in "${NEW_FILES[@]}"; do
      echo "  - $f"
    done
  fi
  echo ""
  echo "To install a proposal: open the file, copy the section BELOW the"
  echo "'## ... (copy below this line)' divider into the suggested target dir"
  echo "(printed in the file's frontmatter as suggested_dir / suggested_section)."
  echo ""
  echo "================================================================"
  echo "Latest reflection (full body) — $LATEST_REFLECTION"
  echo "================================================================"
  echo ""
  if [ -n "$REFLECTION_BODY" ]; then
    echo "$REFLECTION_BODY"
  else
    echo "(no reflection produced this run)"
  fi
  echo ""
  echo "================================================================"
  echo "Run log: $RUN_LOG"
} > "$EMAIL_FILE"

# Resend send. Plain text email — Resend accepts text/plain via the `text` field.
# Email subject reflects whether anything was found, so the inbox preview is honest.
SUBJECT="ccblog weekly batch — $DATE_STAMP — ${#NEW_FILES[@]} proposal(s)"

# Use python to JSON-escape the body — avoids shell-quoting hell for multi-line content.
JSON_PAYLOAD="$(python3 -c '
import json, os, sys
with open(os.environ["EMAIL_FILE"]) as f:
    body = f.read()
print(json.dumps({
    "from": "claude@updates.varadhja.in",
    "to": ["varadhjain@gmail.com"],
    "subject": os.environ["SUBJECT"],
    "text": body,
}))
' EMAIL_FILE="$EMAIL_FILE" SUBJECT="$SUBJECT")"

HTTP_RESPONSE="$(curl -sS -w "\n%{http_code}" -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")"

HTTP_CODE="$(echo "$HTTP_RESPONSE" | tail -1)"
HTTP_BODY="$(echo "$HTTP_RESPONSE" | sed '$d')"

echo "" | tee -a "$RUN_LOG"
echo "---- email send ----" | tee -a "$RUN_LOG"
echo "HTTP $HTTP_CODE" | tee -a "$RUN_LOG"
echo "$HTTP_BODY" | tee -a "$RUN_LOG"

rm -f "$EMAIL_FILE" "$NEW_MARKER_FILE"
touch "$PREV_MARKER"
echo "==== done $(date) ====" | tee -a "$RUN_LOG"
