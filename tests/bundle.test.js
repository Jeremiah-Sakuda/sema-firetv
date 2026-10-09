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

test('moment orientation reuses existing measured speech and does not add required guidance clips', t => {
  const catalog = JSON.parse(fs.readFileSync('preview/media/catalog.json')).films;
  const dir = root(t, {catalog, clips: JSON.parse(fs.readFileSync('media/prompts/prompts.json'))});
  fs.copyFileSync('pipeline/prompts.json', path.join(dir,'pipeline/prompts.json'));
  for (const entry of catalog) {
    const pkg = JSON.parse(fs.readFileSync(`preview/${entry.package}`));
    fs.mkdirSync(path.dirname(path.join(dir,entry.package)), {recursive:true});
    fs.writeFileSync(path.join(dir,entry.package), JSON.stringify(pkg));
    for (const clip of [...pkg.events.map(e=>e.recovery), ...pkg.cues.map(c=>c.variants.essential)]) {
      const target = path.join(dir,clip.audio); fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(`preview/${clip.audio}`,target);
    }
  }
  const {data, missingClips} = buildData(dir, () => {}, {preview:true});
  assert.equal(missingClips.length, 0);
  const timed = film => film.package.events.filter(e => film.package.cues.some(c => c.events.length === 1 && c.events[0] === e.id));
  assert.equal(Object.keys(data.momentPrompts).length, data.films.reduce((n, f) => n + timed(f).length, 0));
  for (const film of data.films) for (const event of film.package.events) {
    if (!timed(film).includes(event)) {
      // No short timed form: no spoken preview, so Select is not preceded by the same description.
      assert.equal(event.labelPrompt, undefined); continue;
    }
    const clip = data.momentPrompts[event.labelPrompt];
    assert.ok(clip && fs.existsSync(path.join(dir,clip.audio)));
    assert.equal(event.label, clip.text.replace(/[.!?]$/, ''));
    assert.notEqual(clip.text, event.recovery.text, 'preview differs from the description Select plays');
  }
});
