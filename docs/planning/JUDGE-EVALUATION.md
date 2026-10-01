# Sema: judge's evaluation and plan to win

**Date:** Thursday, October 1, 2026. 22 days before the deadline (Fri Oct 23, 12:00 PT / 3:00 PM ET).
**Track:** Fire TV (primary), AWS Builder (mini).
**What I evaluated:** the code and media in this folder, not the PRD's plans. I ran the unit tests and validators. I also drove the web prototype with the keyboard in a Chromium browser pane at 1280×720. I did **not** run it on Vega, a Fire TV, or with VoiceView. Anything marked *hypothesis* still has to be checked on the target.

---

## 1. Verdict

**As it stands today, Sema would not get through Stage One.** Stage One is pass/fail, and it needs a working Fire OS or Vega app shown on a qualifying device or simulator. The Vega project still loads the template "Hello from WebView" page. There is also no repository, license, or video yet.

The idea itself could contend for first place in the Fire TV track. Most entries will be "streaming UI plus AI chatbot". This one is different: viewers choose how much audio description they hear, can ask "What did I miss?" without spoilers, and the app keeps track of critical story events. That is a real accessibility problem, it fits a Fire TV priority category (AI-enhanced viewing), and it plays to Amazon's own accessibility investment (VoiceView).

**What's missing is execution evidence, not concept.** By size, the project is about 130 KB of PRDs, panel reviews, and rubrics against 357 lines of app code and tests. The PRD's own gates G0, G1, and G2 (Sept 18, 21, and 27) have all passed without being met. **Stop writing specifications.** Everything that moves your score from here on is code running on Vega, real AWS output, a real viewer, and a 2:45 video.

---

## 2. Scorecard on current evidence

This is an unofficial 0–10 scale that scores only what exists today. It is not a win probability.

| Criterion (25% each) | Now | Why | What an 8+ looks like on Oct 21 |
|---|:-:|---|---|
| **Stage One gate** | ❌ | No Sema build on Vega; no repo or video | Sema running on the Vega Virtual Device or a Fire TV in an unbroken video take |
| **Tech Implementation** | 3 | The pure state machine is clean and well tested (18/18 pass). Includes a strict package validator, stale-token cancellation, and versioned resume. But nothing runs on the target, there is zero AWS code, and there are 4 confirmed defects | Runs on Vega; real S3 → Transcribe → Bedrock → Polly pipeline produced the shipped packages; measured fit and timing numbers in the README |
| **Design** | 3 | Thoughtful remote model, explicit resume, and a pending-recovery label. But focus is lost after every spoken prompt, the end of the film is silent, and the first D-pad press lands on "Off" | Fully remote-operable loop with no focus traps; VoiceView verified; legible at 10 ft; one change made from real viewer feedback |
| **Potential Impact** | 2 | The audience is clear, but there is no user evidence, the content is a 15-second geometric fixture, and the supply path isn't shown | 2–3 blind or low-vision (BLV) viewers tested; a real filmmaker's short published through the pipeline; cost and review minutes per finished minute |
| **Quality of the Idea** | 6 | Creative and honestly positioned against *Describe Now*. But the "AI" part is invisible today: hand-written scripts read by the macOS `say` voice | The AI pipeline is visible and credible, and adaptive detail plus recovery is shown beating fixed narration for a real viewer |
| **Friction bonus (up to 10%)** | 0 | No log exists | 6–10 structured, reproducible entries captured *as they happen* |

---

## 3. What's strong (keep it)

- **`src/playback.js` is the best asset in the repo.** It's a pure, testable media-clock state machine with:
  - critical-event delivery states (`not-due`, `pending`, `delivered`, `bypassed`)
  - generation tokens, so stale audio callbacks can't speak (`canStart` / `complete`)
  - a second fit check when audio actually starts (`canStart`, playback.js:87)
  - a versioned resume snapshot that marks in-flight critical audio as pending (playback.js:112–117)
- **`src/package.js` validation** rejects future-fact cues, dialogue overlap, missing approval, path traversal, and audio that doesn't fit its window. It's strict by default, and fixtures have to opt in.
- **Playback logs looked well behaved in a normal run.** Cues started 20–50 ms after the earliest permitted start (`audio-start` at 2.548 against an earliest start of 2.5). Both critical events were delivered. This is one desktop browser run, not a device measurement.
- **The core interaction works end to end in the browser:**
  1. Opening controls mid-cue marks the event as pending.
  2. The button changes to "Recover missed description (1)".
  3. The recovery audio plays and marks the event delivered.
  4. Playback stays paused until you choose Resume.
