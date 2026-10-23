# Testing and engineering evidence

## Fast checks

```sh
npm ci
npm test
npm run preview:build
npm run repo:check
```

The JavaScript suite checks scheduling, interruptions, stale callbacks, future-event exclusion, earlier-moment navigation, bounded picker ranges, remote focus, spoken guidance, media integrity and release gates.

## October 23, 2026 first-run and catalog checks

The current suites have 159 JavaScript, 78 offline pipeline and 6 native host tests passing. New cases cover starting directly from the first-run Play button, saving the Standard default, Back without playback and free-viewing disclosures that depend on explicit catalog metadata.

Focused Chrome checks pass at 1920×1080, 1280×720 and 375×812. They cover the two-Select start, selected-level state, D-pad navigation on TV layouts, keyboard navigation at the narrow width, an unchanged paused frame during Revisit, complete focus visibility and no horizontal overflow. Reduced motion is enabled. The updated aarch64 package builds successfully. These checks do not include a new simulator run or new audible VoiceView evidence.

## Offline authoring checks

Install Python and ffmpeg using the [pipeline setup](../pipeline/README.md), then run:

```sh
SEMA_FORBID_LIVE=1 PYTHONPATH=pipeline pipeline/.venv/bin/python -m unittest discover -s pipeline/tests
```

The environment guard prevents these tests from constructing live AWS clients.

## Actual browser media

Start `npm run preview` in one terminal. In another, install Playwright separately (`npm install --no-save --package-lock=false playwright`, then `npx playwright install chromium`) and run:

```sh
SEMA_URL=http://127.0.0.1:4173 npm run test:browser
```

`SEMA_CHROME` can point to an existing Chrome executable; `SEMA_PLAYWRIGHT_MODULE` can point to an existing Playwright module. Results go to `artifacts/browser/`, or `SEMA_BROWSER_OUT` if provided. This harness decodes real media in Chrome.

## Narration audit and longer-film simulation

```sh
python3 tools/audit-narration.py --reels
node tools/simulate-long-film.mjs
```

The narration audit requires ffmpeg and ffprobe. It reads the shipped packages, decodes all 45 timed variants and 25 Revisit recordings, and checks duration, recorded dialogue overlap, timing slack, quiet audio, clipping and word rate. `--reels` also creates three film-and-description mixes and a Revisit reel for each film. The mixes use fixed ducking and a peak limiter; they are listening aids, not recordings of app playback. Frame contact sheets and JSON indexes help locate each line. Outputs stay in ignored `artifacts/extended-review/`. Signal checks cannot establish pronunciation, clarity or the accuracy of a description.

The simulation repeats the existing excerpt metadata into 12-, 24- and 60-minute packages. It exercises the playback scheduler at all three levels, checks critical-cue interruption and restore, rejects future moments, and compares steps through Earlier with the shared moment picker. Picker counts start after opening Browse moments and assume a known target and first-row focus; they exclude speech duration and mistakes. It does not render a new film or exercise the device interface. Its report records actual Node execution time separately from estimated editorial time. Source watches and listening passes have known durations; decision time, edit time and rework rates are explicit assumptions in the script. New-film annotation, breaks, collaboration and service wait times are excluded. These estimates are for planning, not a claim of measured production throughput.

## Audible VoiceView device check

Use a physical device with working VoiceView speech. Record the device model, OS version, app package hash, VoiceView settings, audio output and Dolby mode. Capture audible output and remote actions together; logs alone cannot show what was spoken. Run both films with VoiceView off and on, then repeat the interruption cases after changing the available Dolby setting. If a combination is unsupported or produces a system warning, record that result rather than treating it as a pass.

