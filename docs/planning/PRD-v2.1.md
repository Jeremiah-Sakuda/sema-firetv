# Sema PRD v2.1

**Track:** Fire TV — AI-enhanced viewing and multi-modal UX  
**Mini challenge:** AWS Builder  
**Submission deadline:** October 23, 2026, 3:00 PM EDT  
**Status:** Current proposed scope, incorporating selected panel recommendations; implementation and user validation have not begun. Supersedes v2.0 for building; the v2.0 review snapshot remains unchanged.  
**Objective:** Build a credible first-place contender through an independently usable Fire TV experience, reliable playback, and evidence that viewer control improves on fixed audio description. This is an objective, not a prediction of placement.

## 1. Product promise

**Sema lets blind and low-vision viewers choose how much visual detail they hear, and recover missed moments, using their Fire TV remote.**

Sema plays a small, rights-cleared catalog with human-reviewed audio description (AD). Viewers choose Essential, Standard, or Rich before playback and can adjust it while watching. “What did I miss?” pauses the film and describes the most recent completed visual beat, including relevant details their selected level may have omitted. If a critical description was interrupted or skipped by the player, recovery first supplies that missing information. The viewer explicitly resumes playback.

The primary benefit is control over following the story. AI makes candidate authoring possible; accessible interaction, editorial quality, and playback reliability make the product useful.

## 2. Users, need, and initial distribution

**Primary viewer:** a blind or low-vision adult watching short narrative films on Fire TV who wants to follow visual events and choose the amount of narration.

**Initial publisher hypothesis:** independent filmmakers who can authorize distribution of their short films and want to offer accessible versions through a curated Fire TV catalog. The filmmaker supplies the film and rights; a designated reviewer approves description; Sema packages and plays it.

**Hackathon operator:** the team performs ingestion, review, and publishing. Self-service onboarding, payments, and a publisher marketplace are out of scope.

**Need to validate:** viewers differ in when and how much description they want; changing detail and recovering missed visual information should help without creating excessive interruption or interaction effort. A good fixed Standard track is the baseline, not merely playback with no AD.

The two demo films establish a working workflow, not a distribution partnership or a sustainable catalog. Conduct one concrete publishing walkthrough with an independent filmmaker if access permits: use an authorized asset, show the approved package, identify who would review another film and the required turnaround, and record a next-asset commitment, objection, or refusal. Prefer using the second asset to avoid another production workstream. If no filmmaker participates, measure the team's workflow and label external demand unvalidated. A partnership is not a build prerequisite and must not be claimed without agreement.

After both assets, report active review/edit/listening time separately from unattended processing. Estimate a bounded pilot capacity as available reviewer minutes per week divided by observed review minutes per finished video minute, using the slower asset as a conservative scenario. State the assumed staffing, asset lengths, and content restrictions; do not extrapolate two clips into proven long-form economics. If review effort exceeds the team's available time, shorten the proposed pilot or narrow supported content before claiming scalability.

## 3. Differentiation and honest claims

User-controlled detail and on-demand AI description already appear in research, including *Describe Now*. Sema does not claim to invent adaptive AD. Its proposed contribution is the combination of:

- Continuous, gap-fitted playback on Fire TV with three reviewed detail levels.
- Independent operation using the remote and platform accessibility support.
- Recovery of a recent visual beat without describing future events.
- A reproducible authoring and quality-control workflow for authorized content.

These are hypotheses to demonstrate, not assertions of worldwide novelty. Research and comparable products belong in the submission's related-work note. Do not assume the size or quality of the competing field.

## 4. Scope

### Required for the competitive v1

- One Fire OS or Vega OS app, demonstrated on a qualifying simulator or actual Fire TV device.
- Accessible catalog, onboarding, playback, settings, recovery, and error states.
- Off, Essential, Standard, and Rich playback settings; three meaningfully distinct described levels.
- One original 45–60 second short and a second independently selected, rights-cleared excerpt of comparable length.
- Offline AWS authoring pipeline, one fixed narration voice, human review, exact rendered-audio validation, versioned packages.
- A fixed Standard comparison condition and formative target-user evaluation.
- Evidence, setup instructions, product feedback, and actionable friction logs.

### Explicit non-goals

- Describing video in Prime Video, Netflix, or any other app.
- Live stream description, arbitrary uploads from viewers, or real-time generation during playback.
- Custom voice commands, voice selection, translation, second-language recap, or other track integrations.
- Commercial catalog licensing, DRM integration, payments, accounts, or an elaborate authoring dashboard.
- A generalized description SDK or an additional Open Source mini-challenge project.
- A browsable recovery-history interface, automatic catch-up summaries, or a large efficacy study. A small per-asset record of interrupted critical events is required for reliability.

