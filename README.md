# Sema

### Audio description at your pace.

**Sema gives blind and low-vision viewers control over the visual story on Fire TV. They choose how much description to hear, press Select to hear any moment already on screen, then continue from the same frame. Descriptions are prepared ahead of time on AWS, so every request plays instantly, with no model call and no cloud cost per viewer.**

Built for **Fire TV / Vega OS**, with an AWS authoring pipeline. Code: [MIT](LICENSE). Film excerpts: [CC BY 3.0](media/ATTRIBUTION.md).

## One scene

Audio description has to fit between the lines of dialogue. In the bridge scene of *Tears of Steel*, two characters talk from 23.05 s to 45.22 s. The longest pause in that stretch is 1.21 s. Saying *"A man and a woman stand beside a canal on a metal bridge"* takes 3.3 s, so a timed track has to leave it out. With Sema, the viewer can still hear it.

![Sema on the Vega Virtual Device, paused at 0:34 in the Tears of Steel bridge scene. The panel reads "Revisiting a visual moment: Describing at 0:33: Mechanical hand. Next earlier at 0:25: People on the bridge", and the description text reads "The woman raises her mechanical right hand toward the man."](docs/vega/screenshots/65-bridge-revisit-oct16.png)

*Sema on the Vega Virtual Device (October 16 build).*

1. **Select** pauses the film and focuses **Revisit latest moment**.
2. **Select** again: *"The woman raises her mechanical right hand toward the man."*
3. When the description finishes, focus returns to Resume. Press **Right twice**, then **Select** on **Earlier moment**: *"A man and a woman stand beside a canal on a metal bridge."*
4. **Play** continues from the paused frame.

In this excerpt, 4 of the 13 described moments have no timed slot; Revisit is how a viewer hears them. Revisit only offers moments that have already been on screen.

## Who it is for