- **Honest positioning** (prior work, fixture disclaimers) builds credibility with judges. Keep that tone in the submission.

---

## 4. Findings

### 4a. Eligibility blockers (P0)

| # | Blocker | Evidence | Fix |
|---|---|---|---|
| B1 | **Sema isn't in the Vega app** | `vega-app/assets/index.html:51` is still "Hello from WebView". `App.tsx:39` loads `file:///pkg/assets/index.html`. `manifest.toml:4` still has the template title | Add `npm run vega:sync` to copy `index.html`, `style.css`, `src/bundle.js`, and `media/` into `vega-app/assets/`. Then build, install, and run on the Vega Virtual Device (VVD) |
| B2 | **No repo, license, README, or video** | Not a git repo; no LICENSE; no README | Today: `git init`, create the GitHub repo, add an MIT LICENSE so it shows in the About section, and a README skeleton |
| B3 | **AWS Builder has nothing to judge** | No AWS SDK calls anywhere. Narration comes from `/usr/bin/say -v Samantha` (`tools/generate-fixture.py:16`) | Build the minimal real pipeline (section 5, Phase 2). Polly also replaces the macOS system voice, which carries license restrictions on non-personal use |

### 4b. Confirmed defects (reproduced today)

**D1: focus is lost after every spoken prompt (P0 for an accessibility product).**
- *Cause:* `announce()` sets `speaking=true`, and `render()` then disables Resume and Recover (`app.js:27`, `:30`). The code then calls `.focus()` on those disabled buttons, which does nothing. This happens in `open()` (`app.js:76`), `controls()` (`:40`), and when recovery finishes (`:47`). When speech ends, `finish()` re-renders but never restores focus.
- *Repro:*
  1. Open the film. Focus is `BODY`.
  2. Press Down. Focus lands on **Off**, because `advanceFocus` picks the first visible button (`app.js:79`).
  3. Press Select. Description is now turned off.
  4. Separately: after a recovery cue, the app says "Select Resume when you are ready", but focus is `BODY`, so pressing Select does nothing.
- *Consequence:* a blind viewer gets stuck in the exact loop the demo is built around.
- *Fix:*
  - Don't disable buttons while prompts speak. Let any activation cancel the prompt and act immediately ("barge-in"), which is also better TV and screen-reader behavior.
  - At minimum, store an `intendedFocus` and apply it in `finish()`.
  - Add a regression test with jsdom or Playwright for "focus is never `BODY` in the player".

**D2: the end of the film is silent and unfocused.**
- *Cause:* the 30 ms loop sees `mode==='ended'` and calls `video.pause()` (`app.js:109`) before the native `ended` event fires. So the `ended` handler (`app.js:103`) never runs: no announcement, no focus on Start over.
- *Observed:* `video.ended=false`, a stale "Choose a description level…" status, focus on `BODY`, and a disabled "Resume film" button.
- *Fix:* move the end-of-film handling into a function and call it from the loop when `player.mode==='ended'`.

**D3: a forward seek erases earlier pending critical events (this contradicts SEM-337).**
- *Cause:* `playback.js:48` bypasses *every* undelivered event at or before the destination, not just the skipped range.
- *Repro (Node):* interrupt the envelope cue at 2.6 s, resume, then seek 9 s → 12 s. `envelope-hidden` goes from `pending` to `bypassed`, even though the viewer never skipped it.
- *Fix:* bypass only events with `old < availableAt <= new`, plus the in-flight event. Add a test.

**D4: the duration display is hard-coded.**
- *Cause:* `app.js:25` renders `0:${s} / 0:15`. A 60-second film would show "0:60 / 0:15".
- *Fix:* format `mm:ss` from `asset.duration`.

**D5 (P2): developer diagnostics can be reached with the D-pad on the catalog screen.**
- *Cause:* `index.html:27`.
- *Fix:* render it only with `?debug`.

### 4c. Risks to check on Vega first (hypotheses, ordered by likelihood × impact)

