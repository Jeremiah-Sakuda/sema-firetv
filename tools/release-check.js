// Verify the shipped assets, not only package metadata. A fixture can pass
// engineering tests while this release check correctly reports NOT READY.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePackage, LEVELS } from '../src/package.js';

const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const textHash = text => typeof text === 'string' ? crypto.createHash('sha256').update(text, 'utf8').digest('hex') : null;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function probeMedia(file) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' }));
}

export function checkRelease(root = projectRoot, { probe = probeMedia } = {}) {
  const issues = [], assets = [], measured = new Map();
  const issue = (code, file, detail) => issues.push({ code, file, detail });
  const safeFile = file => {
    if (typeof file !== 'string' || !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(file) || file.includes('..')) return null;
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
    const relative = path.relative(fs.realpathSync(root), fs.realpathSync(absolute));
    return relative.startsWith('..') || path.isAbsolute(relative) ? null : absolute;
  };
  const readJSON = file => {
    const absolute = safeFile(file);
    if (!absolute) { issue('MISSING_FILE', file, 'required release file absent or unsafe'); return null; }
    try { return JSON.parse(fs.readFileSync(absolute, 'utf8')); }
    catch { issue('INVALID_JSON', file, 'invalid JSON'); return null; }
  };
  const inspect = (file, expectedDuration) => {
    const absolute = safeFile(file);
    if (!absolute) { issue('MISSING_MEDIA', file, 'referenced media absent or unsafe'); return null; }
    let result = measured.get(file);
    if (!result) {
      try {
        const media = probe(absolute), duration = Number(media.format?.duration);
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('no finite duration');
        result = { file, duration, codecs: (media.streams ?? []).map(s => ({ type: s.codec_type, codec: s.codec_name })),
          sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') };
        measured.set(file, result);
      } catch { issue('UNREADABLE_MEDIA', file, 'ffprobe could not read a positive media duration'); return null; }
    }
    if (Number.isFinite(expectedDuration) && Math.abs(result.duration - expectedDuration) > 0.08)
      issue('DURATION_MISMATCH', file, `metadata ${expectedDuration}s, measured ${result.duration}s (tolerance 80ms)`);
    return result;
  };
  const catalog = readJSON('media/catalog.json');
  // Entries marked "pending" are drafts held back from this release (not bundled, not shipped).
  const films = catalog?.films?.filter(f => !f.dev && f.status !== 'pending') ?? [];
  const pendingFilms = catalog?.films?.filter(f => f.status === 'pending').map(f => f.id) ?? [];
  if (films.length < 1) issue('CATALOG_INCOMPLETE', 'media/catalog.json', 'at least one reviewed real film excerpt required for this submission');
  for (const film of films) {
    const pkg = readJSON(film.package);
    if (!pkg) continue;
    for (const error of validatePackage(pkg)) issue('PACKAGE_INVALID', film.package, error);
    if (['scenes', 'dialogue', 'events', 'cues'].some(k => !Array.isArray(pkg[k]))) continue;
    if (pkg.id !== film.id) issue('ID_MISMATCH', film.package, 'package and catalog IDs differ');
    if (pkg.pipeline?.mode !== 'live') issue('AWS_PROVENANCE', film.package, 'live pipeline provenance required; offline tones cannot ship');
    if (pkg.approval?.method !== 'interactive' || !pkg.approval?.reviewer?.trim() || !pkg.approval?.approvedAt)
      issue('HUMAN_REVIEW', film.package, 'dated human interactive review required; automated approval is insufficient');
    if (!pkg.cues?.length || !pkg.events?.some(e => e.critical)) issue('EMPTY_DESCRIPTION', film.package, 'real reviewed cues and a critical event required');
    const approved = pkg.approval?.integrity;
    if (approved?.schemaVersion !== 1 || !approved.artifacts || !approved.sourceSha256)
      issue('APPROVAL_INTEGRITY', film.package, 'review fingerprints required; review the final artifacts again');
    const pick = (item, keys) => Object.fromEntries(keys.map(k => [k, item[k]]));
    const contract = { duration: pkg.duration, scenes: pkg.scenes, dialogue: pkg.dialogue,
      events: (pkg.events ?? []).map(e => pick(e, ['id', 'scene', 'availableAt', 'critical'])),
      cues: (pkg.cues ?? []).map(c => pick(c, ['id', 'events', 'start', 'end', 'margin'])) };
    if (canonical(contract) !== canonical(pkg.approval?.playback))
      issue('APPROVED_TIMING_CHANGED', film.package, 'facts or playback timing differ from the review');
    const approvedAudio = (key, variant, measuredAudio) => {
      const expected = approved?.artifacts?.[key];
      if (!expected || expected.duration !== variant?.duration || expected.textSha256 !== textHash(variant?.text) ||
          (measuredAudio && expected.audioSha256 !== measuredAudio.sha256))
        issue('APPROVED_CONTENT_CHANGED', variant?.audio ?? film.package, 'script or audio differs from the reviewed artifact');
    };
    const video = inspect(pkg.video, pkg.duration);
    if (video && video.sha256 !== approved?.sourceSha256)
      issue('APPROVED_SOURCE_CHANGED', pkg.video, 'source differs from the reviewed film');
    if (video && video.sha256 !== pkg.pipeline?.sourceSha256) issue('SOURCE_CHANGED', pkg.video, 'packaged source no longer matches pipeline checksum');
    const webm = typeof pkg.video === 'string' ? pkg.video.replace(/\.mp4$/, '.webm') : null;
    const rendition = webm !== pkg.video ? inspect(webm, pkg.duration) : null;
    if (!rendition || !rendition.codecs.some(c => c.type === 'video' && c.codec === 'vp8') || !rendition.codecs.some(c => c.type === 'audio' && c.codec === 'opus'))
      issue('VEGA_RENDITION', webm, 'VP8 video and Opus audio rendition required for the tested simulator path');
    if (rendition) {
      const provenance = readJSON(`${webm}.json`);
      if (provenance?.sourceSha256 !== approved?.sourceSha256 || provenance?.renditionSha256 !== rendition.sha256)
        issue('RENDITION_CHANGED', webm, 'rendition must be bound to the reviewed source and current bytes');
    }
    for (const cue of pkg.cues ?? []) for (const level of LEVELS) {
      const variant = cue.variants?.[level];
      const audio = inspect(variant?.audio, variant?.duration);
      approvedAudio(`cue:${cue.id}:${level}`, variant, audio);
      if (audio && audio.duration + 2 * cue.margin + (pkg.pipeline?.fitSlackSeconds ?? 0) > cue.end - cue.start + 0.001)
        issue('AUDIO_DOES_NOT_FIT', variant.audio, 'measured narration exceeds the guarded window');
    }
    for (const event of pkg.events ?? []) {
      const audio = inspect(event.recovery?.audio, event.recovery?.duration);
      approvedAudio(`recovery:${event.id}`, event.recovery, audio);
    }
    if (!pkg.credits?.trim()) issue('CREDIT_MISSING', film.package, 'film credit must be visible in the app');
    if (!safeFile(`content/rights/${film.id}.txt`)) issue('RIGHTS_RECORD', film.package, 'committed film rights record missing');
    assets.push({ id: pkg.id, version: pkg.version, cues: pkg.cues?.length ?? 0, humanReview: pkg.approval ?? null, pipeline: pkg.pipeline?.mode });
  }
  const expected = readJSON('pipeline/prompts.json') ?? {};
  const prompts = readJSON('media/prompts/prompts.json') ?? {};
  const provenance = readJSON('media/prompts/provenance.json');
  if (provenance?.mode !== 'live') issue('PROMPT_PROVENANCE', 'media/prompts/provenance.json', 'real Polly guidance clips required');
  for (const [id, text] of Object.entries(expected)) {
    const clip = prompts[id];
    if (!clip) { issue('GUIDANCE_MISSING', id, 'spoken guidance cannot rely on simulator speechSynthesis'); continue; }
    if (clip.text !== text.replace(/\s+/g, ' ').trim()) issue('GUIDANCE_STALE', id, 'spoken text no longer matches the interface prompt');
    inspect(clip.audio, clip.duration);
  }
  return { schemaVersion: 1, checkedAt: new Date().toISOString(), ready: issues.length === 0, assets, pendingFilms,
    guidanceClips: Object.keys(prompts).length, media: [...measured.values()], issues,
    scope: 'File/provenance/duration checks only. Audible timing, VoiceView and viewer benefit require recorded observations.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkRelease();
  const outIndex = process.argv.indexOf('--report');
  if (outIndex >= 0) {
    const out = process.argv[outIndex + 1];
    if (!out) throw new Error('--report needs a path');
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(`${result.ready ? 'READY' : 'NOT READY'}: ${result.assets.length} packaged real film(s)${result.pendingFilms.length ? ` (pending, not shipped: ${result.pendingFilms.join(', ')})` : ''}; ${result.guidanceClips} guidance clips.`);
  for (const issue of result.issues) console.error(`${issue.code}: ${issue.file}: ${issue.detail}`);
  process.exitCode = result.ready ? 0 : 1;
}
