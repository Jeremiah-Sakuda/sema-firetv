# Sema v2.1 — panel recommendation decisions

**Outcome:** adopt the concrete reliability and navigation fixes, strengthen early evidence gates, and narrow the experiments to fit the existing two-asset prototype. [PRD v2.1](PRD-v2.1.md) is now the current proposed build specification. [PRD v2.0](PRD-v2.0.md) and its [panel feedback](PANEL-FEEDBACK.md) remain unchanged for traceability.

This is an editorial/product assessment of the recommendations. It is not another panel score or a claim that the proposed behavior has been tested. No app implementation was requested or performed.

## Selection principle

A change belongs in v2.1 when it fixes a contradiction in the product promise, makes a material failure observable and recoverable, or tests the central winning claim before expensive production. Prefer reusing the existing player, reviewed recovery audio, two content assets, and formative sessions. Defer additions whose cost exceeds the evidence they can deliver in this build window.

| Panel recommendation | Decision and material benefit | Scope cost / boundary | PRD location |
|---|---|---|---|
| Preserve critical meaning after runtime interruption | **Accept.** A complete script cannot compensate for a fact the player never finishes speaking. Track delivery and prioritize pending critical recovery across scene boundaries. | Moderate but necessary: event IDs/states and one existing recovery action. No history browser, free-form summaries, or automatic spoken backlog. Intentional seeking/Off is distinct from player loss. | INV-10; SEM-320, 331–337; acceptance |
| Define return to catalog | **Accept.** Completes the basic journey and prevents a navigation trap. | Small: explicit Back/Return behavior, focus restoration, versioned local resume record. | SEM-307; remote contract |
| Firm independent-use acceptance | **Accept.** Makes accessibility a release decision rather than a reporting activity. | Small process cost: blocker/fix/retest ledger. Device evidence cannot substitute for missing target-user evidence. | Section 10; G4 |
| Prove video/AD/VoiceView coexistence | **Accept as a hard early gate.** It is the central platform feasibility risk. | Bounded state/speech matrix on one supported target. No cross-platform framework or second screen reader. | SEM-335; G1 playback proof; G1 |
| Reduce interruption burden | **Accept with simplification.** Start with a preferred level and occasional adjustment; observe whether control is worth its cost. | Defer Up/Down shortcuts until user observations justify them. Add a few metrics to existing sessions. | SEM-301, 310; Section 11 |
| Compare fixed Standard plus recovery | **Accept conditionally.** Investigate density's contribution when combined-condition evidence is ambiguous. | One short triggered follow-up using the same player, not a mandatory three-arm efficacy study. If access/material is insufficient, narrow the claim. | Section 11; G3 |
| Test whether levels converge on difficult content | **Accept.** Protects against filming only favorable gaps and discovering a weak differentiator late. | Reorder the existing second-asset work; report differences/fallbacks. No third required asset or word-count padding. | SEM-108; G1/G2 |
| Validate supply and review capacity | **Accept at pilot scale.** Makes the audience-beyond-hackathon claim more concrete. | One asset-specific filmmaker walkthrough, ideally the existing second asset, and measured reviewer capacity. No mandatory partnership or marketplace build. Failed access is reported. | Section 2; G3 |
| Define timing measurement | **Accept.** Start-error statistics alone cannot establish safe cue endings. | Clarify existing capture/validation work: signed/absolute onset, audible end, uncertainty, and guard sizing. No performance laboratory. | Section 10 |
| Specify low-vision test conditions | **Accept narrowly.** Turns broad visual promises into inspectable criteria. | Record/test one supported layout/display condition, contrast, focus, clipping, and text placement. No broad device matrix or unsupported accessibility certification. | SEM-308; acceptance |

## Alternatives deferred or rejected

- **Unbounded recovery history and automatic catch-up narration:** more interaction and authoring complexity than the reliability problem requires. The accepted record is bounded by critical events in one short asset and uses the existing recovery action, one beat per activation.
- **Frequent mid-film control as a mandatory success criterion:** a viewer choosing the right level once can still benefit. Observed behavior should decide the headline.
- **Mandatory large or three-condition study:** disproportionate to the prototype and available recruitment. The conditional follow-up is enough to challenge unsupported attribution without promising statistical proof.
- **More assets, confirmed content partnership, or commercial onboarding before the prototype:** these would delay feasibility and usability learning. One real workflow walkthrough and candid limitations are sufficient for the proposed pilot argument.
- **Automatic score increase:** stronger requirements earn no measured product score. The v2.0 panel's 7.6/10 average remains attached to that version only.

## Suggested build order

1. Implement the short local playback slice, canonical navigation, explicit speech ownership, and recoverability of an interrupted critical cue; capture its actual behavior.
2. Run the second asset through all three reviewed levels before final filming; measure meaningful differences and authoring effort.
3. Run an early target-viewer session, iterate the largest blocker, and choose whether density selection or recovery earns the lead claim.

These are implementation priorities, not work completed by editing the PRD. The remaining uncertainty is actual platform behavior and viewer benefit; more document detail alone will not resolve it.
