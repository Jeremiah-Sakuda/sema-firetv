# Findings

This document records what we have **measured**. Anything not yet measured says so. Proposed targets from the planning documents (`docs/planning/`) are not results.

_Last updated: 2026-10-01._

## 1. Platform: Vega Virtual Device

Full detail and evidence are in [vega/PLATFORM-FINDINGS.md](vega/PLATFORM-FINDINGS.md).

| Question | Measured on VVD (Vega SDK 0.24.12112, Chromium 144 WebView) | What Sema does about it |
|---|---|---|
| Remote keys | D-pad, Select (`Enter`/13), Back (`GoBack`/27), Play/Pause (179), Rewind (227) and FF (228) reach the page. **Menu does not.** | Every feature is reachable without Menu (`src/keymap.js`) |
| `fetch`/XHR of `file:///pkg/assets` | Always fail. `<script src>` and `<video>/<audio src>` work | Packages ship as `src/data.js` (`window.SEMA_DATA`). The UI tests assert that `fetch` is never called |
| `speechSynthesis` | Exists, but has 0 voices; `onerror` fires within ~3 ms; `onend` never fires | Prompts are pre-rendered Polly clips. Every utterance has a watchdog, and any key interrupts it (`src/voice.js`) |
| `<video>` + separate `<audio>` | Both clocks advance together; the extra audio does not pause the video | The narration architecture is viable |
| Video codecs | **H.264 and VP9 stall** about 3.1 s after `play()` (platform decoder path); `seeked` never fires; `play()` can hang. **VP8 + Opus WebM plays through:** both 72 s films reach `ended` with 0–2 dropped frames, seeks take 22–144 ms, and narration plays on top without pausing the video | `tools/webm.js` encodes VP8 renditions; the player picks them on Vega OS; `play()` has a timeout |
| VoiceView | Can be enabled; follows WebView DOM focus. **The VVD has no TTS service,** so its speech can't be verified there | Physical-device check pending |

**Core loop on the VVD (2026-10-01, fixture, VP8, injected remote presses).** Screenshots 40–43 in `vega/screenshots/`.
1. Onboarding focuses Standard.
2. Play runs past 0:03 with no stall.
3. Select mid-narration at 0:12: "Paused. What did I miss is selected", (1 missed).
4. Select recovers the missed moment: "Description complete. Resume is selected".
5. Resume plays to the end: "The film has ended. Return to catalog is selected".

## 2. Player correctness (automated)

- **Results:** `npm test`, run on 2026-10-01, gives **37/37 passing**.
- **What they cover:**
  - The state machine: media-clock scheduling, late-cue fallback to shorter reviewed variants, critical-event delivery, pending and bypassed states, a forward seek that keeps earlier player-lost facts, stale-callback tokens, and versioned resume.
  - The package validator.
  - jsdom remote-flow tests, which assert:
    - focus after every transition (it never lands on `<body>`);
    - the end-of-film announcement;
    - Back/Back to the catalog with focus restored;
    - the resume offer;
    - the onboarding default;
    - live-region behavior with guidance off;
    - the adaptive suggestion;
    - blocked packages;
    - fixed-Standard study mode;
    - package-version invalidation;
    - D-pad spatial navigation on the button layout measured on the VVD.

**Defects found and fixed during the 2026-10-01 audit (each one has a regression test):**

| Defect | Effect before the fix |
|---|---|
| Focus lost after every spoken prompt | Disabled buttons were focused while speaking. The first D-pad press landed on **Off**, and "Select Resume" did nothing |
| End of film was silent | The media-clock loop paused the video before the native `ended` event fired |
| A forward seek erased earlier interrupted critical facts | Contradicted the spec's "skip only the skipped period" rule |
| Duration display hard-coded to `0:15` | Wrong time shown for any other film |
| D-pad skipped rows (found on the VVD) | Scoring by centre distance jumped from Resume to a level button, where Select changed the level by accident |

## 3. Narration timing

**Desktop Chromium (2026-10-01, fixture, Standard level, one run).** These are scheduler-level numbers (media position when `audio.play()` resolved), not audible onset.

| Cue | Earliest permitted start | Audio started at media time | Offset |
|---|---|---|---|
| envelope | 2.500 s | 2.548 s | +48 ms |
| door | 9.500 s | 9.531 s | +31 ms |

**On device:** pending; it requires stable video playback.

## 4. Authoring pipeline (AWS)

**Pending the first live run.** The pipeline's 59 offline tests pass with the network blocked. Planned measurements:
- per-stage time
- Transcribe seconds
- Bedrock tokens per model
- Polly characters
- estimated cost
- fit-loop retries
- reviewer edits, drops and minutes per finished minute
- critical events the model missed
- Transcribe dialogue intervals against the official *Tears of Steel* subtitles

## 5. Viewers

**No sessions yet.** Outreach drafts are in [submission/OUTREACH.md](submission/OUTREACH.md). Until sessions happen, Sema makes **no claim** that blind or low-vision viewers prefer adaptive description over fixed Standard.