## 5. Product invariants

| ID | Invariant |
|---|---|
| INV-1 | Final rendered audio determines fit. Text length is only an estimate. Every approved edit is rendered and revalidated before packaging. |
| INV-2 | A person reviews every shipped playback and recovery cue. Unapproved content cannot enter a published package. |
| INV-3 | Sema narration does not cover dialogue. A late or unsafe playback cue is skipped; recovery and spoken UI requiring attention pause program playback. |
| INV-4 | A target viewer can complete the core journey without sighted assistance. Visible focus and readable text complement spoken access. |
| INV-5 | Levels preserve the same observed facts and critical events. Rich adds reviewed detail; it does not introduce a contradictory account. |
| INV-6 | Recovery only describes information available by the viewer's current position. Nothing from a later reveal is spoken early. |
| INV-7 | Measurements, quotations, testing, tool use, partnerships, and limitations are reported accurately. Proposed thresholds are never reported as achieved results. |
| INV-8 | Content rights and required attribution are documented. The code license does not automatically license all media assets. |
| INV-9 | Playback state, active audio, and cue scheduling stay coherent through pause, seek, buffering, level changes, recovery, and app interruptions. |
| INV-10 | Critical facts present in the package must not silently disappear during playback. Track delivery and keep interrupted or system-skipped critical events recoverable until delivered or intentionally bypassed by the viewer. Delivery is an audio-playback observation, not proof of comprehension. |

## 6. Viewer experience and interaction requirements

### SEM-300: Independent operation

- **SEM-301 — First run:** offer a spoken and visible introduction before program playback begins. Explain level selection, recovery, and resume. The viewer chooses a starting level; Standard is the suggested option. Save the explicit choice. Never silently default to Off because a platform preference could not be read. Initially design for a preferred level with occasional adjustment; frequent mid-film changes are a hypothesis to test, not required user behavior.
- **SEM-302 — Platform integration:** evaluate VoiceView, accessibility labels, focus order, remote hints, and relevant system preferences on the chosen platform. A readable system AD preference may suggest the initial choice but must not override a saved choice. Document unsupported APIs and the tested device/OS.
- **SEM-303 — Catalog:** two assets with accessible title, duration, synopsis, and description availability. Each can be launched without sighted assistance. Avoid unexplained icons and pointer-only interactions.
- **SEM-304 — Settings:** accessible Off / Essential / Standard / Rich selection and optional large high-contrast narration text. Persist the selected level across app restarts. Text mode is supplementary; no essential information is visual-only.
- **SEM-305 — Feedback:** speak focused control names and selected values through the platform accessibility path where supported. Announcements and program audio must not compete. Coalesce rapid input into one final-state confirmation.
- **SEM-306 — Errors:** asset loading, missing audio, unavailable recovery, and retry/back actions have spoken and visible messages. A broken package is blocked from playback rather than presented as complete AD.
- **SEM-307 — Return and resume:** every playback/control/error state has an accessible route to the catalog. Stop app narration on exit; restore catalog focus to the film just left. Save position and pending critical-event IDs with the asset/package version. Reopening offers Resume or Start over while paused. Start over resets delivery state; a changed package invalidates the old resume record and is announced before restarting. Loading/errors offer Retry and Return to catalog. At the end, keep pending recovery available alongside Replay and Return to catalog; do not autoplay another film.
- **SEM-308 — Low-vision verification:** before G1, record the supported resolution, chosen text size, text/background and focus colors, and text-card placement. Use proposed targets of at least 4.5:1 text contrast and 3:1 focus-indicator contrast against adjacent colors. All controls and errors must have visible focus, no clipped labels, and text cards that avoid the demo's critical action. Test on a documented physical display/viewing distance when available; simulator-only inspection supports a layout claim, not a living-room readability claim. Record low-vision participants' adjustments and unresolved failures without claiming universal accessibility.

### SEM-310: Remote contract

Accessible focusable controls are the canonical path. G1 includes no density shortcuts. Only add one later if early viewer sessions reveal a concrete need and tests with VoiceView show no navigation conflict or harmful interruption. Do not spend scope on shortcuts merely to make the demo look more immediate.

Entering playback controls cancels the active AD instance before control speech and registers any unfinished critical event under SEM-337. A normal transport pause instead preserves the narration position when synchronized resume is reliable; that pause alone does not create a pending-loss notification. Resume after control interaction schedules the next eligible cue and leaves any cancelled critical information reachable through recovery.

