# Vega friction candidates (observed while porting Sema)

Every item below happened during this session, with Vega SDK 0.24.12112, the Vega Virtual Device (VVD, aarch64), macOS on Apple silicon, Node 22.22 and npm 10.9 (2026-10-01). Error text is copied verbatim.

**Severity scale**

* **Blocker:** stops the task with no workaround inside the SDK.
* **High:** a workaround exists, but it is non-obvious or costs real time.
* **Medium:** confusing or noisy.
* **Low:** cosmetic.

---

## 1. Spaces in the project path break `npm run build:debug`. Blocker (High once you know the workaround)

* **Task:** build the `vegaWebview` template project.
* **Steps:** `cd ".../2025 Fall Projects/.../Sema/vega-app" && npm run build:debug`
* **Expected:** a debug `.vpkg`.
* **Actual:**

  ```
  /bin/sh: /Users/jerem/Desktop/Projects/2025: No such file or directory
  error Unable to generate a manifest: Error: Command failed: /Users/jerem/Desktop/Projects/2025 Fall Projects/…/vega-app/node_modules/@amazon-devices/kepler-module-manifest-builder/dist/src/cli.js build -d /Users/jerem/Desktop/Projects/2025 Fall Projects/…/vega-app -p ./package.json -s
  ```

  `@amazon-devices/kepler-compatibility-metro-config@0.0.7` (`dist/src/utils.js`, `buildKeplerManifest`) runs `child_process.execSync(\`${manifestBuilderBinary} build ${packageDirArgs} -p … -s\`)` with unquoted paths. A symlinked, space-free path does not help, because the CLI uses the physical cwd.
* **Workaround:** build from a copy whose path has no spaces. `vega-app/scripts/build-staged.sh` rsyncs to `$TMPDIR/sema-vega-app`, runs `npm ci` and `react-native build-vega`, and copies the `.vpkg` back.
* **Suggestion:** use `execFileSync` with an argument array, or quote the paths. Also add a "paths with spaces" check to `vega project doctor`.

## 2. `vega build` alone exits 0 with a package that has no JS bundle. High

* **Task:** build with the SDK CLI directly, which is what `vega build -h` suggests.
* **Steps:** `cd vega-app && vega build -b Debug -t aarch64`
* **Expected:** a runnable package, or an error saying the JS bundle step is missing.
* **Actual:**
  * `vega vtbuild exited with code 0` with `"size": 4893`.
  * The package contains `assets/index.html` and `bundle/assets/app.json`, but no `bundle/index.hermes.bundle`.
  * The only hint is a buried line: `[native-build] cp: no such file or directory: …/vega-app/build/lib/rn-bundles/Debug/assets/*`
  * That same `cp:` line also appears on good builds (`npm run build:debug`), so it trains you to ignore it.
* **Workaround:** use `npm run build:debug` (`react-native build-vega`), which runs Metro first.
* **Suggestion:** fail, or at least warn, when `includeJsBundle` is true and no bundle exists. Drop the `cp` noise when the assets directory is simply absent.

## 3. The output path contains a literal `undefined` segment. Low

* **Task:** find the built package.
* **Steps:** any successful build.
* **Expected:** something like `build/vpkg/sema_aarch64.vpkg`.
* **Actual:** `vega-app/build/private/kepler/@amazon-devices/sema/undefined/vega/aarch64/Debug/@amazon-devices/sema_aarch64.vpkg`
* **Workaround:** `find vega-app/build -name '*.vpkg'`. `build-staged.sh` copies the package to `vega-app/build/vpkg/`.
* **Suggestion:** fill in the missing variable, or print the final package path as the last line of the build.

## 4. `~/vega/env` points PATH at a deleted temp directory. Medium

* **Task:** use the `vega` CLI after installing the SDK.
* **Steps:** `. ~/vega/env; command -v vega`
* **Expected:** `vega` found.
* **Actual:** `~/vega/env` prepends `/private/tmp/sema-vega-tools/bin`, which no longer exists. `ls: /private/tmp/sema-vega-tools/bin: No such file or directory`, and `vega: command not found`.
* **Workaround:** `export PATH="$HOME/vega/sdk/vega-sdk/main/0.24.12112/bin:$PATH"`
* **Suggestion:** the installer should point PATH at a stable location (the SDK `bin/` or `~/vega/bin`), never at a temp directory.

