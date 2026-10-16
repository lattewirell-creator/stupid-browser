#!/usr/bin/env bash
# Headless UI self-tests (Linux + xvfb, or macOS directly). Prints PASS/FAIL lines.
set -uo pipefail
cd "$(dirname "$0")/.."
if command -v xvfb-run >/dev/null; then WRAP=(xvfb-run -a -s "-screen 0 1440x900x24"); else WRAP=(); fi
if command -v timeout >/dev/null; then TO=timeout; elif command -v gtimeout >/dev/null; then TO=gtimeout; else TO=; fi
run() {
  local script=$1 dir=$2 secs=$3
  STUPID_SELFTEST=/tmp/stupid-selftest.png STUPID_SELFTEST_STEPS="quit@$((secs*1000))" STUPID_SELFTEST_SCRIPT="$PWD/test/$script" \
    ${TO:+$TO $((secs+30))} ${WRAP[@]+"${WRAP[@]}"} node_modules/.bin/electron --no-sandbox --user-data-dir="$dir" . 2>&1 | grep -E "\[PASS\]|\[FAIL\]|script error" | sed 's/^\[renderer\] info //'
}
D=$(mktemp -d)
run selftest.js "$D" 170
run restore.js "$D" 60
run extra.js "$(mktemp -d)" 40