| Context | Input | Behavior |
|---|---|---|
| Catalog/settings/dialog | D-pad / Select | Move focus / activate focused item; never change playback density incidentally. |
| Playback with controls hidden | Menu | Pause at the current position and open playback controls. Announce available actions. |
| Playback controls | D-pad / Select | Select description level, What did I miss?, text mode, Resume, or Return to catalog. |
| Playback with controls hidden | Up / Down | Candidate shortcut to increase/decrease detail. Retain only if platform and target-user testing show it does not conflict with navigation. |
| Playback with controls hidden | Select | Open the paused controls; initial focus may be What did I miss? after usability testing. Do not globally remap Select to recovery. |
| Normal playback | Play/Pause | Pause/resume both program and scheduled narration coherently. |
| Playback with controls hidden, playing or paused | Back | Pause and open controls, focused on Return to catalog; a second Back exits. |
| Recovery narration | Play/Pause or Back | Stop recovery narration, retain any incomplete critical event as pending, and remain paused with Resume focused. |
| Paused playback controls | Back | Return to catalog and restore focus to the film just left. |
| Nested settings | Back | Return to the paused playback controls and restore focus to the setting's entry control. |
| Loading/error | Back | Cancel pending work, stop app audio, and return to catalog with focus restored. |
| Playback | Rewind / Fast Forward | Seek; cancel old narration and rebuild eligible cue state at the destination. |

For a retained Up/Down shortcut, finish the current narration cue without changing its content. Pause at the next safe boundary for the short spoken confirmation, then restore prior playback state. Menu-based changes remain paused until Resume. Test whether the shortcut interruption is acceptable; remove the shortcut if it makes the experience worse.

The level selected is shown immediately, but the new narration level applies only to a future eligible cue. If the next gap cannot carry additional Rich detail, use an approved shorter variant and do not imply that more words are guaranteed immediately.

### SEM-320: Recovery — “What did I miss?”

1. Pause program playback and stop any active AD, recording the position.
2. If an eligible critical event is pending under SEM-337, select the earliest pending beat and announce that an interrupted description is being recovered. Otherwise select the most recent completed visual beat in the current scene at or before that position. A recovery cue is a separately reviewed account of that beat, not a replay of the last emitted AD line. Pending critical recovery can cross a scene boundary; ordinary latest-beat recovery cannot.
3. Speak the pre-rendered recovery cue and optionally show its text. It may include details omitted at Essential. No runtime model call is needed.
4. Mark covered critical events delivered only after the whole recovery cue completes. Remain paused with Resume focused; Play/Pause or Select on Resume continues from the saved position. If more critical beats remain pending, expose their count in the recovery control's accessible name. Serve one beat per activation, in order, without an automatic queue of spoken recaps. Recovery is never followed by an unannounced automatic resume.

**Boundary rules:** when there is neither eligible pending critical information nor a completed beat in the current scene, say that no completed visual moment is available yet and remain paused. Pressing recovery again during narration restarts that beat without duplicating audio; after completion the next request handles the next pending beat or ordinary latest-beat recovery. After seeking, nothing after the destination is eligible. A recovery cue interrupted by seeking is cancelled and SEM-337's intentional-seek rules apply. Do not resume the cancelled AD fragment after recovery; retain its undelivered critical event if any, and schedule future AD normally.

**Editorial restriction:** recovery describes observed actions, appearances, and relevant setting. It does not infer private thoughts, identify a character before the story does, or explain a twist with later knowledge.

## 7. Content and editorial requirements

- **SEM-101 — Original short:** a 45–60 second narrative containing visible, story-relevant actions and measurable speech-free opportunities. Demonstrate the difference between original audio and visual information without treating a black-screen simulation as evidence of blind users' experience.
- **SEM-102 — Second asset:** select a rights-cleared excerpt before tuning prompts to it. Include a less convenient case such as music under a dialogue gap, denser speech, or an action occurring during speech. Record the source and distribution permission/public-domain basis; do not infer rights from a hosting site label alone.
- **SEM-103 — Delivery:** 1080p H.264 input is sufficient for the pipeline. Shooting format is a production choice, not a product acceptance criterion.
- **SEM-104 — Reference annotation:** manually mark dialogue intervals, meaningful non-speech audio, visual beats, critical facts, reveal times, and acceptable narration windows for evaluation. Keep this reference separate from model generation inputs and report human corrections.
- **SEM-105 — Level semantics:** Essential preserves plot-critical facts; Standard adds useful spatial/action context; Rich adds relevant appearance, expression, and setting. Do not pad descriptions simply to differentiate labels. All levels share stable character references and a common event inventory.
- **SEM-106 — Impossible fit:** never drop a critical event silently. Route it to another valid window if timely and spoiler-safe; otherwise block publishing until the reviewer resolves the omission or rejects the asset. Optional details may be dropped with a recorded reason.
- **SEM-107 — Sound protection:** no-dialogue does not mean narration is desirable. Review important effects and intentional silence as protected intervals. Do not use program-audio ducking as a solution to unsafe placement.
- **SEM-108 — Independent content check:** select and process the second asset before filming the final original short. Record which windows have distinct approved variants, which facts differ, and how often Rich uses a shorter variant. Retain three levels only when the differences are useful rather than padded. If gaps make the levels converge, record the failed hypothesis and reassess supported content or the level count at G3 instead of silently lowering the distinction requirement. Preserve the failed asset's findings even if replacing it for the demo.

