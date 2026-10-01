# Independent panel review: playback engineering and delivery

**Reviewed:** PRD-v2.0.md, as frozen. **Lens:** Fire TV playback engineering, AWS feasibility, timing correctness, and delivery risk. This is an AI-assisted pre-build review, not Amazon judging, user research, or a prediction of placement.

## Verdict and scores

**Recommendation: conditional build.** The plan is considerably stronger than a generic AI narration demo. Its offline architecture, human approval, packaged playback, and explicit failure handling are credible choices for this scope. Resolve how viewers recover critical information lost during playback, then prove the audio/accessibility implementation before producing the full content set.

**Stage One: conditionally eligible.** Sections 4, 12, and 15 describe an appropriate Fire TV artifact and submission package. A document cannot establish eligibility: a working qualifying app, required materials, and a final rules check remain necessary.

Scores assess the quality and credibility of the proposed plan using the panel's unofficial 0–10 scale. They do not score a completed product.

| Criterion | Score | Rationale and PRD references | Missing evidence |
|---|---:|---|---|
| Tech Implementation | 8.0 | Sections 8–10 make strong architectural choices: actual rendered duration governs fit, the media timeline drives cues, edits invalidate approval/rendering, and offline packages avoid runtime model latency. SEM-331–333 still allow critical information to disappear after an interruption without an explicit recovery obligation. Actual playback and VoiceView integration are unresolved. | Working target platform; captured synchronization and interruption results; brief-action detection results; package validation failures; measured authoring time/cost. |
| Design | 7.5 | Sections 6 and 9 define canonical focusable controls, pause for spoken interaction, explicit resume, and context-sensitive remote behavior. These are thoughtful. The cost of pausing for level changes, the discoverability of recovery, and the behavior after an interrupted critical cue remain uncertain. | Independent task completion; observed VoiceView announcements; interruption tolerance; recovery success when the missed information is older than the most recent beat. |
| Potential Impact | 7.0 | Sections 2 and 11 define a specific viewer, a plausible publisher hypothesis, an appropriate fixed-AD comparator, and honest small-sample reporting. The initial catalog and operational model are credible hypotheses rather than established reach. | Target-viewer benefit; filmmaker willingness; review labor per finished minute; whether difficult films remain practical to describe without editorial rejection. |
| Quality of the Idea | 7.5 | Sections 1, 3, and 14 position a coherent combination of remote-controlled detail, paused recovery, and a reviewed publishing workflow without an unsupported invention claim. The main creative value depends on useful differences between levels under the same temporal constraints. | Meaningful level differences on an untuned asset; evidence viewers use or value density selection; incremental value beyond a strong fixed track with recovery. |

**Equal-weight composite: 7.5/10. Friction bonus: 0 awarded in this review.** A planned log cannot earn a bonus; only organizers can award one based on actual evidence.

## Highest-impact concerns

### 1. P1 — The runtime contract can permanently omit a critical event

**Type:** internal specification gap.

SEM-106 and the critical-content acceptance condition require every described level to cover critical facts. However, SEM-331 skips unsafe cues; SEM-332 can discard interrupted cues; and SEM-320 explicitly abandons the interrupted AD fragment after recovery. A complete and editorially valid package can therefore produce an incomplete viewing experience. Reporting skipped cues makes the issue visible but does not restore the missing fact. Recovery only selects the most recent completed beat in the current scene, so an earlier missing critical beat may no longer be reachable.

**Suggested change:** mark critical event coverage at runtime and define a bounded policy for critical cues interrupted by ordinary controls or buffering. For this small prototype, pause and offer a reviewed recovery account of the interrupted critical beat before resuming, or replay that cue from a safe position. Distinguish deliberate forward seeking from system-induced loss: a viewer who intentionally skips footage need not hear every skipped event. Avoid silently queuing descriptions into future dialogue.

**Verification:** interrupt the key critical cue halfway through using buffering, menu opening, and recovery. Demonstrate that the viewer can obtain its full meaning without guessing when to rewind. Repeat after a later visual beat has completed. Log event coverage, not just emitted cue IDs.

### 2. P1 — Independent audio playback and accessibility speech are the decisive feasibility risk