## 5. `vega virtual-device status` reports the wrong SDK version. Low

* **Task:** check whether the VVD is running.
* **Steps:** `vega virtual-device status`
* **Expected:** the status and SDK 0.24.12112.
* **Actual:**

  ```
  [WARN] vvman command not found or failed: exec: "vvman": executable file not found in $PATH
  [INFO] Attempting fallback to kepler --v command
  [INFO] kepler command result: 0.200.0
  [INFO] SDK Version obtained: 0.200.0
  {"running":false,"process_ids":{"qemu":-1}}
  ```

  The CLI's own log also says `keplerCliVersion=0.200.0`, while `vega --version` prints `0.24.12112`.
* **Workaround:** none needed; ignore it.
* **Suggestion:** resolve `vvman` from the SDK's own tree, and keep the version warnings out of normal output.

## 6. `fetch()` and XHR cannot read the app's own `file:///pkg/assets` files. High (for web apps)

* **Task:** load a JSON package that ships next to `index.html` in the `vegaWebview` template.
* **Steps:** from `file:///pkg/assets/index.html`, call `fetch('media/fixture.json')`, `fetch('file:///pkg/assets/media/fixture.json')` and an XHR GET.
* **Expected:** the JSON. The template invites `file://` loading, and `<video src>` / `<script src>` to the same directory work.
* **Actual:**
  * Every attempt fails: `TypeError: Failed to fetch`, and XHR fires `error` with status 0.
  * The host's `onError` logs `[onError]: (-2: file:///pkg/assets/media/fixture.json) net::ERR_FAILED`.
  * A missing file gives the same error as an existing one.
* **Workaround:** generate a `<script src>` data file (`src/data.js` → `window.SEMA_DATA`). Not tried: `allowFileAccess`.
* **Suggestion:** document this in the `vegaWebview` template, both in the README and in a comment in `assets/index.html`, and show the supported pattern (script-embedded data or a local server).

## 7. Cleartext HTTP from the WebView is blocked, with no documented opt-in. Medium

* **Task:** send diagnostics from the page to the host (`vda reverse tcp:8765 tcp:8765`, or `10.0.2.2`).
* **Steps:** `fetch('http://127.0.0.1:8765/probe', {method:'POST', …})`, and the same for `10.0.2.2` and `localhost`.
* **Expected:** it reaches the host. `curl` from `vda shell` does reach it.
* **Actual:** `[onError]: (-29: http://127.0.0.1:8765/probe) net::ERR_CLEARTEXT_NOT_PERMITTED`, and the device log says `KeplerNetworkPolicy: No ClearTextTrafficPolicy`.
* **Workaround:** the WebView `onMessage` bridge (`window.ReactNativeWebView.postMessage`) with logging in `App.tsx`, read through `loggingctl`.
* **Suggestion:** document the cleartext policy and how to allow it for debug builds (a manifest key or a WebView prop), the way Android's `usesCleartextTraffic` / network-security-config does.

## 8. Web `console.*` output is not in the device log, and the log drops or suppresses lines. Medium

* **Task:** debug the web page on the VVD.
* **Steps:** `console.log(...)` in the page, then `vda shell 'loggingctl log -f'`.
* **Expected:** the page's console output in the device log, or a documented remote-inspector path.
* **Actual:**
  * Page console output never appeared.
  * Messages bridged through `[WebViewMessage]` did appear, but:
    * messages of ~1,500+ characters never appeared, and the longest line ever seen was 820 characters;
    * every `console.info` from the RN host was printed twice;
    * the app's JS info logs from the first ~3 s after launch were missing. That includes the template's own `Page loading completed...`, which never appeared in any run.
  * Related system line: `lc_ProcessConfigManager Process exceeds log limit of [300] lps, [info] logs will be temporarily suppressed for [1] sec`.
