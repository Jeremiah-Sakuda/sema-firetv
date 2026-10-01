// Extracts a catalog poster frame for each packaged film listed in
// media/catalog.json (requires ffmpeg). Output: media/<id>/poster.jpg
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'media/catalog.json'), 'utf8'));
for (const entry of catalog.films) {
  const pkgFile = path.join(root, entry.package);
  if (!fs.existsSync(pkgFile)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const out = path.join(root, 'media', entry.id, 'poster.jpg');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(entry.posterTime ?? 1), '-i', path.join(root, pkg.video),
    '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', out]);
  console.log(`poster: ${path.relative(root, out)}`);
}