**Type:** sensible requirements whose implementation is unproven; not evidence the design is infeasible.

SEM-330–336 correctly describe desired behavior but do not yet establish that the chosen player and accessibility APIs can deliver it. The difficult case is concurrent video, an independently rendered AD file, and platform speech while the app receives rapid remote input, buffering, or an audio-focus interruption. The proposed gates appropriately put this early; they must remain hard gates.

**Suggested change:** make G1's engineering exit artifact a small state-transition table plus a device capture covering program playback, active AD, paused controls, recovery, seeking, buffering, and return from background. Specify which component owns pause/resume and how stale audio-start callbacks are invalidated. Choose the target platform and audio approach from this result.

**Verification:** on the actual intended target, run mid-cue pause/resume, rapid level changes, recovery cancellation, seek while audio is loading, and VoiceView focus changes. Record audible output and media position. A plain video player plus independently successful TTS tests does not pass this gate.

### 3. P1 — Three labels may deliver too little useful variation within the same gaps

**Type:** central product and content hypothesis remains unproven.

SEM-105–106 require critical facts in every level, while Section 6 permits approved shorter variants when Rich cannot fit. These are good safety choices, but on speech-dense material they may leave little audible difference among the three settings. The acceptance condition of two differentiated moments per asset can pass even when users see little practical reason to change level.

**Suggested change:** before filming around favorable gaps, run the level-generation and fitting process on the independently selected second asset. Record how often each level differs, what information differs, and how often Rich falls back. Preserve editorial quality instead of imposing a word-count quota. Define the evidence needed to retain three levels based on viewer understanding and preference.

**Verification:** present the approved variants to target viewers using counterbalanced material. Ask what changed and when the difference helped. A valid outcome can be that a particular clip has little room for variation; disclose that instead of generalizing from the easiest scene.

### 4. P2 — Timing acceptance needs a precise, reproducible measurement protocol

**Type:** incomplete acceptance definition, rather than a demonstrated timing defect.

Section 10 specifies 200 ms protection, p95 start error of 150 ms, and a maximum of 250 ms. It also correctly says timing that defeats the configured margins fails. Consequently, meeting the numerical start-error limit alone does not establish safety, especially for cues near the end of a window. The document does not yet define whether error is signed or absolute, how source dialogue boundaries are aligned to recorded playback, or how actual audible cue endings are assessed.

**Suggested change:** define the measurement method before evaluating: signed and absolute start error, measured audible onset/end against source-aligned protected intervals, synchronization/alignment uncertainty, and required slack derived from observed device behavior. Report results by asset and level alongside the combined distribution. Keep the no-overlap condition authoritative.

**Verification:** include a cue with little spare window capacity, exercise target-device conditions, and inspect both its onset and ending in the captured output. Show that the measured slack exceeds observed uncertainty; raise margins and regenerate/review if it does not.

## Strongest differentiator

A complete, reviewed viewing workflow in which a viewer can choose detail and recover visual meaning independently using a Fire TV remote. Its strength is the interaction plus dependable content, not the number of AWS services.

## Strongest skeptical judge objection

“You have demonstrated expensive preparation for two short films. What evidence shows that changing detail improves the viewer's experience enough to justify the additional controls, pauses, and editorial work over one excellent fixed track with recovery?”

The plan acknowledges this objection but has not yet answered it. A small, candid comparison and measured review burden would be more persuasive than additional architecture.

## Three next experiments

1. **Target-device playback stress slice:** use a reviewed 10–15 second clip to exercise active AD, VoiceView focus, pause, seek, buffering, and recovery. Capture audible output and timeline state; prove critical information is recoverable after interruption.
2. **Untuned content feasibility pass:** select the second asset first, annotate a withheld reference, and run model observation, all three script levels, Polly rendering, and review. Measure missed brief actions, critical coverage, differentiated moments, fallback frequency, fit, and human effort.
3. **Formative comparison:** recruit target viewers early and compare fixed Standard with the adaptive experience using counterbalanced clips. Record independent operation, comprehension, preference, interruption cost, and which feature caused any benefit. If feasible, add fixed Standard with recovery to distinguish recovery value from density value.
