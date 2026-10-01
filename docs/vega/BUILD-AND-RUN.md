# Build and run Sema on the Vega Virtual Device

These steps were tested on macOS (Apple silicon) with Vega SDK 0.24.12112, Node 22 and npm 10, on 2026-10-01. The VVD on Apple silicon is `aarch64`. Fire TV devices are usually `armv7`.

Every command is meant to run from the **repo root** unless a step says otherwise.

## 0. Prerequisites and the PATH workaround

* **Vega SDK.** It must be installed at `~/vega/sdk/vega-sdk/main/0.24.12112` (the default from the SDK installer).
* **The `vega` CLI may not be on your PATH.** `~/vega/env` can point PATH at a temporary directory that no longer exists. If `vega --version` fails, put the SDK's own `bin/` first in this shell. Don't edit your shell rc files:

  ```sh
  export PATH="$HOME/vega/sdk/vega-sdk/main/0.24.12112/bin:$PATH"
  vega --version
  vega which vda      # prints the vda (Vega Device Adapter) path
  ```

* **Optional: a `vda` alias.** `vega exec vda …` works too, but it mangles quotes in `shell '...'` arguments, so call the binary directly:

  ```sh
  VDA="$(vega which vda | tail -1)"
  ```

## 1. Install dependencies (once)

```sh
cd vega-app && npm install && cd ..
```

This installs about 1,150 packages in roughly a minute. `vega-app/package-lock.json` is generated and should be committed, so `npm ci` stays reproducible.

## 2. Copy the web app into the Vega package

```sh
npm run bundle                 # web app engineer's step: regenerates src/bundle.js and src/data.js
node tools/vega-sync.js        # copies index.html, style.css, src/bundle.js, src/data.js, media/** into vega-app/assets/
```

**What the sync does**

* It deletes only the paths it owns under `vega-app/assets/` and leaves everything else, such as a future `assets/raw/`.
* It copies whatever is on disk at that moment.
* From `media/` it copies only `.mp4 .mp3 .json .vtt .png .jpg .svg` files.
* It warns when `src/bundle.js` is older than any `src/*.js` module. It never rebuilds the bundle itself.
* The synced copies are git-ignored (`vega-app/.gitignore`).

**Optional flags**

* `node tools/vega-sync.js --probe` installs the platform probe (`tools/vega-probe/probe.html`) as the entry page instead.
* `node tools/vega-sync.js --dry-run` shows the plan without changing anything.

## 3. Build a debug package

**If the checkout path contains no spaces**, the standard template command works:

```sh
cd vega-app && rm -rf build && npm run build:debug && cd ..   # rm -rf build: see the stale-assets note below
# The VVD package ends up at:
#   vega-app/build/private/kepler/@amazon-devices/sema/undefined/vega/aarch64/Debug/@amazon-devices/sema_aarch64.vpkg
```

**If the path contains spaces** (like ours: `…/2025 Fall Projects/…`), `npm run build:debug` fails with:

```
/bin/sh: /Users/jerem/Desktop/Projects/2025: No such file or directory
error Unable to generate a manifest: Error: Command failed: …/kepler-module-manifest-builder/dist/src/cli.js build -d …
```

A symlink doesn't fix it, because the CLI resolves the physical path. Instead, build from a staging copy whose path has no spaces:

```sh
vega-app/scripts/build-staged.sh Debug aarch64      # or: cd vega-app && npm run build:staged
# -> vega-app/build/vpkg/sema_aarch64.vpkg
```

**What the staging script does**

1. rsyncs `vega-app/` (without `node_modules` and `build`) to `$TMPDIR/sema-vega-app`.
2. Runs `npm ci` there the first time.
3. Runs `react-native build-vega --build-type Debug --target aarch64`.
4. Copies the `.vpkg` back to `vega-app/build/vpkg/`.

A rebuild takes about 15 s.

**Always build from a clean `build/`.** The build copies `assets/` into `build/private/vega/<arch>/<type>/assets/` and never prunes it, so files you deleted or moved keep shipping. The staging script deletes its `build/` before every build.

**Two things not to do**

* **Don't use `vega build` on its own for this project.** It only runs the native packaging step. It exits 0 and produces a 4.9 KB package with **no JS bundle**, which installs but cannot run. Use `npm run build:debug` (which runs Metro and then `vega build`) or the staging script.
* **Ignore this line in the log:** `cp: no such file or directory: …/build/lib/rn-bundles/Debug/assets/*`. It appears even on good builds.

**Check the package contents** (optional; it should list `bundle/index.hermes.bundle`, `assets/index.html` and `assets/media/...`):

```sh
vega exec vpt show-contents vega-app/build/vpkg/sema_aarch64.vpkg
```

## 4. Start the Vega Virtual Device

```sh
vega virtual-device start --timeout 300     # opens the "Vega Virtual Device" window; "Virtual device ready." in ~10 s
vega virtual-device status                  # {"running":true,...}
"$VDA" devices                              # emulator-5554   device
```

`status` prints a misleading SDK version (`0.200.0` through a `kepler --v` fallback, because `vvman` is not on PATH). You can ignore it.

## 5. Install and launch

```sh
vega run-app vega-app/build/vpkg/sema_aarch64.vpkg com.sema.viewer.main
# Installed … / Successfully launched the app
```

**Other device commands**