| Action | Listen for and record |
|---|---|
| Cold launch; enter each film | Catalog title, focused film, selected detail level and Play film are intelligible in navigation order. No duplicate control names from Sema and VoiceView. |
| Change Essential, Standard and Rich | The focused option and selected value are distinguishable. Start playback and confirm the chosen description plays. |
| Pause, Revisit, then Earlier | The pause state, focused action, moment description and completion state arrive in a useful order. Earlier names the next available moment. |
| Browse moments; open a range; select a moment; press Back | Range times and moment names are spoken. Back restores the selected parent row, then Browse moments. Selecting a description keeps the film at its paused position. |
| Interrupt a critical timed description with Back and Play/Pause | Film and description stop. The missed-description action is focused and announced. Retry speaks the retained fact and completion once. |
| Interrupt Revisit with Back; retry; resume | Old narration stops, retry starts the same requested moment, and old completion speech does not arrive over the new action. Film resumes at the paused position. |
| Navigate rapidly while speech is active | Focus speech follows the current control. Record stale announcements, duplicated names, unexpected queues or speech that masks the requested description. |
| Open and close the system menu; background and return | Speech and playback recover in the correct state. No abandoned narration or old focus announcement continues after return. |
| Toggle VoiceView while controls are open | The host reports the change. Built-in guidance and VoiceView do not compete; focused controls remain audible. |
| Finish the film; Revisit; return to catalog | End state, Revisit completion and catalog focus are spoken in order. |

For each case, retain an audio timestamp, actual spoken words, expected action, observed result and any reproduction steps. Mark a case passed only after hearing it. Automated native-bridge and page tests cover routing and stale callbacks; they do not establish audible queue order or interruption behavior.

## October 18, 2026 moment picker

Revisit and Browse moments remain unavailable before the first reveal time. The shared navigation module checks every range and leaf against the current film position. The page tests cover distant selection, Back and Tab focus, interrupted critical facts, stale focus speech, transport keys and media failure. That October 18 run had 156 JavaScript tests, 78 offline pipeline tests and six native host tests passing.

The focused Chrome check runs the picker at 1920, 1280 and 375 pixels, with browser text-to-speech disabled. Range and moment recordings complete, Back restores focus, and selecting a description leaves the film position unchanged. All 77 new navigation recordings decode and complete. The native aarch64 package builds; its 261 media files and player assets match the source bytes. These checks do not include a new simulator or audible VoiceView run.

For a five-minute lookback in the synthetic 12-minute workload, the picker takes seven Down presses and three Select presses after opening. Earlier takes 53 selections after reaching its control. The picker result assumes the target is known; speech time, mistakes and the action to open the picker are excluded. Reproduce the calculation with `node tools/simulate-long-film.mjs`.

## October 18, 2026 source-media repair

The shipped Sintel extract had visible frame corruption near 36–39 seconds and contained 1,707 video frames. A fresh copy of the same 150–222 second range from Blender's source contains 1,728 frames at 24 fps. The preview MP4, VP8/Opus rendition and fixed Standard comparison were rebuilt. Narration text and timing are unchanged. The package records the replacement hash alongside the original AWS authoring-input hash; integrity records cover the new media.

The development history retains its original authors and dates. Historical build identifiers below refer to the source used for recorded runs; commit hashes changed when repository history was cleaned.

## October 16, 2026 final build on the Vega Virtual Device

Commit `15e8eb5`, after a fresh simulator restart. [Log excerpts](vega/logs/evidence-excerpts.txt); screenshots 66–67 in `vega/screenshots/`.

- All 184 media files in the aarch64 package match their source hashes.
- In *Tears of Steel*, a pause at 34.8 s and Revisit described `mechanical-hand` with description text on screen and the compact panel. Earlier moment described `pair-on-bridge`.
- Back at 46.5 s cut off the critical "forty years later" cue. The pause focused "Hear missed description".
- With VoiceView turned on by the Back+Menu hold, the missed description played and "Description complete." went to the host's announce call (`{"sema":"announce"}` in the device log). The app omitted the focused control from its guidance message; audible VoiceView duplication was not verified. VoiceView was turned off again afterwards.

## October 16, 2026 narration and remote fixes

