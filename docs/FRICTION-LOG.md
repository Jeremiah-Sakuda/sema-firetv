# Friction log

Real problems we hit while building Sema between 2026-09-27 and 2026-10-05. Each entry gives:
- the task
- exact steps
- expected vs. actual result, with verbatim error text
- severity
- the workaround we used
- an actionable suggestion

**Environment:** Vega SDK 0.24.12112; the Vega Virtual Device (VVD, aarch64) on macOS / Apple silicon; `@amazon-devices/webview` 4.0.2 (Chromium 144); Node 22.

**SDK version:** 0.24.12112 was the newest SDK installed when the log was last checked (2026-10-08). The Vega entries have not been re-run on a later SDK.

**AWS entries:** entries 24–26 come from the live authoring pilot (2026-10-04, us-east-1). Measured usage is in [evidence/aws/](evidence/aws/LIVE-PILOT-2026-10-04.json).

**Evidence:** [vega/PLATFORM-FINDINGS.md](vega/PLATFORM-FINDINGS.md), `vega/logs/evidence-excerpts.txt` and `vega/screenshots/`.

**Severity scale:**
- **Blocker:** stops the task, with no workaround inside the SDK.
- **High:** there is a workaround, but it is non-obvious or costly.
- **Medium:** confusing or noisy.
- **Low:** cosmetic.

| # | Issue | Severity |
|---|---|---|
| 1 | Spaces in the project path break `npm run build:debug` | Blocker (High once you know the workaround) |
| 2 | `vega build` alone exits 0 with a package that has no JS bundle | High |
| 3 | The output path contains a literal `undefined` segment | Low |
| 4 | `~/vega/env` points PATH at a deleted temp directory | Medium |
| 5 | `vega virtual-device status` reports the wrong SDK version | Low |
| 6 | `fetch()` and XHR cannot read the app's own `file:///pkg/assets` files | High (for web apps) |
| 7 | Cleartext HTTP from the WebView is blocked, with no documented opt-in | Medium |
| 8 | Web `console.*` output is not in the device log, and the log drops or suppresses lines | Medium |
| 9 | `vega exec vda shell '…'` mangles quoting | Low |
| 10 | The vda server drops and restarts mid-session | Medium |
| 11 | On-device screenshot tools don't work from the developer shell | Medium |
| 12 | Template leftovers | Low |
| 13 | Remote keys: Menu never reaches the WebView, and `KEY_SELECT`/`KEY_OK` do nothing | Medium |
| 14 | `inputd-cli series` rejects its documented syntax | Low |
| 15 | VVD `<video>` playback stalls after ~3 s, seeks never complete, and `play()` can hang | High (for media apps) |
| 16 | VVD has no working speech: `speechSynthesis` fails and VoiceView's TTS service is missing | High (for accessibility apps) |
| 17 | The WebView's accessibility tree is published to VoiceView with role errors | Medium |
| 18 | VoiceView can't be queried or toggled through `a11y-tv-util` | Low |
| 19 | Small CLI and log papercuts | Low |
| 20 | Deleted assets keep shipping: the build never prunes `build/private/vega/<arch>/<type>/assets/` | High |
| 21 | Turning on VoiceView warns that it "can only speak during video playback if Dolby audio is disabled" | High (for audio-description apps) |
| 22 | `useKeplerBackHandler` takes Back away from the WebView; the generic `BackHandler.exitApp()` does nothing | High (for WebView apps) |
| 23 | VVD media playback slows to a crawl after repeated reinstalls; restarting the VVD restores it | Medium |
| 24 | Signing in to the AWS console does not authenticate the local SDK | Medium |
| 25 | Nova visual observations echoed the example or misidentified story-critical objects | High (for description authoring) |
| 26 | A line shortened to fit its gap can lose its meaning | Medium |

---

## 1. Spaces in the project path break `npm run build:debug`. Blocker (High once you know the workaround)