```sh
vega device launch-app --appName com.sema.viewer.main     # relaunch (reloads the page)
vega device terminate-app --appName com.sema.viewer.main
vega device running-apps
```

## 6. Drive it with remote keys from the CLI

**Basic form.** Keys are injected on the device with the developer-mode tool `inputd-cli`:

```sh
"$VDA" shell 'inputd-cli button_press KEY_DOWN'
"$VDA" shell 'inputd-cli button_press KEY_ENTER'           # Select
"$VDA" shell 'inputd-cli button_press KEY_BACK'
"$VDA" shell 'inputd-cli button_press KEY_PLAYPAUSE'
"$VDA" shell 'inputd-cli button_press KEY_REWIND'          # / KEY_FASTFORWARD / KEY_HOMEPAGE
"$VDA" shell 'inputd-cli button_press KEY_BACK --holdDuration 2500'
```

**Wrapper script.** `tools/vega-probe/remote.sh` uses friendly names:

```sh
tools/vega-probe/remote.sh down down select          # DELAY=0.6 s between presses by default
tools/vega-probe/remote.sh --raw KEY_SELECT
```

Names: `up down left right select back menu playpause rewind ff home`.

**Which key is Select.** Use `KEY_ENTER`. `KEY_SELECT` and `KEY_OK` produce no DOM event in the WebView (see `PLATFORM-FINDINGS.md`).

**Chords (VoiceView on/off = hold Back + Menu for at least 2 s).** `series` takes unquoted tokens, and a held key stays down across calls:

```sh
"$VDA" shell 'inputd-cli series button_hold KEY_BACK'
"$VDA" shell 'inputd-cli series button_hold KEY_MENU'
sleep 3
"$VDA" shell 'inputd-cli series button_release KEY_MENU'
"$VDA" shell 'inputd-cli series button_release KEY_BACK'
```

**Using the VVD window instead.** You can also click the on-screen remote. The emulator maps the Mac keyboard as Esc=Back, F1=Home, F2=Menu, F3=Rewind, F4=Play/Pause and F5=FF; this comes from the VVD launch arguments and is untested.

## 7. Logs and screenshots

**Device log.** Developer mode uses `loggingctl` instead of `journalctl`:

```sh
"$VDA" shell 'loggingctl log -f -o short_precise'                       # follow everything
"$VDA" shell 'loggingctl log -f' | grep -E 'com.sema.viewer|WebViewMessage'
```

**What shows up in the log**

* The WebView page's `console.*` output does **not** appear.
* WebView load errors do. `vega-app/src/App.tsx` logs `onError`/`onHttpError`.
* So do page messages sent through `window.ReactNativeWebView.postMessage(string)`; `App.tsx` logs them as `[WebViewMessage] <data>`.

**Screenshots.** The on-device `screenshooter` and `gwsi-tool-screenshooter` fail in the developer shell. Capture the VVD window on the Mac instead:

```sh
tools/vega-probe/vvd-screenshot.sh docs/vega/screenshots/name.png
```

The helper brings the window forward first; under Stage Manager a background window only captures as a 256×198 thumbnail. It needs Screen Recording permission for your terminal, and the Mac display must be awake.

## 8. Run the platform probe (optional)

```sh
node tools/vega-probe/collect.js --device-log --raw docs/vega/logs/device-probe.log &   # appends to docs/vega/probe-results.jsonl
node tools/vega-sync.js --probe
vega-app/scripts/build-staged.sh Debug aarch64
vega run-app vega-app/build/vpkg/sema_aarch64.vpkg com.sema.viewer.main
# The automatic tests take ~5 min (codec trials include two 72 s films); then press keys with tools/vega-probe/remote.sh
```

**The two long films are not in git.** `tools/vega-probe/media-test/long-*.webm` (~15 MB each) are git-ignored; regenerate them from `content/sources/` with the VP8 command in `PLATFORM-FINDINGS.md`, "Codec trials". Without them, trials L3/L4/N2 report `DID NOT LOAD`. The older media trials still run from the "Re-run media test" button.

The probe shows results on screen and sends them through the React Native bridge into the device log. The collector reads that log over `vda`. The collector also accepts HTTP POSTs, but the WebView blocks cleartext HTTP (`net::ERR_CLEARTEXT_NOT_PERMITTED`), so HTTP only helps when you test the page in a desktop browser. To serve that HTTP path to the device anyway:

* use `"$VDA" reverse tcp:8765 tcp:8765` (device `127.0.0.1:8765`), or
* use `10.0.2.2:8765` (QEMU user networking).

## 9. Run the Sema app

**Video codec for the VVD: use WebM with VP8 video and Opus audio.** On the VVD, H.264 MP4 and VP9 stop after about 3 s, and AV1 shows no picture. See `PLATFORM-FINDINGS.md`, "Codec trials", for the evidence and the ffmpeg command.

```sh
npm run bundle && node tools/vega-sync.js
vega-app/scripts/build-staged.sh Debug aarch64
vega run-app vega-app/build/vpkg/sema_aarch64.vpkg com.sema.viewer.main
tools/vega-probe/remote.sh select          # e.g. open the focused film
```

## 10. Stop

```sh
vega device terminate-app --appName com.sema.viewer.main
vega virtual-device stop
```

## Notes for a real Fire TV

Build `armv7` (`vega-app/scripts/build-staged.sh Debug armv7`) and pass `-d <serial>` to `vega run-app`. This was not tested here.
