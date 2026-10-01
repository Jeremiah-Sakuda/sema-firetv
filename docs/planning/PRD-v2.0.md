# Sema PRD v2.0

**Track:** Fire TV — AI-enhanced viewing and multi-modal UX  
**Mini challenge:** AWS Builder  
**Submission deadline:** October 23, 2026, 3:00 PM EDT  
**Status:** Proposed scope; implementation and user validation have not begun.  
**Objective:** Build a credible first-place contender through an independently usable Fire TV experience, reliable playback, and evidence that viewer control improves on fixed audio description. This is an objective, not a prediction of placement.

## 1. Product promise

**Sema lets blind and low-vision viewers choose how much visual detail they hear, and recover missed moments, using their Fire TV remote.**

Sema plays a small, rights-cleared catalog with human-reviewed audio description (AD). During playback, viewers select Essential, Standard, or Rich description. “What did I miss?” pauses the film and describes the most recent completed visual beat, including relevant details their selected level may have omitted. The viewer explicitly resumes playback.

The primary benefit is control over following the story. AI makes candidate authoring possible; accessible interaction, editorial quality, and playback reliability make the product useful.

## 2. Users, need, and initial distribution

**Primary viewer:** a blind or low-vision adult watching short narrative films on Fire TV who wants to follow visual events and choose the amount of narration.

**Initial publisher hypothesis:** independent filmmakers who can authorize distribution of their short films and want to offer accessible versions through a curated Fire TV catalog. The filmmaker supplies the film and rights; a designated reviewer approves description; Sema packages and plays it.

**Hackathon operator:** the team performs ingestion, review, and publishing. Self-service onboarding, payments, and a publisher marketplace are out of scope.

**Need to validate:** viewers differ in when and how much description they want; changing detail and recovering missed visual information should help without creating excessive interruption or interaction effort. A good fixed Standard track is the baseline, not merely playback with no AD.

The two demo films establish a working workflow, not a distribution partnership or a sustainable catalog. Seek one filmmaker conversation and document willingness, objections, and review burden. Do not claim a partner without agreement.

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

## 6. Viewer experience and interaction requirements

### SEM-300: Independent operation

- **SEM-301 — First run:** offer a spoken and visible introduction before program playback begins. Explain level selection, recovery, and resume. The viewer chooses a starting level; Standard is the suggested option. Save the explicit choice. Never silently default to Off because a platform preference could not be read.
- **SEM-302 — Platform integration:** evaluate VoiceView, accessibility labels, focus order, remote hints, and relevant system preferences on the chosen platform. A readable system AD preference may suggest the initial choice but must not override a saved choice. Document unsupported APIs and the tested device/OS.
- **SEM-303 — Catalog:** two assets with accessible title, duration, synopsis, and description availability. Each can be launched without sighted assistance. Avoid unexplained icons and pointer-only interactions.
- **SEM-304 — Settings:** accessible Off / Essential / Standard / Rich selection and optional large high-contrast narration text. Persist the selected level across app restarts. Text mode is supplementary; no essential information is visual-only.
- **SEM-305 — Feedback:** speak focused control names and selected values through the platform accessibility path where supported. Announcements and program audio must not compete. Coalesce rapid input into one final-state confirmation.
- **SEM-306 — Errors:** asset loading, missing audio, unavailable recovery, and retry/back actions have spoken and visible messages. A broken package is blocked from playback rather than presented as complete AD.

### SEM-310: Remote contract

Accessible focusable controls are the canonical path. Shortcuts are optional conveniences and must be verified with VoiceView enabled.

| Context | Input | Behavior |
|---|---|---|
| Catalog/settings/dialog | D-pad / Select | Move focus / activate focused item; never change playback density incidentally. |
| Playback with controls hidden | Menu | Pause at the current position and open playback controls. Announce available actions. |
| Playback controls | D-pad / Select | Select description level, What did I miss?, text mode, or Resume. |
| Playback with controls hidden | Up / Down | Candidate shortcut to increase/decrease detail. Retain only if platform and target-user testing show it does not conflict with navigation. |
| Playback with controls hidden | Select | Open the paused controls; initial focus may be What did I miss? after usability testing. Do not globally remap Select to recovery. |
| Normal playback | Play/Pause | Pause/resume both program and scheduled narration coherently. |
| Recovery narration | Play/Pause or Back | Stop recovery narration and remain paused with Resume focused. |
| Paused controls | Back | Close the controls and remain paused; announce that Play resumes. |
| Playback | Rewind / Fast Forward | Seek; cancel old narration and rebuild eligible cue state at the destination. |

For a retained Up/Down shortcut, finish the current narration cue without changing its content. Pause at the next safe boundary for the short spoken confirmation, then restore prior playback state. Menu-based changes remain paused until Resume. Test whether the shortcut interruption is acceptable; remove the shortcut if it makes the experience worse.

