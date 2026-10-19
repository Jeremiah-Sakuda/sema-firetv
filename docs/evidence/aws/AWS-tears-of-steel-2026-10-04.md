# Sema pipeline report: Tears of Steel — The Bridge

Asset `tears-of-steel` - 72.0 s film - generated 2026-10-04T15:58:54Z

## Stage timings

| Stage | Seconds | Mode | Status |
|---|---:|---|---|
| ingest | 1.622 | live | done |
| analyze | 6.152 | live | done |
| observe | 58.487 | live | done |
| script | 14.225 | live | done |
| render | 5.93 | live | done |

Latest stage attempts, automated time (excluding human review): **86.416 s**

## Service usage (cumulative, including reruns)

- Amazon S3: 1 upload(s), 13,370,498 bytes
- Amazon Transcribe: 1 job(s), 72.0 s of media
- Amazon Bedrock `us.amazon.nova-pro-v1:0`: 58 request(s), 149,698 input / 5,210 output tokens
- Amazon Bedrock `us.amazon.nova-2-lite-v1:0`: 84 request(s), 30,245 input / 2,734 output tokens
- Amazon Polly (neural): 218 request(s), 10,019 characters

## Estimated AWS cost

_List-price estimate, excluding free tier/credits, tax, S3 requests and data transfer. Price table: 2026-10-04 (Nova Pro/2 Lite, neural Polly, batch Transcribe and S3 Standard verified via AWS Price List API; other rates unverified)._

| Service | Item | Quantity | USD |
|---|---|---|---:|
| transcribe | sema-tears-of-steel-20261004151116 | 72.0 s | 0.0072 |
| bedrock | us.amazon.nova-pro-v1:0 | 149698 in / 5210 out tokens | 0.1364 |
| bedrock | us.amazon.nova-2-lite-v1:0 | 30245 in / 2734 out tokens | 0.0175 |
| polly | neural | 10019 characters | 0.1603 |
| s3 | storage (1 month) | 0.0134 GB | 0.0003 |
| **total** | | | **0.3217** |

## Editorial work

This automated run recorded no completed human review or review time. At this stage, the review counters were all zero: edits, dropped cues, downgraded critical events and attached descriptions. Later AI edits are recorded in [`content/editorial/`](../../../content/editorial/).

## Fit results

Fit mode: deterministic. 24 variants: 22 fit first try, 2 after regeneration, 0 unresolved; 2 regenerations; minimum headroom 0.053 s.

| Cue | Level | Window s | Speech budget s | Rendered s | Headroom s | Regens | Status |
|---|---|---:|---:|---:|---:|---:|---|
| c02 | essential | 2.75 | 2.20 | 1.18 | 1.02 | 0 | fit |
| c02 | standard | 2.75 | 2.20 | 1.58 | 0.61 | 0 | fit |
| c02 | rich | 2.75 | 2.20 | 1.99 | 0.21 | 0 | fit |
| c03 | essential | 3.05 | 2.50 | 1.34 | 1.16 | 0 | fit |
| c03 | standard | 3.05 | 2.50 | 1.37 | 1.13 | 0 | fit |
| c03 | rich | 3.05 | 2.50 | 2.16 | 0.34 | 0 | fit |
| c04 | essential | 4.70 | 4.15 | 1.25 | 2.90 | 0 | fit |
| c04 | standard | 4.70 | 4.15 | 1.97 | 2.18 | 0 | fit |
| c04 | rich | 4.70 | 4.15 | 2.76 | 1.39 | 0 | fit |
| c05 | essential | 2.79 | 2.24 | 1.22 | 1.01 | 0 | fit |
| c05 | standard | 2.79 | 2.24 | 1.37 | 0.87 | 0 | fit |
| c05 | rich | 2.79 | 2.24 | 2.18 | 0.05 | 0 | fit |
| c06 | essential | 2.80 | 2.25 | 1.32 | 0.93 | 0 | fit |
| c06 | standard | 2.80 | 2.25 | 2.02 | 0.23 | 0 | fit |
| c06 | rich | 2.80 | 2.25 | 1.85 | 0.40 | 1 | fit |
| c07 | essential | 2.00 | 1.45 | 1.15 | 0.30 | 0 | fit |
| c07 | standard | 2.00 | 1.45 | 1.25 | 0.20 | 1 | fit |
| c07 | rich | 2.00 | 1.45 | 1.08 | 0.37 | 0 | fit |
| c08 | essential | 3.92 | 3.37 | 1.20 | 2.17 | 0 | fit |
| c08 | standard | 3.92 | 3.37 | 1.61 | 1.76 | 0 | fit |
| c08 | rich | 3.92 | 3.37 | 1.94 | 1.42 | 0 | fit |
| c09 | essential | 2.00 | 1.45 | 1.18 | 0.27 | 0 | fit |
| c09 | standard | 2.00 | 1.45 | 1.32 | 0.13 | 0 | fit |
| c09 | rich | 2.00 | 1.45 | 1.32 | 0.13 | 0 | fit |

## Observation and planning

- Model input: frames; 13 events (2 critical), 5 characters, 0 output repairs/notes
- 11 narration windows -> 8 cues
- Models: observe `us.amazon.nova-pro-v1:0`, script `us.amazon.nova-2-lite-v1:0`, region `us-east-1`

## Issues flagged for the reviewer

- [info] optional-unplaced: No narration window of >= 1.5 s starts after 25.00 s for 'A man and a woman stand beside a canal on a metal bridge.'. It stays available through 'What did I miss?' recovery.
- [info] optional-unplaced: No narration window of >= 1.5 s starts after 33.00 s for 'The woman raises her mechanical right hand toward the man.'. It stays available through 'What did I miss?' recovery.
- [info] optional-unplaced: No narration window of >= 1.5 s starts after 47.00 s for 'Orange and blue wireframe figures stand among machinery and floating colored lines.'. It stays available through 'What did I miss?' recovery.

## Caveats

- Costs are estimates from a parameterized price table (`prices` in config); verify current pricing.
- Frame sampling can miss brief actions. Production packages require editorial approval.
- The pilot narration was subsequently edited with AI tools; those edits do not grant production approval.
