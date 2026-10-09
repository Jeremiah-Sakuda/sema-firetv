// Build an offline player for remote viewer sessions. Publishing is separate.
// The same release gate protects participant builds and the final TV submission.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, buildData } from './bundle.js';
import { checkRelease } from './release-check.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function buildSite({ root = ROOT, out = path.join(root, 'site'), probe } = {}) {
  root = path.resolve(root); out = path.resolve(out);
  const relative = path.relative(root, out);
  if (out === root || root.startsWith(out + path.sep) ||
      (!relative.startsWith('..') && ['src', 'media', 'pipeline', 'tools', 'tests', 'docs', 'vega-app', '.git'].includes(relative.split(path.sep)[0])))
    throw new Error('site: choose a dedicated output directory, not project source');
  const marker = '.sema-site.json';
  if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(path.join(out, marker)))
    throw new Error('site: output is not owned by this builder; choose a new empty directory');
  const release = checkRelease(root, probe ? { probe } : {});
  if (!release.ready) throw new Error('site: reviewed release required before viewer sessions:\n' +
    release.issues.map(i => `${i.code}: ${i.file}: ${i.detail}`).join('\n'));
  const { data } = buildData(root);
  const shipped = data.films.filter(f => !f.dev && !f.allowFixture && f.package.reviewStatus === 'approved');
  const files = new Set(['index.html', 'style.css']);
  for (const film of shipped) {
    const p = film.package;
    files.add(p.video);
    if (film.webm) files.add(film.webm);
    if (film.standardMix) files.add(film.standardMix);
    if (film.standardMixWebm) files.add(film.standardMixWebm);
    if (film.poster) files.add(film.poster);
    for (const c of p.cues) for (const v of Object.values(c.variants)) files.add(v.audio);
    for (const e of p.events) files.add(e.recovery.audio);
  }
  for (const clip of Object.values(data.prompts)) files.add(clip.audio);
  const siteData = { ...data, films: shipped };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const stage = fs.mkdtempSync(path.join(path.dirname(out), '.sema-site-'));
  try {
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(stage, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(stage, file));
    }
    fs.mkdirSync(path.join(stage, 'src'), { recursive: true });
    fs.writeFileSync(path.join(stage, 'src/bundle.js'), buildBundle(root));
    fs.writeFileSync(path.join(stage, 'src/data.js'), `window.SEMA_DATA = ${JSON.stringify(siteData)};\n`);
    fs.writeFileSync(path.join(stage, '.nojekyll'), '');
    fs.writeFileSync(path.join(stage, marker), JSON.stringify({ schemaVersion: 1, films: shipped.map(f => f.package.id) }) + '\n');
    // Build first: a missing asset leaves the previous usable session build intact.
    fs.rmSync(out, { recursive: true, force: true });
    fs.renameSync(stage, out);
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  return { out, films: shipped.length, files: files.size, bytes: [...files].reduce((n, f) => n + fs.statSync(path.join(root, f)).size, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) throw new Error('Usage: node tools/build-site.js [--out directory]');
    const result = buildSite({ out: args.length ? path.resolve(ROOT, args[1]) : path.join(ROOT, 'site') });
    console.log(`site: ${result.films} reviewed film(s), ${result.files} files, ${(result.bytes / 1e6).toFixed(1)} MB -> ${result.out}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