The level selected is shown immediately, but the new narration level applies only to a future eligible cue. If the next gap cannot carry additional Rich detail, use an approved shorter variant and do not imply that more words are guaranteed immediately.

### SEM-320: Recovery — “What did I miss?”

1. Pause program playback and stop any active AD, recording the position.
2. Select the most recent completed visual beat in the current scene at or before that position. A recovery cue is a separately reviewed account of that beat, not a replay of the last emitted AD line.
3. Speak the pre-rendered recovery cue and optionally show its text. It may include details omitted at Essential. No runtime model call is needed.
4. Remain paused with Resume focused; Play/Pause or Select on Resume continues from the saved position. Recovery is never followed by an unannounced automatic resume.

**Boundary rules:** before the first eligible beat, or in a new scene without an eligible completed beat, say that no completed visual moment is available yet and remain paused. Repeated requests for the same beat replay that cue after the prior playback is cancelled; do not queue overlapping narration. After seeking, evaluate only beats at or before the destination. A recovery cue interrupted by seeking is cancelled. Do not resume the cancelled AD fragment after recovery; resume normal scheduling with the next eligible cue.

**Editorial restriction:** recovery describes observed actions, appearances, and relevant setting. It does not infer private thoughts, identify a character before the story does, or explain a twist with later knowledge.

## 7. Content and editorial requirements

- **SEM-101 — Original short:** a 45–60 second narrative containing visible, story-relevant actions and measurable speech-free opportunities. Demonstrate the difference between original audio and visual information without treating a black-screen simulation as evidence of blind users' experience.
- **SEM-102 — Second asset:** select a rights-cleared excerpt before tuning prompts to it. Include a less convenient case such as music under a dialogue gap, denser speech, or an action occurring during speech. Record the source and distribution permission/public-domain basis; do not infer rights from a hosting site label alone.
- **SEM-103 — Delivery:** 1080p H.264 input is sufficient for the pipeline. Shooting format is a production choice, not a product acceptance criterion.
- **SEM-104 — Reference annotation:** manually mark dialogue intervals, meaningful non-speech audio, visual beats, critical facts, reveal times, and acceptable narration windows for evaluation. Keep this reference separate from model generation inputs and report human corrections.
- **SEM-105 — Level semantics:** Essential preserves plot-critical facts; Standard adds useful spatial/action context; Rich adds relevant appearance, expression, and setting. Do not pad descriptions simply to differentiate labels. All levels share stable character references and a common event inventory.
- **SEM-106 — Impossible fit:** never drop a critical event silently. Route it to another valid window if timely and spoiler-safe; otherwise block publishing until the reviewer resolves the omission or rejects the asset. Optional details may be dropped with a recorded reason.
- **SEM-107 — Sound protection:** no-dialogue does not mean narration is desirable. Review important effects and intentional silence as protected intervals. Do not use program-audio ducking as a solution to unsafe placement.

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

**Minimum cue fields:** asset/package version, cue ID, event IDs, scene ID, level or recovery type, factual availability time, planned start/end, permitted window, rendered duration, audio path, text, approval state, and content hash.

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
- **SEM-331 — Late cue policy:** immediately before playback, verify enough permitted time remains for the whole cue plus margin. Skip an unsafe cue, log why, and never rush, truncate, or shift it into dialogue.
- **SEM-332 — Pause/buffer:** freeze narration with program playback. If the audio components cannot reliably resume together, discard the active cue and log the event; never allow narration to advance while video is stalled.
- **SEM-333 — Seek:** stop active AD/recovery and invalidate pending work. Do not replay old cues simply because their timestamps have passed. Resume at the next complete eligible window after the destination.
- **SEM-334 — Level changes:** snapshot the selected level for a new cue. Never switch voices or content mid-utterance. Off prevents future cues; immediate stop is available through pause/controls.
- **SEM-335 — Accessibility speech:** serialize application announcements and AD. Pause program playback for foreground control interaction; verify actual VoiceView behavior rather than assuming app audio control suppresses screen-reader output.
- **SEM-336 — Interruptions:** app backgrounding, audio focus loss, and return from system UI cancel or pause narration safely and preserve the user-visible paused state.

## 10. Acceptance criteria and evidence

All numbers below are **proposed engineering targets**, not measurements or established user preferences. Any changed threshold must be recorded with a reason before final evaluation.

