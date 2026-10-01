# Vega platform findings for Sema (Vega Virtual Device)

Measured on 2026-10-01 with the **Vega Virtual Device (VVD)**, Vega SDK **0.24.12112**, macOS on Apple silicon (VVD target `aarch64`). The app is the `vegaWebview` template (`@amazon-devices/webview` 4.0.2, React Native 0.83). It loads `file:///pkg/assets/index.html`.

Every result below comes from `tools/vega-probe/probe.html` running inside the app's WebView, unless it says otherwise. Each item has three parts:

* **Observed:** what we measured.
* **Evidence:** where to check it.
* **Guess:** an interpretation we did not verify. Guesses are always labelled.

Nothing here has been checked on a physical Fire TV yet.

**Evidence files**

* `docs/vega/probe-results.jsonl`: one JSON line per probe message. Device data has `"via":"device-log"`.
* `docs/vega/logs/evidence-excerpts.txt`: the key device-log lines.
* `docs/vega/logs/device-probe-run*.log`: full `loggingctl` streams. These are git-ignored by the root `*.log` rule.
* `docs/vega/screenshots/*.png`

**Probe runs**

| Run id | What changed |
|---|---|
| `run-muq136cn` | HTTP transport only, so nothing reached the host. Screenshot 01. |
| `run-muq1cdea` | First run with the RN bridge. |
| `run-muq1grcd` | Controlled media trials. |
| `run-muq1wh4y` | Codec variants, the full key matrix, and Home. |
| `run-muq21e3e` | Relaunch after Home. |
| `run-muq25vdt` | Page reload during VoiceView enable. |

## Summary

| # | Question | Result on VVD |
|---|---|---|
| a | Remote key codes | D-pad, Select, Back, Play/Pause, Rewind and FF all reach the page (table below). **Menu does not reach the page.** Native spatial navigation is active. |
| b | `fetch` / XHR from `file://` | **Both fail** for every `file:///pkg/assets/...` URL. **Classic `<script src>` works.** `<video src>` / `<audio src>` load `file://` media. |
| c | `<video>` + separate `<audio>` at once | Both clocks advance together while the video still runs, and starting the audio does not pause the video. **But `<video>` itself stalls about 3.1 s after `play()`, with or without audio.** |
| d | `speechSynthesis` | Present. **0 voices.** `speak()` fires `onerror` with `synthesis-failed` within ~3 ms. **`onend` never fires.** |
| e | Media events | First play: `play` and `playing` arrive within 1–3 ms of `play()`. **About 3.1 s later `waiting` fires (readyState 2) with no recovery.** **Seeks never fire `seeked`.** `ended` never fires. |
| f | `navigator.mediaSession` | Present. All 8 action handlers register. Remote media keys arrive as **key events, not** session actions. The system calls the **`pause`** action when the app is backgrounded. |
| g | ARIA live / focus / VoiceView | `focus()` moves focus and fires DOM focus events. **VoiceView can be enabled on the VVD** (Back+Menu hold), tracks WebView DOM focus, and receives the WebView's accessibility tree. **No speech engine on the VVD** (`com.amazon.tts.service.main` missing), so live-region announcements cannot be heard or verified. |

**What this means for Sema right now**

* `<script src>` works, so loading package data from `src/data.js` / `window.SEMA_DATA` is the right approach. `fetch('media/...json')` cannot work in this WebView.
* On the VVD, film playback will stop after about 3 s. The app's `waiting` handler (`src/app.js`, `bufferTimer`) will then open the buffering controls. This is a platform limitation of the VVD video path, not a Sema bug. See item (e).
* Spoken prompts through `speechSynthesis` will never complete on the VVD. `src/voice.js` already handles this correctly: it prefers pre-rendered clips (plain `new Audio()`, which works) and uses a watchdog.
* The Menu button cannot be the only way to open controls. Select (Enter), Back and Play/Pause all reach the page.

## Environment (observed)

From probe section `env`, run `run-muq1wh4y`:

* **User agent:** `Mozilla/5.0 (Linux; Kepler 1.2; AQVV01P user/102282480; wv) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Chrome/144.0.7559.246 Safari/537.36`. This is a Chromium 144 WebView.
* **Location:** `location.href` is `file:///pkg/assets/index.html` and `origin` is `file://`.
* **Viewport:** `innerWidth × innerHeight` is 1920×1080 and `devicePixelRatio` is 1.
* **Media support:**
  * `canPlayType` returns `"probably"` for H.264 High + AAC, H.264 Baseline, MP3 and WebM/VP9.
  * `MediaSource`, `AudioContext`, `TextTrack` and IndexedDB exist.
  * `localStorage` works.
