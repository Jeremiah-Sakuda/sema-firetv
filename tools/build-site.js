// Builds a static copy of the player for remote viewer sessions: participants
// open it in their own browser with their own screen reader (VoiceOver, NVDA,
// JAWS). It is the same code that runs in the Vega WebView; sessions run this
// way are reported as "browser, not Fire TV".
//   node tools/build-site.js [--out site]
// Output contains only what the bundled catalog references. Publishing it
// (for example to GitHub Pages) is a separate, deliberate step.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, buildData } from './bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = path.resolve(ROOT, outArg >= 0 ? process.argv[outArg + 1] : 'site');

const { data, missingClips } = buildData(ROOT, message => console.warn(message));
const files = new Set(['index.html', 'style.css']);
// Participants only ever see human-approved films, never the engineering fixture.
const shipped = data.films.filter(f => f.package.reviewStatus === 'approved');
for (const film of shipped) {
  const p = film.package;
  files.add(p.video);
  if (film.poster) files.add(film.poster);
  for (const c of p.cues) for (const v of Object.values(c.variants)) files.add(v.audio);
  for (const e of p.events) files.add(e.recovery.audio);
}
for (const clip of Object.values(data.prompts)) files.add(clip.audio);

fs.rmSync(OUT, { recursive: true, force: true });
for (const file of files) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) throw new Error(`site: referenced file missing: ${file}`);
  fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, file));
}
const siteData = { ...data, films: shipped };
fs.mkdirSync(path.join(OUT, 'src'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'src/bundle.js'), buildBundle(ROOT));
fs.writeFileSync(path.join(OUT, 'src/data.js'), `window.SEMA_DATA = ${JSON.stringify(siteData)};\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
const size = [...files].reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
console.log(`site: ${siteData.films.length} film(s), ${files.size} files, ${(size / 1e6).toFixed(1)} MB -> ${path.relative(ROOT, OUT)}/` +
  (siteData.films.length ? '' : ' (no reviewed film packaged yet: the catalog will be empty)') +
  (missingClips.length ? `; ${missingClips.length} prompt(s) use text fallback until re-rendered` : ''));
