export const LEVELS = ['essential', 'standard', 'rich'];
const finite = n => Number.isFinite(n);
const safePath = p => typeof p === 'string' && /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(p) && !p.includes('..');

/** Publication is strict by default; fixture use must be explicit. */
export function validatePackage(p, { allowFixture = false } = {}) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  check(p && typeof p === 'object', 'Package must be an object');
  if (!p || typeof p !== 'object') return errors;
  check(typeof p.id === 'string' && !!p.id, 'Asset ID required');
  check(typeof p.version === 'string', 'Version required');
  check(finite(p.duration) && p.duration > 0, 'Positive duration required');
  check(safePath(p.video), 'Safe relative video path required');
  check(p.reviewStatus === 'approved' || (allowFixture && p.reviewStatus === 'fixture'), 'Human approval required for publication');
  check(typeof p.rights === 'string' && !!p.rights, 'Rights record required');
  for (const key of ['scenes', 'events', 'cues', 'dialogue']) check(Array.isArray(p[key]), `${key} must be an array`);
  if (['scenes','events','cues','dialogue'].some(k => !Array.isArray(p[k]))) return errors;
  const events = new Map(); const cueIds = new Set();
  const range = (s,e) => finite(s) && finite(e) && s >= 0 && e > s && e <= p.duration;
  for (const [i,s] of p.scenes.entries()) {
    check(typeof s.id === 'string' && !p.scenes.slice(0,i).some(x => x.id === s.id), 'Unique scene IDs required');
    check(range(s.start,s.end), `Scene ${s.id}: invalid range`);
    check(i === 0 ? s.start === 0 : s.start === p.scenes[i-1].end, 'Scenes must be ordered and contiguous');
  }
  check(p.scenes.length > 0 && p.scenes.at(-1)?.end === p.duration, 'Scenes must cover the asset');
  for (const d of p.dialogue) check(range(d.start,d.end), 'Invalid dialogue range');
  const audio = (v, label) => {
    check(v && typeof v.text === 'string' && v.text.length > 0, `${label}: text required`);
    check(v && finite(v.duration) && v.duration > 0, `${label}: measured duration required`);
    check(v && safePath(v.audio), `${label}: safe audio path required`);
  };
  for (const e of p.events) {
    check(typeof e.id === 'string' && !events.has(e.id), 'Unique event IDs required');
    events.set(e.id, e);
    const scene = p.scenes.find(s => s.id === e.scene);
    check(scene && finite(e.availableAt) && e.availableAt >= scene.start && e.availableAt < scene.end, `Event ${e.id}: invalid availability`);
    check(typeof e.critical === 'boolean', `Event ${e.id}: critical flag required`);
    audio(e.recovery, `Event ${e.id} recovery`);
  }
  let previousEnd = 0;
  for (const c of p.cues) {
    check(typeof c.id === 'string' && !cueIds.has(c.id), 'Unique cue IDs required'); cueIds.add(c.id);
    check(range(c.start,c.end), `Cue ${c.id}: invalid window`);
    check(c.start >= previousEnd, 'Cue windows must be ordered and non-overlapping'); previousEnd = c.end;
    check(finite(c.margin) && c.margin >= 0.2, `Cue ${c.id}: at least 200 ms guard required`);
    check(Array.isArray(c.events) && c.events.length > 0, `Cue ${c.id}: event references required`);
    for (const id of c.events ?? []) check(events.has(id) && events.get(id).availableAt <= c.start, `Cue ${c.id}: unknown or future event ${id}`);
    for (const d of p.dialogue) check(c.end <= d.start || c.start >= d.end, `Cue ${c.id}: overlaps dialogue`);
    for (const level of LEVELS) {
      const v = c.variants?.[level]; audio(v, `${c.id}/${level}`);
      check(v && v.duration + 2*c.margin <= c.end-c.start, `${c.id}/${level}: rendered audio does not fit`);
    }
  }
  for (const e of p.events.filter(e => e.critical)) check(p.cues.some(c => c.events?.includes(e.id)), `Critical event ${e.id}: no playback cue`);
  return errors;
}
