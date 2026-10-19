# AWS narration authoring

Use this CLI to prepare narration for a film you have permission to use. It produces timed descriptions at three detail levels and separate Revisit recordings. An editor reviews the content before production packaging; the TV plays the resulting media locally.

For the included films, use `npm run preview` from the repository root. Authoring setup is only needed to generate or edit content.

## Setup

Tested with Python 3.14, ffmpeg/ffprobe and Node.js 22. From the repository root:

```sh
python3 -m venv pipeline/.venv
pipeline/.venv/bin/python -m pip install -r pipeline/requirements-agent.txt
cp pipeline/config.example.json pipeline/config.json
```

`requirements.txt` supplies the core AWS clients; `requirements-agent.txt` also installs the optional Strands implementation used by the full offline test suite. Local configuration and working files are ignored by Git.

For live calls, configure a named AWS profile through your normal AWS sign-in. Use temporary credentials; do not put access keys in repository files. Set `AWS_PROFILE` for the local SDK and choose your bucket and region in `pipeline/config.json` or the supported CLI arguments.

```sh
export AWS_PROFILE=sema
PYTHONPATH=pipeline pipeline/.venv/bin/python -m sema_pipeline preflight --profile sema --bucket YOUR_BUCKET
```

Adapt [policy.example.json](policy.example.json) to your bucket, account, models and region. Remove bucket creation or streamed invocation permissions if you do not use those options. Live authoring incurs AWS charges.

## Stages

| Stage | Input → output |
|---|---|
| `ingest` | Source, rights and credits → checksum, manifest and S3 object |
| `analyze` | Transcribe word timestamps and local media analysis → dialogue intervals and gaps |
| `observe` | Timestamped frames or video → proposed visual events |
| `script` | Available events and gaps → Essential / Standard / Rich and recovery text |
| `render` | Polly speech → measured duration, shortening retries and fit results |
| `review` | Source and narration → explicit editorial decisions and fingerprints |
| `package` | Approved content → versioned player package and media |
| `report` | Recorded stage/usage data → timings and estimated costs |

The live pilot used timestamped frame batches and the deterministic render/measure/shorten loop. The optional Strands mode has been tested offline.

## Example workflow

Run all commands below from the repository root. The shell helper only shortens the CLI invocation:

```sh
sema() { PYTHONPATH=pipeline pipeline/.venv/bin/python -m sema_pipeline "$@"; }
sema --help
npm run content:fetch
sema ingest --asset sintel-dragon --source content/sources/sintel-dragon.mp4 --rights content/rights/sintel-dragon.txt --title 'Sintel — The Rooftop' --credits '© copyright Blender Foundation | durian.blender.org | CC BY 3.0' --bucket YOUR_BUCKET --live
sema analyze --asset sintel-dragon --live
sema observe --asset sintel-dragon --frames 2 --live
sema script --asset sintel-dragon --live
sema render --asset sintel-dragon --live
sema review --asset sintel-dragon --reviewer 'Your name' --live
sema package --asset sintel-dragon
sema report --asset sintel-dragon
```

Commands are offline by default; `--live` explicitly opts into AWS calls. Use the CLI's `--help` for each stage and `pipeline/config.example.json` for configuration. The interactive reviewer can listen, edit, approve or drop a line. Changed source, scripts, timing or audio invalidate earlier approval. Do not use automated approval as a substitute for editorial work.

To generate UI guidance from `pipeline/prompts.json`:

```sh
sema prompts --live
```

After all production films are packaged:

```sh
npm run webm
npm run release:check
npm run baselines
npm run bundle
npm run vega:sync
```

`preview:author` regenerates the separate prototype media snapshot from the local authoring workspace. It does not create production approval records.

## Timing and content safeguards

A rendered line must fit `duration + 2 × margin + slack ≤ window`. The default extra slack is 0.15 seconds. After bounded shortening retries, an unresolved line requires an editorial decision. Required concept groups protect specific critical facts while shortening.

Events cannot be scheduled before their recorded reveal time. This is a metadata constraint, not proof of semantic accuracy: models can propose wrong events or times. The workflow therefore keeps editorial decisions separate from automated checks. Usage and stage timings include the recorded operations; they are not total production labor or an AWS invoice.

## Offline tests

```sh
SEMA_FORBID_LIVE=1 PYTHONPATH=pipeline pipeline/.venv/bin/python -m unittest discover -s pipeline/tests
```

The test clients implement the same interfaces as the AWS clients and return fixed test data. Their sine-tone audio is for tests only. See [architecture](../docs/ARCHITECTURE.md), [test evidence](../docs/TESTING.md) and [developer feedback](../docs/PRODUCT-FEEDBACK.md).