## 8. Offline AWS pipeline

| ID | Stage | Required behavior |
|---|---|---|
| SEM-201 | Ingest | Store authorized source assets in S3 with asset ID, checksum, and rights record. |
| SEM-202 | Speech and windows | Use Transcribe timing and speech detection/alignment to propose dialogue intervals; ffmpeg energy/silence analysis is supplementary. Review missed speech and protected sound intervals. Derive permitted narration windows with margins. |
| SEM-203 | Visual understanding | Use an accessible Bedrock video-capable model and record exact model/region/configuration. Extract timestamped observations and candidate beat boundaries. Validate brief actions against source footage. |
| SEM-204 | Temporal event inventory | Track observed events, when they become knowable, and whether described. Supply prior context and pending events to generation; do not limit input to frames inside a dialogue gap. Every narration fact must be available by its cue start. |
| SEM-205 | Candidate scripts | Produce structured Essential/Standard/Rich variants and separate recovery cues. Preserve critical facts across levels; include source-event references and planned windows. |
| SEM-206 | Estimated fit | Estimate seconds as word count divided by measured words per second, plus margin. Regenerate shorter once when needed; flag unresolved cases for review. This is a cost-saving precheck only. |
| SEM-207 | Review | A simple local page or CLI supports video context, approve/edit/drop, and reasons. Review scripts and listen to rendered audio before final approval. Critical omissions and contradictory level variants block release. |
| SEM-208 | Render and exact fit | Polly renders the final script in one fixed voice. Measure actual decoded duration. Re-render after any text/voice/rate edit. Require cue start + actual duration + end margin <= permitted window end. |
| SEM-209 | Package | Publish video, audio files, cue sheet, per-level transcripts, recovery cues, rights metadata, version, checksums, and approval record. The app validates package completeness before playback. |
| SEM-210 | Reproducibility | Provide a packaged demo that runs without a judge's AWS credentials, plus separate instructions to regenerate using an authorized AWS account. Record pipeline processing time, service usage/cost, and human review minutes per finished video minute. |

**Minimum cue fields:** asset/package version, cue ID, event IDs, critical-event flags, scene ID, level or recovery type, factual availability time, planned start/end, permitted window, rendered duration, audio path, text, approval state, and content hash. Every critical event needs a reviewed recovery-cue mapping, with all recovery facts available by the relevant playback cue's start. Critical events are completed or editorially split into completed sub-events before they become eligible. This prevents recovery of an interrupted cue from introducing later information.

**Model feasibility check:** Nova documentation describes temporal sampling that can miss very brief events. Model access and input limits alone are insufficient. Test whether the actual selected model observes the key action. A documented denser frame-sampling approach may replace video input if needed; do not imply frame-perfect understanding.

**Architecture:**

```text
Authorized source → S3
  ├─ Transcribe + speech alignment + sound review → permitted windows
  └─ Bedrock visual understanding → timestamped observations
         ↓
  Event inventory + temporal/reveal constraints
         ↓
  Three playback variants + per-beat recovery candidates
         ↓
  Estimated fit → human edit/review → Polly render
         ↓
  Exact-duration validation + listening review + package validation
         ↓
  Versioned assets → Fire TV player + accessible controls
```

## 9. Playback engineering and reliability

