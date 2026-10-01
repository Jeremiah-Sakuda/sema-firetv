#!/usr/bin/env bash
# Send Fire TV remote presses to the Vega Virtual Device (or a connected device) from the CLI.
#   tools/vega-probe/remote.sh down down select
#   tools/vega-probe/remote.sh --raw KEY_SELECT
#   DELAY=1 tools/vega-probe/remote.sh right right select
# Uses the on-device developer tool: vda shell inputd-cli button_press <KEY_*>
# Names: up down left right select back menu playpause rewind ff home
#   (select -> KEY_ENTER; KEY_SELECT and KEY_OK also exist; see docs/vega/PLATFORM-FINDINGS.md)
set -euo pipefail
VDA="${VDA:-}"
if [ -z "$VDA" ]; then
  if command -v vega >/dev/null 2>&1; then VDA="$(vega which vda | tail -1)"; else
    VDA="$HOME/vega/sdk/vega-sdk/main/0.24.12112/workspace/env/KeplerCLIVegaDeviceAdaptor-2.0/runtime/bin/vda"; fi
fi
[ -x "$VDA" ] || { echo "vda not found; set VDA=/path/to/vda" >&2; exit 1; }
SERIAL_ARGS=(); [ -n "${VDA_SERIAL:-}" ] && SERIAL_ARGS=(-s "$VDA_SERIAL")
[ $# -gt 0 ] || { sed -n 2,8p "$0"; exit 2; }
raw=0
for name in "$@"; do
  if [ "$name" = "--raw" ]; then raw=1; continue; fi
  if [ "$raw" = 1 ]; then key="$name"; raw=0; else
    case "$name" in
      up) key=KEY_UP;; down) key=KEY_DOWN;; left) key=KEY_LEFT;; right) key=KEY_RIGHT;;
      select|ok|enter) key=KEY_ENTER;; back) key=KEY_BACK;; menu) key=KEY_MENU;;
      playpause|play|pause) key=KEY_PLAYPAUSE;; rewind|rew) key=KEY_REWIND;; ff|fastforward) key=KEY_FASTFORWARD;;
      home) key=KEY_HOMEPAGE;;
      KEY_*) key="$name";;
      *) echo "unknown key name: $name" >&2; exit 2;;
    esac
  fi
  "$VDA" ${SERIAL_ARGS[@]+"${SERIAL_ARGS[@]}"} shell "inputd-cli button_press $key"
  sleep "${DELAY:-0.6}"
done