**Viewers.** In 2020, an estimated 43 million people worldwide were blind and 295 million more had moderate or severe vision impairment ([Lancet Global Health, 2021](https://pubmed.ncbi.nlm.nih.gov/33275950/)). People who rely on audio description don't all want the same amount of it. In [Describe Now](https://arxiv.org/abs/2411.11835), 20 blind and low-vision participants preferred different description frequency and detail across videos. Sema turns those preferences into controls on the remote.

**Beyond the hackathon.** Sema reaches viewers in two ways:
- **As a Fire TV app** with its own catalog of openly licensed films.
- **For publishers.** A publisher can adapt the MIT-licensed player and the AWS authoring pipeline to add viewer-controlled description to its own films. The [integration guide](docs/INTEGRATION.md) covers the package format and the scheduling core, `src/playback.js`, which runs without a browser.

**Standards.** In the EU, the [European Accessibility Act](https://eur-lex.europa.eu/eli/dir/2019/882/oj) has applied since June 2025 to services that give access to audiovisual media. EN 301 549, the European ICT accessibility standard, asks that audio-description controls sit at the same level as the main playback controls (clause 7.3). In Sema, they are one Select away.

## What Sema does

| Viewer action | Behavior |
|---|---|
| Choose the amount of description | Essential, Standard or Rich. Every level fits the measured dialogue gaps; Rich adds visual detail where the gap allows. |
| Revisit a moment | The film stays paused while Sema describes a visual moment. Earlier moment steps further back. Only moments at or before the current position are offered. |
| Recover interrupted narration | If a critical description is cut off, it is offered first and stays available until heard or deliberately skipped. A clip that is cut off never counts as heard. |
| Keep watching | Timed descriptions fit within the recorded dialogue gaps. Fit is checked again when narration starts; stalls and late starts have recovery paths. |
| Use spoken guidance or VoiceView | Recorded prompts announce controls and state changes. When VoiceView is on, Sema hands speech to VoiceView: its own guidance turns off, and state changes go to VoiceView through the native announce API. A viewer's explicit choice takes precedence. |
| Resume and keep preferences | Detail level and film position persist. More options holds text, spoken guidance, help and a confirmed Start over. Back closes these options first. |

The catalog contains two **72-second** Blender open-film excerpts: *Sintel — The Rooftop* and *Tears of Steel — The Bridge*. Together they have:
- 25 described moments;
- 57 timed narration variants;
- 67 recorded control prompts;
- 25 short recorded moment names.

All playback media is in the repository. Narration and 63 control prompts use Amazon Polly; moment names and four viewing-options prompts use local Piper speech. Watching uses local files and makes no model or cloud call.

## Why it belongs on Fire TV

- **The remote is the whole interface.** Every action works with the D-pad, Select, Back and Play/Pause.
- **VoiceView and Dolby audio.** Fire TV's screen reader, VoiceView, can only speak during video playback if Dolby audio is disabled ([friction log, entry 21](docs/FRICTION-LOG.md)). Sema pauses the film before any interface speech, so it never needs VoiceView to talk over a playing film.
- **Prepared, not generated, at viewing time.** A Revisit request plays a prepared recording instantly, with no model call or network wait.

## Publisher workflow

1. **Supply an authorized film.** Amazon S3 holds the authoring input; Amazon Transcribe supplies dialogue timestamps.
2. **Prepare descriptions.** Bedrock Nova Pro observes timestamped frames. Nova 2 Lite writes three detail levels and a separate Revisit description for each moment.
3. **Render and check.** Amazon Polly voices the lines. The pipeline measures each recording against its gap, rewrites lines that don't fit and checks that required facts survive.
4. **Review.** An editor approves, edits or drops each line. Approval is bound to the exact source, timing and audio, so any later change reopens review.
5. **Package.** The player uses prepared media locally, so a viewer's request never waits for generation.

The [pipeline guide](pipeline/README.md) documents the working CLI and release checks. For the two included excerpts, an AI editorial pass (Codex) corrected the drafted wording against the source frames; [`content/editorial/`](content/editorial/) records every change and the exact text that ships.

Measured in the [October 4 live run](docs/evidence/aws/LIVE-PILOT-2026-10-04.json):

| Per 72-second excerpt | Sintel | Tears of Steel |
|---|---:|---:|
| Estimated AWS usage at list price, including reruns | $0.38 | $0.32 |
| Latest automated run | 97 s | 86 s |
| Timed variants fitting on first render | 32 of 33 | 22 of 24 |

That works out to roughly 30 cents of estimated AWS usage per minute of film. Viewing makes no cloud calls, so more viewers add no AWS cost.

## What makes the interaction distinctive

[Extended audio description](https://www.w3.org/WAI/WCAG22/Understanding/extended-audio-description-prerecorded.html) adds description by pausing the video, at points the author chooses. In Sema, the viewer chooses.

Related work explores:
- viewer-controlled timing and detail ([Describe Now](https://arxiv.org/abs/2411.11835));
- customizable description ([CustomAD, ASSETS 2024](https://www.guoanhong.com/papers/ASSETS24-CustomAD.pdf));
- conversational video description ([ViDscribe, 2026](https://arxiv.org/abs/2603.14662)).

Sema brings this to the living-room TV. It combines detail choice, spoiler-safe Revisit of past moments and recovery of interrupted facts, all from the remote, with prepared playback that responds instantly.

## Try it

Requires **Node.js 22** and npm. No AWS account is needed to run the included two-film prototype.

```sh
npm ci
npm run preview
```

Open **http://127.0.0.1:4173**. Use arrow keys as the D-pad, Enter as Select, Escape as Back and Space as Play/Pause. For the target platform, follow the [Vega build guide](docs/vega/BUILD-AND-RUN.md).

- **The bridge example:** start *Tears of Steel* from the beginning and pause at about **38 seconds**, before the next moment at 44 seconds. Then follow the four steps under "One scene".
- **Detail choice:** compare the *Sintel* alley cue at about 6 seconds in separate runs. Essential says *"A woman walks."* Rich says *"A red-haired woman carries a staff through a narrow sunlit alley."*

## Verified behavior

- **Test suites (October 16):** 140 JavaScript, 76 offline pipeline and 6 native host tests pass. Both films pass their description contracts, the editorial record matches every shipped line, and the repository checks pass.
- **Browser:** real-media Chrome runs cover both films at all three levels. They also cover the keyboard flow through Revisit, Earlier moment, resume and every Back action.
- **Vega package:** the aarch64 build contains 200 hash-matched playback assets.
- **Vega Virtual Device (October 16 build):** in the bridge scene, Revisit, Earlier moment, resume and recovery of an interrupted critical description all worked from the remote. Earlier builds also covered both excerpts end to end, Back, and VoiceView turning on and off.

The included excerpts run with `npm run preview`. `npm run release:check` is the separate gate for editor-approved production packages.

[Test commands and dated evidence](docs/TESTING.md)

```sh
npm test
npm run preview:build
npm run repo:check
npm run content:check
```

## Repository guide

| Path | Contents |
|---|---|
| `src/`, `index.html`, `style.css` | Player state, narration, remote input and interface |
| `preview/media/` | Portable two-film media snapshot, Standard mixes and integrity manifest |
| `media/` | Spoken guidance, engineering fixture and production catalog |
| `vega-app/` | Native Vega WebView host and package build |
| `pipeline/` | AWS authoring stages and offline tests |
| `content/editorial/` | Editorial record: every change to the drafted narration and the exact text that ships |
| `tests/`, `tools/` | Regression tests, bundling, media checks and platform diagnostics |
| `docs/` | Setup, architecture, evidence, friction log and developer feedback |

[Documentation index](docs/README.md) · [Architecture](docs/ARCHITECTURE.md) · [Integration](docs/INTEGRATION.md) · [Viewing language](GLOSSARY.md) · [Friction log](docs/FRICTION-LOG.md) · [Product feedback](docs/PRODUCT-FEEDBACK.md) · [Contributing](CONTRIBUTING.md)

Film credits and adaptation details are in [media attribution](media/ATTRIBUTION.md).

## Prepare the source handoff

Run `npm run submission:prepare` after `npm ci`. The command doesn't publish anything. It:
- exports the current public source;
- verifies an independent copy, with an offline dependency install, the tests and the prototype build;
- produces a source archive plus per-file hashes.

Private drafts and generated files are excluded. Outputs stay under `.local/submission/kit/`.