- 145 JavaScript tests, 78 offline pipeline tests and 6 native host tests pass.
- Four optional timed lines that were read over a later camera shot (*Sintel* c05, c07 and c11; *Tears of Steel* c05) were dropped from the timed track. Their moments stay available through Revisit. The *Tears of Steel* c06 cue no longer marks the workers moment as described. The comparison mixes were regenerated and the integrity manifest updated; the editorial record lists each change.
- Earlier moment steps back from the moment Revisit plays, and before any Revisit the context line names that moment, so the two lines always read in order. After a Revisit at the end of the film, the panel still says the film ended.
- After a guidance failure without a screen reader, Back turns spoken guidance off for that session only.
- The frame-batch observer keeps a new moment whose ID repeats an earlier one, under a fresh ID.
- `docs/INTEGRATION.md` says to check the scheduler's mode after `tick()` and `canStart()`, and the headless test covers a late critical cue.
- With VoiceView on in the Vega app, state changes go to VoiceView through the host's `announceForAccessibility` call, and the live region stays quiet so nothing is spoken twice.
- Pressing Earlier moment during the oldest moment lets that description finish, and the focused button keeps its name while it plays.
- While a moment is described, the panel keeps only the viewing actions, so the frame stays visible. Selected levels carry a check mark as well as color.
- The cue planner keeps optional actions from being read over a later camera shot.
- `content/editorial/` now records the later text revisions and the exact shipped text; `npm run content:check` fails if they drift.
- `tests/integration-example.test.js` runs the publisher integration path in plain Node.

## October 16, 2026 fixes and checks

- 137 JavaScript tests, 75 offline pipeline tests and 5 native host tests pass.
- New regression tests cover five remote and playback fixes:
  - Entering the description-level row lands on the selected level, so Down from the actions can't put one Select on Off.
  - Pressing Earlier moment while the oldest moment plays names the control that has focus afterwards (Resume).
  - Play/Pause during a critical description focuses "Hear missed description".
  - An audio error on a timed cue drops optional detail or keeps a critical fact recoverable, the same as a start timeout.
  - The film ending while its last description plays still ends with focused controls.
- **Vega Virtual Device, October 16 build** ([log excerpts](vega/logs/evidence-excerpts.txt); screenshots 64–65 in `vega/screenshots/`):
  - Down from Play film landed on Standard, the selected level.
  - In *Tears of Steel*, a pause at 34.9 s and Revisit described `mechanical-hand` with description text on screen. Earlier moment then described `pair-on-bridge`, and focus stayed on Earlier moment.
  - Play/Pause at 45.55 s cut off the critical "forty years later" cue. Sema said "Paused. Hear missed description" with focus on that control.

## October 15, 2026 submission checks

- 133 JavaScript tests pass, including four source-export privacy regressions.
- The focused real-media Chrome checks pass at 1920, 1280 and 375 pixels. A keyboard-only sequence completes Revisit, uses two Right presses to reach Earlier moment, revisits that moment, resumes, and checks each Back action and its hint.
- Option disclosure, recorded option prompts and detected-VoiceView recovery pass.
- Both film description contracts and repository/link checks pass.
- The Debug aarch64 Vega SDK package builds with 200 playback assets verified against their source hashes.
- On October 16, the 75 offline pipeline tests and 5 native host tests passed again on the same source.

## October 14, 2026 playback-session checks

The offline pipeline suite also passed 75 tests. The aarch64 Vega SDK package built with 200 matched assets.

- 129 JavaScript tests pass. New session tests cover superseded video rejection, stale watchdogs, immediate cancellation, real current failures, film changes, cancelled audio readiness, recovery timeouts, buffering cancellation and resource cleanup.
- An app-level deferred-video regression covers pause, resume and seek: old failures are ignored, and the current failure retains focused Retry.
- The playback session handles media startup, cancellation and cleanup. The scheduler still chooses descriptions, and the app handles guidance and controls.
- Playback asset tests cover missing moment audio, changed Polly bytes, absent fingerprints and preservation of prior site output when verification fails. The prompt-renderer check binds each generated file to its fingerprint.
- Eight full real-media browser runs and both interruption/recovery paths pass after the session extraction. Final package checks also decode the recorded labels and exercise the option and guidance flow.

## October 13, 2026 interface polish

- 115 JavaScript tests pass, including option-panel focus and Back, interruption retention, detected-VoiceView recovery and supplemental recording integrity.
- Resume, Revisit and Earlier moment come before detail selection. Text, guidance, help and Start over are under More options.
- The real-media browser harness checks the disclosure at 1920, 1280 and 375 pixels, decodes four new option prompts and exercises detected-VoiceView recovery.
- Source handoff checks exclude generated interface copies and enforce exact archive membership.

## October 12–13, 2026 iteration checks

