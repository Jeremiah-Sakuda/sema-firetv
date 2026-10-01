#!/usr/bin/env bash
# Build the Vega package from a staging copy whose path has NO spaces.
#
# Why: in Vega SDK 0.24.12112, `react-native build-vega` (npm run build:debug)
# shells out to the module manifest builder with an unquoted project path
# (@amazon-devices/kepler-compatibility-metro-config/dist/src/utils.js), so it
# fails with "/bin/sh: /Users/.../2025: No such file or directory" when the
# project lives under a path containing spaces. A symlink does not help because
# the CLI resolves the physical cwd. If your checkout path has no spaces, just
# run `npm run build:debug` in vega-app/ instead of this script.
#
# Usage: vega-app/scripts/build-staged.sh [Debug|Release] [target]
#   target defaults to aarch64 (Vega Virtual Device on Apple silicon).
#   Use "all" to build every target. Use armv7 for most Fire TV devices.
# Env:   SEMA_VEGA_STAGE   staging dir (default: $TMPDIR/sema-vega-app)
#        VEGA_SDK_BIN      SDK bin dir (default: ~/vega/sdk/vega-sdk/main/0.24.12112/bin)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_TYPE="${1:-Debug}"
TARGET="${2:-aarch64}"
case "$BUILD_TYPE" in Debug|Release) ;; *) echo "build type must be Debug or Release" >&2; exit 2;; esac

STAGE="${SEMA_VEGA_STAGE:-${TMPDIR:-/tmp}/sema-vega-app}"
STAGE="${STAGE%/}"
case "$STAGE" in *" "*) echo "SEMA_VEGA_STAGE must not contain spaces: $STAGE" >&2; exit 2;; esac

export PATH="${VEGA_SDK_BIN:-$HOME/vega/sdk/vega-sdk/main/0.24.12112/bin}:$PATH"
command -v vega >/dev/null || { echo "vega CLI not found; set VEGA_SDK_BIN" >&2; exit 1; }

if [ ! -f "$APP_DIR/assets/index.html" ]; then
  echo "vega-app/assets/index.html is missing. Run 'node tools/vega-sync.js' (or --probe) at the repo root first." >&2
  exit 1
fi

echo "==> Staging $APP_DIR -> $STAGE"
mkdir -p "$STAGE"
# node_modules and build/ are excluded, so they are also protected from --delete.
rsync -a --delete --exclude node_modules --exclude build --exclude .git "$APP_DIR/" "$STAGE/"

if [ ! -d "$STAGE/node_modules" ] || [ "$STAGE/package-lock.json" -nt "$STAGE/node_modules/.package-lock.json" ]; then
  echo "==> Installing dependencies in stage (npm ci)"
  (cd "$STAGE" && npm ci --no-audit --no-fund)
fi

TARGET_ARGS=()
[ "$TARGET" != "all" ] && TARGET_ARGS=(--target "$TARGET")
# The native step copies assets into build/private/vega/<arch>/<type>/assets/ and never
# prunes it, so files deleted from vega-app/assets/ would still ship. Always start clean.
rm -rf "$STAGE/build"
echo "==> Building $BUILD_TYPE (${TARGET}) in stage"
MARKER="$STAGE/.build-started"; : > "$MARKER"
(cd "$STAGE" && npx react-native build-vega --build-type "$BUILD_TYPE" ${TARGET_ARGS[@]+"${TARGET_ARGS[@]}"})

OUT="$APP_DIR/build/vpkg"
mkdir -p "$OUT"
found=0
while IFS= read -r pkg; do
  cp "$pkg" "$OUT/"
  echo "==> $(basename "$pkg") ($(wc -c < "$pkg" | tr -d ' ') bytes) -> $OUT/"
  found=1
done < <(find "$STAGE/build" -name "*_${TARGET/all/*}.vpkg" -path "*/$BUILD_TYPE/*" -newer "$MARKER" 2>/dev/null)
[ "$found" = 1 ] || { echo "No .vpkg produced for $BUILD_TYPE/$TARGET under $STAGE/build" >&2; exit 1; }