| Area | Proposed acceptance condition | Evidence |
|---|---|---|
| Platform | Core flow runs on one actual Fire TV or qualifying Fire TV/Vega simulator. | Device/OS/build record and uninterrupted recording. |
| Exact fit | Every shipped playback cue fits its reviewed window with at least 200 ms start and end protection; tune upward if device measurements require it. | Package validator output and rendered durations. |
| Actual playback | No observed AD/dialogue overlap in the full test matrix; planned versus audible cue start error p95 <= 150 ms and maximum <= 250 ms. Fail publication if error defeats the configured margins. | Captured playback audio/video aligned to the source; report run count, sample count, p95, maximum, and method. |
| Critical content | Every manually annotated critical fact has an approved, timely description in every described level. | Reference-vs-script audit for both assets. |
| Recovery | All scripted boundary scenarios select a valid past beat or announce unavailability; zero future-reveal facts in approved cues. | Scenario results and editorial audit. |
| Distinct levels | Each asset has at least two moments with meaningful content differences between levels, while retaining critical facts. | Side-by-side scripts and observed playback. |
| Independent journey | After accessible in-app onboarding, each formative participant attempts catalog → playback → level change → recovery → resume without facilitator coaching; any blocker is logged and fixed/retested where feasible. | Task observations with exact participant denominator and remaining failures. |
| Reliability | Two assets × three described levels, plus Off, run end to end; exercise pause, mid-cue input, repeated presses, seek, buffering, missing audio, and interruption. | Automated checks where appropriate and manual device scenario log. |
| Authoring practicality | Report processing time, AWS usage/cost, reviewer edits and minutes per finished minute, regeneration/drop counts, and critical-event detection failures. | Pipeline logs and review timing; no invented economic target. |

A clean fit pass rate achieved by dropping necessary information is a failure, not success. Report missed facts and skipped runtime cues alongside overlap and timing measurements.

## 11. Formative validation plan

Recruit blind and low-vision viewers immediately; target 3–5 participants if feasible. This is a small formative study, not a representative efficacy trial. Seek an experienced AD reviewer if available; report reviewer experience honestly.

**Two evaluation questions:**

1. Can a viewer independently operate the app and recover from mistakes?
2. Does adaptive playback with recovery offer a useful advantage over fixed Standard AD?

For the comparison, use the same player and matched task instructions. Fixed Standard keeps normal transport controls but no density changes or recovery; adaptive mode adds those features. This tests the combined adaptive experience, not the isolated effect of each feature. Log which feature was used. If feasible, use a follow-up fixed-Standard-plus-recovery condition to separate recovery value from density value; this is optional.

Use different clips and counterbalance clip/condition order across participants where feasible. Do not measure comprehension improvement by repeatedly showing a participant the same reveal. Record prior familiarity with each clip and AD experience.

Collect critical-event comprehension using predefined questions, task completion, facilitator interventions, detail choices, recovery use, interruptions, preference and reasons. Explain that there is no preferred answer. Record quotations or video only with consent; anonymize notes by default.

Publish counts and individual observations, including negative feedback. If testing cannot be recruited, state that explicitly and downgrade the impact/usability claims. Sighted blindfold testing is not a replacement. If viewers prefer fixed AD or cannot distinguish the levels, revise the interaction or acknowledge that the differentiation remains unproven.

## 12. Build gates and schedule

Dates are working targets anchored to the October 23 deadline; revise if project start shifts.

| Gate | Target | Exit evidence / response |
|---|---|---|
| G0: Platform and access | Sept 18 | One framework plays a local clip on a qualifying target; remote and VoiceView feasibility checked; AWS/model/Polly access verified. Choose based on working playback/accessibility, not a system-preference API alone. |
| G1: Vertical slice | Sept 21 | A 10–15 second rights-cleared test clip supports independently reachable controls, distinct levels, recovery, and measured fit. A simulator failure triggers evaluation of an available physical Fire TV before changing projects. |
| G2: Content and authoring | Sept 27 | Original short shot or replaced by authorized material; second asset selected; reviewed pipeline output for both; initial target-user session sought before interaction freeze. |
| G3: Evaluation and iteration | Oct 9 | Formative sessions completed where recruitment permits, fixed-vs-adaptive observations recorded, major blockers corrected. Publish actual sample size. |
| G4: Feature freeze | Oct 14 | Reliability matrix complete; critical omissions, spoilers, and navigation blockers resolved; evidence and draft demo assembled. |
| G5: Submission rehearsal | Oct 20 | Fresh setup rehearsal, final packages, accessible demo video around 2:45, product feedback and friction log reviewed. |
| G6: Submit | Oct 22 target | Submit ahead of Oct 23 deadline; request available AWS promotional credits early and no later than the stated Oct 21 noon PT cutoff. |

**Reduction order:** remove optional shortcuts, polish, and review-tool UI complexity; shorten assets if needed. Keep accessible canonical controls, meaningful level differences, recovery, exact validation, and human approval. A second short excerpt is preferable to abandoning independent content evidence.

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
- [ ] Public English YouTube/Vimeo demo under three minutes showing the qualifying platform.
- [ ] Accurate product feedback for each tool/API/SDK used, with AWS integrations explained for the mini challenge. Omit unnecessary promotional branding without concealing relevant tool use or required attribution.
- [ ] Project description, Fire TV track selection, AWS Builder fields, and optional feature requests.
- [ ] Judges can access the required project materials through the end of judging (currently November 20, 2026); document test access and preserve packaged assets.
- [ ] Fresh-install/run rehearsal and final rules check before submission.

## 16. What changed from v1.0

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