* **Workaround:** forward page messages through the `onMessage` bridge, send them in ≤600-character chunks, wait 5 s after launch, and de-duplicate on the host (`tools/vega-probe/collect.js --device-log`).
* **Suggestion:** forward WebView console output to the app's log in Debug builds, or document Chrome DevTools remote debugging for the Vega WebView.

## 9. `vega exec vda shell '…'` mangles quoting. Low

* **Task:** run a piped shell command on the device.
* **Steps:** `vega exec vda shell 'uname -a; id; echo $PATH; ls /usr/bin | head -300 | tr "\n" " "'`
* **Expected:** it runs on the device.
* **Actual:** `$PATH` expanded on the **host**, and the host printed `tr: missing operand after `n'` / `Two strings must be given when translating.`
* **Workaround:** call the binary directly: `"$(vega which vda | tail -1)" shell '…'`.
* **Suggestion:** pass the arguments through unchanged (`"$@"`) in the `vega exec` wrapper.

## 10. The vda server drops and restarts mid-session. Medium

* **Task:** run consecutive `vda shell` commands against the running VVD.
* **Steps:** several `vda shell …` calls, a few seconds apart.
* **Expected:** a stable connection.
* **Actual (seen twice):**

  ```
  * daemon not running; starting now at tcp:5037
  * daemon started successfully
  vda: error: connect failed: device offline (transport offline)
  ```

  The device came back within ~5 s. No Android `adb` was installed, so nothing else was competing for port 5037.
* **Workaround:** `vda wait-for-device` before commands, and retry.
* **Suggestion:** keep the vda server alive, or document why it exits.

## 11. On-device screenshot tools don't work from the developer shell. Medium

* **Task:** capture what the VVD shows from the CLI.
* **Steps:** `vda shell 'screenshooter /tmp/shot.png'`, then `vda shell 'gwsi-tool-screenshooter /tmp/g.png'`.
* **Expected:** a PNG to `vda pull`.
* **Actual:**
  * `screenshooter` prints `creating a buffer file for 8294400 B failed: Permission denied` / `error marshalling arguments for shoot (signature oo): null value passed for arg 1` / `Error marshalling request: Invalid argument`.
  * `gwsi-tool-screenshooter` hung for more than 120 s.
* **Workaround:** capture the host window (`screencapture -l<windowid>`; see `tools/vega-probe/vvd-screenshot.sh`). Under macOS Stage Manager the window must be raised first, or you get a 256×198 thumbnail.
* **Suggestion:** add a `vega device screenshot` command, or a `vvd` screenshot built on the emulator's own capture.

## 12. Template leftovers. Low

* **Task:** start from `vega project generate --template vegaWebview` (`@amazon-devices/ks-app@2.83.1`).
* **Actual:**
  * `metro.config.js` lines 4–7 contain literal diff `+` markers inside the comment (` + * Metro configuration`). They come from the upstream template tarball.
  * `src/App.tsx` says *"the splash screen images are bundled in this app (assets/raw/ folder)"*, but the template ships no `assets/raw/`. The only file there is the build-generated `keplerscript-app-config.json`, inside the package.
  * `manifest.toml` title is `Basic UI React Native Application for project sema`.
  * `vpt` warns `[package.icon] Icon is not defined in the manifest. System default will be used.`
  * `npm install` reports `27 vulnerabilities (14 moderate, 13 high)` in the template's dependencies.
* **Workaround:** edit by hand (done in this repo).
* **Suggestion:** fix the template; ship placeholder splash and icon assets, or remove the comment.

## 13. Remote keys: Menu never reaches the WebView, and `KEY_SELECT`/`KEY_OK` do nothing. Medium

