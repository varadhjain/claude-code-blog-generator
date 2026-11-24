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

# Read the gateway token. Prefer the real environment (set on this Mac
# via ~/.config/firm-stack/secrets.env or launchd's EnvironmentVariables) and
# only parse the investing .env file as a fallback. Do not source the whole
# investing environment into this process; provider credentials remain inside
# mail-service.
MAIL_SERVICE_URL="http://127.0.0.1:9100"
if [ -z "${MAIL_SERVICE_TOKEN:-}" ]; then
  if [ ! -f "$INVESTING_ENV" ]; then
    if [ -z "${MAIL_SERVICE_TOKEN:-}" ]; then
      echo "MAIL_SERVICE_TOKEN unavailable — missing $INVESTING_ENV" >&2
      exit 1
    fi
  else
    FILE_MAIL_SERVICE_TOKEN="$(python3 - "$INVESTING_ENV" <<'PY'
import sys

wanted = ("MAIL_SERVICE_TOKEN",)
values = {}
with open(sys.argv[1], encoding="utf-8") as env_file:
    for raw_line in env_file:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, candidate = line.split("=", 1)
        key = key.strip()
        if key in wanted:
            value = candidate.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key] = value
print(values.get("MAIL_SERVICE_TOKEN", ""))
PY
)"
    MAIL_SERVICE_TOKEN="${MAIL_SERVICE_TOKEN:-$FILE_MAIL_SERVICE_TOKEN}"
  fi
fi
if [ -z "${MAIL_SERVICE_TOKEN:-}" ]; then
  echo "MAIL_SERVICE_TOKEN unavailable — check environment or $INVESTING_ENV" >&2
  exit 1
fi

cd "$REPO_DIR"

# Snapshot mtime BEFORE running so we can diff "what's new this run".
PREV_MARKER="$MARKER"
NEW_MARKER_FILE="$(mktemp)"
# mktemp's creation time marks the actual beginning of this run on macOS.

echo "==== ccblog weekly batch — $(date) ====" | tee -a "$RUN_LOG"

FAILED_STEPS=()
run_step() {
  local label="$1"
  shift
  echo "" | tee -a "$RUN_LOG"
  echo "---- $label ----" | tee -a "$RUN_LOG"
  if "$@" 2>&1 | tee -a "$RUN_LOG"; then
    return 0
  else
    echo "[!] $label exited non-zero (continuing)" | tee -a "$RUN_LOG"
    FAILED_STEPS+=("$label")
    return 0
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

if [ "${#NEW_FILES[@]}" -eq 0 ] && [ "${#FAILED_STEPS[@]}" -eq 0 ]; then
  echo "No new material to review; digest skipped." | tee -a "$RUN_LOG"
  rm -f "$NEW_MARKER_FILE"
  touch "$PREV_MARKER"
  exit 0
fi

JSON_PAYLOAD="$(python3 - "$DATE_STAMP" "${#FAILED_STEPS[@]}" ${FAILED_STEPS[@]+"${FAILED_STEPS[@]}"} ${NEW_FILES[@]+"${NEW_FILES[@]}"} <<'PYMAIL'
import html
import json
from pathlib import Path
import re
import sys

day, failed_count, *items = sys.argv[1:]
failed_count = int(failed_count)
failures, files = items[:failed_count], [Path(path) for path in items[failed_count:]]
subject = f"Bilan weekly · {day} · " + ("batch needs attention" if failures else f"{len(files)} new items to review")
opening = "Some batch steps failed. Review the failures before relying on this week's results." if failures else (
    "Review the new reflections and proposals from this week's coding sessions.")
rows = []
for path in files:
    with path.open(errors="replace") as source_file:
        preview = source_file.read(4000)
    heading = re.search(r"^# (.+)$", preview, re.M)
    title = heading[1].strip()[:180] if heading else path.stem
    rows.append((path.parent.name.replace("-", " ").title(), title, path.name))
plain = [opening]
parts = ['<main style="max-width:600px;margin:auto;padding:24px 20px;background:#f5f4ef;color:#282822;'
         'font:16px/1.55 system-ui,sans-serif"><p style="margin:0">Bilan · ' + html.escape(day)
         + '</p><h1 style="font-size:28px;line-height:1.2;margin:8px 0">Weekly review</h1><p>'
         + html.escape(opening) + '</p>']
if failures:
    plain += ["", "Failed steps", *["- " + name for name in failures]]
    parts += ['<h2 style="font-size:21px;margin:20px 0 8px">Failed steps</h2><ul>',
              *[f'<li>{html.escape(name)}</li>' for name in failures], "</ul>"]
if rows:
    plain += ["", "New review items", *[f"- {kind}: {title} ({name})" for kind, title, name in rows]]
    parts += ['<h2 style="font-size:21px;margin:20px 0 8px">New review items</h2><ul style="padding-left:19px">',
              *[f'<li style="margin-bottom:11px"><strong>{html.escape(title)}</strong><br>'
                f'<span style="font-size:14px;color:#56574c">{html.escape(kind)}</span></li>' for kind, title, name in rows],
              "</ul>"]
parts.append("</main>")
print(json.dumps({
    "from": "ccblog@updates.varadhja.in",
    "to": ["varadhjain@gmail.com"],
    "subject": subject,
    "plain": "\n".join(plain),
    "html": "".join(parts),
    "source": "ccblog-weekly-batch",
}))
PYMAIL
)"
if [ -z "$JSON_PAYLOAD" ]; then
  echo "Could not render weekly review." | tee -a "$RUN_LOG" >&2
  rm -f "$NEW_MARKER_FILE"
  exit 1
fi

if ! HTTP_RESPONSE="$(curl -sS -w "\n%{http_code}" -X POST "${MAIL_SERVICE_URL%/}/send" \
  -H "Authorization: Bearer $MAIL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")"; then
  echo "mail-service unavailable" | tee -a "$RUN_LOG" >&2
  rm -f "$NEW_MARKER_FILE"
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
  rm -f "$NEW_MARKER_FILE"
  exit 1
fi

rm -f "$NEW_MARKER_FILE"
touch "$PREV_MARKER"
echo "==== done $(date) ====" | tee -a "$RUN_LOG"
