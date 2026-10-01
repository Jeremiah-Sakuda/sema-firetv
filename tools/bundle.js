// Builds the two scripts index.html loads, so the player runs from file:// in
// the Vega WebView with no module loader and no runtime fetch:
//   src/bundle.js  the known ESM sources concatenated into one IIFE
//                  (single-line imports only; not a general-purpose bundler)
//   src/data.js    window.SEMA_DATA: catalog packages and spoken prompts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackage } from '../src/package.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

const modules = ['src/package.js', 'src/playback.js', 'src/format.js', 'src/keymap.js', 'src/voice.js', 'src/app.js'];
const code = modules.map(file => `// ${file}\n` + read(file).replace(/^import .+;\n/gm, '').replace(/^export /gm, ''));
fs.writeFileSync(path.join(root, 'src/bundle.js'), '(()=>{\n' + code.join('\n') + '\n})();\n');

const catalog = JSON.parse(read('media/catalog.json'));
const films = [];
for (const entry of catalog.films) {
  if (!exists(entry.package)) { console.warn(`skip ${entry.id}: ${entry.package} not built yet`); continue; }
  const pkg = JSON.parse(read(entry.package));
  const allowFixture = pkg.reviewStatus === 'fixture';
  const errors = validatePackage(pkg, { allowFixture });
  if (errors.length) console.warn(`warning ${entry.id}: package fails validation and will show as unavailable:\n  ${errors.join('\n  ')}`);
  const poster = `media/${entry.id}/poster.jpg`;
  const webm = pkg.video.replace(/\.mp4$/, '.webm');  // VP8 rendition for Vega (tools/webm.js)
  films.push({ package: pkg, poster: exists(poster) ? poster : null, webm: webm !== pkg.video && exists(webm) ? webm : null, dev: !!entry.dev, allowFixture });
}
// Until a reviewed film is packaged, show the engineering fixture rather than an empty catalog.
if (!films.some(f => !f.dev)) for (const f of films) f.dev = false;
const prompts = exists('media/prompts/prompts.json') ? JSON.parse(read('media/prompts/prompts.json')) : {};
const promptTexts = JSON.parse(read('pipeline/prompts.json'));  // fallback text before clips are rendered
const data = { generatedAt: new Date().toISOString(), films, prompts, promptTexts };
fs.writeFileSync(path.join(root, 'src/data.js'), `window.SEMA_DATA = ${JSON.stringify(data)};\n`);
console.log(`Bundled player (${modules.length} modules); data: ${films.length} film(s) [${films.map(f => f.package.id + (f.dev ? ' (dev)' : '')).join(', ')}], ${Object.keys(prompts).length} prompt clip(s).`);
