#!/usr/bin/env node
// Copy the current Sema web app into the Vega WebView package (vega-app/assets/).
//
//   node tools/vega-sync.js            # sync the real app (index.html, style.css, src/bundle.js, media/)
//   node tools/vega-sync.js --probe    # install tools/vega-probe/probe.html as the WebView entry page
//   node tools/vega-sync.js --dry-run  # print what would be copied, change nothing
//
// The WebView loads file:///pkg/assets/index.html (vega-app/src/App.tsx), so the
// synced layout mirrors the repo root: assets/index.html, assets/style.css,
// assets/src/bundle.js, assets/media/...  Only the paths this script owns are
// cleaned; anything else under assets/ (e.g. assets/raw/ splash images) is kept.
//
// The script copies whatever is on disk at run time. It never rebuilds
// src/bundle.js (src/ belongs to the web-app engineer); it only warns when the
// bundle looks older than its sources. Run `npm run bundle` at the repo root first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'vega-app', 'assets');
const args = new Set(process.argv.slice(2));
const probe = args.has('--probe');
const dryRun = args.has('--dry-run');

if (args.has('-h') || args.has('--help')) {
  console.log('Usage: node tools/vega-sync.js [--probe] [--dry-run]');
  process.exit(0);
}
const unknown = [...args].filter(a => !['--probe', '--dry-run'].includes(a));
if (unknown.length) { console.error(`Unknown option(s): ${unknown.join(' ')}`); process.exit(2); }

// Paths under vega-app/assets/ that this script owns and may delete.
const OWNED = ['index.html', 'style.css', 'src', 'media', 'probe-script.js', 'probe-media', '.sema-sync.json'];
const MEDIA_EXT = new Set(['.mp4', '.mp3', '.json', '.vtt', '.png', '.jpg', '.svg']);
// Every ES module under src/ feeds src/bundle.js (tools/bundle.js); the generated files are excluded.
const BUNDLE_SOURCES = fs.existsSync(path.join(root, 'src'))
  ? fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js') && !['bundle.js', 'data.js'].includes(f)).map(f => `src/${f}`)
  : [];

const rel = p => path.relative(root, p) || '.';
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function fail(message) { console.error(`vega-sync: ${message}`); process.exit(1); }

if (!isDir(path.join(root, 'vega-app'))) fail(`missing ${rel(path.join(root, 'vega-app'))}`);

// Build the copy plan first so a missing required file aborts before anything is deleted.
const plan = []; // [{from, to}]
const add = (from, to) => plan.push({ from: path.join(root, from), to: path.join(assets, to) });

if (probe) {
  const probePage = path.join('tools', 'vega-probe', 'probe.html');
  if (!isFile(path.join(root, probePage))) fail(`missing ${probePage}`);
  add(probePage, 'index.html');
  add(path.join('tools', 'vega-probe', 'probe-script.js'), 'probe-script.js'); // <script src> over file:// test
  const variants = path.join('tools', 'vega-probe', 'media-test'); // probe-owned media: fixture copy, narration clips, codec variants
  if (isDir(path.join(root, variants))) for (const f of fs.readdirSync(path.join(root, variants)).filter(f => /\.(mp4|webm|mp3|json)$/.test(f))) add(path.join(variants, f), path.posix.join('probe-media', f));
} else {
  for (const required of ['index.html', 'style.css', 'src/bundle.js']) {
    if (!isFile(path.join(root, required))) fail(`missing required web app file ${required}${required === 'src/bundle.js' ? ' (run `npm run bundle` at the repo root)' : ''}`);
    add(required, required);
  }
  if (isFile(path.join(root, 'src/data.js'))) add('src/data.js', 'src/data.js');

  // Warn (do not fix) when the bundle is older than the modules it is built from.
  const bundleTime = fs.statSync(path.join(root, 'src/bundle.js')).mtimeMs;
  const newer = BUNDLE_SOURCES.filter(f => isFile(path.join(root, f)) && fs.statSync(path.join(root, f)).mtimeMs > bundleTime);
  if (newer.length) console.warn(`vega-sync: WARNING src/bundle.js is older than ${newer.join(', ')}; run \`npm run bundle\` at the repo root, then sync again.`);
}

// Media is needed by both the app and the probe (fetch, <video>, <audio> tests).
const skipped = [];
function walkMedia(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const child = path.posix.join(dir, entry.name);
    const abs = path.join(root, child);
    if (isDir(abs)) walkMedia(child);
    else if (isFile(abs) && MEDIA_EXT.has(path.extname(entry.name).toLowerCase())) add(child, child);
    else skipped.push(child);
  }
}
if (isDir(path.join(root, 'media'))) walkMedia('media');
else console.warn('vega-sync: WARNING no media/ directory; the package will have no media.');

// Clean only the paths this script owns.
for (const owned of OWNED) {
  const target = path.join(assets, owned);
  if (!fs.existsSync(target)) continue;
  if (dryRun) console.log(`would remove  ${rel(target)}`);
  else fs.rmSync(target, { recursive: true, force: true });
}

let bytes = 0;
for (const { from, to } of plan) {
  const size = fs.statSync(from).size; bytes += size;
  if (dryRun) { console.log(`would copy    ${rel(from)} -> ${rel(to)} (${size} B)`); continue; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

const record = {
  mode: probe ? 'probe' : 'app',
  syncedAt: new Date().toISOString(),
  files: plan.map(({ to }) => path.relative(assets, to).split(path.sep).join('/')),
  skipped,
};
if (!dryRun) fs.writeFileSync(path.join(assets, '.sema-sync.json'), JSON.stringify(record, null, 2) + '\n');

console.log(`vega-sync: ${dryRun ? 'would sync' : 'synced'} ${plan.length} files (${(bytes / 1024).toFixed(1)} KiB) into ${rel(assets)} [${record.mode} mode]`);
if (skipped.length) console.log(`vega-sync: skipped ${skipped.length} media file(s) with other extensions: ${skipped.join(', ')}`);
if (!dryRun) console.log('Next: cd vega-app && npm run build:debug   (see docs/vega/BUILD-AND-RUN.md)');
