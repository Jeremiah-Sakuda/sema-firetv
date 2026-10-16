# Included two-film prototype

This is the runnable viewer experience: choose the description level, revisit a past visual moment and continue from the same frame. The two excerpts show the full experience described in the [project README](../README.md).

From the repository root, run `npm run preview`. Node.js 22 is sufficient; no AWS account, Python environment or authoring workspace is needed.

`media/integrity.json` binds the included movies, narration, posters and fixed Standard mixes. The build verifies these files, then rebuilds HTML, CSS, player scripts and spoken guidance from the main source.

Narration was drafted with Amazon Bedrock and voiced with Amazon Polly; [`content/editorial/`](../content/editorial/) holds its editorial record. The [architecture guide](../docs/ARCHITECTURE.md) describes the production approval workflow.

Film credits, licenses and adaptations: [media attribution](../media/ATTRIBUTION.md). To regenerate the snapshot from a local authoring workspace, run `npm run preview:author` with Python and ffmpeg installed.