| # | Risk | Where | Pre-decided response |
|---|---|---|---|
| H1 | `fetch('media/fixture.json')` from a `file://` page is often blocked in Chromium-based WebViews | `app.js:113` | Have `tools/bundle.js` write packages to `src/packages.js` (`window.SEMA_PACKAGES = …`) so no fetch is needed |
| H2 | The `<video>` and a separate `<audio>` element may not play at the same time, or audio focus may pause the video | `app.js:45` | **Fallback:** pre-mix four renditions (Off, Essential, Standard, Rich) and switch `src` while paused, since level changes already pause. Recovery audio only plays while paused, so it isn't affected. Cue metadata still drives delivery tracking |
| H3 | Remote key codes are guesses: `GoBack`, 179, 227, 228, `ContextMenu`, `m` | `app.js:86–91` | Build a 20-line key-probe page and log every remote button on the VVD; fix the key map from the results |
| H4 | `speechSynthesis` may be missing, or its `onend` may never fire. Then `speaking` stays true and Resume and Recover stay disabled **forever** | `app.js:12–16, 27` | Pre-render the roughly 15 UI prompts with Polly as MP3s (same voice as the narration, completion events you can rely on), and add a watchdog timeout |
| H5 | VoiceView: is it available on the VVD? There may also be duplicate speech, because `recover()` puts the cue text in the status region, which is `aria-live=polite` when prompts are off, so it would be read over the recovery audio | `app.js:34, 70` | Check VoiceView on the VVD on day 1. If it's absent, use a physical Vega Fire TV Stick (order today). Don't put cue text in the live region while that audio is playing |
| H6 | A `waiting` event at play start or after a seek may wrongly trigger "Buffering interrupted playback" | `app.js:101` | Ignore `waiting` until the first `playing` event, and debounce it |
| H7 | Pressing Back on the catalog calls `preventDefault`, which may stop the app from exiting | `app.js:86` | On the catalog, don't call `preventDefault` |
| H8 | `allowsDefaultMediaControl` may let the system handle Play/Pause directly, bypassing the state machine | `App.tsx:29` | Test it. If the system takes over, turn the prop off or route through `mediaSession` |

### 4d. Not implemented (compared with what the PRD and video promise)

- First-run onboarding (SEM-301)
- A global level preference (the current one is tied to the fixture resume record)
- A multi-film catalog
- A Resume / Start over prompt when reopening a film (SEM-307)
- Error retry
- The AWS pipeline and the review step
- Real content
- Any viewer evidence

### 4e. Process risk

The planning docs are rigorous, but judges never read the PRD. A repo whose top level is 130 KB of documents saying "not implemented" or "unvalidated" reads as vaporware. Move them to `docs/planning/`. Lead the repo with the README, a short FINDINGS.md, and a FRICTION-LOG.md.

---

## 5. Plan: Oct 1 → submit Wed Oct 21 (2-day buffer)

Every phase has a hard exit gate. If a gate slips, apply the fallback the same day. Don't re-plan.

### Phase 0: today and tomorrow (Thu Oct 1 – Fri Oct 2)

**Admin (about 1 hour, all today):**
- [ ] **Request the $150 AWS credits** (form deadline Oct 21 noon PT; supplies are limited).
- [ ] **Order a Vega OS Fire TV Stick** as insurance for VoiceView and real-remote footage.
- [ ] **Start recruiting 2–3 blind or low-vision viewers.** Lead time is the bottleneck. Boston-area options: BU Disability & Access Services, Perkins School for the Blind (Watertown), the Carroll Center for the Blind (Newton), and local NFB/ACB chapters. Offer compensation and get consent for quotes and footage.
- [ ] **Ask a BU film student (College of Communication) for a 45–60 s short.** Get written distribution permission. This gives you your original asset *and* your supply-side story: a real filmmaker publishing through Sema.

**Repo:**
- [ ] `git init`, push to GitHub, MIT LICENSE, README skeleton.
- [ ] Move the PRD and review docs into `docs/planning/`.
- [ ] Create `FRICTION-LOG.md` and log every snag from now on. You already have one real entry: the `vegaWebview` template's `metro.config.js:4–7` ships with leftover `+` diff markers.

**Fix D1–D5 with regression tests (about half a day).**

### Phase 1: Vega vertical slice (Fri Oct 2 – Tue Oct 6). **Gate: Tue Oct 6**