* **Task:** map Fire TV remote buttons in a web app (`allowSystemKeyEvents` is set).
* **Steps:** `vda shell 'inputd-cli button_press KEY_MENU'` (and the same for `KEY_SELECT`, `KEY_OK`, `KEY_ESC`).
* **Expected:** a DOM key event for Menu, as there is for Back (`GoBack`/27) and media keys.
* **Actual:** no `keydown`/`keyup` for `KEY_MENU`, `KEY_SELECT`, `KEY_OK` or `KEY_ESC`. Select arrives only as `KEY_ENTER` (`Enter`/13).
* **Workaround:** don't rely on Menu in web apps; Select, Back and Play/Pause all work.
* **Suggestion:** document the WebView key table (key, code and keyCode for each remote button), and say whether Menu can be delivered.

## 14. `inputd-cli series` rejects its documented syntax. Low

* **Task:** inject a two-key chord (Back + Menu hold toggles VoiceView).
* **Steps:**
  * `inputd-cli series "button_hold KEY_BACK,button_hold KEY_MENU"` → `Cmd: button_hold KEY_MENU` / `Unrecognized command: button_hold KEY_MENU`
  * `inputd-cli series "button_press KEY_LEFT short"` → `Unrecognized command: button_press KEY_LEFT short`
* **Expected:** usage says `inputd-cli series <comma_separated_actions>...`.
* **Actual:** only the **unquoted** form works: `inputd-cli series button_hold KEY_BACK` → `Injecting Button Press As Driver: KEY_BACK State: down`. The held state persists across invocations.
* **Workaround:** one `series button_hold` / `button_release` call per key (see `BUILD-AND-RUN.md` §6).
* **Suggestion:** fix the parser or the usage text, and add an example.

## 15. VVD `<video>` playback stalls after ~3 s, seeks never complete, and `play()` can hang. High (for media apps)

* **Task:** play a local H.264/AAC MP4 in the WebView.
* **Steps:** `tools/vega-probe/probe.html` trials T1, V1–V4 and T5 (`docs/vega/PLATFORM-FINDINGS.md` §c/e).
* **Expected:** 15 s of playback, `seeked` after a seek, and `ended`. The same file does all of this in desktop Chromium.
* **Actual:**
  * **High, Main and Baseline profiles; 480p and 720p; with or without an audio track; relative and absolute URLs:** `waiting` fires about 3.1 s after `play()` (0.1 s when there is no audio track) with `readyState` 2. The video never recovers.
  * **After a seek:** `seeking` fires, `seeked` never does, and the next `play()` promise never settles.
  * **Device log:**
    * `media_transform_wrapper_idl.cc:426] No available media format buffer sizes, using fallback frame buffer size`
    * `media_transform_wrapper_idl.cc:735] Color Space is not supported. Downgrading to BT709`
    * `JsonMediaCapabilitiesParser:codec capabilities JSON file is missing for the device!!`
* **More detail:** VP9 WebM behaves exactly like H.264 (stall at 3.18 s; seeks never complete). Both go through `Initializing AmazonVideoDecoderIdl with config: codec: h264|vp9`. AV1 WebM loads with `videoWidth/Height` 0×0 and plays audio only. `canPlayType` still answers `"probably"` for H.264, VP9 and WebM.
* **Workaround:** **VP8 + Opus in WebM works**: real-time playback to `ended`, every frame presented, seeks in 22–144 ms, verified on 15 s and 72 s films and with separate `new Audio()` narration on top (`PLATFORM-FINDINGS.md`, "Codec trials"). Also put timeouts on `play()` and `seeked`.
* **Suggestion:** fix the VVD's platform decoder path, or document "use VP8 on the VVD" and make `canPlayType` truthful.

## 16. VVD has no working speech: `speechSynthesis` fails and VoiceView's TTS service is missing. High (for accessibility apps)

* **Task:** use web speech for spoken prompts, and test VoiceView with the app.
* **Steps:**
  * `speechSynthesis.speak(new SpeechSynthesisUtterance('…'))`
  * Enable VoiceView (Back + Menu hold).
* **Expected:** speech, with `onend`, and VoiceView speaking.
* **Actual:**
  * `getVoices()` returns `[]`; `onerror` fires with `synthesis-failed` within ~3 ms; `onend` never fires.
  * When VoiceView starts, the log shows:

    ```
    pkgmgrd: E pkgmgr-registrar:[PackageRegistrarQueryHandler.cpp:201] Package for id 'com.amazon.tts.service.main' not found
    servicergrd: ERROR … error issuing launch request: ApmfError { message: "Failed to launch service component 'com.amazon.tts.service.main' -1", types: "" }
    ucc[1779]: The specified key: voiceview_ready_no_tutorial was not found in the given string resources.
    ```

