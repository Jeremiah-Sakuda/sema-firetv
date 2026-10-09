import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkRelease } from '../../tools/release-check.js';

const fixture = JSON.parse(fs.readFileSync('media/fixture/package.json', 'utf8'));
export function setup(t) {
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
  return { root, write, films, durations, probe, check: () => checkRelease(root, { probe }) };
}