* **Task:** build the `vegaWebview` template project.
* **Steps:** `cd ".../2025 Fall Projects/.../Sema/vega-app" && npm run build:debug`
* **Expected:** a debug `.vpkg`.
* **Actual** (personal path replaced with an equivalent path containing spaces):

  ```
  /bin/sh: /Users/developer/Projects/Film: No such file or directory
  error Unable to generate a manifest: Error: Command failed: /Users/developer/Projects/Film App/vega-app/node_modules/@amazon-devices/kepler-module-manifest-builder/dist/src/cli.js build -d /Users/developer/Projects/Film App/vega-app -p ./package.json -s
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

* **Task:** start a web app from the official template.
* **Steps:** `vega project generate --template vegaWebview` (`@amazon-devices/ks-app@2.83.1`), then `npm install` and `npm run build:debug`.
* **Expected:** a clean starting project: no stray diff markers, no comments about files that don't exist, a project-specific title, and an icon.
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
* **Workaround:** one `series button_hold` / `button_release` call per key (entry 18 shows the overlapping-hold form that toggles VoiceView).
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
* **Expected:** the current VoiceView state, and a scriptable way to toggle it for automated accessibility tests.
* **Actual:** `error obtaining user profile object`, and `ERROR: setting key [voiceview] not found or is unset`. There's no way to list the valid keys.
* **Workaround:** inject the Back + Menu chord as two overlapping holds in one shell call:

  ```sh
  vda shell 'inputd-cli button_press KEY_BACK --holdDuration 3500 & sleep 0.1; inputd-cli button_press KEY_MENU --holdDuration 3300 & wait'
  ```

  Re-checked on 2026-10-08: same `a11y-tv-util` errors. The chord toggled VoiceView both ways, and React Native's `AccessibilityInfo` `screenReaderChanged` event reached the running app each time (log excerpts, October 8 section). Apps can detect VoiceView; test scripts just can't set it directly.
* **Suggestion:** make `settings list` work without a signed-in profile, and document the VoiceView key.

## 19. Small CLI and log papercuts. Low

Each papercut below is separately reproducible on SDK 0.24.12112 and the VVD.

| Task | Steps | Expected | Actual (verbatim) | Workaround | Suggestion |
|---|---|---|---|---|---|
| Install a package | `vega run-app vega-app/build/vpkg/sema_aarch64.vpkg com.sema.viewer.main` | The target device is named | `Installed vega-app/build/vpkg/sema_aarch64.vpkg on ` (empty device name) | Check `vega device list` separately | Print the device serial or name |
| Read recent device logs | `vda shell 'loggingctl log -S "-5min"'` | The last five minutes of logs | `error: unexpected argument '-5' found` | Use `loggingctl log -f` while reproducing | Accept relative times, or document the accepted format next to the `journalctl` hint |
| Correlate host and device events | Let the Mac display sleep, wake it, compare log timestamps | VVD clock matches the host | Device clock 23 minutes behind (host `22:09:44`, device `21:46:44`) | Restart the VVD before timing-sensitive tests | Resync the VVD clock on wake |
| Debug expected missing subresources | Request a missing optional file in a Debug build | One informational log line | The host `onError` plus `W Volta:Reporting exception:` stack traces for every failure | Ignore during debugging | Log expected subresource misses at info level in the template |

## 20. Deleted assets keep shipping: the build never prunes `build/private/vega/<arch>/<type>/assets/`. High

* **Task:** rebuild after removing or moving files under `vega-app/assets/`. Our web app moved its media from `media/*.mp3` to `media/fixture/*.mp3`.
* **Steps:** remove files from `assets/`, then build again in the same project directory (`react-native build-vega` / `npm run build:debug`), then `vega exec vpt show-contents <vpkg>`.
* **Expected:** the package mirrors the current `assets/` directory.
* **Actual:** the package still contained every file deleted since earlier builds: `assets/media/fixture.json`, `assets/media/door-rich.mp3` and the rest, next to the new `assets/media/fixture/...` files. A probe page's assets would have shipped inside the real app. Those files were still in `build/private/vega/aarch64/Debug/assets/media/`.
* **Workaround:** delete `vega-app/build/` before each build. `vega-app/scripts/build-staged.sh` now runs `rm -rf "$STAGE/build"` first.
* **Suggestion:** sync (mirror) the assets into the staging directory instead of copying over it, or clear it at the start of each build.


## 21. Turning on VoiceView warns that it "can only speak during video playback if Dolby audio is disabled". High (for audio-description apps)

- **Task:** enable VoiceView to test an audio-description player.
- **Steps:** hold Back + Menu for 2 s on the VVD (see item 14 for the CLI injection).
- **Expected:** VoiceView turns on and can announce controls while a film plays.
- **Actual:** a "Dolby + VoiceView" dialog says: *"VoiceView can only speak during video playback if Dolby audio is disabled."* The viewer must choose whether to disable Dolby (screenshot `docs/vega/screenshots/04-voiceview-dolby-dialog.png`).
- **Why it matters:** blind viewers are exactly the users who need both VoiceView and good program audio.
- **Workaround:** Sema pauses the film before any interface speech (spoken guidance, recovery, state announcements). So VoiceView and Sema never need to speak over playing video.
- **Suggestion:** document which audio paths are affected, and expose an API so apps can tell whether VoiceView can currently speak during playback.

## 22. `useKeplerBackHandler` takes Back away from the WebView; the generic `BackHandler.exitApp()` does nothing. High (for WebView apps)

- **Task:** in the `vegaWebview` template, let the page own Back (pause, leave the film, return to the catalog), then exit the app when Back is pressed on the page's root screen. This is standard Fire TV behaviour.
- **Steps and actual results** (Vega SDK 0.24.12112, VVD, 2026-10-05):
  1. **Generic API.** The page posts `{"sema":"exit"}`, and `App.tsx` calls `BackHandler.exitApp()` from `react-native`. **Actual:** the app keeps running (`vega device running-apps` still lists `com.sema.viewer.main`). The Kepler implementation calls `NativeDeviceEventManager.invokeDefaultBackPressHandler()`, which has no effect here.
  2. **Root-tag-aware hook.** Call `useKeplerBackHandler()` and use its `exitApp()`. **Actual:** registering the hook installs a native Back listener. With no subscription, the **first Back anywhere exits the app**. The page never sees it, and the system calls the `mediaSession` `pause` action as the app backgrounds.
  3. **Claiming Back.** Add `addEventListener('hardwareBackPress', () => true)`. **Actual:** the app no longer exits, but **Back no longer reaches the WebView at all**: no `keydown`, so the film kept playing.
- **Expected:** a documented way for a WebView app to receive Back in the page *and* to exit the app when the page declines it.
- **Workaround (shipped):**
  - Claim Back in a `hardwareBackPress` subscription, and forward it with `webRef.current.injectJavaScript('window.__semaBack && window.__semaBack(); true;')`.
  - The page handles Back. On its root screen it posts `{"sema":"exit"}`, and the host calls `useKeplerBackHandler().exitApp()`.
  - Verified on the VVD: Back during playback pauses; Back on the catalog exits.
- **Suggestion:** document Back ownership between the React Native host and `@amazon-devices/webview`. Add a WebView option that delivers Back to the page and calls a host callback when the page doesn't handle it.

## 23. VVD media playback slows to a crawl after repeated reinstalls; restarting the VVD restores it. Medium

- **Task:** reinstall and relaunch a debug build several times during one VVD session (Vega SDK 0.24.12112, 2026-10-05).
- **Steps:** `vega run-app vega-app/build/vpkg/sema_aarch64.vpkg com.sema.viewer.main` about 4 times over about 40 minutes, playing the same 15 s VP8/Opus fixture each time.
- **Expected:** real-time playback every time. The first run after a fresh boot reached 0:04 after about 4 s.
- **Actual:**
  - In later runs the clock advanced about 0.07 s per second of wall time (0.299 s → 1.067 s over about 13 s). There were no `waiting` events.
  - The screen showed only the poster or a frozen frame (`docs/vega/screenshots/54-vvd-degraded-poster-only.png`).
  - After `vega virtual-device stop` and `start`, the identical build played in real time again (0:05, then 0:09).
- **Workaround:** restart the VVD before any timing-sensitive test or demo recording.
- **Suggestion:** investigate media-pipeline resource leaks across app reinstalls on the VVD, and document the restart.

## 24. Signing in to the AWS console does not authenticate the local SDK. Medium

* **Task:** run the authoring pipeline (boto3) against a freshly created AWS account profile.
* **Steps:** sign in to the AWS console in a browser, then run `python -m sema_pipeline preflight --profile sema`.
* **Expected:** the developer sign-in is usable by the SDK, or the SDK error says exactly which command and dependency to use.
* **Actual:** the SDK had no usable credentials until `aws login --profile sema --region us-east-1` (AWS CLI 2.37.9) was run with `botocore[crt]` installed. Later calls failed with `LoginRefreshRequired: Your session has expired or credentials have changed. Please reauthenticate using 'aws login'.` when the temporary session expired.
* **Workaround:** a `preflight` command that checks identity, region, bucket and model access before any paid call, and the `aws login` step documented in `pipeline/README.md`.
* **Suggestion:** in the SDK error, name the missing `botocore[crt]` dependency, and say how long developer-login sessions last.

## 25. Nova visual observations echoed the example or misidentified story-critical objects. High (for description authoring)

* **Task:** extract timestamped visual events from a 72 s film excerpt with Amazon Nova Pro (Bedrock Converse).
* **Steps:** `observe --live` with video input. Then `observe --live --frames 2` (timestamped image batches, 2 frames per second).
* **Expected:** grounded events: the actual objects and actions on screen, at the right times.
* **Actual:**
  * **Video input:** some requests echoed the JSON example from the prompt or invented actions.
  * **Frame batches:** these described an injured baby dragon as "a defeated enemy" and a visible mechanical hand as "a glove".
  * Two excerpts are a small sample, not an accuracy benchmark.
* **Workaround:**
  * Use frame input with timestamps.
  * Keep a per-film editorial ledger (`content/editorial/`) recording every correction.
  * Gate publication on human review.
* **Suggestion:** document Nova's video sampling limits for brief actions. Provide grounding diagnostics, such as which frames support each claim, so authors can check story-critical objects.

## 26. A line shortened to fit its gap can lose its meaning. Medium

* **Task:** shorten a description until the rendered Polly audio fits the gap between dialogue lines.
* **Steps:** run the fit loop: render with Polly, measure with ffprobe, and if the line is too long, ask Bedrock for a shorter line.
* **Expected:** a shorter line that keeps the fact.
* **Actual:** the line fitted the measured gap but lost its content, e.g. "40 years later" became "Text".
* **Workaround:** protect required concepts per event (`content/description-contracts.json`, checked by `npm run content:check`), and keep human review mandatory.
* **Suggestion:** publish authoring examples that judge rendered duration and preservation of facts together, not duration alone.

## Feature requests

| Request | Why it matters to Sema | Priority |
|---|---|---|
| A TTS service and audible VoiceView on the Vega Virtual Device (entry 16) | We could not hear or automate a single screen-reader announcement for an accessibility app without hardware | Critical |
| Reliable H.264/VP9 decode and `seeked` on the VVD, or a published codec matrix (entry 15) | Media apps cannot be demoed or tested end to end on the simulator without VP8 renditions | Critical |
| An API reporting whether VoiceView can speak during playback, given Dolby settings (entry 21) | An AD app must know when the screen reader can be heard over the film | Important |
| A documented Back-ownership contract between the React Native host and `@amazon-devices/webview` (entry 22) | Pausing on Back and exiting at the root needed an `injectJavaScript` bridge | Important |
| A documented WebView remote-key table, and a way to receive Menu (entry 13) | Remote-first web apps need every button | Important |
| Documented `file://` asset loading for `vegaWebview`: fetch/XHR, or a supported alternative (entry 6) | Every data-driven web app hits this first | Important |
| Forward WebView `console` output to the device log in Debug builds (entry 8) | Basic debuggability | Nice-to-have |
| A `vega device screenshot` command (entry 11) | Documentation, QA and friction reporting | Nice-to-have |

