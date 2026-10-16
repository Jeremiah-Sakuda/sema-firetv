// Measures "What did I miss?" on the real pipeline drafts: simulate continuous
// viewing with the shipped Playback state machine, then ask for recovery every
// half second. Reports how often recovery has an answer, that no answer is ever
// a future fact, and the old shot-limited rule for comparison.
//   node tools/recovery-coverage.js [--level standard] [--report artifacts/recovery-coverage.md]
// Durations are rendered audio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Playback } from '../src/playback.js';
import { validatePackage } from '../src/package.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'pipeline/work');
const LEVELS = ['essential', 'standard', 'rich'];

/** Mirror of the pipeline's build_reviewed() + package assembly, without copying audio. */
export function draftPackage(dir) {
  const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const analysis = read('analysis.json'), script = read('script.json'), render = read('render.json'), obs = read('observations.json');
  const pkg = {
    id: path.basename(dir), version: 'draft', duration: analysis.duration, video: 'film.mp4', reviewStatus: 'fixture',
    rights: 'draft analysis', scenes: analysis.scenes, dialogue: analysis.dialogue,
    cues: script.cues.map(c => ({ id: c.id, events: c.events, start: c.start, end: c.end, margin: c.margin,
      variants: Object.fromEntries(LEVELS.map(l => { const v = render.cues[c.id][l]; return [l, { text: v.text, audio: v.audio, duration: v.duration }]; })) })),
    events: obs.events.map(e => { const r = render.recoveries[e.id]; return { id: e.id, scene: e.scene, availableAt: e.availableAt, critical: e.critical,
      recovery: { text: r.text, audio: r.audio, duration: r.duration } }; }),
  };
  // Critical events the draft could not place are review blockers; analyse them as optional and say so.
  const unplaced = [];
  for (const error of validatePackage(pkg, { allowFixture: true })) {
    const m = /^Critical event (.+): no playback cue$/.exec(error);
    if (!m) throw new Error(`${pkg.id}: draft package invalid: ${error}`);
    unplaced.push(m[1]); pkg.events.find(e => e.id === m[1]).critical = false;
  }
  return { pkg, unplaced };
}

/** The pre-Oct-5 rule: pending fact, else the latest moment in the current camera shot. */
function oldRule(p) {
  const shot = p.sceneAt();
  return p.pending()[0] ?? p.asset.events.filter(e => e.scene === shot?.id && e.availableAt <= p.position).sort((a, b) => b.availableAt - a.availableAt)[0] ?? null;
}

export function coverage(pkg, level = 'standard', step = 0.5) {
  const viewer = new Playback(pkg, { allowFixture: true });
  viewer.level = level; viewer.enter(); viewer.resume();
  const samples = [];
  let active = null;
  for (let t = 0, next = step; t <= pkg.duration + 1e-9; t = Math.round((t + 0.02) * 100) / 100) {
    if (active && t >= active.until) { viewer.complete(active.token); active = null; }
    const cue = viewer.tick(t);
    if (cue) active = { token: cue.token, until: t + cue.duration };
    if (viewer.mode !== 'playing' && viewer.mode !== 'ended') viewer.resume();  // keep watching through any pause
    if (t + 1e-9 >= next) {
      next += step;
      const snap = viewer.snapshot();  // pressing Select now: an in-flight critical cue becomes pending
      const asker = new Playback(pkg, { allowFixture: true }); asker.restore(snap);
      const before = oldRule(asker);
      const r = asker.recover();
      const event = r ? pkg.events.find(e => e.id === r.events[0]) : null;
      samples.push({ t: Math.round(t * 100) / 100, now: event?.id ?? null, future: !!event && event.availableAt > t + 1e-9, old: before?.id ?? null });
    }
  }
  const first = Math.min(...pkg.events.map(e => e.availableAt));
  const eligible = samples.filter(s => s.t >= first);
  const pct = n => eligible.length ? Math.round(1000 * n / eligible.length) / 10 : 0;
  const gaps = list => { const out = []; let start = null; for (const s of eligible) { if (!s[list] && start === null) start = s.t; if (s[list] && start !== null) { out.push([start, s.t]); start = null; } } if (start !== null) out.push([start, eligible.at(-1).t]); return out; };
  return { level, step, firstEventAt: first, samples: eligible.length,
    covered: pct(eligible.filter(s => s.now).length), coveredOld: pct(eligible.filter(s => s.old).length),
    futureFacts: eligible.filter(s => s.future).length, unansweredOld: gaps('old'), unanswered: gaps('now') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
  const levels = arg('--level') ? [arg('--level')] : LEVELS;
  const assets = fs.existsSync(WORK) ? fs.readdirSync(WORK).filter(d => !d.startsWith('_') && fs.existsSync(path.join(WORK, d, 'render.json'))) : [];
  const results = assets.map(id => { const { pkg, unplaced } = draftPackage(path.join(WORK, id)); return { id, shots: pkg.scenes.length, events: pkg.events.length, unplaced, levels: levels.map(l => coverage(pkg, l)) }; });
  const fmt = r => r.map(([a, b]) => `${a}–${b} s`).join(', ') || 'none';
  const lines = ['# "What did I miss?" coverage on the included narration', '',
    `Generated by \`node tools/recovery-coverage.js\`. Continuous viewing is simulated with the shipped \`Playback\` state machine; recovery is requested every 0.5 s from the first visual event to the end.`, '',
    '| Film | Level | Camera shots | Events | Answered (new rule) | Answered (old shot-limited rule) | Future facts |', '|---|---|---:|---:|---:|---:|---:|'];
  for (const r of results) for (const c of r.levels) lines.push(`| ${r.id} | ${c.level} | ${r.shots} | ${r.events} | **${c.covered}%** | ${c.coveredOld}% | ${c.futureFacts} |`);
  lines.push('', '## Unanswered spans (Standard)');
  for (const r of results) { const c = r.levels.find(x => x.level === 'standard') ?? r.levels[0]; lines.push(`- **${r.id}**: new rule ${fmt(c.unanswered)}; old rule ${fmt(c.unansweredOld)}.${r.unplaced.length ? ` Unplaced critical facts analysed as optional (review must resolve): ${r.unplaced.join(', ')}.` : ''}`); }
  const report = arg('--report');
  if (report) { fs.mkdirSync(path.dirname(path.resolve(report)), { recursive: true }); fs.writeFileSync(report, lines.join('\n') + '\n'); fs.writeFileSync(report.replace(/\.md$/, '.json'), JSON.stringify(results, null, 2) + '\n'); }
  console.log(lines.join('\n'));
  if (results.some(r => r.levels.some(c => c.futureFacts))) process.exitCode = 1;
}
