# Media attribution

| Work and paths | License and attribution | Source and changes |
|---|---|---|
| **Sintel** (2010), `preview/media/sintel-dragon/` and production `media/sintel-dragon/` | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). © copyright Blender Foundation · durian.blender.org | [Official film source](https://download.blender.org/durian/movies/Sintel.2010.1080p.mkv). Excerpt 2:30–3:42, scaled and re-encoded; Sema narration, comparison mixes and poster frame added. |
| **Tears of Steel** (2012), `preview/media/tears-of-steel/` and production `media/tears-of-steel/` | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). (CC) Blender Foundation · mango.blender.org | [Blender project](https://mango.blender.org/). Excerpt 0:00–1:12, re-encoded; Sema narration, comparison mixes and poster frame added. |
| **The red envelope**, `media/fixture/` | Original engineering fixture; code and generated visuals under this repository's [MIT license](../LICENSE) | Generated test footage, re-voiced with Amazon Polly on October 7: Joanna narration and Matthew dialogue. |

Narration and the 63 current Polly guidance prompts were generated with Amazon Polly. Bedrock/Nova drafted the film narration; Codex and Claude Code edited it against source frames. The code license does not replace the films' CC BY terms.

Full rights records: [Sintel](../content/rights/sintel-dragon.txt), [Tears of Steel](../content/rights/tears-of-steel.txt). `npm run content:fetch` reproduces source excerpts. The Blender Foundation does not endorse Sema.


## Recorded moment names

The 25 short moment-name recordings are generated from Sema's interface text with Piper 1.8.0 and the `en_US-ljspeech-high` voice. The voice [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD) identifies its [LJ Speech dataset](https://keithito.com/LJ-Speech-Dataset/) as public domain. `moment-labels/provenance.json` records the generator version and model hash. Piper and its voice model are not included in the app; the app includes only the resulting MP3 files. Film narration and 63 control prompts were rendered with Amazon Polly. Four additional viewing-options prompts use the same Piper voice; their text, audio hashes and generation provenance are in `interface/`.