* **JS features:** optional chaining, `??`, `Array.prototype.at`, class fields, `structuredClone`, async/await and `replaceAll` are all present. Sema's bundle syntax is fine.
* **Media queries:** `prefers-reduced-motion`, `prefers-contrast: more`, `forced-colors`, `inverted-colors` and `prefers-color-scheme: dark` all evaluate to `false`.

## (a) Remote keys

**How the keys were sent.** Each key was injected on the VVD with `vda shell inputd-cli button_press <KEY>` (see `BUILD-AND-RUN.md`). The page logged every `keydown`/`keyup`. Source: `a-keys` records for `run-muq1wh4y` in `probe-results.jsonl`, and the injection order in the table.

| Remote button | Injected key | `event.key` | `event.code` | `keyCode` | Notes (observed) |
|---|---|---|---|---|---|
| D-pad up | `KEY_UP` | `ArrowUp` | `ArrowUp` | 38 | |
| D-pad down | `KEY_DOWN` | `ArrowDown` | `ArrowDown` | 40 | |
| D-pad left | `KEY_LEFT` | `ArrowLeft` | `ArrowLeft` | 37 | |
| D-pad right | `KEY_RIGHT` | `ArrowRight` | `ArrowRight` | 39 | |
| Select | `KEY_ENTER` | `Enter` | `Enter` | 13 | Also fires `click` on the focused `<button>` (`isTrusted: true`, `detail: 0`). |
| Back | `KEY_BACK` | **`GoBack`** | **`BrowserBack`** | **27** | The app did **not** exit. The probe calls `preventDefault()` on it, and `allowSystemKeyEvents` routes it to JS. |
| Menu | `KEY_MENU` | — | — | — | **No DOM event.** |
| Play/Pause | `KEY_PLAYPAUSE` | `MediaPlayPause` | `MediaPlayPause` | 179 | No `mediaSession` action fired. |
| (Play) | `KEY_PLAY` | `MediaPlayPause` | `MediaPlayPause` | 179 | Same event as Play/Pause. |
| (Pause) | `KEY_PAUSE` | `MediaPlayPause` | `MediaPlayPause` | 179 | Same event as Play/Pause. |
| Rewind | `KEY_REWIND` | `MediaRewind` | `MediaRewind` | 227 | |
| Fast forward | `KEY_FASTFORWARD` | `MediaFastForward` | `MediaFastForward` | 228 | |
| Home | `KEY_HOMEPAGE` | — | — | — | No key event. The page gets a `mediaSession` **`pause`** action call, then `window` `blur`, and the app goes to the background. |
| — | `KEY_SELECT`, `KEY_OK`, `KEY_ESC`, `KEY_F2` | — | — | — | No DOM event for any of these. |

**Other observations**

* **Native spatial navigation exists.** In `run-muq1wh4y`, unhandled arrow keys moved focus between the probe's four buttons following the layout:
  * `ArrowRight`: `#b-media` → `#b-speak` → `#b-live` → `#b-send`
  * `ArrowLeft` went back one button.
  * `ArrowUp`/`ArrowDown` from the bottom row did not move.

  However, in `run-muq1cdea`, three arrow presses did **not** move focus. That run's video was stuck in a stalled `play()` at the time; we don't know whether that mattered.

  Sema calls `preventDefault()` on arrows and moves focus itself (`advanceFocus`), so the two navigations should not double up. Any arrow handler that does **not** call `preventDefault()` will get the WebView's own movement as well.
* **Relaunch reloads the page.** After Home, `vega device launch-app --appName com.sema.viewer.main` reloaded the page (a new run id). Only `localStorage` carried over, which Sema already uses.
* **Mac keyboard mapping (from the launch log, not tested).** The VVD's launch command maps the Mac keyboard as Esc→Back, F1→Home, F2→Menu, F3→Rewind, F4→Play/Pause and F5→FF. Evidence: `vvd/virtual_device.log`, `-keyboard-mapping` argument. We did not check whether F2 (Menu) reaches the page.
* **Unknown: the on-screen remote's OK button.** We did not check which Linux key it sends. `KEY_ENTER` is the one that produces `Enter`/13.
* **Recommendation for `src/keymap.js`:** it already maps `GoBack`/`BrowserBack`/27, `Enter`/13, `MediaPlayPause`/179, `MediaRewind`/227 and `MediaFastForward`/228 correctly. `ContextMenu`/93 (Menu) will never arrive on the VVD, so every feature must also be reachable through Select, Back or Play/Pause.

