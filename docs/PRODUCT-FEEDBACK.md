# Developer product feedback

Observed while building Sema, viewer-controlled audio description for Fire TV. Authoring happens before release, and playback uses local media. Each entry records purpose, strengths, problems, onboarding and whether we would use the tool again.

## AWS services used (AWS Builder mini-challenge)

Sema's narration is authored offline by a multi-service AWS pipeline (`pipeline/`). It ran live on October 4, 2026 in us-east-1, on both 72-second film excerpts.

| Service | How Sema uses it |
|---|---|
| **Amazon S3** | Stores each authorized source excerpt. It is the input for Transcribe and the frame and observation stages. |
| **Amazon Transcribe** | Word-level timestamps, which become the dialogue intervals that narration must never overlap. |
| **Amazon Bedrock: Nova Pro** | Timestamped visual events from 2-fps frame batches, with stable character references. |
| **Amazon Bedrock: Nova 2 Lite** | Writes the Essential, Standard and Rich lines plus a separate Revisit description for each moment. Shortens lines that don't fit their gap. |
| **Amazon Polly (neural Joanna)** | Voices every narration line and the 63 spoken interface prompts. Each rendered line is measured with ffprobe against its gap. |
| **Strands Agents SDK** | Agent version of the fit loop, with offline tests. The live run used the deterministic loop. |

**Measured in the live pilot** ([evidence](evidence/aws/LIVE-PILOT-2026-10-04.json)):
- **Estimated list-price cost:** $0.38 and $0.32 per excerpt, including reruns.
- **Latest automated run:** about 97 s and 86 s.
- **First-render fit:** 32 of 33 and 22 of 24 lines fit their gap on the first render.

An AI editorial pass (Codex) then corrected the drafts against the source frames; `content/editorial/` records every change and the exact shipped text. Release packaging goes through the pipeline's review step, which binds approval to the exact source, timing and audio.

## Vega SDK and CLI

- Purpose: create, build, install and launch the Vega WebView application; inspect developer tooling and package output.
- Worked: the WebView template provides a usable starting point; CLI install/launch and developer logs supported repeated iteration.
- Needs work: paths with spaces break manifest generation; a bare build can exit successfully without a usable JavaScript bundle; package paths include undefined; deleted assets can persist in build output.
- Onboarding: initial template creation was straightforward, but a staged path without spaces and clean builds were needed for this project.
- Build again: Yes, for this Fire TV experience, with a documented staged build and clean-output checks.

## Vega Virtual Device and developer input/log tools

- Purpose: run the target app, probe codecs and remote keys, inject remote input, and capture focus/media diagnostics using inputd-cli and loggingctl.
- Worked: VP8/Opus played full excerpts in codec probes; input injection and device logs enabled repeatable fixture checks.
- Needs work: H.264/VP9 stalled at about three seconds; seek completion was unreliable on those paths; there was no working speech engine for audible VoiceView; host screenshots were fragile; some input-series parsing failed.
- Onboarding: launch was workable, but codec, remote and speech probing was necessary before assuming media-app behavior.
- Build again: Yes, for simulator iteration. See the [full friction log](FRICTION-LOG.md) for exact reproductions.

## Vega WebView and React Native host

- Purpose: host the same JavaScript player under file URLs and pass developer diagnostics to the native host.
- Worked: script and media assets load locally, modern JavaScript runs, and Back/media keys can reach the page with the configured props. VoiceView focus tracking was observed on VVD.
- Needs work: local fetch/XHR fail; Menu is not delivered; console output is not readily available in device logs; accessibility role warnings and audio/speech behavior need clearer documentation.
- Onboarding: the template helped, followed by a platform probe to establish local-file and key behavior. Speech and audio decisions required additional testing.
- Build again: Yes, for a shared web/player codebase, while retaining explicit native-platform verification.

## Amazon S3

- Purpose: authorized source storage and Transcribe/Bedrock inputs; transcription outputs.
- Worked: source upload and service handoff completed for both excerpts, with local checksums retained.
- Needs work: local development requires explicit account/region/bucket configuration and permissions; console sign-in alone did not authenticate the local SDK. No S3 reliability failure was observed in this pilot.
- Onboarding: a new AWS account, developer-login credentials and a chosen region/bucket preceded the first successful upload. Total setup time was not recorded.
- Build again: Yes, for offline authoring inputs, with least-privilege configuration and a reproducible preflight.

## Amazon Transcribe

- Purpose: batch word timestamps for dialogue intervals and candidate narration gaps.
- Worked: both 72-second sources returned transcripts and timings used by the planner.
- Needs work: word timings alone cannot establish safe treatment of every vocalization, music cue or important film sound. No transcription accuracy statistic is claimed from this pilot.
- Onboarding: S3 inputs, output permissions and polling were integrated into the local pipeline and tested offline before live jobs.
- Build again: Yes, as a dialogue-timing input combined with sound protection and human review.

## Amazon Bedrock / Nova Converse API

- Purpose: video/frame observations, three narration levels, recovery drafts and fit-loop shortening. The successful final pilot used Nova Pro frame batches and Nova 2 Lite writing/shortening; video and a short visual comparison were also tried.
- Worked: actual service calls produced structured drafts and recorded token usage; model-assisted shortening integrated with measured Polly duration checks.
- Needs work: initial responses echoed schema examples or invented facts; frame batches still misidentified the injured creature and mechanical hand. Duration-only shortening could erase the time-jump fact. Better grounding diagnostics and examples combining factual preservation with rendered duration would help.
- Onboarding: region/inference-profile selection and response parsing were manageable after preflight. Prompt/schema and visual-quality iteration required substantial work beyond making a successful API call.
- Build again: Yes, for proposals inside a controlled editorial workflow. This pilot does not support unattended trustworthy AD generation.

