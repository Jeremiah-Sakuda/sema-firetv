# Sema

### Audio description that waits for you.

**On Fire TV, press Select and the film pauses. Sema then describes the visual moment you just missed, using only what has already been on screen. Press Play to continue from the same frame.**

Built for **Fire TV / Vega OS**, with an AWS authoring pipeline. Code: [MIT](LICENSE). Film excerpts: [CC BY 3.0](media/ATTRIBUTION.md).

## One scene

In the bridge scene of *Tears of Steel*, two characters talk almost continuously from 23.05 s to 45.22 s. The only pauses in those 22 seconds last 1.21 s and 0.75 s. A conventional description track has no room there to say who is on the bridge, or that the woman raises a mechanical right hand toward the man.

![Sema on the Vega Virtual Device, paused at 0:35 in the Tears of Steel bridge scene. The panel reads "Revisiting a visual moment", and the description text at the top reads "The woman raises her mechanical right hand toward the man."](docs/vega/screenshots/60-bridge-revisit-mechanical-hand.png)

Sema handles this from the remote:

1. **Select** pauses the film and focuses **Revisit latest moment**.
2. **Select** again: *"The woman raises her mechanical right hand toward the man."*
3. **Right**, then **Select** on **Earlier moment**: *"A man and a woman stand beside a canal on a metal bridge."*
4. **Play** continues from the paused frame.

Four of the 13 described moments in that excerpt fit in no dialogue gap, so Revisit is the only way to hear them. Revisit never describes anything later than the current film position.

## What Sema does

| Viewer action | Behavior |
|---|---|
| Revisit a moment | The film stays paused while Sema describes the latest visual moment. Earlier moment steps further back. Only moments at or before the current position are offered. |
| Recover interrupted narration | If a critical description is cut off by seeking, a stall or a dialogue overlap, it stays available until heard or deliberately skipped. |
| Timed description | Short descriptions play in the measured gaps between dialogue lines and never overlap speech. |
| Detail level | Essential, Standard or Rich. Where a gap is very short, the levels share wording: Rich matches Standard in 9 of 19 windows. |
| Spoken guidance or VoiceView | Recorded prompts announce controls and state changes. When VoiceView is on, Sema turns its own guidance off unless the viewer has chosen otherwise, so each control is spoken once. |
| Resume and preferences | Detail level and film position persist; Start over requires confirmation. |

The catalog contains two **72-second** Blender open-film excerpts: *Sintel — The Rooftop* and *Tears of Steel — The Bridge*. They include 25 described moments, 57 timed narration variants and 65 recorded guidance prompts. All media needed to run the prototype is in the repository.

## How it differs

- **Extended audio description.** WCAG names description that pauses the video *extended audio description*. Usually the author decides where the pauses go, and everyone gets them. In Sema, the viewer decides when to pause and what to hear again.
- **Related research.** Customizable description has been studied ([CustomAD, ASSETS 2024](https://www.guoanhong.com/papers/ASSETS24-CustomAD.pdf)), and so has pairing it with conversational questions about a video ([ViDscribe, 2026](https://arxiv.org/abs/2603.14662)). Sema does not claim either idea. Its contribution is narrower: on-demand description that:
  - works with a TV remote alone;
  - is spoiler-safe by construction;
  - tracks critical facts across interruptions;
  - is prepared ahead of time, so no model call or network request happens while someone watches.

## For publishers: AI-authored, human-gated

An app publisher on Vega would use Sema's [authoring pipeline](pipeline/README.md) to add this kind of description to its own catalog:

1. **Amazon Transcribe** finds the dialogue intervals.
2. **Amazon Bedrock (Nova Pro)** observes timestamped frames.
3. **Nova 2 Lite** writes three levels plus a separate Revisit description for each moment.
4. **Amazon Polly** voices them.
5. Every rendered clip is measured against its gap, and lines that don't fit are shortened and rendered again.
6. A human reviewer approves each line before release. The approval records are bound to the exact source, timing and audio.

Measured in the [October 4 live run](docs/evidence/aws/LIVE-PILOT-2026-10-04.json) on the two 72-second excerpts:

| | Sintel | Tears of Steel |
|---|---:|---:|
| Estimated AWS cost (list price, including reruns) | $0.38 | $0.32 |
| Automated stage time | 97 s | 86 s |
| Narration variants that fit on first render | 32 of 33 | 22 of 24 |

The machine drafts were not good enough on their own. An AI editorial pass outside the pipeline changed 78 of the 83 drafted lines; [`content/editorial/`](content/editorial/) records every before-and-after. Human review time has not been measured yet, and that number decides the real cost. [Recovery coverage](docs/evidence/recovery-coverage.md) on the drafts: at every half-second, Revisit has a moment to offer, and none comes from the future.

## Status

- **Narration:** the included narration is an AI-prepared draft and has **not** been approved by a human reviewer. The release gate (`npm run release:check`) refuses to package it as production content.
- **Platform:** tested in the browser and in the Vega Virtual Device, including VoiceView detection. Not yet tested on physical Fire TV hardware. VoiceView speech is also untested, because the simulator has no speech engine.
- **Viewers:** no sessions with blind or low-vision viewers yet. These results are engineering checks, not evidence of preference or comprehension.

## Try it

Requires **Node.js 22** and npm. No AWS account is needed to run the included two-film prototype.

```sh
npm ci
npm run preview
```

Open **http://127.0.0.1:4173**. Use arrow keys as the D-pad, Enter as Select, Escape as Back and Space as Play/Pause. For the target platform, follow the [Vega build guide](docs/vega/BUILD-AND-RUN.md).

To try the bridge scene, open *Tears of Steel* and play past 38 seconds. Then follow the steps under "One scene".

## Verified behavior

On October 8, 2026, these suites passed:
- 103 JavaScript tests;
- 75 offline pipeline tests;
- 5 native host tests.

Real-media browser runs covered both films at all three levels, plus both fixed Standard soundtracks. Interruption, retry, revisit and resume ran on both films in the browser and in the Vega Virtual Device. [Test commands, evidence and scope](docs/TESTING.md).

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
| `content/editorial/` | Record of the AI editorial pass on the draft narration |
| `tests/`, `tools/` | Regression tests, bundling, media checks and platform diagnostics |
| `docs/` | Setup, architecture, evidence, friction log and developer feedback |

[Documentation index](docs/README.md) · [Architecture](docs/ARCHITECTURE.md) · [Friction log](docs/FRICTION-LOG.md) · [Product feedback](docs/PRODUCT-FEEDBACK.md) · [Contributing](CONTRIBUTING.md)

Sema operates its own small catalog. It does not connect to Prime Video or other streaming services. Film credits and adaptation details are in [media attribution](media/ATTRIBUTION.md).
