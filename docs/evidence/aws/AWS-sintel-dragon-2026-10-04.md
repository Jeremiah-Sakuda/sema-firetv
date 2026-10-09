# Sema pipeline report: Sintel — The Rooftop

Asset `sintel-dragon` - 72.0 s film - generated 2026-10-04T15:58:54Z

## Stage timings

| Stage | Seconds | Mode | Status |
|---|---:|---|---|
| ingest | 3.556 | live | done |
| analyze | 16.853 | live | done |
| observe | 55.173 | live | done |
| script | 14.437 | live | done |
| render | 6.818 | live | done |

Latest stage attempts, automated time (excluding human review): **96.837 s**

## Service usage (cumulative, including reruns)

- Amazon S3: 1 upload(s), 20,089,561 bytes
- Amazon Transcribe: 1 job(s), 72.0 s of media
- Amazon Bedrock `us.amazon.nova-pro-v1:0`: 83 request(s), 178,869 input / 7,838 output tokens
- Amazon Bedrock `us.amazon.nova-2-lite-v1:0`: 56 request(s), 25,554 input / 2,863 output tokens
- Amazon Polly (neural): 253 request(s), 11,792 characters

## Estimated cost (ESTIMATE, not a bill)

_ESTIMATE at list prices; not a bill. Excludes free tier/credits, tax, S3 requests, data transfer. Price table: 2026-10-04 (Nova Pro/2 Lite, neural Polly, batch Transcribe and S3 Standard verified via AWS Price List API; other rates unverified)._

| Service | Item | Quantity | USD |
|---|---|---|---:|
| transcribe | sema-sintel-dragon-20261004150943 | 72.0 s | 0.0072 |
| bedrock | us.amazon.nova-pro-v1:0 | 178869 in / 7838 out tokens | 0.1682 |
| bedrock | us.amazon.nova-2-lite-v1:0 | 25554 in / 2863 out tokens | 0.0163 |
| polly | neural | 11792 characters | 0.1887 |
| s3 | storage (1 month) | 0.0201 GB | 0.0005 |
| **total** | | | **0.3808** |

## Human review

- Reviewer: None (method: None; completed: False)
- Review time: pending; no completed human review measurement.
- Edits: 0; dropped cues: 0; critical events downgraded: 0; attached: 0

## Fit results

Fit mode: deterministic. 33 variants: 32 fit first try, 1 after regeneration, 0 unresolved; 1 regenerations; minimum headroom 0.002 s.

| Cue | Level | Window s | Speech budget s | Rendered s | Headroom s | Regens | Status |
|---|---|---:|---:|---:|---:|---:|---|
| c01 | essential | 1.92 | 1.37 | 1.15 | 0.22 | 0 | fit |
| c01 | standard | 1.92 | 1.37 | 1.37 | 0.00 | 0 | fit |
| c01 | rich | 1.92 | 1.37 | 1.37 | 0.00 | 0 | fit |
| c02 | essential | 6.08 | 5.53 | 1.18 | 4.36 | 0 | fit |
| c02 | standard | 6.08 | 5.53 | 1.85 | 3.69 | 0 | fit |
| c02 | rich | 6.08 | 5.53 | 3.26 | 2.27 | 0 | fit |
| c03 | essential | 8.65 | 8.10 | 1.22 | 6.88 | 0 | fit |
| c03 | standard | 8.65 | 8.10 | 2.40 | 5.70 | 0 | fit |
| c03 | rich | 8.65 | 8.10 | 4.13 | 3.97 | 0 | fit |
| c04 | essential | 2.42 | 1.87 | 1.25 | 0.62 | 0 | fit |
| c04 | standard | 2.42 | 1.87 | 1.58 | 0.28 | 0 | fit |
| c04 | rich | 2.42 | 1.87 | 1.34 | 0.52 | 0 | fit |
| c05 | essential | 1.92 | 1.37 | 1.03 | 0.34 | 0 | fit |
| c05 | standard | 1.92 | 1.37 | 1.10 | 0.26 | 0 | fit |
| c05 | rich | 1.92 | 1.37 | 1.10 | 0.26 | 0 | fit |
| c06 | essential | 5.42 | 4.87 | 1.68 | 3.19 | 0 | fit |
| c06 | standard | 5.42 | 4.87 | 2.64 | 2.23 | 0 | fit |
| c06 | rich | 5.42 | 4.87 | 3.31 | 1.55 | 0 | fit |
| c07 | essential | 2.08 | 1.53 | 1.06 | 0.48 | 0 | fit |
| c07 | standard | 2.08 | 1.53 | 1.10 | 0.43 | 0 | fit |
| c07 | rich | 2.08 | 1.53 | 1.34 | 0.19 | 0 | fit |
| c08 | essential | 2.62 | 2.08 | 0.98 | 1.09 | 0 | fit |
| c08 | standard | 2.62 | 2.08 | 1.42 | 0.66 | 0 | fit |
| c08 | rich | 2.62 | 2.08 | 1.78 | 0.30 | 0 | fit |
| c09 | essential | 6.71 | 6.16 | 1.82 | 4.33 | 0 | fit |
| c09 | standard | 6.71 | 6.16 | 2.35 | 3.81 | 0 | fit |
| c09 | rich | 6.71 | 6.16 | 3.86 | 2.29 | 0 | fit |
| c10 | essential | 3.47 | 2.92 | 1.25 | 1.67 | 0 | fit |
| c10 | standard | 3.47 | 2.92 | 1.68 | 1.24 | 0 | fit |
| c10 | rich | 3.47 | 2.92 | 2.11 | 0.81 | 0 | fit |
| c11 | essential | 2.54 | 1.99 | 1.18 | 0.82 | 0 | fit |
| c11 | standard | 2.54 | 1.99 | 1.34 | 0.65 | 0 | fit |
| c11 | rich | 2.54 | 1.99 | 1.18 | 0.82 | 1 | fit |

## Observation and planning

- Model input: frames; 12 events (3 critical), 2 characters, 0 output repairs/notes
- 16 narration windows -> 11 cues
- Models: observe `us.amazon.nova-pro-v1:0`, script `us.amazon.nova-2-lite-v1:0`, region `us-east-1`

## Issues flagged for the reviewer

- [info] optional-unplaced: No narration window of >= 1.5 s starts after 71.00 s for 'She lowers a dark bowl onto a surface.'. It stays available through 'What did I miss?' recovery.

## Caveats

- Costs are estimates from a parameterized price table (`prices` in config); verify current pricing.
- Model video sampling can miss brief actions; human review is mandatory before publication.
- Pilot facts and speech received AI editorial preparation; this is separate from human approval. See content/editorial/ for the change ledger.
