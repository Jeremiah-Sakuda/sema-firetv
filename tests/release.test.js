import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkRelease } from '../tools/release-check.js';

const fixture = JSON.parse(fs.readFileSync('media/fixture/package.json', 'utf8'));
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const durations = new Map();
  const write = (file, data = 'test bytes') => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof data === 'object' ? JSON.stringify(data) : data);
  };
  const media = (file, duration) => { write(file); durations.set(file, duration); };
  const films = ['alpha', 'beta'].map(id => {
    const pkg = structuredClone(fixture);
    Object.assign(pkg, { id, reviewStatus: 'approved', credits: 'Test film', video: `media/${id}/film.mp4`,
      approval: { method: 'interactive', reviewer: 'Test reviewer', approvedAt: '2026-10-04' },
      pipeline: { mode: 'live', sourceSha256: crypto.createHash('sha256').update('test bytes').digest('hex') } });
    media(pkg.video, pkg.duration); media(pkg.video.replace('.mp4', '.webm'), pkg.duration);
    for (const c of pkg.cues) for (const [level, v] of Object.entries(c.variants)) {
      v.audio = `media/${id}/${c.id}-${level}.mp3`; media(v.audio, v.duration);
    }
    for (const e of pkg.events) { e.recovery.audio = `media/${id}/recover-${e.id}.mp3`; media(e.recovery.audio, e.recovery.duration); }
    const hash = data => crypto.createHash('sha256').update(data).digest('hex');
    pkg.approval.integrity = { schemaVersion: 1, sourceSha256: hash('test bytes'), artifacts: {} };
    for (const c of pkg.cues) for (const [level, v] of Object.entries(c.variants))
      pkg.approval.integrity.artifacts[`cue:${c.id}:${level}`] = { textSha256: hash(v.text), audioSha256: hash('test bytes'), duration: v.duration };
    for (const e of pkg.events) pkg.approval.integrity.artifacts[`recovery:${e.id}`] = {
      textSha256: hash(e.recovery.text), audioSha256: hash('test bytes'), duration: e.recovery.duration };
    const pick = (item, keys) => Object.fromEntries(keys.map(k => [k, item[k]]));
    pkg.approval.playback = { duration: pkg.duration, scenes: pkg.scenes, dialogue: pkg.dialogue,
      cues: pkg.cues.map(c => pick(c, ['id', 'events', 'start', 'end', 'margin'])),
      events: pkg.events.map(e => pick(e, ['id', 'scene', 'availableAt', 'critical'])) };
    write(pkg.video.replace('.mp4', '.webm.json'), { sourceSha256: hash('test bytes'), renditionSha256: hash('test bytes') });
    write(`media/${id}/package.json`, pkg); write(`content/rights/${id}.txt`, 'Test rights');
    return { id, package: `media/${id}/package.json` };
  });
  write('media/catalog.json', { films });
  write('pipeline/prompts.json', { welcome: 'Welcome.' });
  write('media/prompts/prompts.json', { welcome: { text: 'Welcome.', audio: 'media/prompts/welcome.mp3', duration: 1 } });
  write('media/prompts/provenance.json', { mode: 'live' }); media('media/prompts/welcome.mp3', 1);
  const probe = absolute => {
    const file = path.relative(root, absolute);
    return { format: { duration: durations.get(file) }, streams: file.endsWith('.webm')
      ? [{ codec_type: 'video', codec_name: 'vp8' }, { codec_type: 'audio', codec_name: 'opus' }]
      : [{ codec_type: 'audio', codec_name: 'mp3' }] };
  };
  return { root, write, films, durations, check: () => checkRelease(root, { probe }) };
}

test('release checks all referenced bytes and durations for both films and guidance', t => {
  const s = setup(t);
  assert.equal(s.check().ready, true);
  fs.unlinkSync(path.join(s.root, 'media/prompts/welcome.mp3'));
  assert.ok(s.check().issues.some(i => i.code === 'MISSING_MEDIA'));
});

test('missing real catalog packages cannot be silently skipped', t => {
  const s = setup(t);
  fs.unlinkSync(path.join(s.root, s.films[0].package));
  const result = s.check();
  assert.equal(result.ready, false);
  assert.ok(result.issues.some(i => i.code === 'MISSING_FILE' && i.file === s.films[0].package));
});

test('file duration exceeding its metadata and protected window blocks release', t => {
  const s = setup(t);
  s.durations.set('media/alpha/envelope-standard.mp3', 8);
  const result = s.check();
  assert.ok(result.issues.some(i => i.code === 'DURATION_MISMATCH'));
  assert.ok(result.issues.some(i => i.code === 'AUDIO_DOES_NOT_FIT'));
});

test('offline provenance and scripted approvals cannot be submitted as human-reviewed AWS output', t => {
  const s = setup(t), file = s.films[0].package;
  const pkg = JSON.parse(fs.readFileSync(path.join(s.root, file)));
  pkg.pipeline.mode = 'offline-stub'; pkg.approval.method = 'approve-all'; s.write(file, pkg);
  s.write('media/prompts/provenance.json', { mode: 'stub' });
  const codes = s.check().issues.map(i => i.code);
  for (const code of ['AWS_PROVENANCE', 'HUMAN_REVIEW', 'PROMPT_PROVENANCE']) assert.ok(codes.includes(code));
});

test('different narration bytes with unchanged duration fail the approval binding', t => {
  const s = setup(t);
  s.write('media/alpha/envelope-standard.mp3', 'different words at the same duration');
  assert.ok(s.check().issues.some(i => i.code === 'APPROVED_CONTENT_CHANGED'));
  s.write('media/alpha/envelope-standard.mp3', 'test bytes');
  assert.equal(s.check().ready, true);
});

test('edited script text or critical reveal time invalidates approval', t => {
  const s = setup(t), file = s.films[0].package;
  const pkg = JSON.parse(fs.readFileSync(path.join(s.root, file)));
  pkg.cues[0].variants.standard.text = 'A different story fact.';
  pkg.events[0].availableAt += 0.1;
  s.write(file, pkg);
  const codes = s.check().issues.map(i => i.code);
  assert.ok(codes.includes('APPROVED_CONTENT_CHANGED'));
  assert.ok(codes.includes('APPROVED_TIMING_CHANGED'));
});

test('recovery and rendition bytes are also bound to approved content', t => {
  const s = setup(t);
  s.write('media/alpha/recover-envelope-hidden.mp3', 'changed recovery');
  s.write('media/alpha/film.webm', 'changed rendition');
  const codes = s.check().issues.map(i => i.code);
  assert.ok(codes.includes('APPROVED_CONTENT_CHANGED'));
  assert.ok(codes.includes('RENDITION_CHANGED'));
});

test('one reviewed film is enough; a pending film is held back, not shipped', t => {
  const s = setup(t);
  s.write('media/catalog.json', { films: [s.films[0], { id: 'later', package: 'media/later/package.json', status: 'pending' }] });
  const result = s.check();
  assert.equal(result.ready, true, JSON.stringify(result.issues));
  assert.deepEqual([...result.pendingFilms], ['later']);
  s.write('media/catalog.json', { films: [{ ...s.films[0], status: 'pending' }] });
  assert.ok(s.check().issues.some(i => i.code === 'CATALOG_INCOMPLETE'));
});
