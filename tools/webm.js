// Encodes a VP8 + Opus WebM rendition next to each packaged film's MP4.
// The Vega Virtual Device's platform decoder stalls on H.264 and VP9 about 3 s
// in; VP8 is decoded in software and plays through (docs/vega/PLATFORM-FINDINGS.md,
// "Codec trials"). The player picks the WebM on Vega OS. Requires ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'media/catalog.json'), 'utf8'));
for (const entry of catalog.films) {
  const pkgFile = path.join(root, entry.package);
  if (!fs.existsSync(pkgFile)) continue;
  const src = path.join(root, JSON.parse(fs.readFileSync(pkgFile, 'utf8')).video);
  const out = src.replace(/\.mp4$/, '.webm');
  if (out === src) { console.warn(`skip ${entry.id}: video is not .mp4`); continue; }
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) { console.log(`up to date: ${path.relative(root, out)}`); continue; }
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
    '-c:v', 'libvpx', '-b:v', '1.5M', '-deadline', 'good', '-cpu-used', '2', '-c:a', 'libopus', '-b:a', '96k', out]);
  console.log(`webm: ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}