- **SEM-330 — One timeline:** schedule all cues from the media playback position, not elapsed wall-clock timers. Preload narration required for the short demo assets.
- **SEM-331 — Late cue policy:** immediately before playback, verify enough permitted time remains for the whole cue plus margin. Skip an unsafe cue, log why, and never rush, truncate, or shift it into dialogue. Optional detail can be lost with a logged reason; critical events become pending recovery under SEM-337.
- **SEM-332 — Pause/buffer:** freeze narration with program playback. If the audio components cannot reliably resume together, discard the active audio instance, retain its undelivered critical events under SEM-337, and log the interruption; never allow narration to advance while video is stalled.
- **SEM-333 — Seek:** stop active AD/recovery and invalidate pending work. Do not replay old cues simply because their timestamps have passed. Resume at the next complete eligible window after the destination.
- **SEM-334 — Level changes:** snapshot the selected level for a new cue. Never switch voices or content mid-utterance. Off prevents future cues; immediate stop is available through pause/controls.
- **SEM-335 — Accessibility speech:** serialize application announcements and AD. Pause program playback for foreground control interaction; verify actual VoiceView behavior rather than assuming app audio control suppresses screen-reader output. Use one owner for each utterance: VoiceView supplies accessible control labels/states when enabled, without duplicate app speech; app-provided onboarding/status prompts cover the defined non-VoiceView path. Do not create a second screen reader. An explicit Resume action waits until the implemented speech path is clear before media starts; if completion cannot be observed reliably, prove another deterministic handshake on the chosen target. A guessed delay alone does not pass G1.
- **SEM-336 — Interruptions:** app backgrounding, audio focus loss, and return from system UI cancel or pause narration safely and preserve the user-visible paused state.
- **SEM-337 — Critical-event delivery:** maintain a small record per asset of not-yet-due, delivered, pending-recovery, and intentionally-bypassed critical event IDs. A cue that reaches its audible end marks its mapped events delivered; partial playback does not. Menu entry, recovery, buffering, app interruption, and unsafe-cue rejection retain undelivered critical events as pending. Deduplicate by event ID and persist with the resume record. This is bookkeeping for the two short assets, not a new history interface.

  When the player loses critical information during otherwise continuous viewing, pause before automatically advancing further (or on safe return from system UI), announce once that description was interrupted, and offer What did I miss?, Resume without recovery, and Return to catalog. An interruption that already opened controls needs only the pending-state announcement there. Do not interrupt again solely because the viewer elected to resume; keep pending recovery available across scene changes. New losses can produce a new notification. Optional-detail loss does not cause automatic interruption.

  Deliberate forward seeking or switching Off bypasses pending information for the skipped/disabled period; do not force catch-up or claim it was delivered. Record those events separately from player-caused loss. Backward seeking resets eligibility for events after the destination, removes their pending state, and allows their normal descriptions to play again on a new viewing pass. Earlier pending events remain available. Returning to catalog preserves state; Start over resets it.

### G1 playback proof

Write a compact transition table for playing, paused controls, recovery, seeking, buffering, backgrounded, and catalog/loading/error states. A single playback controller owns app media pause/resume. Invalidate outstanding audio-start callbacks whenever seek, exit, recovery, or interruption changes the playback generation; stale work cannot start narration in a new state.

Capture audible output and media position for: VoiceView enabled/disabled, first launch, rapid focus movement, mid-cue menu entry, level selection, recovery cancellation, deliberate seek, forced buffering, Return to catalog, missing audio, and return from system UI. Verify no duplicate prompts, predictable focus, and no speech competition. A successful video test and a separate successful narration test do not establish this gate.

## 10. Acceptance criteria and evidence

All numbers below are **proposed engineering targets**, not measurements or established user preferences. Any changed threshold must be recorded with a reason before final evaluation.

| Area | Proposed acceptance condition | Evidence |
|---|---|---|
| Platform | Core flow runs on one actual Fire TV or qualifying Fire TV/Vega simulator. | Device/OS/build record and uninterrupted recording. |
| Exact fit | Every shipped playback cue fits its reviewed window with at least 200 ms start and end protection; tune upward if device measurements require it. | Package validator output and rendered durations. |
| Actual playback | No observed AD/dialogue overlap in the full test matrix; absolute planned-versus-audible start error p95 <= 150 ms and maximum <= 250 ms. Both onset and end must remain outside protected intervals after measurement uncertainty is considered. Numerical start-error limits do not excuse a margin failure. | Captured playback audio/video aligned to the source under the protocol below. |
| Critical content | Every manually annotated critical fact has an approved, timely description in every described level. Each forced player-caused skip/partial cue leaves its event recoverable, including across scene changes, until delivered or intentionally bypassed. | Reference-vs-script audit plus runtime delivery/recovery/bypass records for both assets. |
| Recovery | All scripted boundary scenarios select a valid past beat or announce unavailability; zero future-reveal facts in approved cues. | Scenario results and editorial audit. |
| Distinct levels | Each asset has at least two moments with meaningful content differences between levels, while retaining critical facts. | Side-by-side scripts and observed playback. |
| Independent journey | Supported core flow includes catalog → playback → level change → recovery → resume → return to catalog → another film, plus error recovery and app restart. No reproducible app-caused blocker may remain at release; fixes require scenario retests. Participant attempts and failures are recorded separately from this release rule. | Scenario/issue/fix/retest ledger, with actual participant denominator and any limitations. |
| Low-vision presentation | Chosen viewing conditions and values are recorded; text/focus meet SEM-308's proposed contrast targets; all screens avoid clipping and critical-action obstruction. | Layout/contrast inspection plus physical-display and participant observations where available, clearly distinguished. |
| Reliability | Two assets × three described levels, plus Off, run end to end; exercise pause, mid-cue input, repeated presses, seek, buffering, missing audio, and interruption. | Automated checks where appropriate and manual device scenario log. |
| Authoring practicality | Report processing time, AWS usage/cost, reviewer edits and minutes per finished minute, regeneration/drop counts, and critical-event detection failures. | Pipeline logs and review timing; no invented economic target. |

