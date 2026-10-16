import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkDescriptionLevels, checkEditorialRecord } from '../tools/check-description-levels.js';
const contracts = JSON.parse(fs.readFileSync('content/description-contracts.json'));
const film = JSON.parse(fs.readFileSync('preview/media/tears-of-steel/package.json'));
test('current narration preserves the explicit content floors for both films', () => {
  for (const id of Object.keys(contracts)) assert.deepEqual(checkDescriptionLevels(JSON.parse(fs.readFileSync(`preview/media/${id}/package.json`)), contracts), []);
});
test('the editorial record states exactly what ships, and catches any later edit', () => {
  for (const id of Object.keys(contracts)) {
    const pkg = JSON.parse(fs.readFileSync(`preview/media/${id}/package.json`));
    assert.deepEqual(checkEditorialRecord(pkg, JSON.parse(fs.readFileSync(`content/editorial/${id}.json`))), []);
  }
  const record = JSON.parse(fs.readFileSync('content/editorial/tears-of-steel.json'));
  const edited = structuredClone(film); edited.cues.find(c => c.id === 'c07').variants.rich.text = 'A man with an eyepiece.';
  assert.match(checkEditorialRecord(edited, record).join(' '), /c07\/rich: editorial record differs/);
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