* **Workaround:** pre-rendered audio clips through `new Audio()` (these do play), plus watchdog timeouts.
* **Suggestion:** include the TTS service in the VVD image, or document that the VVD can't be used for VoiceView/TTS testing.

## 17. The WebView's accessibility tree is published to VoiceView with role errors. Medium

* **Task:** VoiceView reading a WebView page.
* **Steps:** enable VoiceView while the probe page is open.
* **Expected:** clean UCC publication of buttons, text and live regions.
* **Actual:** many lines like:

  ```
  E chromium:[…:ERROR:kepler_common/content/browser/accessibility/ucc/kepler_ucc_publisher.cc:749] Invalid Role enum value
  W chromium:[…:WARNING:kepler_common/content/browser/accessibility/kepler_web_contents_accessibility.cc:266] Invalid role: rootWebArea   (also staticText, genericContainer)
  E chromium:[…:ERROR:kepler_common/content/browser/accessibility/ucc/kepler_ucc_publisher.cc:229] Error updating UCCElement child count
  ```

  VoiceView did draw its focus ring on the focused `<button>`.
* **Workaround:** none known. Whether text and live regions are spoken is unverified (see item 16).
* **Suggestion:** map Chromium's `rootWebArea`/`staticText`/`genericContainer` roles in the UCC publisher.

## 18. VoiceView can't be queried or toggled through `a11y-tv-util`. Low

* **Task:** check or enable VoiceView from the CLI.
* **Steps:** `vda shell 'a11y-tv-util settings list'` and `… settings get voiceview`.
* **Actual:** `error obtaining user profile object`, and `ERROR: setting key [voiceview] not found or is unset`. There's no way to list the valid keys.
* **Workaround:** inject the Back + Menu chord (item 14).
* **Suggestion:** make `settings list` work without a signed-in profile, and document the VoiceView key.

## 19. Small CLI and log papercuts. Low

* `vega run-app …` prints `Installed vega-app/build/vpkg/sema_aarch64.vpkg on ` with an empty device name.
* `vda shell journalctl` prints `WARNING: journalctl is not supported in developer mode shell. Please use loggingctl instead.` The hint is good. However, `loggingctl log -S "-5min"` fails with `error: unexpected argument '-5' found`; relative times need a different form.
* After the Mac's display slept, the VVD clock was exactly 23 minutes behind the host (host `22:09:44`, device `21:46:44`). Device-log timestamps no longer lined up with host-side events.
* In Debug builds, each WebView subresource failure is reported through the host `onError`. The template logs it with `console.error`, which also produces `W Volta:Reporting exception:` stack traces: noisy for an expected condition.

## 20. Deleted assets keep shipping: the build never prunes `build/private/vega/<arch>/<type>/assets/`. High

* **Task:** rebuild after removing or moving files under `vega-app/assets/`. Our web app moved its media from `media/*.mp3` to `media/fixture/*.mp3`.
* **Steps:** remove files from `assets/`, then build again in the same project directory (`react-native build-vega` / `npm run build:debug`), then `vega exec vpt show-contents <vpkg>`.
* **Expected:** the package mirrors the current `assets/` directory.
* **Actual:** the package still contained every file deleted since earlier builds: `assets/media/fixture.json`, `assets/media/door-rich.mp3` and the rest, next to the new `assets/media/fixture/...` files. A probe page's assets would have shipped inside the real app. Those files were still in `build/private/vega/aarch64/Debug/assets/media/`.
* **Workaround:** delete `vega-app/build/` before each build. `vega-app/scripts/build-staged.sh` now runs `rm -rf "$STAGE/build"` first.
* **Suggestion:** sync (mirror) the assets into the staging directory instead of copying over it, or clear it at the start of each build.