A clean fit pass rate achieved by dropping necessary information is a failure, not success. Report missed facts and skipped runtime cues alongside overlap and timing measurements.

**Timing protocol:** align recorded output to known source audio/video markers on the same media timeline. Define the audible narration onset and end consistently, documenting the measurement threshold and alignment uncertainty. Report signed onset error (actual minus planned), absolute onset error p95/maximum, and end position against speech/protected-sound boundaries by asset and level; include run and cue counts. Size each side's guard at least 200 ms and no less than the corresponding observed scheduling error plus alignment uncertainty; re-render/review any cue that no longer fits. Validate the narrowest windows and repeat after relevant playback changes. This is measured reliability on the tested configuration, not a guarantee for every device.

**Release rule:** a reproducible app-caused core-navigation failure, inaccessible essential message, unsafe audio overlap, spoiler, or unrecoverable player-caused critical loss blocks release on the supported configuration. Correct it and rerun the failing scenario plus directly affected paths. A facilitator workaround is not a fix. If target-user recruitment fails, device tests still apply, but they cannot establish independent target-user usability; keep that claim explicitly unvalidated.

## 11. Formative validation plan

Recruit blind and low-vision viewers immediately; target 3–5 participants if feasible. This is a small formative study, not a representative efficacy trial. Seek an experienced AD reviewer if available; report reviewer experience honestly.

**Two evaluation questions:**

1. Can a viewer independently operate the app and recover from mistakes?
2. Does adaptive playback with recovery offer a useful advantage over fixed Standard AD?

For the comparison, use the same player and matched task instructions. Fixed Standard keeps normal transport controls but no elective density changes or latest-beat recovery; adaptive mode adds those features. Keep accessibility support and critical-loss safeguards the same in both conditions. Analyze technical failures separately, so intentionally degraded playback cannot manufacture a product advantage. This tests the combined adaptive experience, not the isolated effect of each feature.

Start with a short task-based usability session, then observe unfamiliar footage without instructions to change levels. Log onboarding/task-prompted actions separately from spontaneous use. If viewers use recovery but rarely change levels, or any claimed advantage is otherwise ambiguous, prioritize one short follow-up comparison of fixed Standard plus recovery against adaptive playback. Reuse the player and approved assets; counterbalance unfamiliar excerpts where possible. If there is insufficient unfamiliar material or participant access, report density's incremental value as unresolved rather than enlarging the study or claiming it was proven.

Use different clips and counterbalance clip/condition order across participants where feasible. Do not measure comprehension improvement by repeatedly showing a participant the same reveal. Record prior familiarity with each clip and AD experience.

Collect critical-event comprehension using predefined questions, task completion, facilitator interventions, detail choices, recovery use, interruption count, time paused for controls/recovery, accidental activations, failed attempts, preference and reasons. Separate deliberate viewer pauses from player failure. Ask whether each interruption helped; fewer pauses is not automatically better. Explain that there is no preferred answer. Record quotations or video only with consent; anonymize notes by default.

At G3, decide from observations whether the strongest supported benefit is choosing a preferred level, occasional adjustment, or recovery. Lead the demo with that benefit. If three levels add no useful distinction, explicitly revise scope and claims before implementation freeze; do not preserve them merely to match the pitch or count scripted button presses as demand. Lack of recruitment leaves the choice a hypothesis, not a positive finding.

Publish counts and individual observations, including negative feedback. If testing cannot be recruited, state that explicitly and downgrade the impact/usability claims. Sighted blindfold testing is not a replacement. If viewers prefer fixed AD or cannot distinguish the levels, revise the interaction or acknowledge that the differentiation remains unproven.

## 12. Build gates and schedule

