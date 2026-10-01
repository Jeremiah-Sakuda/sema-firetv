#!/usr/bin/env bash
# Capture the "Vega Virtual Device" window on macOS to a PNG.
#   tools/vega-probe/vvd-screenshot.sh docs/vega/screenshots/name.png
# The on-device tools (screenshooter, gwsi-tool-screenshooter) do not work from the
# developer-mode shell on SDK 0.24.12112 (permission denied / hang), so this captures
# the host window instead. The window is raised first because with Stage Manager a
# background window only yields a 256x198 thumbnail. Needs Screen Recording permission
# for the calling terminal; raising the window needs Automation/Accessibility for
# System Events (macOS will prompt once).
set -euo pipefail
OUT="${1:?usage: vvd-screenshot.sh out.png}"
mkdir -p "$(dirname "$OUT")"
SWIFT_SRC="${TMPDIR:-/tmp}/vvd-window-id.swift"
cat > "$SWIFT_SRC" <<'EOF'
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list where (w[kCGWindowOwnerName as String] as? String) == "vega-virtual-device"
  && (w[kCGWindowName as String] as? String) == "Vega Virtual Device" {
  print(w[kCGWindowNumber as String] as? Int ?? 0); break
}
EOF
WID="$(swift "$SWIFT_SRC" 2>/dev/null | head -1)"
[ -n "$WID" ] && [ "$WID" != 0 ] || { echo "Vega Virtual Device window not found (is the VVD running with --gui?)" >&2; exit 1; }
# Raise + capture, retrying: during a Stage Manager transition the capture fails or
# returns the 256x198 thumbnail.
for attempt in 1 2 3 4; do
  osascript -e 'tell application "System Events" to set frontmost of (first process whose name is "vega-virtual-device") to true' >/dev/null 2>&1 || true
  sleep "${VVD_SHOT_DELAY:-1.2}"
  if screencapture -x -o -l"$WID" "$OUT" 2>/dev/null && [ "$(sips -g pixelWidth "$OUT" | awk '/pixelWidth/ {print $2}')" -gt 600 ]; then break; fi
  [ "$attempt" = 4 ] && { echo "capture failed (window thumbnail or transition)" >&2; exit 1; }
done
echo "$OUT ($(sips -g pixelWidth -g pixelHeight "$OUT" | awk '/pixel/ {printf "%s ", $2}'))"