## Amazon Polly

- Purpose: neural Joanna speech at 24 kHz MP3 for all narration, recovery and 63 UI prompts; measure each rendered file with ffprobe.
- Worked: actual speech files and measurable durations were produced, with consistent voice settings across the app.
- Needs work: speech duration cannot be safely inferred from word count. Fit requires rendering and measuring; shortening can damage meaning.
- Onboarding: SDK synthesis was straightforward after temporary credentials worked; integration added fit retries, provenance and prerecording because VVD TTS was unusable.
- Build again: Yes, with measured fit, explicit factual checks and listening review.

## AWS CLI developer login, boto3/botocore and AWS Price List API

- Purpose: temporary local credentials, AWS client calls, and rate verification for list-price estimates.
- Worked: AWS CLI 2.37.9 developer login connected the signed-in account to the local workflow; compatible boto3/botocore with CRT support consumed credentials. Price List responses supplied pilot rate/product identifiers.
- Needs work: console authentication and SDK authentication are different steps; dependency/version support was a source of setup uncertainty.
- Onboarding: sign-in was completed in the browser; the local SDK required the compatible dependency setup and a named profile. No access keys are published.
- Build again: Yes, using temporary credentials, pinned dependencies and a readiness check; limit authoring permissions for continued use.

## Strands Agents SDK

- Purpose: prototype a tool-driven render/measure/check fit loop. The live pilot used the deterministic loop, not Strands orchestration.
- Worked: offline tests exercised tool/result handling and independently measured fit.
- Needs work: an agent's own report of fit can't be trusted, so the loop re-measures every rendered clip independently.
- Onboarding: installed as an optional dependency and tested with injected clients.
- Build again: No for this submission's critical path; reconsider later if agent orchestration measurably reduces authoring effort.

## Other development tools

| Tool | Purpose | Worked | Needs work / limits | Onboarding | Build again |
|---|---|---|---|---|---|
| ffmpeg / ffprobe | Excerpts, source-frame PTS, codec renditions, review mixes, duration measurement | Produced usable local files and reproducible probe output | Correct sample timestamps and codec behavior require deliberate validation; duration is not audibility | Local command-line integration | Yes, for media transforms and measurement |
| JavaScript / Node.js / npm | Player, bundling, release tools and tests | A shared player runs in browser and Vega | Browser success cannot establish target media behavior | Locked dev dependencies and explicit build scripts | Yes, with target verification |
| Python | Authoring, review and reports | Clear local stages and offline tests | Stage freshness and approval provenance need enforcement | Pinned environment | Yes |
| jsdom / Node test runner / unittest | Deterministic state, focus, adapter and pipeline regressions | Caught real focus, speech-sequencing and integrity defects | Mocked media cannot verify heard speech or real decode | Local test harnesses and fixtures | Yes, alongside browser and target-platform checks |
| Git / GitHub | Source history, public OSS repository and CI | Existing public MIT repository and automated workflows | Public source delivery must include the media snapshot and locked setup instructions | Repository and workflow setup | Yes |
| Playwright | Real-media browser harness (`npm run test:browser`): full playbacks, remote-key flows, layouts at three sizes | Drove Chrome through real media decode and keyboard-as-remote sequences, with screenshots | Installed separately to keep the default install light | `npm install --no-save` plus a Chromium download | Yes |
| Claude Code | Implementation, tests, Vega Virtual Device verification through `vda`/`inputd-cli`, documentation and review panels | Found and fixed focus and speech-ordering defects; drove the simulator and its logs end to end | Documentation claims needed checking against the code and evidence | Used in the shared local project | Yes, with code review and verified tests |
| Codex | Implementation assistance, code review and editorial preparation | Found concrete defects and kept AI edits separate from human review | Suggested code and narration wording required corrections | Used in the shared local project | Yes, with code review and verified tests |

## Feedback evidence

The [platform findings](vega/PLATFORM-FINDINGS.md) provide reproduction cases and actionable requests. [Engineering evidence](TESTING.md) documents playback checks, reproduction commands and observed platform behavior.


## Piper local speech rendering

- Purpose: render 25 short moment names for focus guidance and four viewing-options prompts. Moment names cover scenes that have no timed description slot.
- Worked: the named MP3 files play through the same recorded-guidance channel, with durations measured by ffprobe. No runtime speech engine or cloud call is needed.
- Friction: local authoring needs a separately downloaded voice model and ffmpeg. These short recordings use a different voice from Polly narration; text, byte hashes and measured durations are validated during bundling.
- Onboarding: isolated Python environment, `piper-tts==1.8.0`, the `en_US-ljspeech-high` voice, and ffmpeg conversion to 24 kHz mono MP3.
- Build again: Yes for short interface recordings; retain the existing AWS authoring pipeline for film narration.

The [voice model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD) identifies the [LJ Speech dataset](https://keithito.com/LJ-Speech-Dataset/) as public domain. Engine/model files are authoring dependencies and are not bundled into the viewer.
