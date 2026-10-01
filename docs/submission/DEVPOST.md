# Devpost submission draft

Copy each section into the matching Devpost field.

- **[MEASURE]** marks a number that must come from `docs/FINDINGS.md`. Never fill it in from memory.
- **[YOU]** marks something only you can supply.

---

## Project name
Sema: audio description, your way

## Elevator pitch (≤200 characters)
A Fire TV app that lets blind and low-vision viewers choose how much of the picture they hear, and ask "What did I miss?" with one remote press. Built on a reviewed AWS AD pipeline.

## Tracks
- **Primary track:** Fire TV
- **Mini challenge:** AWS Builder

## About the project

### Inspiration
Audio description (AD) narrates what happens on screen in the gaps between dialogue. But it ships as one fixed track:
- the same amount of narration for every viewer;
- no way to catch a moment you missed, except rewinding and hoping;
- for most independent films, no AD at all.

We wanted AD to behave like the rest of a modern TV experience: personal, forgiving, and cheap enough to produce that small films can have it too.

### What it does
- **Choose your detail.** Essential gives key story moments, Standard adds context, and Rich adds the picture. All three keep every plot-critical fact. You can change level any time from the remote.
- **"What did I miss?"** Press Select, then Select again. Sema pauses and describes the most recent visual moment, without spoilers. If a description was cut off (you paused, the film buffered, a line couldn't fit), Sema remembers that story fact and lets you recover it, even after the scene changes. A critical fact never silently disappears.
- **Adapts to you.** Ask about the same scene twice and Sema offers Rich detail, while you're already paused.
- **Remote-first and screen-reader-aware.**
  - Every screen always has a focused control.
  - Every state change tells you where focus is ("Paused. What did I miss is selected.").
  - Spoken guidance uses the same Polly voice as the narration, and any key press interrupts it.
  - VoiceView users can switch guidance off and get ARIA live-region announcements instead.
- **Authoring pipeline on AWS.** Amazon Transcribe finds dialogue gaps. Amazon Nova on Bedrock watches the film and drafts three levels plus recovery cues. Amazon Polly voices them. Every line's *rendered* duration is measured against its gap, and lines that don't fit are rewritten (optionally by a Strands Agents agent). A person approves every word before anything ships.

### How we built it
- **Player:** dependency-free JavaScript that runs inside the Vega OS WebView (`vegaWebview` template, Vega SDK 0.24). Narration is scheduled from the video clock, never from timers. A pure state machine handles:
  - fit checks at schedule time *and* audio start;
  - reviewed shorter fallbacks when a cue is reached late;
  - stale-callback tokens;
  - versioned resume.
- **Platform probe.** Before building UI on assumptions, we ran a probe page on the Vega Virtual Device. It measured key codes, `file://` fetch, concurrent video and audio, `speechSynthesis`, media events, `mediaSession` and VoiceView. The app's design follows those measurements: script-embedded data instead of `fetch`, pre-rendered prompts instead of TTS, and nothing that depends on the Menu key.
- **Pipeline:** Python and boto3 with dependency-injected AWS clients. It has 59 offline tests, recorded responses for replay, and a minimal IAM policy.
- **Tests:** 36 player tests, including jsdom remote-flow tests that assert where focus lands after every transition.

### Challenges we ran into
- **`fetch()` can't read the app's own `file:///pkg/assets` files in the Vega WebView.** We switched to a generated `<script>` data file.
- **`speechSynthesis` exists on the VVD but has no voices and never fires `onend`.** Waiting on it would have frozen the app. We moved all spoken guidance to Polly clips, with a watchdog.
- **H.264 playback on the Vega Virtual Device stalls about 3 s in, and `seeked` never fires.** We documented it and guarded every `play()` with a timeout. [YOU/MEASURE: physical device result or VVD workaround]
- **AD has to fit the gaps.** Text length lies; only the measured rendered audio counts. The fit loop and the validator enforce this.
- The Vega build fails when the project path contains spaces, and other papercuts. All are in our friction log.

### Accomplishments we're proud of
- A complete recover-and-resume loop that a viewer can operate entirely from the remote, without seeing the screen.
- Critical-fact tracking, so "the player lost the line" never means "the viewer lost the story".
- 19 reproducible, evidence-backed friction-log entries for Vega and its WebView.

### What we learned
[YOU + MEASURE: viewer-session findings. One design change you made because of them, and any negative feedback.]

### What's next
- A filmmaker self-publishing flow: upload → review → publish.
- More films.
- Verification on more Fire TV hardware.

---

## Product feedback (required, per tool)

### Vega SDK, CLI and Vega Virtual Device
- **Used for:** building and running the Sema WebView app; automated remote input (`inputd-cli`); device logs (`loggingctl`).
- **What worked well:**
  - The `vegaWebview` template got a web app onto Vega quickly.
  - `vega run-app` and `vega virtual-device start` are fast (VVD ready in about 10 s).
  - `inputd-cli` lets us script remote presses, which made automated platform testing possible.
- **What needs work:**
  - The build breaks on paths with spaces.
  - `vega build` alone exits 0 with no JS bundle.
  - The package path contains a literal `undefined`.
  - The installer writes a temp-directory PATH.
  - VVD H.264 playback stalls about 3 s in.
  - The VVD has no TTS, so VoiceView and `speechSynthesis` can't be tested.
  - `inputd-cli series` parsing is broken.
  - Screenshots require host-window capture.

  Details are in our friction log.
- **Onboarding:**
  - Installing the SDK and booting the VVD took about [YOU] minutes.
  - Hello-world in the WebView was quick.
  - Making a real media app work took most of a day of platform probing, because WebView media, `file://` and speech limits aren't documented.
- **Would we build with it again?** [YOU: Yes/No + why.]

### Vega WebView (`@amazon-devices/webview`)
- **Worked well:**
  - It is Chromium 144, so modern JavaScript just works.
  - `allowSystemKeyEvents` delivers Back and media keys to the page.
  - VoiceView follows DOM focus.
- **Needs work:**
  - `fetch`/XHR on `file://` fail, undocumented.
  - The cleartext HTTP policy is undocumented.
  - Page `console` output isn't in the device log.
  - Menu never reaches the page.
  - The UCC publisher logs role errors for `rootWebArea`, `staticText` and `genericContainer`.

### Amazon Bedrock (Amazon Nova)
[MEASURE after the live run: model IDs, video input path (S3 vs. bytes), observed quality, what the reviewer had to fix, latency, tokens and cost.]

### Amazon Transcribe
[MEASURE: job time, accuracy of the dialogue intervals against the official subtitles for *Tears of Steel*.]

### Amazon Polly
[MEASURE: voice and engine, characters, cost, how often the fit loop had to shorten a line.]

### Amazon S3
[MEASURE/YOU]

### Strands Agents SDK
[MEASURE: whether `--agent` was run live. Any mismatches between what the agent claimed and what was measured.]

---

## AWS Builder: how each service is used
See the "AWS services used" table in the README, and `pipeline/README.md` (architecture diagram and IAM policy). Measured costs and times are in `docs/FINDINGS.md`.

## Feature requests (optional)

| Request | Why it matters to Sema | Priority |
|---|---|---|
| A working TTS service + VoiceView speech on the Vega Virtual Device | We can't verify screen-reader announcements for an accessibility app without hardware | Critical |
| Reliable H.264 playback (and `seeked`) in the VVD WebView | Media apps can't be demoed or tested end to end on the VVD | Critical |
| A documented WebView key table, plus a way to receive Menu | Remote-first web apps need every button | Important |
| Documented `file://` asset access (fetch/XHR) for `vegaWebview` | Every data-driven web app hits this first | Important |
| A `vega device screenshot` command | Docs, QA and friction reporting | Nice-to-have |
| WebView `console` → device log in Debug builds | Basic debuggability | Important |

## Friction log
Paste the entries from `docs/FRICTION-LOG.md`. The official format is: task, steps, expected vs. actual, severity, workaround, suggestion.

## Links
- **Repository:** https://github.com/Jeremiah-Sakuda/sema [confirm after push]
- **Video:** [YOU: YouTube/Vimeo URL, public]
