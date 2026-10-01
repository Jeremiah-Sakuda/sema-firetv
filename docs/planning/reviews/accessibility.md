# Independent evaluator: accessibility and viewer experience

This is an AI-assisted review of the frozen PRD v2.0, using EVALUATION-RUBRIC.md. It is not actual judging, target-user research, or a claim of lived experience. Scores assess the proposed plan, not an implemented app. I did not read other panel reviews.

**Recommendation: conditional build.** The specification now makes independent operation and a fairer comparison central to the product. Its most consequential remaining risks are the full navigation loop, coordinating platform speech with program audio, and whether the interruptions required to obtain control are worth the benefit.

## Stage One and scores

**Stage One: conditionally eligible.** The specified Fire TV app, AWS pipeline, and viewing interaction fit the stated track. A working qualifying platform demonstration is still required. The PRD supplies no implementation evidence and therefore cannot establish a pass. **Friction bonus: 0 awarded**; planned logging is not evidence.

| Criterion | Plan score / 10 | Rationale and requirement references | Evidence still needed |
|---|---:|---|---|
| Tech Implementation | 8.0 | INV-1–3 and SEM-208/330–336 address actual audio duration, late cues, buffering, and competing speech. These are unusually concrete reliability requirements. The app-to-screen-reader coordination is still the highest implementation uncertainty for the intended experience. | Captured target-device playback, VoiceView interaction, seek/buffer/recovery cases, and a fresh setup run. |
| Design | 7.5 | SEM-301–306, the context-specific remote contract, and explicit recovery/resume make independent use plausible. However, the contract does not complete the route from paused playback back to the catalog, and audible confirmation can impose frequent pauses. The usability acceptance row requires attempts rather than defining a successful exit threshold. | Uncoached end-to-end operation including mistakes, exiting a film, selecting another film, and restarting the app; interruption counts and user reactions. |
| Potential Impact | 7.0 | Sections 2 and 11 identify a specific audience, a plausible initial publisher, and honest formative questions. The study separates operational independence from product benefit and avoids claiming representative efficacy. Two brief clips and 3–5 participants can identify problems but cannot establish lasting demand or long-form usefulness. | Actual participant observations, reasons to prefer or reject adaptation, filmmaker feedback, and measured review burden. |
| Quality of the Idea | 8.0 | Sections 3 and 6 connect reviewed adaptive detail, remote operation, and a separate recovery cue without claiming category invention. Comparing against fixed Standard is the right challenge to the concept. Recovery may prove valuable even if three density levels do not; section 11 correctly acknowledges that the primary comparison tests the combined package. | Evidence of which feature creates value, meaningful level differences, and benefits that survive comparison with a well-authored fixed track. |

**Equal-weight composite: 7.625/10 (7.6 rounded).** These scores do not predict placement.

## Highest-impact concerns

### 1. P1 — Playback navigation has no specified exit to the catalog

**Type: internal specification omission.** SEM-310 says Back from paused controls closes controls and remains paused. Select reopens those controls. Neither that table nor SEM-303 specifies a route to leave playback, return to the catalog, and restore useful focus. This does not prove an eventual app will trap users; it leaves a core journey undefined.

**Suggested change:** define an accessible “Return to catalog” action and a consistent Back policy for hidden controls, paused playback, loading, and errors. Returning should focus the previously selected film. Specify what happens to the saved playback position.

**Verify:** an uncoached participant starts film A, pauses, changes their mind, returns to the catalog, and starts film B. Include the same journey from an error state and with VoiceView enabled.

### 2. P1 — Independent operation lacks a clear acceptance threshold

**Type: internal specification gap.** INV-4 requires independent completion, while section 10's acceptance row only requires that every participant attempts the journey and blockers are fixed/retested “where feasible.” Section 12's G4 calls for navigation blockers to be resolved, but the relationship between observed participant failure and a release decision is not explicit.

