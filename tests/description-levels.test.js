import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkDescriptionLevels } from '../tools/check-description-levels.js';
const contracts = JSON.parse(fs.readFileSync('content/description-contracts.json'));
const film = JSON.parse(fs.readFileSync('preview/media/tears-of-steel/package.json'));
test('current narration preserves the explicit content floors for both films', () => {
  for (const id of Object.keys(contracts)) assert.deepEqual(checkDescriptionLevels(JSON.parse(fs.readFileSync(`preview/media/${id}/package.json`)), contracts), []);
});
test('a longer but less specific Rich line cannot pass a timing-only check', () => {
  const bad = structuredClone(film); bad.cues.find(c => c.id === 'c02').variants.rich.text = 'Engines blaze above red steel.';
  assert.match(checkDescriptionLevels(bad, contracts).join(' '), /c02\/rich: preserve rocket/);
  bad.cues.find(c => c.id === 'c07').variants.rich.text = 'An eye device.';
  assert.match(checkDescriptionLevels(bad, contracts).join(' '), /c07\/rich: preserve mechanical/);
});
test('equivalent detail in short windows is allowed, while deleting a contracted cue is not', () => {
  const pkg = structuredClone(film); for (const c of pkg.cues) c.variants.rich = c.variants.standard;
  assert.deepEqual(checkDescriptionLevels(pkg, contracts), []);
  pkg.cues = pkg.cues.filter(c => c.id !== 'c07');
  assert.match(checkDescriptionLevels(pkg, contracts).join(' '), /c07: contracted cue missing/);
});
