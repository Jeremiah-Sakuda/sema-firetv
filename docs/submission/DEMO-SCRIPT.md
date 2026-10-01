# Demo video script

**Target:** 2:45, safely under the 3:00 limit.
**Upload:** public on YouTube or Vimeo.
**Recording:** real footage only, from the Vega Virtual Device (VVD) or a Fire TV, plus terminal captures for the pipeline.

**Music:** none. The film audio comes from CC BY films with attribution. Don't add stock music unless you own it.

**Accessibility of the video itself:**
- Burn in captions, or upload an SRT.
- Narrate the visuals as you go. A demo about audio description should itself be audio-described.

## Before recording

- [ ] `npm test` passes; `npm run validate` passes for every package.
- [ ] `npm run vega:sync`, build, and install on the VVD (`docs/vega/BUILD-AND-RUN.md`).
- [ ] Clear app storage, so onboarding appears on the first take.
- [ ] Use a screen recorder that captures **system audio**. macOS: QuickTime with an audio loopback device such as BlackHole, or OBS. Judges must *hear* the narration land between the dialogue lines.
- [ ] Have a remote-press overlay ready. Either show `tools/vega-probe/remote.sh` key events in a corner, or film your hand with the VVD remote or keyboard.

## Shot list

| Time | Picture | Voice-over (you) | Proves |
|---|---|---|---|
| 0:00–0:12 | *Sintel — The Rooftop* playing with **original audio only**. Caption: "The soundtrack never says what she found." | "[Sourced statistic on blindness or audio description availability. Verify it, e.g. against the WHO World Report on Vision, and cite it in the description.] When films go quiet, the story keeps happening on screen." | The problem |
| 0:12–0:22 | Sema on the VVD: catalog → onboarding. VoiceView or Sema's spoken guidance reads "How much do you want to hear?" | "Sema is a Fire TV app that lets blind and low-vision viewers choose how much of the picture they hear." | Fire TV app, Stage One |
| 0:22–0:58 | **One uncut take.** Choose Standard → Play. The AD line lands in a dialogue gap. Press Select mid-description → "A description was interrupted. What did I miss is selected." → Select → recovery narration → "Resume is selected" → Select. | Mostly silent; let the app speak. One line: "Every press here is a real remote press, uncut." | Core interaction, no hidden latency |
| 0:58–1:15 | The same rooftop moment at **Essential vs. Rich**. Split screen, with captions on via Description text. | "Same moment, same gap. Essential gives you the key fact. Rich gives you the picture." | Adaptive detail is real |
| 1:15–1:25 | The **adaptive suggestion**: ask "What did I miss?" twice in a scene → Sema offers Rich, already paused. | "If you keep asking, Sema offers more detail, without interrupting the film." | AI-enhanced viewing that adapts |
| 1:25–1:45 | Viewer evidence: a participant quote (with consent) + one design change you made because of it. **If there are no sessions, show the limitation honestly** and the test-suite run. | "[Participant quote]. We changed [X] because of it." | Impact, iteration |
| 1:45–2:20 | Pipeline montage (terminal + diagram): ingest → Transcribe dialogue gaps → Nova observations → three levels → Polly → fit loop (show a line too long, shortened, re-measured) → human review CLI → `validate.js` ✔. Overlay **real numbers** from `pipeline-report.md`. | "Amazon Transcribe finds the gaps. Nova on Bedrock watches the film. Polly voices it, and we measure every line to make sure it fits. A person approves every word. One minute of film took [N] minutes of review and cost [$X]." | AWS Builder, scale story |
| 2:20–2:35 | *Tears of Steel* plays in the catalog. Show the dense-dialogue scene: the narration waits, then lands. | "It works on live action with dense dialogue, too. If a line can't fit, Sema never talks over the actors." | Robustness, second asset |
| 2:35–2:45 | End card: the Sema logo, "Open source · MIT", GitHub URL, film credits (Blender Foundation, CC BY 3.0). | "Sema. Hear as much of the picture as you want." | Close |

## Rules to keep while editing

- **Don't cut the 0:22–0:58 take.** Judges are told that editing can hide latency and failures.
- **Use real numbers only.** If a number isn't measured yet, leave it out.
- **Don't imply** Prime Video integration, a content partnership, or any user result that didn't happen.