1. `vega:sync` script; replace the template HTML; fix `manifest.toml` title and app icon.
2. `npm install` in `vega-app/`, `build:debug`, install and launch on the VVD. **Screen-record the first successful launch**; it's demo B-roll and friction-log evidence.
3. Run the risk checks in order: H1 (inline packages) → H3 (key probe) → H2 (concurrent audio) → H4 (TTS) → H5 (VoiceView) → H6–H8.
4. Replace app prompts with pre-rendered audio (a temporary `say` render is fine until Polly lands in Phase 2).

**Exit:** on the VVD, using only remote keys, you can complete this loop with no focus loss, captured in one unbroken recording:

catalog → play → interrupt a cue → recover → resume → film ends → return to catalog

**Fallbacks:**
- If H2 fails, switch to pre-mixed renditions the same day.
- If the VVD has no VoiceView, use the physical stick. If you have no stick, show app prompts and state the limitation.

### Phase 2: real content and the real AWS pipeline (Mon Oct 5 – Mon Oct 12). **Gate: Mon Oct 12**

**Content:**
- **Asset A:** the BU filmmaker's short, or your own phone-shot "who took the key" short.
- **Asset B:** a CC-BY Blender open-movie excerpt. *Tears of Steel* has live action with dialogue, which tests dialogue-gap fitting. Attribution is required.
- Pick Asset B **before** tuning prompts.

**Pipeline** (`pipeline/`, Python + boto3, credentials from the environment, no secrets in the repo):

| Step | Service | Output |
|---|---|---|
| Ingest | S3 | Source, checksum, rights record |
| Dialogue gaps | Transcribe (word timestamps) + ffmpeg silence detection | Dialogue intervals → candidate windows (margins of 200 ms or more) |
| Observations | Bedrock, using a video-capable Nova model (check which are enabled in your region). If brief actions are missed, sample frames densely (2–4 fps) within candidate windows | Timestamped events and `availableAt` |
| Scripts | Bedrock, structured JSON output | Essential / Standard / Rich text plus a recovery cue for each event |
| Review | Small HTML page or CLI that writes `reviewStatus:"approved"`, reviewer, edits, and **minutes spent** | Approval record |
| Render | Polly neural voice: cues, recovery cues, **and UI prompts** | MP3s plus measured durations (ffprobe) |
| Fit loop | If a cue doesn't fit its window, regenerate a shorter version, re-render, and re-measure | Every cue passes `validatePackage` |
| Package | Existing validator → `packages.js` | Published package |

**AWS Builder upgrade (time-box to 1 day, only if Phase 1 passed on time):** make the fit loop a **Strands Agents** agent with three tools: `render_with_polly`, `measure_duration`, and `check_window`. This is an honest agentic pattern, close to the rules' own "Creative" example ("multi-service pipeline… agent orchestration patterns"). If you use **Kiro** while building, document how; it qualifies for the mini challenge on its own.

**Record as you go** (for FINDINGS.md and the demo):
- Processing time per asset
- AWS cost
- Review minutes per finished minute
- Number of cues regenerated or dropped
- Critical events the model missed

**Exit:** both assets were produced by the pipeline, reviewed, rendered with Polly, validated, and play on the VVD. Delete the `say` audio from the repo.

**Fallback:** if the three detail levels sound nearly the same on Asset B, ship two levels plus recovery and revise the claims everywhere in the submission. Don't pad descriptions to make the levels differ.

### Phase 3: viewer evidence and one iteration (Fri Oct 9 – Fri Oct 16)

- **Sessions with 2–3 BLV viewers:**
  - First, an uncoached task run: can they complete the loop on their own?
  - Then fixed Standard narration vs. adaptive (levels + recovery) on different clips.
  - Log spontaneous vs. prompted use, recoveries, pauses, and quotes (with consent).
- **If remote testing is the only option:** host the web build, which is the same code that runs in the WebView, and let testers use their own screen reader (VoiceOver or NVDA). Label it honestly: "browser + screen reader, not Fire TV."
- **Make one visible design change** from what you observe and film the before and after. Judges reward iteration evidence, and it feeds both Design and Impact.
- **If you can't recruit anyone by Oct 12:** say so plainly in the submission and lean on device-test evidence. Don't use blindfolded sighted testers as a substitute.

### Phase 4: feature freeze Fri Oct 16 → demo and materials → **submit Wed Oct 21**

**Oct 16–18: record and edit the video.** Use the storyboard below. Make the video itself accessible: captions, plus an audio-described version made with Sema's own pipeline. Mentioning that in one line of the video is a memorable, on-brand touch.