Dates are working targets anchored to the October 23 deadline; revise if project start shifts.

| Gate | Target | Exit evidence / response |
|---|---|---|
| G0: Platform and access | Sept 18 | One framework plays a local clip on a qualifying target; remote and VoiceView feasibility checked; AWS/model/Polly access verified. Choose based on working playback/accessibility, not a system-preference API alone. |
| G1: Vertical slice | Sept 21 | A 10–15 second rights-cleared clip passes the speech/state matrix, full catalog-return loop, interrupted-critical-event recovery, and timing protocol with canonical controls. Initial second-asset processing reveals whether three levels are feasible before final filming. A simulator failure triggers evaluation of an available physical Fire TV before changing projects. |
| G2: Content and authoring | Sept 27 | Original short shot or replaced by authorized material; reviewed output for both assets; second-asset differences/fallbacks and actual review labor recorded; initial target-user session sought before interaction freeze. |
| G3: Evaluation and iteration | Oct 9 | Formative sessions where recruitment permits; fixed/adaptive observations and conditional recovery-only follow-up; decide which interaction earns the headline. Record actual sample size, publisher walkthrough outcome, pilot assumptions, and any explicit scope revision. |
| G4: Feature freeze | Oct 14 | Reliability matrix complete; no unresolved reproducible release blocker; corrected scenarios retested; source coverage and delivered/recovered/bypassed critical events distinguished; evidence and draft demo assembled. |
| G5: Submission rehearsal | Oct 20 | Fresh setup rehearsal, final packages, accessible demo video around 2:45, product feedback and friction log reviewed. |
| G6: Submit | Oct 22 target | Submit ahead of Oct 23 deadline; request available AWS promotional credits early and no later than the stated Oct 21 noon PT cutoff. |

**Reduction order:** remove optional shortcuts, polish, and review-tool UI complexity; shorten assets if needed. Keep accessible canonical controls, recovery, exact validation, human approval, and recoverability of interrupted critical information. Keep three levels as the initial hypothesis; a G3 evidence-based reduction must explicitly revise the scope, acceptance table, and pitch together. This does not authorize quietly removing adaptation to solve a schedule slip. A second short excerpt is preferable to abandoning independent content evidence.

**Stop/reassess:** if no qualifying platform can run the vertical slice, or narration cannot coexist safely with accessible controls, resolve that before producing the full film. If adequate factual coverage cannot be obtained within review capacity, reassess the product claim rather than presenting an Essential-only generation demo as fulfillment of the adaptive concept.

## 13. Demo and submission story

Target runtime: **2:45**, safely below three minutes. Use actual app footage, legible labels, captions, and spoken explanation. Show real remote actions and the tested platform. Include unbroken playback interaction footage so editing does not conceal latency or failure.

| Time | Proof |
|---|---|
| 0:00–0:15 | Sema on Fire TV; immediate demonstration of control over description. |
| 0:15–0:35 | A visual story fact absent from the original audio: “The original audio never tells us who pocketed the key.” |
| 0:35–1:15 | Distinct detail levels and complete pause → recovery → explicit resume flow. |
| 1:15–1:40 | Actual target-user findings and one resulting design change; if unavailable, explicitly show the limitation and observed device-test evidence instead. |
| 1:40–2:10 | Observations → review → rendered duration → validation → playback, with real measurements and AWS roles. |
| 2:10–2:35 | Second asset and the filmmaker-to-reviewed-package workflow. |
| 2:35–2:45 | Specific audience and the value of independent viewing control. |

Do not spend closing time on unrelated future features. Explain existing AD and prior adaptive work accurately. Avoid implying access to commercial streaming catalogs or established publisher partnerships.

## 14. Judging strategy

The official Stage One screen concerns viability, theme, and required technology. Stage Two uses four equally weighted criteria. A qualifying platform demo and working source are prerequisites; this PRD alone cannot demonstrate eligibility or quality.

| Official criterion | Evidence Sema must earn |
|---|---|
| Tech Implementation | Functional Fire TV app; reproducible AWS pipeline; exact validation; timeline-aware scheduling; measured failure behavior. Service count alone is not quality. |
| Design | Independent core journey; appropriate remote focus behavior; understandable spoken states; usable detail selection and recovery; iteration based on target viewers. |
| Potential Impact | Specific viewer need; honest formative outcomes; a plausible independent-film publishing path; measured human review burden. |
| Quality of the Idea | A coherent Fire TV application of adaptive AD with accurate related-work positioning; distinct interaction benefit demonstrated against fixed Standard. |

