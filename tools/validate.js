import fs from 'node:fs';
import { validatePackage } from '../src/package.js';

// Usage: node tools/validate.js <package.json> [--fixture]   one package
//        node tools/validate.js --all                        every package in media/catalog.json
const files = process.argv.includes('--all')
  ? JSON.parse(fs.readFileSync('media/catalog.json', 'utf8')).films.map(f => f.package).filter(f => fs.existsSync(f))
  : process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!files.length) { console.error('Usage: node tools/validate.js <package.json> [--fixture] | --all'); process.exit(2); }
let failed = false;
for (const file of files) {
  try {
    const asset = JSON.parse(fs.readFileSync(file, 'utf8'));
    const allowFixture = process.argv.includes('--fixture') || (process.argv.includes('--all') && asset.reviewStatus === 'fixture');
    const errors = validatePackage(asset, { allowFixture });
    for (const error of errors) console.error(`${file}: ${error}`);
    if (errors.length) { failed = true; continue; }
    console.log(`${asset.id}: valid ${asset.reviewStatus} package; ${asset.cues.length} cues, ${asset.events.length} events. Audio timing is metadata validation, not a measured playback result.`);
  } catch (error) { console.error(`${file}: ${error.message}`); failed = true; }
}
process.exit(failed ? 1 : 0);