**Suggested change:** distinguish an evidence collection requirement from a release criterion. Treat reproducible app-caused blockers on a supported target configuration as release blockers; require retesting of the corrected scenario. Preserve participant-level results and report unresolved confusion instead of converting the small sample into a universal success claim.

**Verify:** maintain a scenario/result/issue/retest ledger and explicitly review unresolved failures at G4. Include catalog return and error recovery in addition to the existing happy path.

### 3. P1 — Platform speech coordination could undermine the central experience

**Type: sensible requirement whose feasibility is unproven, not a discovered implementation defect.** SEM-305/335 correctly require announcements and AD to coexist. A written pause rule does not demonstrate that the selected platform's focus announcements will finish before program playback resumes, or that enabling VoiceView will avoid duplicate spoken prompts.

**Suggested change:** make G0/G1 evidence include a small, explicit speech-state matrix: VoiceView enabled/disabled, first launch, rapid focus movement, density changes, error messages, recovery, and return from system UI. Specify a single owner for each app-generated utterance and define the resume behavior after speech cancellation. Do not assume all low-vision viewers use a screen reader.

**Verify:** capture the audible output and remote actions on the supported configuration. Confirm understandable labels, selected state, no duplicate app speech, no program/announcement overlap, and predictable resume. Treat inability to deliver this as a platform-selection problem before content production.

### 4. P1 — Control may cost more interruption than it gives back

**Type: product hypothesis requiring evidence.** SEM-310 pauses the program for controls and potentially again for shortcut confirmation. SEM-320 pauses for recovery and requires explicit resume. These choices protect intelligibility, but a viewer may prefer uninterrupted fixed AD, especially in short clips with little time to learn the controls.

**Suggested change:** keep the safe canonical controls and test the complete sequence before adding shortcuts. Add interruption count, time spent paused, accidental activations, and repeated failed attempts to the formative observation sheet. Ask about the timing and usefulness of each interruption, without assuming fewer pauses is always better.

**Verify:** run the fixed-Standard/adaptive comparison in section 11, recording actual feature use. If recovery drives preference while density changes go unused or confuse viewers, report that distinction and simplify the interaction based on observations.

### 5. P2 — Low-vision presentation requirements are too broad to verify

**Type: specification improvement.** SEM-304 promises optional large high-contrast text, and INV-4 mentions visible focus, but there is no agreed test condition for distance, text clipping, focus visibility, or the placement of narration text over relevant action. The blind-viewer speech path is more developed than the low-vision visual path.

**Suggested change:** define a supported TV size/resolution and representative viewing distance; specify text-size options, contrast checks, visible selected/focused states, and a placement rule that avoids obscuring the demo's key actions. Choose the final values with target-viewer feedback rather than presenting arbitrary pixel sizes as universally accessible.

**Verify:** inspect both films and every control/error state from that distance, then record low-vision participants' adjustments and failures when such participants are available.

## Closing assessment

**Strongest differentiator:** the combination of reviewed visual-beat recovery and independently accessible Fire TV control. Recovery can supply information that a selected density omitted, giving the interaction a concrete purpose beyond changing narration length.

**Strongest skeptical judge objection:** “You have made an accessible player with several authored tracks; where is the evidence that operating those controls improves following the story compared with simply providing an excellent Standard track?” The PRD now proposes an appropriate answer, but the answer remains unmeasured.

**Three next experiments:**

1. Build the 10–15 second target-device slice and record the full speech/navigation matrix, including exit to catalog and recovery cancellation.
2. Run one early, uncoached target-viewer session focused on discovery, mistakes, and resuming; correct the largest blocker before filming the main short.
3. Pilot the fixed-Standard/adaptive protocol with different clips and predefined comprehension questions; check that task wording does not instruct participants to use adaptive features merely because the team wants to demonstrate them.

Method note: the UI/UX Pro Max skill was consulted for interaction review. Its search returned general focus guidance, but no verified Fire TV focus-restoration rule; the navigation finding above comes directly from the PRD's incomplete state contract, not an asserted platform-specific standard.
