// Builds the two scripts index.html loads, so the player runs from file:// in
// the Vega WebView with no module loader and no runtime fetch:
//   src/bundle.js  the known ESM sources concatenated into one IIFE
//                  (single-line imports only; not a general-purpose bundler)
//   src/data.js    window.SEMA_DATA: catalog packages and spoken prompts
// Output is deterministic, so rebuilding unchanged inputs leaves git clean.
// Tests import buildBundle()/buildData() and never write the tracked files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackage } from '../src/package.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MODULES = ['src/package.js', 'src/playback.js', 'src/format.js', 'src/keymap.js', 'src/voice.js', 'src/app.js'];

export function buildBundle(root = ROOT) {
  const code = MODULES.map(file => `// ${file}\n` + fs.readFileSync(path.join(root, file), 'utf8').replace(/^import .+;\n/gm, '').replace(/^export /gm, ''));
  return '(()=>{\n' + code.join('\n') + '\n})();\n';
}

export function buildData(root = ROOT, warn = () => {}) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const exists = file => fs.existsSync(path.join(root, file));
  const catalog = JSON.parse(read('media/catalog.json'));
  const films = [];
  for (const entry of catalog.films) {
    if (entry.status === 'pending') { warn(`skip ${entry.id}: marked pending (not reviewed for this release)`); continue; }
    if (!exists(entry.package)) { warn(`skip ${entry.id}: ${entry.package} not built yet`); continue; }
    const pkg = JSON.parse(read(entry.package));
    const allowFixture = pkg.reviewStatus === 'fixture';
    const errors = validatePackage(pkg, { allowFixture });
    if (errors.length) warn(`warning ${entry.id}: package fails validation and will show as unavailable:\n  ${errors.join('\n  ')}`);
    const poster = `media/${entry.id}/poster.jpg`;
    const webm = pkg.video.replace(/\.mp4$/, '.webm');  // VP8 rendition for Vega (tools/webm.js)
    films.push({ package: pkg, poster: exists(poster) ? poster : null, webm: webm !== pkg.video && exists(webm) ? webm : null, dev: !!entry.dev, allowFixture });
  }
  // Until a reviewed film is packaged, show the engineering fixture rather than an empty catalog.
  if (!films.some(f => !f.dev)) for (const f of films) f.dev = false;
  const promptTexts = JSON.parse(read('pipeline/prompts.json'));  // the current wording; fallback before clips are rendered
  const rendered = exists('media/prompts/prompts.json') ? JSON.parse(read('media/prompts/prompts.json')) : {};
  // A recorded clip is used only while it says exactly the current text; a stale
  // recording must never contradict the screen. Re-render with `sema_pipeline prompts --live`.
  const prompts = {}, stale = [];
  for (const [id, clip] of Object.entries(rendered)) {
    if (promptTexts[id] === clip.text && exists(clip.audio)) prompts[id] = clip; else if (promptTexts[id]) stale.push(id);
  }
  const missing = Object.keys(promptTexts).filter(id => !prompts[id]);
  if (missing.length) warn(`spoken guidance: ${missing.length} prompt(s) need (re-)rendering and will use text fallback: ${missing.join(', ')}`);
  return { data: { films, prompts, promptTexts }, missingClips: missing, staleClips: stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'src/bundle.js'), buildBundle());
  const { data, missingClips } = buildData(ROOT, message => console.warn(message));
  fs.writeFileSync(path.join(ROOT, 'src/data.js'), `window.SEMA_DATA = ${JSON.stringify(data)};\n`);
  console.log(`Bundled player (${MODULES.length} modules); data: ${data.films.length} film(s) [${data.films.map(f => f.package.id + (f.dev ? ' (dev)' : '')).join(', ')}], ${Object.keys(data.prompts).length} current prompt clip(s)${missingClips.length ? `, ${missingClips.length} awaiting render` : ''}.`);
}
