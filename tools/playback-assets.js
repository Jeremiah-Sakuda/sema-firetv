import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Exact recorded text, location, duration and bytes; rendering origin is checked separately. */
export function recordedClipIssues(root, id, text, clip, { directory, maxDuration = Infinity } = {}) {
  if (!clip) return ['recording missing'];
  const issues = [];
  if (clip.text !== text) issues.push('recorded text differs');
  if (!Number.isFinite(clip.duration) || clip.duration <= 0 || clip.duration >= maxDuration) issues.push('invalid duration');
  if (!/^[a-z0-9_]+$/.test(id) || clip.audio !== `${directory}/${id}.mp3`) return [...issues, 'unexpected recording path'];
  const file = path.resolve(root, clip.audio), realRoot = fs.realpathSync(root);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || !fs.realpathSync(file).startsWith(realRoot + path.sep)) return [...issues, 'recording missing or outside root'];
  if (!/^[0-9a-f]{64}$/.test(clip.sha256 ?? '') || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== clip.sha256) issues.push('recorded bytes differ');
  return issues;
}

/** Every playback reference, including identity recordings independent of timed narration. */
export function requiredPlaybackAssets(data) {
  const files = new Set();
  const add = file => { if (file) files.add(file); };
  for (const film of data.films) {
    add(film.package.video); add(film.webm); add(film.standardMix); add(film.standardMixWebm); add(film.poster);
    for (const cue of film.package.cues) for (const clip of Object.values(cue.variants)) add(clip.audio);
    for (const event of film.package.events) add(event.recovery.audio);
  }
  for (const clips of [data.prompts, data.momentPrompts]) for (const clip of Object.values(clips ?? {})) add(clip.audio);
  return files;
}
