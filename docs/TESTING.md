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

`SEMA_CHROME` can point to an existing Chrome executable; `SEMA_PLAYWRIGHT_MODULE` can point to an existing Playwright module. Results go to `artifacts/browser/`, or `SEMA_BROWSER_OUT` if provided. This harness decodes real media with output muted; it is not a listening test.

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

These are engineering checks. They do not establish narration accuracy, audible synchronization, physical VoiceView/Dolby behavior, independent nonvisual use, listener preference or comprehension gains. Sema makes no participant-study claim.

## Release checks

`npm run release:check` validates approved production packages, source/rendition hashes, media measurements and current spoken prompts. It is intentionally separate from prototype and CI checks. Only approved production packages qualify for `npm run baselines` and `npm run site`; neither command grants approval.
