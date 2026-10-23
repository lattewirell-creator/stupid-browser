#!/usr/bin/env bash
# Build Stupid TV and install it on a Samsung Smart Monitor / TV in developer mode.
# Usage: bash tv/install.sh <monitor-ip> [certificate-profile]
# Needs Tizen Studio's command line tools (tizen, sdb) on PATH and a Samsung certificate profile (see tv/README.md).
set -euo pipefail
IP="${1:?Usage: bash tv/install.sh <monitor-ip> [certificate-profile]}"
PROFILE="${2:-stupidtv}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/.buildResult"

command -v tizen >/dev/null || { echo "Can't find 'tizen'. Add ~/tizen-studio/tools/ide/bin to PATH."; exit 1; }
command -v sdb >/dev/null || { echo "Can't find 'sdb'. Add ~/tizen-studio/tools to PATH."; exit 1; }

sdb connect "$IP"
DEVICE="$(sdb devices | awk -v ip="$IP" 'index($1, ip) == 1 { print $3; exit }')"
[ -n "$DEVICE" ] || { echo "The monitor at $IP didn't answer. Is developer mode on, with this computer's IP?"; exit 1; }

rm -rf "$OUT"
tizen build-web -e ".*" -e "install.sh" -e "README.md" -out "$OUT" -- "$HERE"
tizen package -t wgt -s "$PROFILE" -- "$OUT"
WGT="$(ls "$OUT"/*.wgt | head -1)"
tizen install -n "$WGT" -t "$DEVICE"
tizen run -p StupidTV0.StupidTV -t "$DEVICE"
echo "Done: Stupid TV is on the monitor."