## (b) `fetch` and `XMLHttpRequest` from `file://`

**Observed.** Run `run-muq1wh4y`, section `b`, with the same results in every run on the device:

| Request | Result |
|---|---|
| `fetch('media/fixture.json')` | `TypeError: Failed to fetch` after 2 ms |
| `fetch('file:///pkg/assets/media/fixture.json')` | `TypeError: Failed to fetch` |
| `fetch('media/fixture.mp4')` as a blob | `TypeError: Failed to fetch` |
| `fetch` of a missing file | `TypeError: Failed to fetch` (no 404 is distinguishable) |
| `XMLHttpRequest` GET, `responseType` `text` or `json` | `error` event, `status` 0 |
| `<script src="probe-script.js">` | **`load`**, and the global was set |
| `<video src>` / `<audio src>` / `new Audio(src)` | load fine (`canplay`), with relative or absolute `file://` URLs |

Each failed fetch is also reported to the React Native host's `onError` callback. In `App.tsx` that logs `[onError]: (-2: file:///pkg/assets/media/fixture.json) net::ERR_FAILED` (see `logs/evidence-excerpts.txt`). In a Debug build these also show as `console.error` exceptions in the device log.

**What this means for Sema**

* The original `fetch('media/fixture.json')` loader can never load on Vega. The page would sit at "Cannot open package: Failed to fetch".
* The current approach is correct: generated `src/data.js` sets `window.SEMA_DATA`, and `index.html` loads it with `<script src>`.

