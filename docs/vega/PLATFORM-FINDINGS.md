# Vega platform findings

Observed on Vega SDK 0.24.12112 and its Apple-silicon Virtual Device. Results apply to that SDK and simulator image. Source probes live in `tools/vega-probe/`. The full [friction log](../FRICTION-LOG.md) has every entry with exact steps, verbatim errors and screenshots (`screenshots/`).

| Task and reproduction | Expected → observed | Severity | Implemented workaround | Requested improvement |
|---|---|---|---|---|
| Play equivalent H.264, VP9 and VP8 probe clips | Continuous playback → H.264/VP9 stalled around three seconds; VP8/Opus completed | Critical | Ship VP8/Opus renditions on Vega | Publish a tested simulator codec/seek matrix and diagnose decoder stalls |
| Fetch packaged JSON from a file-URL WebView | Read bundled data → fetch/XHR failed while script/media loading worked | Important | Embed package data in a generated script | Document supported local asset loading patterns with a working example |
| Build from a checkout path containing spaces | Build succeeds → manifest generation split the path and failed | Important | Stage the build at a dedicated path without spaces | Pass subprocess arguments without unsafe path interpolation |
| Remove an asset and rebuild | Removed asset disappears → old file remained in native build output | Important | Clear the staged build directory before packaging | Prune stale assets or provide a dependable clean build option |
| Use browser speech/VoiceView on the simulator | Spoken controls → no working speech engine on the tested image | Critical for audible accessibility testing | Bundle prerecorded guidance; separate simulator focus checks from physical listening checks | Supply TTS in the simulator and document screen-reader test coverage |
| Press Menu in the WebView | Page receives key → Menu was not delivered | Important | Make primary controls reachable through Select and D-pad | Document remote key delivery and interception behavior |
| Enable VoiceView with Dolby settings | Predictable audio/accessibility behavior → a Dolby interaction warning appeared | Important | Treat audio configuration as a distinct physical-device test case | Explain supported combinations and provide a repeatable validation procedure |

## Build example

The path-space failure surfaced as a shell error similar to `/Users/developer/Projects/TV: No such file or directory` while generating the module manifest. `vega-app/scripts/build-staged.sh` uses a separate checkout copy because resolving a symlink still exposed the original path.

The native packaging command could also finish without the JavaScript bundle needed to run the app. The supported project build invokes the React Native bundle step and then packages it. Verify that a package includes its JavaScript bundle, entry HTML and media.

## AWS authoring lessons

- Console sign-in and local SDK credentials are separate. Temporary developer-login credentials plus compatible boto3/botocore support connected the authoring workflow.
- Nova visual observations required correction, including the identity of an injured creature and a mechanical hand. Timestamped frames helped inspect proposals; they did not remove the need for factual review.
- Shortening a line to fit could remove its meaning: “Text” lost the important “40 years later” information. The planner now checks for that fact as well as measuring duration.

[Per-tool feedback](../PRODUCT-FEEDBACK.md) · [Engineering evidence](../TESTING.md)
