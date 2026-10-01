# Sema PRD v2.0 — independent panel feedback

## Verdict

**All three evaluators recommend a conditional build.** Start with the accessible target-platform vertical slice and early viewer testing. The plan is credible enough to pursue; the panel does not consider its winning argument proven.

The strongest common theme is that a well-built pipeline is insufficient: Sema must show that a viewer independently benefits from detail selection and recovery compared with good fixed description. Potential Impact is the lowest-scored criterion across all reviewers.

## Method and scope

Three independent AI evaluators reviewed the same frozen [PRD v2.0](PRD-v2.0.md), each scoring all four criteria with a different emphasis: engineering, accessibility, and product/impact. They were instructed not to read each other's reviews. The lead agent synthesized their findings after all reviews were complete. This is a simulated pre-build panel, not actual Amazon judging, lived-experience feedback, or target-user validation.

The [evaluation packet](EVALUATION-RUBRIC.md) uses the four equally weighted criteria from the [official hackathon rules](https://amazonappdev2026.devpost.com/rules), rechecked during this review. The 0–10 score scale is the panel's planning convention, not an official Devpost scoring scale. Scores assess the specificity and credibility of the proposed plan, not implementation quality already demonstrated or probability of winning.

Reviewed PRD SHA-256: `0a763487dc51ee927c182e9a41a758520263de81f2d482259e3f0c9915693e8f`.

**The PRD remains the version the panel reviewed.** Findings below are proposed follow-up changes and experiments, not silently applied revisions. No implementation or study was performed in this task.

## Scores

| Evaluator | Tech Implementation | Design | Potential Impact | Quality of the Idea | Equal-weight mean |
|---|---:|---:|---:|---:|---:|
| Engineering | 8.0 | 7.5 | 7.0 | 7.5 | 7.50 |
| Accessibility | 8.0 | 7.5 | 7.0 | 8.0 | 7.63 |
| Product / skeptical judge | 8.0 | 8.0 | 7.0 | 8.0 | 7.75 |
| Panel mean | **8.00** | **7.67** | **7.00** | **7.83** | **7.63** |

Unrounded overall mean: 7.625/10, or **7.6/10** to one decimal place. These are subjective assessments by related AI evaluators, not independent statistical measurements.

All reviewers found Stage One eligibility conditional on the actual qualifying app and submission. No reviewer identified a confirmed eligibility defect in the plan. No friction bonus is assumed; actual logs and organizer judgment are required.

## What the panel supports

- The combination of independent Fire TV use, reviewed descriptions, meaningful detail selection, and visual-beat recovery is a coherent product direction.
- Offline processing, fixed narration voice, packaged playback, and human approval are appropriate scope choices.
- Exact rendered-duration validation and media-position scheduling are strong engineering requirements.
- Accurate prior-work positioning makes the submission more credible than an unsupported invention claim.
- Comparing against fixed Standard AD is essential. The reordered demo appropriately leads with the experience.

## Decisions and fixes before implementation lock

These are the lead agent's prioritized synthesis of the individual findings. “Specification defect” means the PRD can be improved now; “experiment” means a plausible requirement still needs real evidence.

| Priority | Finding | Type / reviewers | Recommended response | Verification |
|---|---|---|---|---|
| P1 | Runtime skipping or cancellation can lose a critical fact despite complete packaged scripts. Latest-beat recovery may not retrieve it after later events or a scene change. | Specification gap — engineering and product | Define runtime critical-event coverage. Distinguish intentional forward seeking from system-induced loss. Keep the most recent interrupted critical beat available through a reviewed, spoiler-safe recovery path; avoid automatic narration over later dialogue. | Interrupt a critical cue with buffering, menu entry, and recovery, then cross a scene boundary. Demonstrate retrieval of the full missing meaning. |
| P1 | There is no specified path from paused playback back to the catalog. | Specification gap — accessibility | Add Return to catalog and explicit Back behavior for all playback/control/error states. Restore focus to the selected film and specify position persistence. | An uncoached viewer starts film A, returns, starts film B, and repeats after an error. |
| P1 | “Attempt the journey” and fix/retest “where feasible” is weaker than the independent-use invariant. | Specification gap — accessibility | Make reproducible app-caused navigation blockers on the supported configuration release blockers, with required scenario retesting. Keep individual failures visible rather than claiming universal accessibility. | Issue/retest ledger reviewed at G4; no unresolved reproducible blocker in the supported core flow. |
| P1 | Video, separate AD, platform speech, and rapid input have not been proven to coexist. | Feasibility experiment — engineering and accessibility | Extend G1 with a state-transition and speech-ownership matrix on the selected target. Define pause/resume ownership and invalidation of stale audio callbacks. | Capture VoiceView on/off, focus changes, level changes, recovery cancellation, seek, buffering, and return from system UI. |
| P1 | Changing detail may create more interruption than benefit. | Product experiment — all three | Test canonical controls before adding shortcuts. Measure spontaneous use, reasons, paused time, accidental activations, and perceived benefit. Let observations determine whether the headline is a preferred level, occasional adjustment, or frequent control. | Early target-viewer comparison with good fixed Standard AD; do not count instructed demonstration presses as demand. |
| P1 | Recovery could explain the entire benefit of the combined adaptive condition. | Evaluation limitation — product; also noted by other reviewers | Prioritize a fixed-Standard-plus-recovery follow-up when feature use leaves density's value unclear. Do not turn this into a large efficacy study. | Report participant-level feature use and the limitations of attributing combined outcomes to density selection. |
| P1 | Three levels may converge within tight gaps, especially on untuned content. | Product/content experiment — engineering | Run the second asset early; report meaningful differences, fallback frequency, and review labor. Do not pad text to manufacture contrast. | Target viewers explain when differences help; critical facts remain intact. |
| P1 | One filmmaker conversation does not establish repeat supply or review capacity. | Impact experiment — product | Walk one real asset through the workflow. Seek a concrete next-asset commitment, objection, or refusal; identify who approves scripts and calculate bounded pilot capacity from observed labor. | Document actual reviewer minutes, responsibilities, and willingness without inventing a partnership. |
| P2 | Timing targets lack a full audible-onset/end and uncertainty protocol. | Specification improvement — engineering | Define signed and absolute error, audible end, source alignment, and measurement uncertainty. No-overlap remains authoritative even when aggregate start-error targets pass. | Evaluate the narrowest windows and raise margins when measured uncertainty requires it. |
| P2 | Low-vision presentation lacks concrete viewing conditions. | Specification improvement — accessibility | Define tested screen/resolution/distance, text options, contrast/focus checks, and placement relative to key action. Validate choices with viewers where possible. | Inspect all controls, text, and error states in those conditions and record participant adjustments. |

## Differences in emphasis

The reviewers agreed on the direction but differed on how much credit to give the proposed experience. Product scored Design 8.0; engineering and accessibility scored it 7.5 because interruptions and incomplete navigation contracts remain. Engineering scored Idea 7.5; the other two scored it 8.0, placing more weight on the coherent interaction concept. These differences are modest subjective judgments, not evidence of a measured distinction.

Engineering places the first gate on robust playback and preservation of critical information. Accessibility places it on the complete navigation loop and competing speech. Product places it on whether density control earns its interaction and authoring cost. The vertical slice should address all three before the team expands the catalog or polishes the submission.

## Recommended next three experiments

1. **Accessible playback slice:** one authorized 10–15 second clip on the intended target, including VoiceView, complete catalog return, three levels, recovery, an interrupted critical cue, and audible timing capture. Decide platform/audio feasibility from the whole interaction.
2. **Viewer value check:** an early uncoached target-viewer session followed by the small counterbalanced fixed/adaptive comparison. Observe spontaneous use and interruption cost; investigate recovery-only value if density's contribution is unclear.
3. **Untuned publishing pass:** process the independent second asset, measure critical facts missed by the model, level differentiation, exact fit, human labor, and rights-holder willingness to supply another asset.

The panel's shared skeptical question is: **Why is this better than excellent Standard AD plus recovery, and who supplies and reviews the next films?** The appropriate response is a small amount of clear evidence, not more features.

## Full independent reviews

- [Engineering review](reviews/engineering.md)
- [Accessibility review](reviews/accessibility.md)
- [Product and impact review](reviews/product.md)