**Guess:** this is standard Chromium/Android-WebView behaviour (`fetch` doesn't support the `file:` scheme, and file-URL XHR is off by default). `@amazon-devices/webview` has an `allowFileAccess` prop. Its docs say it is "not needed to access assets in the /pkg/assets directory", and we did **not** test whether it changes fetch/XHR.

**Getting data off the device (also observed)**

* **HTTP is blocked.** The page cannot POST to a host collector. `http://127.0.0.1:8765` (with `vda reverse`), `http://10.0.2.2:8765` and `http://localhost:8765` all fail with `net::ERR_CLEARTEXT_NOT_PERMITTED`. The device log says `KeplerNetworkPolicy: No ClearTextTrafficPolicy`.
* **The host is reachable from the device shell.** `vda shell curl http://127.0.0.1:8765/` (after `vda reverse`) and `curl http://10.0.2.2:8765/` both reached the collector. Only the WebView blocks it.
* **Page console output is not in the device log.** `console.log` from the page never appeared in `loggingctl`.
* **What works: the React Native bridge.** Setting `onMessage` on the WebView (`vega-app/src/App.tsx`) injects `window.ReactNativeWebView.postMessage`. The host logs each message as `[WebViewMessage] …` and `tools/vega-probe/collect.js --device-log` collects it.
  * Device-log lines longer than about 1 KB were dropped whole, so the probe chunks messages to 600 characters.
  * JS info logs from the first ~3 s after launch were missing, so the probe waits 5 s before testing.
  * Each `console.info` appears twice in `loggingctl`, so the collector de-duplicates.

## (c) `<video>` and a separate `<audio>` playing at the same time

**Observed.** Runs `run-muq1grcd` and `run-muq1wh4y`, sections `c-*`. The 250 ms clock samples are in each record's `samples`.

| Trial (fresh load each time) | Video clock | Separate audio | Result |
|---|---|---|---|
| A1: `new Audio(mp3)` alone | — | 3.25 s in 3.25 s wall, `ended` fired | MP3 playback works |
| T1: fixture H.264 High 720p, AAC 44.1 kHz mono, alone | 0 → 3.09 s, then `waiting`, stuck | — | **Video stalls with no audio involved** |
| V4: same, absolute `file:///pkg/assets/...` URL | 0 → 3.10 s, then stuck | — | Same stall |
| V1: H.264 Constrained Baseline 720p, AAC 44.1 kHz stereo, GOP 1 s | 0 → 3.15 s, then stuck | — | Same stall |
| V2: H.264 Main 480p, AAC 48 kHz stereo | 0 → 3.09 s, then stuck | — | Same stall |
| V3: fixture video with **no audio track** | 0 → 0.10 s, then stuck | — | Stalls almost at once |
| T2: fixture + `new Audio(mp3)` started at 1.5 s | Kept advancing at real time until its usual stall at 3.11 s; never paused | Played to `ended` (3.5 s in 3.5 s) | **Concurrent while the video runs.** The audio didn't pause the video. |
| T3: same, video `muted` | Advanced until stall at 3.11 s | Played to `ended` | Same as T2 |
| T4: fixture + DOM `<audio>` element | Advanced until stall at 3.13 s | Played to `ended` | Same as T2 |

**Other observations**

* **The audio sometimes stalls too.** In `run-muq1grcd`, which ran after the video had already stalled several times, the separate audio also stopped advancing (≈0.2–0.35 s in 9–10 s, no `ended`). In `run-muq1cdea`, the first clip played to the end while the video was stalled.
* **One shared audio focus session.** The device log shows the `<video>` element and `new Audio()` sharing one Chromium audio focus session: `AcquireAudioFocus`, then `Skipping attempt to Acquire Audio Focus when we already have focus`, and both streams report `focus session id: 18`. No duck, pause or focus-loss event was logged when the second stream started.
* **Ducking is not measurable.** The VVD gave us no audio we could listen to, and nothing in JS or the logs shows volume ducking.

**Guess:** the stall comes from the VVD's software video path, not from Sema or from concurrency.

* Nearby device-log errors: `media_transform_wrapper_idl.cc:426 No available media format buffer sizes, using fallback frame buffer size`, `Color Space is not supported. Downgrading to BT709` and `JsonMediaCapabilitiesParser: codec capabilities JSON file is missing for the device!!`.
* The ~3 s stall with an audio track, against ~0.1 s without one, fits a decoder that hands back almost no frames while the audio clock carries playback for about 3 s.

**This must be re-tested on a real Fire TV before we draw product conclusions.**

## (d) `window.speechSynthesis`

**Observed.** Every device run, section `d`:

* `speechSynthesis` and `SpeechSynthesisUtterance` exist.
* `getVoices()` returns `[]` straight away. `voiceschanged` fires about 3.5 s after the probe starts, but `getVoices()` is still `[]` afterwards.
* `speak()` fires `onerror` with `error = "synthesis-failed"` 1–10 ms later. **`onstart` and `onend` never fire.**
* `speechSynthesis.speaking` at +300 ms was not available because `onerror` had already ended the test.

**Guess:** the VVD has no working TTS backend for the WebView. When VoiceView started it tried to launch `com.amazon.tts.service.main`, and the device log says `Package for id 'com.amazon.tts.service.main' not found`. The VVD does have Ivona accessibility voices under `/usr/share/ivonatts` (for example `en_us_salli24_a11y.json`) and `com.amazon.accessibility.tts.service.main`.

**What this means for Sema:** never wait on `onend`. Pre-rendered prompt clips played with `new Audio()` do work (A1 above).

## (e) Media events on first play and after a seek

**Observed.** `run-muq1wh4y`; times are relative to `play()`.

* **First play** (T1):
  * Loading: `loadstart` → `loadedmetadata` (~20 ms) → `loadeddata` / `canplay` (~110–170 ms after `src` was set).
  * `play()`: `play` and `playing` arrive at +1–3 ms, and the `play()` promise resolves.
  * `timeupdate` fires normally until about +3.1 s.
  * Then `waiting` arrives with `readyState` 2, `paused` stays false, and the clock freezes. There is no further `playing`, `stalled`, `ended` or `error` within the 6–14 s observation windows.
* **Seek** (T5): played 1 s, `pause()`, then `currentTime = 11`.
  * `pause` and `seeking` fire immediately, with `readyState` 1.
  * **`seeked` never fires** (6 s timeout).
  * The next `play()` fires `play` and `waiting` (`readyState` 1), but **the `play()` promise never settles** (5 s timeout). The clock stays at 11.00, and `ended` never fires.
  * Run `run-muq136cn` stayed frozen at 11.00 for more than 4 minutes, and its probe hung (screenshot `01-probe-run1-fetch-fails-media-hang.png`). Later probe versions put a timeout on every `play()` promise.
* **`stalled`:** fired only during loading on some fresh loads (`readyState` 1, before `canplay`), never during playback.
* **The same file plays fine on desktop Chromium.** Run in desktop Chrome 152, the probe page plays all trials through, `seeked` fires 5 ms after the seek, and `ended` fires on time.

**What this means for Sema on the VVD**

* A `play()` promise can hang forever, so put a timeout on any `await video.play()`.
* `seeked` cannot be relied on.
* The `waiting` → buffering-controls path will trigger about 3 s into every playback.

## (f) `navigator.mediaSession`

**Observed** (section `f`, plus `f-action` records):

* `navigator.mediaSession` and `MediaMetadata` exist. Setting `metadata` works, `setPositionState` is a function, and `playbackState` starts as `"none"`.
* `setActionHandler` succeeded for all 8 actions: `play`, `pause`, `stop`, `seekbackward`, `seekforward`, `seekto`, `previoustrack` and `nexttrack`.
* **Remote media keys did not trigger any action.** Play/Pause, Rewind and FF arrived only as `keydown`/`keyup` (179/227/228).
* **The system did call `pause` three times:**
  * when Home was pressed (`run-muq1wh4y`, followed by `blur`),
  * when the app was replaced by a reinstall (`run-muq136cn`, followed by `blur` and `visibilitychange: hidden`),
  * when VoiceView was enabled (`run-muq21e3e`).
* **Guess:** `allowsDefaultMediaControl` (true in the template) is what wires the system's media-control pause into `mediaSession`.

**What this means for Sema:** handle Play/Pause/Rewind/FF as key events, which `keymap.js` already does. Treat the `pause` action and `visibilitychange` as "the system took over". `app.js` already does both.

## (g) ARIA live regions, focus, and VoiceView

**In the page (observed, section `g`, all device runs).** Programmatic `focus()` moved `document.activeElement` 3 of 3 times, fired DOM `focus` events 3 of 3 times, and `document.hasFocus()` was `true`. The page cannot observe whether a screen reader announced anything.

**Enabling VoiceView on the VVD (observed).** Hold Back + Menu for at least 2 s. From the CLI:

```sh
vda shell 'inputd-cli series button_hold KEY_BACK'
vda shell 'inputd-cli series button_hold KEY_MENU'
sleep 3
vda shell 'inputd-cli series button_release KEY_MENU'
vda shell 'inputd-cli series button_release KEY_BACK'
```

The device log then shows `Inputd:triggerEvent:628: VoiceView Combo Triggered`.

* Screens shown: a welcome screen (`02-voiceview-welcome.png`), a tutorial screen after Play/Pause (`03-voiceview-tutorial.png`; FF exits it), and a **"Dolby + VoiceView"** dialog (`04-voiceview-dolby-dialog.png`).
  * The dialog says: *"VoiceView can only speak during video playback if Dolby audio is disabled."*
  * We chose "Do not disable Dolby", which changes nothing.
  * This matters for an audio-description app: on Dolby-enabled devices VoiceView may stay silent during playback.
* **To turn VoiceView off,** do the same hold again. The log says `voiceview_stop`.
* **`a11y-tv-util` can't toggle it.** `a11y-tv-util settings list` fails with `error obtaining user profile object`, and keys such as `voiceview` or `screenReader` are "not found or is unset".

**With VoiceView on (observed)**

* The WebView's UCC publisher switches on: `kepler_ucc_publisher.cc:130 Changing verbosity to : METADATA`.
* It publishes the page's accessibility tree, but logs many errors:
  * `Invalid Role enum value`
  * `Invalid role: rootWebArea`, `Invalid role: staticText`, `Invalid role: genericContainer`
  * repeated `Error updating UCCElement child count`
* VoiceView draws its **green focus ring on the WebView's focused `<button>`** (`05-probe-voiceview-focus-ring.png`), so it follows DOM focus.
* `ArrowRight` still reached the page as a `keydown`, but focus did not move that time.
* While the welcome screen was up, keys went to VoiceView (the `ucc` process) and not to the page.
* The page reloaded once during the welcome/tutorial screens (new run id `run-muq25vdt`). We don't know why.

**Not verifiable on the VVD (unresolved)**

* We could not hear or log whether VoiceView reads focused elements, `aria-live` updates, or `role="status"` text.
* VoiceView's TTS dependency `com.amazon.tts.service.main` is missing on this image (`Failed to launch service component 'com.amazon.tts.service.main' -1`), and the VVD gave us no audio we could listen to.

**Next step:** test on a Fire TV with VoiceView. Check focus announcements, `aria-live="polite"` / `role="status"`, and whether VoiceView speaks while a `<video>` plays.

## Real Sema app on the VVD

See `BUILD-AND-RUN.md`, "Run the Sema app". Results are recorded in the section "Sema app run (observed)" below.

## Sema app run (observed)

_Pending; this section is filled in by the Sema app run._