Actionable friction logs may earn up to a 10% bonus, at the organizers' discretion. Capture actual task, reproduction steps, expected/actual outcome, severity, workaround, and proposed fix. Do not manufacture problems or assume the full bonus.

The AWS Builder mini is secondary to the Fire TV outcome. Document how S3, Transcribe, Bedrock, and Polly each contribute; do not add services merely to enlarge the diagram.

## 15. Deliverables and release checklist

- [ ] Source repository with visible open-source license (MIT intended for original code), asset-specific rights records, and required third-party notices.
- [ ] Fire TV app build/install instructions and a packaged demo runnable without AWS credentials.
- [ ] Pipeline and simple review tool, with separate AWS regeneration instructions and no embedded secrets.
- [ ] README, architecture diagram, FINDINGS.md, BUILD-LOG.md, and friction log.
- [ ] FINDINGS includes exact model/config, gap and cue counts, factual omissions, fit results, runtime skips, timing method/sample counts, cost, review burden, target-user findings, and limitations.
- [ ] FINDINGS distinguishes delivered/recovered/intentionally-bypassed critical events, spontaneous versus instructed control use, interruption burden, scope decisions, pilot capacity assumptions, and the blocker/retest ledger.
- [ ] Public English YouTube/Vimeo demo under three minutes showing the qualifying platform.
- [ ] Accurate product feedback for each tool/API/SDK used, with AWS integrations explained for the mini challenge. Omit unnecessary promotional branding without concealing relevant tool use or required attribution.
- [ ] Project description, Fire TV track selection, AWS Builder fields, and optional feature requests.
- [ ] Judges can access the required project materials through the end of judging (currently November 20, 2026); document test access and preserve packaged assets.
- [ ] Fresh-install/run rehearsal and final rules check before submission.

## 16. Revision history

### v2.1 — selected panel recommendations

- Added critical-event delivery tracking and bounded recovery across scene changes; no recovery-history interface or automatic spoken backlog.
- Completed Back, catalog return, resume, loading/error, and end-of-film behavior.
- Made reproducible app-caused accessibility/reliability failures release blockers with required retesting.
- Made the G1 gate prove speech ownership, state transitions, stale-callback cancellation, and audible timing on the chosen target.
- Started with canonical controls and a preferred detail level; deferred shortcuts until observations justify them.
- Added interruption metrics and a triggered recovery-only comparison, preserving a small formative study.
- Moved independent-content differentiation checks before final filming and added one concrete publishing walkthrough with measured pilot capacity.
- Specified timing uncertainty and low-vision test conditions without claiming that requirements are achieved results.

See [integration decisions](PRD-v2.1-INTEGRATION.md) for the benefit/scope assessment. The [panel report](PANEL-FEEDBACK.md) scores v2.0 only; its scores have not been reassigned to v2.1.

### v2.0 — changes from v1.0

- Replaced the broad invention claim with an evidence-based Fire TV product claim.
- Made independent accessibility, spoken feedback, and conflict-free remote navigation core requirements.
- Defined recovery as paused, reviewed visual-beat description with explicit resume and spoiler boundaries.
- Corrected duration estimation and required post-edit rendered-audio checks and listening review.
- Added pending visual events, protected sound intervals, critical-fact coverage, and a coherent playback state contract.
- Added comparison against fixed Standard AD, earlier recruitment, and cautious small-sample reporting.
- Added a specific publisher hypothesis and review-time economics without inventing partners.
- Reordered the demo, removed voice choice/custom voice and unrelated future pitches, and repaired scope-reduction gates.
- Replaced blanket attribution suppression with accurate reporting and rights compliance.

## 17. Sources and verification boundaries

- [Hackathon official rules](https://amazonappdev2026.devpost.com/rules): eligibility, deliverables, judging, bonus, dates, and AWS credits. Also supplied by the user as an attachment; recheck before submitting.
- [Describe Now: User-Driven Audio Description for Blind and Low Vision Individuals](https://arxiv.org/abs/2411.11835): relevant prior research, not evidence that Sema works.
- [Amazon accessibility guidance](https://developer.amazon.com/apps-and-games/blogs/2025/11/guide-to-accessibility-on-amazon-fire-devices): accessible controls and target-user testing.
- [Fire TV controller behavior](https://www.developer.amazon.com/docs/fire-tv/controller-behavior-guidelines.html): platform interaction recommendations; exact behavior still requires device testing.
- [Amazon Nova video understanding](https://docs.aws.amazon.com/nova/latest/userguide/modalities-video.html): model-specific sampling/input constraints; verify selected model and account availability during G0.

External sources were consulted during the preceding evaluation. No platform, model, cost, timing, accessibility, or user-study result has yet been measured for Sema.
