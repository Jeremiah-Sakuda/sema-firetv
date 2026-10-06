import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildData } from '../tools/bundle.js';

function root(t, { clips = {}, catalog = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-bundle-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (f, v) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), typeof v === 'string' ? v : JSON.stringify(v)); };
  write('media/catalog.json', { films: catalog });
  write('pipeline/prompts.json', { paused: 'Paused.', ready: 'Ready.' });
  write('media/prompts/prompts.json', clips);
  for (const c of Object.values(clips)) write(c.audio, 'mp3');
  return dir;
}

test('a recorded prompt is used only while it says the current text', t => {
  const dir = root(t, { clips: { paused: { text: 'Paused. Resume is selected.', audio: 'media/prompts/paused.mp3', duration: 1 },
    ready: { text: 'Ready.', audio: 'media/prompts/ready.mp3', duration: 1 } } });
  const { data, staleClips, missingClips } = buildData(dir);
  assert.deepEqual(Object.keys(data.prompts), ['ready']);
  assert.deepEqual(staleClips, ['paused']);
  assert.deepEqual(missingClips, ['paused']);
  assert.equal(data.promptTexts.paused, 'Paused.');
});

test('pending catalog entries are left out of the build', t => {
  const dir = root(t, { catalog: [{ id: 'later', package: 'media/later/package.json', status: 'pending' }] });
  assert.deepEqual(buildData(dir).data.films, []);
});

test('build output is deterministic', t => {
  const dir = root(t);
  assert.equal(JSON.stringify(buildData(dir).data), JSON.stringify(buildData(dir).data));
});
