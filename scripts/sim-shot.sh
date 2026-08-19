#!/usr/bin/env bash
# Repeatable iOS Simulator screenshot for the CollegeOS mobile app.
#
# Boots the target simulator (if needed), starts Metro (if not already running), opens the app via
# an exp:// deep link, and writes a PNG to a known path. Cheap enough to run on demand for visual
# evidence throughout the build.
#
# Usage: scripts/sim-shot.sh [device name] [output path] [expo port]
# Example: scripts/sim-shot.sh "iPhone 16 Pro" .brain/mobile-shot.png 8081
#
# Note: the very first launch of a freshly installed/erased Expo Go shows a one-time "this is the
# dev menu" tutorial overlay. It only appears once per Expo Go install, so normal repeated runs on
# an already-booted, already-used simulator are unaffected — no special handling needed here.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVICE_NAME="${1:-iPhone 16 Pro}"
OUT_PATH="${2:-.brain/mobile-shot.png}"
PORT="${3:-8081}"
METRO_LOG="$(mktemp -t sim-shot-metro-log)"

if [[ "$OUT_PATH" != /* ]]; then
  OUT_PATH="$REPO_ROOT/$OUT_PATH"
fi
mkdir -p "$(dirname "$OUT_PATH")"

echo "==> Resolving simulator UDID for \"$DEVICE_NAME\""
UDID="$(xcrun simctl list devices available | awk -v name="$DEVICE_NAME" -F'[()]' '
  $0 ~ name {
    for (i = 1; i <= NF; i++) {
      if ($i ~ /^[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}$/) { print $i; exit }
    }
  }
')"

if [[ -z "$UDID" ]]; then
  echo "error: no simulator matching \"$DEVICE_NAME\" found. Run 'xcrun simctl list devices available'." >&2
  exit 1
fi
echo "    UDID: $UDID"

BOOT_STATE="$(xcrun simctl list devices | grep "$UDID" | grep -oE '\((Booted|Shutdown)\)' | tr -d '()')"
if [[ "$BOOT_STATE" != "Booted" ]]; then
  echo "==> Booting simulator"
  xcrun simctl boot "$UDID"
  open -a Simulator
  # Give springboard a moment to come up before we try to interact with it.
  for _ in $(seq 1 20); do
    xcrun simctl list devices | grep "$UDID" | grep -q "(Booted)" && break
    sleep 1
  done
else
  open -a Simulator
fi

echo "==> Checking Metro on port $PORT"
if curl -s -o /dev/null -w '' "http://127.0.0.1:$PORT/status" 2>/dev/null; then
  echo "    already running, reusing it"
  STARTED_METRO=0
else
  echo "    starting Metro (managed workflow: expo start --ios only, never native prebuild)"
  ( cd "$REPO_ROOT/apps/mobile" && nohup npx expo start --ios --port "$PORT" > "$METRO_LOG" 2>&1 & )
  STARTED_METRO=1

  echo "==> Waiting for bundle"
  DEADLINE=$((SECONDS + 90))
  while [[ $SECONDS -lt $DEADLINE ]]; do
    if grep -qE "Bundled|error|Error|failed" "$METRO_LOG" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if grep -qE "error|Error|failed" "$METRO_LOG" 2>/dev/null && ! grep -q "Bundled" "$METRO_LOG" 2>/dev/null; then
    echo "error: Metro failed to bundle. Log:" >&2
    cat "$METRO_LOG" >&2
    exit 1
  fi
fi

# `expo start --ios` already auto-opens the app on this simulator once Metro is up — issuing a
# second deep-link open on top of that races the first launch and can bounce back to the home
# screen. Only open manually when we reused an already-running Metro (no auto-open happened for
# this invocation); otherwise just give the auto-opened launch time to settle.
if [[ "$STARTED_METRO" == "1" ]]; then
  echo "==> Waiting for the auto-opened launch to settle"
  sleep 6
else
  echo "==> Opening app via deep link"
  xcrun simctl openurl "$UDID" "exp://127.0.0.1:$PORT"
  sleep 3
fi

echo "==> Capturing screenshot"
xcrun simctl io "$UDID" screenshot "$OUT_PATH"
echo "==> Wrote $OUT_PATH"

if [[ "${STARTED_METRO:-0}" == "1" ]]; then
  echo "note: Metro was started by this script and is still running in the background (log: $METRO_LOG). Stop it with: pkill -f 'expo start --ios --port $PORT'"
fi
