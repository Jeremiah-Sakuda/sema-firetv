# Contributing

Use Node.js 22. Run `npm ci`, `npm test`, `npm run preview:build` and `npm run repo:check` before proposing a change. Pipeline changes also require the [offline Python tests](docs/TESTING.md).

Edit the source in `src/`, `index.html` and `style.css`; bundled scripts and Vega asset copies are generated. Use `npm run preview` for the included films and the [Vega guide](docs/vega/BUILD-AND-RUN.md) for target-platform verification.

Keep remote focus predictable, preserve interrupted critical descriptions, and test narration from actual media events. Do not infer audibility or comprehension from audio completion. Never mark AI-generated content as human-approved or weaken approval checks to make a build pass.

Add only media you can redistribute, with source, license, attribution and modification details. Keep credentials, account configuration, participant material, submission drafts and raw logs out of commits. Generated test output belongs in `artifacts/`; curated evidence belongs in `docs/evidence/`.

Describe the user-visible change and relevant verification in pull requests. Report the platform and SDK version when describing device behavior.
