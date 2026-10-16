# Adding Sema to a Fire TV app

A publisher with its own Fire TV app and catalog can reuse two parts of Sema:
- **the authoring pipeline**, which turns an authorized film into a package of timed descriptions;
- **the scheduler**, which decides what to say and when.

Your app keeps its own video player, user interface and audio output.

## What you reuse

| File | Role | Dependencies |
|---|---|---|
| [`src/playback.js`](../src/playback.js) | Scheduler state machine (173 lines). It decides which description to play at each film position, pauses for interrupted critical facts, and answers Revisit and Earlier moment. | `src/package.js` only; no DOM, media or network APIs |
| [`src/package.js`](../src/package.js) | Package validation: timing, dialogue overlap, required audio and the approval gate | none |
| [`pipeline/`](../pipeline/README.md) | Authoring: S3, Transcribe, Bedrock Nova and Polly, then review and packaging | Python, AWS |

[`tests/integration-example.test.js`](../tests/integration-example.test.js) runs the sequence below in plain Node, with no browser.

## The package

`sema package` writes one JSON file per film, plus its MP3 recordings:

| Field | Meaning |
|---|---|
| `id`, `version`, `title`, `duration`, `video`, `rights` | Identity, length in seconds, and the film's media path and rights record |
| `reviewStatus` | `approved` after the pipeline's review step; the scheduler refuses anything else unless told otherwise |
| `scenes` | Contiguous camera shots `{id, start, end}` covering the film |
| `dialogue` | Recorded dialogue intervals `{start, end}`; no cue may overlap them |
| `events` | Visual moments `{id, scene, availableAt, critical, recovery: {text, duration, audio}}`. `recovery` is the Revisit description. |
| `cues` | Timed slots `{id, events, start, end, margin, variants: {essential, standard, rich}}`. Each variant is `{text, duration, audio}`, and its measured duration plus margins must fit the window. |

## Driving the scheduler

```js
import { Playback } from './playback.js';

const p = new Playback(pkg);        // throws if the package fails validation
p.enter();                          // controls open, film paused
p.setLevel('standard');             // 'essential' | 'standard' | 'rich' | 'off'
p.resume();

// On every player time update:
const cue = p.tick(player.currentTime);
if (p.mode === 'controls') pauseAndOfferRevisit();   // a critical cue no longer fits: see below
else if (cue) {
  // Load cue.audio. When it actually starts playing, confirm it still fits:
  if (p.canStart(cue.token, player.currentTime)) playAudio(cue.audio, () => p.complete(cue.token));
  else if (p.mode === 'controls') pauseAndOfferRevisit();
}

// The viewer pauses:      p.controls('pause');
// Revisit:                const r = p.recover();         // interrupted critical fact first, else the latest moment
//                         playAudio(r.audio, () => p.complete(r.token));
// Earlier moment:         p.recover(eventId);            // any event with availableAt <= current position
// Missed facts:           p.pending();                   // interrupted critical facts, oldest first
// Persist and restore:    p.snapshot(); p.restore(saved);
```

**Check `p.mode` after `tick()` and `canStart()`.** If a critical description can no longer fit (a late start, a stall, a seek into its window), the scheduler switches to `controls` and lists the fact in `pending()`. Pause the film and offer Revisit, which plays that fact first; `src/app.js` does this in its playback loop. Optional detail is simply dropped without pausing.

The scheduler never selects a moment later than the current position. A critical description that is cut off stays in `pending()` until `complete()` confirms it played to the end; a cancelled clip never counts as heard.

## What your app provides

- **Audio playback**, plus ducking of film audio during narration.
- **Remote focus and labels.** Put description controls at the same level as play and pause (EN 301 549, clause 7.3).
- **Screen-reader output.** Send state changes to VoiceView with `AccessibilityInfo.announceForAccessibility`, as [`vega-app/src/App.tsx`](../vega-app/src/App.tsx) does.

## Complete reference

The player in this repository is one complete adapter:
- [`src/playback-session.js`](../src/playback-session.js) owns media timing;
- [`src/app.js`](../src/app.js) owns the remote interface and speech.