**Oct 18–20: write the submission materials.**
- **README:** what and why; a 2-minute quickstart (`npm test`, `npm start` for the web build); Vega build and install steps; pipeline regeneration steps; an architecture diagram; how each AWS service is used; media attributions; limitations.
- **FINDINGS.md:** the real numbers, including negative results.
- **Product feedback for each tool:**
  - Vega SDK and CLI
  - Vega Virtual Device
  - Vega WebView
  - S3, Transcribe, Bedrock, and Polly
  - Strands and Kiro, if used
- **Friction log:** 6–10 entries, each with task, steps, expected vs. actual, severity, workaround, and suggestion.
- **Feature requests:** for example, a VoiceView bridge or speech-completion API for WebView, VoiceView on the VVD, and documented remote key codes for the WebView.

**Oct 20: fresh-clone rehearsal.** Follow the README on a clean machine or account and fix anything that breaks.

**Oct 21: submit**, leaving Oct 22–23 as buffer.

---

## 6. Demo video storyboard (target 2:45, real footage, no music you don't own)

| Time | Shot | What it proves |
|---|---|---|
| 0:00–0:12 | The film playing with original audio. Caption: *"The soundtrack never says who took the key."* | The problem, in 12 seconds |
| 0:12–0:55 | **Unbroken take on the VVD or Fire TV**, with a remote-press overlay: choose Standard → AD plays between dialogue lines → press Select mid-cue → "Description interrupted" → What did I miss? → recovery → Resume | Stage One plus the core interaction (Design and Tech) |
| 0:55–1:15 | The same moment at Essential vs. Rich, with captions shown side by side | Adaptive detail is real, not a label |
| 1:15–1:40 | A BLV viewer's quote and footage (with consent) + the one design change you made | Impact and iteration |
| 1:40–2:15 | Pipeline montage: S3 → Transcribe → Bedrock → review → Polly → validator passing, with **real numbers** (processing time, cost, review minutes per finished minute) | AWS Builder and the scale story |
| 2:15–2:32 | Asset B (CC-BY) plus the filmmaker's publishing walkthrough | Supply path beyond the hackathon |
| 2:32–2:45 | Who it's for, and what makes it different from fixed narration | Idea |

Keep the 0:12–0:55 segment uncut. Judges are told to look for latency or failures hidden by editing.

---

## 7. What to cut so the critical path holds

- **Up/Down shortcuts**, text-mode polish, and the review tool's UI. Use a CLI review step.
- **The PRD's full timing protocol** (p95 statistics, uncertainty analysis). Instead, record VVD screen and audio and report start offsets for every cue in a short table.
- **Pilot-capacity economics.** One measured "review minutes per finished minute" figure is enough.
- **Any new feature** before the Phase 1 gate passes.
- **Optional stretch, only after Oct 16 and only if everything else is done:** after two recoveries in one scene, use the already-paused state to offer "Switch to Rich?" It adds no extra interruptions and directly matches the rules' example "AI-enhanced viewing that adapts". If time is tight, skip it.

---

## 8. Submission checklist (mapped to the rules)

- [ ] Public GitHub repo with an MIT license shown in the About section. *Or* a private repo shared with testing@devpost.com and the six Amazon reviewers.
- [ ] Repo includes all source, assets, and setup/run instructions: web, Vega, and pipeline (with "no AWS credentials needed to run the packaged demo").
- [ ] Media rights records and CC-BY attribution; no macOS `say` audio left in the repo.
- [ ] Video under 3:00, public on YouTube or Vimeo, in English, showing Sema running on the VVD or a Fire TV.
- [ ] Text description; Fire TV track and AWS Builder mini selected.
- [ ] Product feedback for every tool, including the AWS services and how they were used.
- [ ] Friction log entries (up to a 10% bonus); optional feature requests with priority.
- [ ] Judges can access everything through Nov 20; packaged assets stay in place.
- [ ] Final reread of the rules on Oct 20.

---

## 9. Your next five actions (today)

1. Submit the AWS credits form; order the Vega Fire TV Stick.
2. Email BLV organizations and BU film contacts. Recruiting lead time is the longest dependency.
3. `git init` + LICENSE + README skeleton + FRICTION-LOG.md; move planning docs to `docs/planning/`.
4. Fix D1 (focus) and D2 (end of film) first; they break the demo's central loop.
5. Start `vega:sync` and get *anything* Sema-branded on the VVD by tomorrow night.
