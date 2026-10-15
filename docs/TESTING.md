# Testing and engineering evidence

## Fast checks

```sh
npm ci
npm test
npm run preview:build
npm run repo:check
```

The JavaScript suite checks scheduling, interruptions, stale callbacks, future-event exclusion, earlier-moment navigation, remote focus, spoken guidance, media integrity and release gates.

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

`SEMA_CHROME` can point to an existing Chrome executable; `SEMA_PLAYWRIGHT_MODULE` can point to an existing Playwright module. Results go to `artifacts/browser/`, or `SEMA_BROWSER_OUT` if provided. This harness decodes real media with output muted.

## October 15, 2026 submission checks

- 133 JavaScript tests pass, including four source-export privacy regressions.
- The focused real-media Chrome checks pass at 1920, 1280 and 375 pixels. A keyboard-only sequence completes Revisit, uses two Right presses to reach Earlier moment, revisits that moment, resumes, and checks each Back action and its hint.
- Option disclosure, recorded option prompts and detected-VoiceView recovery pass. Browser output was muted.
- Both film description contracts and repository/link checks pass.
- The Debug aarch64 Vega SDK package builds with 200 playback assets verified against their source hashes. This package was not launched; no simulator was run for these checks.

## October 14, 2026 playback-session checks

The offline pipeline suite also passed 75 tests. The aarch64 Vega SDK package built with 200 matched assets; that package was not launched.

- 129 JavaScript tests pass. New session tests cover superseded video rejection, stale watchdogs, immediate cancellation, real current failures, film changes, cancelled audio readiness, recovery timeouts, buffering cancellation and resource cleanup.
- An app-level deferred-video regression covers pause, resume and seek: old failures are ignored, and the current failure retains focused Retry.
- The playback session owns physical media lifetimes; scheduling, spoken-guidance policy and presentation keep their existing responsibilities.
- Playback asset tests cover missing moment audio, changed Polly bytes, absent fingerprints and preservation of prior site output when verification fails. The prompt-renderer check binds each generated file to its fingerprint.
- Eight full real-media browser runs and both interruption/recovery paths pass after the session extraction. Final package checks also decode the recorded labels and exercise the option and guidance flow. Browser output is muted; simulator execution remains deferred.

## October 13, 2026 interface polish

- 115 JavaScript tests pass, including option-panel focus and Back, interruption retention, detected-VoiceView recovery and supplemental recording integrity.
- Primary viewing actions precede detail selection; text, guidance, help and Start over are disclosed under More options.
- The real-media browser harness checks the disclosure at 1920, 1280 and 375 pixels, decodes four new option prompts and exercises detected-VoiceView recovery.
- Source handoff checks exclude generated interface copies and enforce exact archive membership.

## October 12–13, 2026 iteration checks

- 109 JavaScript tests pass, covering predictable recovery focus and actual identity-clip routing for untimed scenes.
- All 25 short moment-name recordings decode and complete in Chrome; both films pass interruption, revisit, earlier moment and resume checks.
- The prototype build, all description contracts and repository checks pass.
- `npm run submission:prepare` repeats those checks in an independent source copy and records hashes and test results in the local source kit.
- The current changes use browser verification; the earlier Vega observations retain their dates.

## October 9, 2026 changes and checks

- 106 JavaScript tests and five native host tests pass.
- Regression cases cover immediate narration cancellation on a film stall, critical-fact recovery without advancing the film, stale audio completion, and harmless waits between descriptions.
- Remote action labels stay compact while screen-reader names retain moment details. The browser harness compares action columns and widths before and after browsing earlier moments.
- Eight full real-media browser playback runs pass, plus both interruption/revisit/earlier/resume scenarios on a focused rerun. The guidance-failure and retry check also passes. Browser output was muted.
- The prototype build, repository checks and all 19 description contracts pass.
- Simulator execution is deferred for this iteration. The October 8 device observations below describe the earlier build.

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
- Eight full browser runs and both interruption/revisit/resume scenarios pass with real media and muted output.
- A separate browser failure test disables speech synthesis and blocks recorded prompts, then verifies focused recovery, successful retry and layouts at 1920 and 375 pixels.
- Description contracts cover all 19 windows. Three Tears of Steel variants reuse their existing measured Standard recording to preserve identifying facts.
- **Vega Virtual Device, October 8 build** (after a fresh VVD restart; [log excerpts](vega/logs/evidence-excerpts.txt), screenshots 60–63 in `vega/screenshots/`):
  - The host passed VoiceView state to the page 11 ms after the page reported ready.
  - Turning VoiceView on and off with the Back+Menu hold reached the running app each time. Spoken guidance switched off and back on without the viewer choosing.
  - In *Tears of Steel*, a pause at 45.9 s cut off the critical "forty years later" cue. Revisit replayed it as pending. Earlier moment then delivered `mechanical-hand` and `pair-on-bridge`, the two bridge moments with no timed cue. Focus stayed on Earlier moment.
  - A pause at 35.1 s in the bridge scene revisited `mechanical-hand` from the same shot.
  - Back during playback paused at 49.2 s, with focus on Return to catalog.
  - Cue onsets landed within 10 ms of schedule.
  - The VVD has no speech engine, so audibility on hardware is still untested.

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

`npm run release:check` validates approved production packages, source/rendition hashes, media measurements and current spoken prompts. It is intentionally separate from prototype and CI checks. Only approved production packages qualify for `npm run baselines` and `npm run site`; neither command grants approval.
