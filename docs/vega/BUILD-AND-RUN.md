# Run Sema on Vega

Verified on macOS Apple silicon with Vega SDK **0.24.12112**, Node.js **22**, and the **aarch64** Vega Virtual Device. Commands below run from the repository root. Other SDK versions and physical devices may behave differently.

## Build the two-film prototype

Install the Vega SDK and put its `bin` directory on PATH. For the tested installation:

```sh
export PATH="$HOME/vega/sdk/vega-sdk/main/0.24.12112/bin:$PATH"
npm ci
npm run vega:preview
vega-app/scripts/build-staged.sh Debug aarch64
vega virtual-device start
vega run-app vega-app/build/vpkg/sema_aarch64.vpkg com.sema.viewer.main
```

`vega:preview` rebuilds the media-verified player and synchronizes it into `vega-app/assets/`. The staged build installs the locked Vega dependencies, builds from a path without spaces, clears stale build output and copies the package back to `vega-app/build/vpkg/`.

If the SDK is elsewhere, set `VEGA_SDK_BIN` to its `bin` directory before invoking the build script. `SEMA_VEGA_STAGE` selects the staging directory; use a dedicated path without spaces.

## Startup recovery

The native host waits for the player's ready message. If loading fails or the player has not responded after 15 seconds, Try again reloads it and Exit closes the app. Back also exits during failed startup. Screen-reader announcements use the native accessibility API where available.

With the native dependencies installed, run `npm run test:native` from the repository root for startup regression tests. These tests cover the host code; use a device or simulator to check playback.

## Remote and logs

```sh
tools/vega-probe/remote.sh select
tools/vega-probe/remote.sh down right select
tools/vega-probe/remote.sh back
node tools/vega-probe/collect.js --device-log --raw artifacts/vega/device.log
```

The collector writes app diagnostics to `artifacts/vega/probe-results.jsonl`. Its HTTP endpoint binds to localhost. Use `OUT` to select another JSONL file. Stop the collector when finished.

The platform probe is available through `node tools/vega-sync.js --probe`. Restore the player with `npm run vega:preview` before building the application again.

## Production packages

After authoring and editorial approval, build the production renditions, validate and synchronize:

```sh
npm run webm
npm run release:check
npm run baselines
npm run bundle
npm run vega:sync
vega-app/scripts/build-staged.sh Debug aarch64
```

The prototype and production paths are separate. See [architecture](../ARCHITECTURE.md), [authoring](../../pipeline/README.md) and [platform findings](PLATFORM-FINDINGS.md).