- 109 JavaScript tests pass, covering focus after recovery and recorded moment names for scenes without timed narration.
- All 25 short moment-name recordings decode and complete in Chrome; both films pass interruption, revisit, earlier moment and resume checks.
- The prototype build, all description contracts and repository checks pass.
- `npm run submission:prepare` repeats those checks in an independent source copy and records hashes and test results in the local source kit.

## October 9, 2026 changes and checks

- 106 JavaScript tests and five native host tests pass.
- Regression cases cover immediate narration cancellation on a film stall, critical-fact recovery without advancing the film, stale audio completion, and harmless waits between descriptions.
- Remote action labels stay compact while screen-reader names retain moment details. The browser harness compares action columns and widths before and after browsing earlier moments.
- Eight full real-media browser playback runs pass, plus both interruption/revisit/earlier/resume scenarios on a focused rerun. The guidance-failure and retry check also passes.
- The prototype build, repository checks and all 19 description contracts pass.

## October 8, 2026 changes and checks

- 103 JavaScript tests and 75 offline pipeline tests pass.
- Five native host tests cover:
  - missing readiness and retry;
  - stale callbacks and main-page errors;
  - Back/Exit;
  - passing VoiceView state to the page.
- TypeScript checking and the aarch64 SDK build pass.
- New player checks cover:
  - VoiceView: guidance turns off automatically unless the viewer chose it, and state announcements no longer repeat the focused control;
  - Space resuming from pause;
  - browser first run: no guidance-failure dialog before the first key press;
  - earlier-moment focus and preview wording.
- Eight full browser runs and both interruption/revisit/resume scenarios pass with real media.
- A separate browser failure test disables speech synthesis and blocks recorded prompts, then verifies focused recovery, successful retry and layouts at 1920 and 375 pixels.
- Description contracts cover all 19 windows. Three Tears of Steel variants reuse their existing measured Standard recording to preserve identifying facts.
- **Vega Virtual Device, October 8 build** (after a fresh VVD restart; [log excerpts](vega/logs/evidence-excerpts.txt), screenshots 60–63 in `vega/screenshots/`):
  - The host passed VoiceView state to the page 11 ms after the page reported ready.
  - Turning VoiceView on and off with the Back+Menu hold reached the running app each time. Spoken guidance switched off and back on without the viewer choosing.
  - In *Tears of Steel*, a pause at 45.9 s cut off the critical "forty years later" cue. Revisit replayed it as pending. Earlier moment then delivered `mechanical-hand` and `pair-on-bridge`, the two bridge moments with no timed cue. Focus stayed on Earlier moment.
  - A pause at 35.1 s in the bridge scene revisited `mechanical-hand` from the same shot.
  - Back during playback paused at 49.2 s, with focus on Return to catalog.
  - Cue onsets landed within 10 ms of schedule.

With Vega dependencies installed, run `npm run test:native`. Use `npm run content:check` for the explicit description contracts. The real-media harness accepts `SEMA_BROWSER_SCOPE=guidance` or `SEMA_BROWSER_SCOPE=interactions` for focused checks; omit it for the full suite. Generated diagnostics remain under ignored `artifacts/`.

## October 7, 2026 results

| Check | Observed result |
|---|---|
| JavaScript regressions | 88 passed |
| Offline pipeline regressions | 75 passed |
| Complete browser playback | Eight runs: both films × three levels, plus both fixed Standard mixes |
| Browser interaction paths | Both films completed interruption → Rich selection → interrupted revisit → retry → earlier moment → resume to end |
| Browser diagnostics | Zero page errors or failed media requests in those runs |
| Layout inspection | 1920×1080 and 375×812, including reduced motion |
| Vega simulator | Both films completed Standard playback, with 19 narration cues completed; additional interruption/retry/revisit/resume paths and level changes exercised |
| Independent source copy | Offline dependency install, all 88 tests and prototype build succeeded without the AWS authoring workspace |
| Integrity failure case | Altered narration bytes rejected by the prototype builder |

Evidence: [browser events](evidence/browser.json), [Vega app events](evidence/vega.json). Repeated native log entries within 100 ms were deduplicated; later repeated events were preserved.

## Release checks

`npm run release:check` is the production gate. It accepts only editor-approved packages whose source, renditions, media measurements and spoken prompts match their approval fingerprints. `npm run baselines` and `npm run site` build only from packages that pass it.
