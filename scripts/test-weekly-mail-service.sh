#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/home/.ccblog/reflections" "$TEST_ROOT/workspace/investing"
cat > "$TEST_ROOT/workspace/investing/.env" <<'EOF'
MAIL_SERVICE_TOKEN=test-token
UNRELATED_SECRET=must-not-be-loaded
EOF

cat > "$TEST_ROOT/bin/npx" <<'EOF'
#!/bin/bash
[ -z "${UNRELATED_SECRET:-}" ] || exit 91
exit 0
EOF

cat > "$TEST_ROOT/bin/curl" <<'EOF'
#!/bin/bash
printf '%s\n' "$@" > "$CAPTURE_ARGS"
for ((i=1; i<=$#; i++)); do
  if [ "${!i}" = "-d" ]; then
    next=$((i + 1))
    printf '%s' "${!next}" > "$CAPTURE_PAYLOAD"
  fi
done
case "${FAKE_CURL_MODE:-success}" in
  success) printf '{"id":"test-message"}\n200\n' ;;
  rejected) printf '{"detail":"recipient not permitted"}\n403\n' ;;
  unavailable) exit 7 ;;
esac
EOF
chmod +x "$TEST_ROOT/bin/npx" "$TEST_ROOT/bin/curl"

run_batch() {
  HOME="$TEST_ROOT/home" \
  PSW_ROOT="$TEST_ROOT/workspace" \
  CCBLOG_REPO_DIR="$REPO_DIR" \
  CCBLOG_TEST_PATH_PREFIX="$TEST_ROOT/bin" \
  CAPTURE_ARGS="$TEST_ROOT/curl.args" \
  CAPTURE_PAYLOAD="$TEST_ROOT/payload.json" \
  FAKE_CURL_MODE="$1" \
  bash "$SCRIPT_DIR/weekly-batch.sh" >/dev/null 2>&1
}

run_batch success
python3 - "$TEST_ROOT/payload.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as payload_file:
    payload = json.load(payload_file)
assert payload["from"] == "CCBlog <ccblog@updates.varadhja.in>"
assert payload["to"] == ["varadhjain@gmail.com"]
assert payload["plain"]
assert payload["html"]
assert payload["source"] == "ccblog-weekly-batch"
assert ("allow_" + "external") not in payload
PY
grep -q '^http://127.0.0.1:9100/send$' "$TEST_ROOT/curl.args"
grep -q '^Authorization: Bearer test-token$' "$TEST_ROOT/curl.args"

if run_batch rejected; then
  echo "expected non-2xx mail-service response to fail" >&2
  exit 1
fi
if run_batch unavailable; then
  echo "expected unavailable mail-service to fail" >&2
  exit 1
fi

rm "$TEST_ROOT/workspace/investing/.env"
if run_batch success; then
  echo "expected missing token source to fail" >&2
  exit 1
fi

echo "weekly mail-service tests passed"
