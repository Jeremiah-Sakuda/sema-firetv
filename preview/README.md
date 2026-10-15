# Included two-film prototype

This is the runnable viewer experience: choose the description level, revisit a past visual moment and continue from the same frame. The two excerpts illustrate the proposed publisher workflow described in the [project README](../README.md#who-it-is-for).

From the repository root, run `npm run preview`. Node.js 22 is sufficient; no AWS account, Python environment or authoring workspace is needed.

`media/integrity.json` binds the included movies, narration, posters and fixed Standard mixes. The build verifies these files, then rebuilds HTML, CSS, player scripts and spoken guidance from the main source.

This snapshot uses AI-prepared narration. It is separate from the production approval workflow described in the [architecture guide](../docs/ARCHITECTURE.md). Its integrity manifest verifies bytes; it is not an editorial approval record.

Film credits, licenses and adaptations: [media attribution](../media/ATTRIBUTION.md). To regenerate the snapshot from a local authoring workspace, run `npm run preview:author` with Python and ffmpeg installed.
