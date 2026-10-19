// Builds the two scripts index.html loads, so the player runs from file:// in
// the Vega WebView with no module loader and no runtime fetch:
//   src/bundle.js  the known ESM sources concatenated into one IIFE
//                  (single-line imports only; not a general-purpose bundler)
//   src/data.js    window.SEMA_DATA: catalog packages and spoken prompts
// Output is deterministic, so rebuilding unchanged inputs leaves git clean.
// Tests import buildBundle()/buildData() and never write the tracked files.
import fs from 'node:fs';
import path from 'node:path';
import { recordedClipIssues } from './playback-assets.js';
import { fileURLToPath } from 'node:url';
import { validatePackage } from '../src/package.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MODULES = ['src/package.js', 'src/moment-navigation.js', 'src/playback.js', 'src/format.js', 'src/keymap.js', 'src/voice.js', 'src/playback-session.js', 'src/app.js'];

export function buildBundle(root = ROOT) {
  const code = MODULES.map(file => `// ${file}\n` + fs.readFileSync(path.join(root, file), 'utf8').replace(/^import .+;\n/gm, '').replace(/^export /gm, ''));
  return '(()=>{\n' + code.join('\n') + '\n})();\n';
}

export function buildData(root = ROOT, warn = () => {}, { preview = false } = {}) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const exists = file => fs.existsSync(path.join(root, file));
  const catalog = JSON.parse(read('media/catalog.json'));
  const films = [];
  for (const entry of catalog.films) {
    if (entry.status === 'pending') { warn(`skip ${entry.id}: marked pending (not reviewed for this release)`); continue; }
    if (!exists(entry.package)) { warn(`skip ${entry.id}: ${entry.package} not built yet`); continue; }
    const pkg = JSON.parse(read(entry.package));
    if (pkg.reviewStatus === 'draft' && !preview) { warn(`skip ${entry.id}: draft only; use the separate review build`); continue; }
    const allowFixture = pkg.reviewStatus === 'fixture';
    const allowDraft = preview && pkg.reviewStatus === 'draft';
    const errors = validatePackage(pkg, { allowFixture, allowDraft });
    if (errors.length) warn(`warning ${entry.id}: package fails validation and will show as unavailable:\n  ${errors.join('\n  ')}`);
    const poster = `media/${entry.id}/poster.jpg`;
    const webm = pkg.video.replace(/\.mp4$/, '.webm');  // VP8 rendition for Vega (tools/webm.js)
    const standardMix = `media/${entry.id}/standard.mp4`, standardMixWebm = `media/${entry.id}/standard.webm`;
    films.push({ package: pkg, poster: exists(poster) ? poster : null, webm: webm !== pkg.video && exists(webm) ? webm : null,
      standardMix: exists(standardMix) ? standardMix : null, standardMixWebm: exists(standardMixWebm) ? standardMixWebm : null,
      dev: !!entry.dev, allowFixture, allowDraft });
  }
  // Until a reviewed film is packaged, show the engineering fixture rather than an empty catalog.
  if (!films.some(f => !f.dev)) for (const f of films) f.dev = false;
  const supplemental = exists('content/interface-prompts.json') ? JSON.parse(read('content/interface-prompts.json')) : {};
  const promptTexts = {...JSON.parse(read('pipeline/prompts.json')), ...supplemental};  // the current wording; fallback before clips are rendered
  const rendered = {...(exists('media/prompts/prompts.json') ? JSON.parse(read('media/prompts/prompts.json')) : {}), ...(exists('media/interface/prompts.json') ? JSON.parse(read('media/interface/prompts.json')) : {})};
  // A recorded clip is used only while it says exactly the current text; a stale
  // recording must never contradict the screen. Re-render with `sema_pipeline prompts --live`.
  const prompts = {}, stale = [];
  for (const [id, clip] of Object.entries(rendered)) {
    if (promptTexts[id] && !recordedClipIssues(root,id,promptTexts[id],clip,{directory:supplemental[id]?'media/interface':'media/prompts',maxDuration:supplemental[id]?5:Infinity}).length) prompts[id] = clip; else if (promptTexts[id]) stale.push(id);
  }
  const missing = Object.keys(promptTexts).filter(id => !prompts[id]);
  if (missing.length) warn(`spoken guidance: ${missing.length} prompt(s) need (re-)rendering and will use text fallback: ${missing.join(', ')}`);
  const labels = exists('content/moment-labels.json') ? JSON.parse(read('content/moment-labels.json')) : {};
  const identities = exists('media/moment-labels/prompts.json') ? JSON.parse(read('media/moment-labels/prompts.json')) : {};
  const momentPrompts = {}, missingMomentClips = [];
  for (const film of films) {
    if (validatePackage(film.package, {allowFixture: film.allowFixture, allowDraft: film.allowDraft}).length) continue;
    for (const event of film.package.events) {
      // Prefer concise identity audio. A fixture may reuse a short timed clip,
      // but the full recovery answer is never used as a focus announcement.
      const cue = film.package.cues.find(c => c.events.length === 1 && c.events[0] === event.id);
      const clip = cue?.variants.essential;
      // Identity is metadata, independent of whether this moment has a timed clip.
      event.label = labels[film.package.id]?.[event.id] ?? clip?.text.replace(/[.!?]$/, '') ?? event.id.replace(/-/g, ' ');
      const id = `moment_${film.package.id}_${event.id}`.replace(/-/g, '_');
      const identity = identities[id];
      if (labels[film.package.id]?.[event.id]) {
        if (recordedClipIssues(root,id,`${event.label}.`,identity,{directory:'media/moment-labels',maxDuration:5}).length) {
          missingMomentClips.push(id); continue;
        }
        event.labelPrompt = id; momentPrompts[id] = identity; continue;
      }
      if (!clip || !exists(clip.audio)) continue;
      event.labelPrompt = id;
      momentPrompts[id] = clip;
    }
  }
  if (missingMomentClips.length) warn(`Recorded moment identities need rendering: ${missingMomentClips.join(', ')}`);
  return { data: { films, prompts, momentPrompts, promptTexts, preview }, missingClips: missing, staleClips: stale, missingMomentClips };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--preview-root' || !args[1])) throw new Error('Usage: bundle.js [--preview-root directory]');
  const out = args.length ? path.resolve(args[1]) : ROOT;
  if (args.length && out === ROOT) throw new Error('Review builds must use a separate output directory');
  fs.mkdirSync(path.join(out, 'src'), { recursive: true });
  fs.writeFileSync(path.join(out, 'src/bundle.js'), buildBundle());
  const { data, missingClips } = buildData(out, message => console.warn(message), { preview: args.length > 0 });
  fs.writeFileSync(path.join(out, 'src/data.js'), `window.SEMA_DATA = ${JSON.stringify(data)};\n`);
  console.log(`Bundled player (${MODULES.length} modules); data: ${data.films.length} film(s) [${data.films.map(f => f.package.id + (f.dev ? ' (dev)' : '')).join(', ')}], ${Object.keys(data.prompts).length} current prompt clip(s)${missingClips.length ? `, ${missingClips.length} awaiting render` : ''}.`);
}
