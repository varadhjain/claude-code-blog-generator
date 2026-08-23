#!/bin/bash
#
# ccblog weekly compound-engineering batch.
# Runs reflect + four propose-X commands against the last 7 days, counts new
# files written under ~/.ccblog/, and emails a digest via local mail-service.
#
# Triggered by ~/Library/LaunchAgents/com.varadh.ccblog-weekly-batch.plist
# (Sunday 9pm America/New_York). Run manually via:
#     bash scripts/weekly-batch.sh
#
# Logs to /tmp/ccblog-weekly-batch.log so launchd output stays readable.

set -uo pipefail

# Hard-pin tool paths — launchd's PATH is minimal and Homebrew node is invisible
# to the default cron PATH (per CLAUDE.md launchd rule).
#
# PIN Node 24 (keg-only) FIRST on PATH: the search index uses better-sqlite3, a
# native module. The system `node` is v26 (ABI 147), but better-sqlite3@11.10.0
# has no node-26 prebuilt and its bundled node-gyp can't build for node 26 — the
# module fails to load, so `ccblog index` produced zero sessions ("No sessions
# found in window"). Node 24 (ABI 137) builds cleanly; better-sqlite3 is compiled
# against it. If you upgrade better-sqlite3 to a node-26-compatible release, drop
# this keg prefix. Keg installed via `brew install node@24`.
export PATH="${CCBLOG_TEST_PATH_PREFIX:+$CCBLOG_TEST_PATH_PREFIX:}/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Workspace root (W12): PSW_ROOT env override, else derived from this script's
# location (scripts/ is one level under the repo, repo is one level under root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSW_ROOT="${PSW_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
REPO_DIR="${CCBLOG_REPO_DIR:-$PSW_ROOT/blog-post-generator}"
INVESTING_ENV="$PSW_ROOT/investing/.env"
CCBLOG_ROOT="$HOME/.ccblog"
LOG_DIR="$HOME/.ccblog/weekly-batch-logs"
mkdir -p "$LOG_DIR"
DATE_STAMP="$(date +%Y-%m-%d)"
RUN_LOG="$LOG_DIR/${DATE_STAMP}.log"
MARKER="$LOG_DIR/.last-run.marker"

# Read only the gateway token. Do not source the whole investing environment
# into this process; provider credentials remain inside mail-service.
if [ ! -f "$INVESTING_ENV" ]; then
  echo "MAIL_SERVICE_TOKEN unavailable — missing $INVESTING_ENV" >&2
  exit 1
fi
MAIL_SERVICE_TOKEN="$(python3 - "$INVESTING_ENV" <<'PY'
import sys

value = ""
with open(sys.argv[1], encoding="utf-8") as env_file:
    for raw_line in env_file:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, candidate = line.split("=", 1)
        if key.strip() == "MAIL_SERVICE_TOKEN":
            value = candidate.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
print(value)
PY
)"
if [ -z "$MAIL_SERVICE_TOKEN" ]; then
  echo "MAIL_SERVICE_TOKEN unavailable — check $INVESTING_ENV" >&2
  exit 1
fi

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

# Build/refresh the local session search index FIRST — the reflect/propose-X
# miners read from it, and a stale/empty index is why the digest kept coming
# back "No sessions found in window." (index takes no args; scans the sessions root.)
run_step "index"            npx ts-node src/cli/index.ts index
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

# Send through mail-service. Subject reflects whether anything was found, so
# the inbox preview is honest.
SUBJECT="ccblog weekly batch — $DATE_STAMP — ${#NEW_FILES[@]} proposal(s)"

# Use python to JSON-escape the body and produce a minimal safe HTML companion.
# NB: env-assignments must come BEFORE `python3` — placing `EMAIL_FILE=... SUBJECT=...`
# after `-c '...'` passes them as sys.argv, NOT os.environ, so os.environ[...] raised
# KeyError → empty payload → gateway 400 "Request body must be valid JSON".
JSON_PAYLOAD="$(EMAIL_FILE="$EMAIL_FILE" SUBJECT="$SUBJECT" python3 -c '
import json, os
import html
with open(os.environ["EMAIL_FILE"]) as f:
    body = f.read()
print(json.dumps({
    "from": "CCBlog <ccblog@updates.varadhja.in>",
    "to": ["varadhjain@gmail.com"],
    "subject": os.environ["SUBJECT"],
    "plain": body,
    "html": "<pre style=\"white-space:pre-wrap;font-family:ui-monospace,monospace\">" + html.escape(body) + "</pre>",
    "source": "ccblog-weekly-batch",
}))
')"

if ! HTTP_RESPONSE="$(curl -sS -w "\n%{http_code}" -X POST "http://127.0.0.1:9100/send" \
  -H "Authorization: Bearer $MAIL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")"; then
  echo "mail-service unavailable" | tee -a "$RUN_LOG" >&2
  rm -f "$EMAIL_FILE" "$NEW_MARKER_FILE"
  exit 1
fi

HTTP_CODE="$(echo "$HTTP_RESPONSE" | tail -1)"
HTTP_BODY="$(echo "$HTTP_RESPONSE" | sed '$d')"

echo "" | tee -a "$RUN_LOG"
echo "---- email send ----" | tee -a "$RUN_LOG"
echo "HTTP $HTTP_CODE" | tee -a "$RUN_LOG"
echo "$HTTP_BODY" | tee -a "$RUN_LOG"

if [[ ! "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  echo "mail-service rejected the digest" | tee -a "$RUN_LOG" >&2
  rm -f "$EMAIL_FILE" "$NEW_MARKER_FILE"
  exit 1
fi

rm -f "$EMAIL_FILE" "$NEW_MARKER_FILE"
touch "$PREV_MARKER"
echo "==== done $(date) ====" | tee -a "$RUN_LOG"
