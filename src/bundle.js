(()=>{
// src/package.js
const LEVELS = ['essential', 'standard', 'rich'];
const finite = n => Number.isFinite(n);
const safePath = p => typeof p === 'string' && /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(p) && !p.includes('..');

/** Publication is strict by default; fixture use must be explicit. */
function validatePackage(p, { allowFixture = false } = {}) {
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

// src/playback.js

/** Pure media-clock state machine. Audio/UI side effects belong to the adapter. */
class Playback {
  constructor(asset, { allowFixture = false } = {}) {
    const errors = validatePackage(asset, { allowFixture });
    if (errors.length) throw new Error(errors.join('\n'));
    this.asset = asset; this.level = 'standard'; this.mode = 'catalog';
    this.position = 0; this.epoch = 0; this.active = null;
    this.attempted = new Set(); this.delivery = new Map(); this.log = [];
    for (const e of asset.events) this.delivery.set(e.id, 'not-due');
  }
  record(type, detail = {}) {
    this.log.push({ type, position: this.position, ...detail });
    if (this.log.length > 2000) this.log.shift();
  }
  pending() { return this.asset.events.filter(e => e.availableAt <= this.position && this.delivery.get(e.id) === 'pending').sort((a,b) => a.availableAt-b.availableAt); }
  enter() { this.mode = 'controls'; this.record('open'); }
  resume() {
    if (this.mode === 'catalog' || this.mode === 'error' || this.position >= this.asset.duration) return false;
    this.cancel('resume'); this.mode = 'playing'; this.record('resume'); return true;
  }
  cancel(reason) {
    if (this.active) {
      for (const id of this.active.events) {
        if (this.asset.events.find(e => e.id === id)?.critical && this.delivery.get(id) !== 'delivered') this.delivery.set(id, 'pending');
      }
      this.record('audio-cancel', { reason, token: this.active.token });
    }
    this.active = null; this.epoch++;
  }
  controls(reason = 'menu') { this.cancel(reason); this.mode = 'controls'; this.record('pause', { reason }); }
  catalog() { this.cancel('catalog'); this.mode = 'catalog'; this.record('catalog'); }
  fail(reason) { this.cancel(reason); this.mode = 'error'; this.record('error', { reason }); }
  setLevel(level) {
    if (!['off', ...LEVELS].includes(level)) throw new Error('Unknown level');
    this.controls('level'); this.level = level;
    if (level === 'off') for (const e of this.pending()) this.delivery.set(e.id, 'bypassed');
    this.record('level', { level });
  }
  seek(to) {
    if (!Number.isFinite(to)) throw new Error('Seek position must be finite');
    const old = this.position;
    // Narration in progress is part of what a forward seek deliberately skips.
    const inFlight = new Set(this.active?.kind === 'cue' ? this.active.events : []);
    this.cancel('seek');
    this.position = Math.max(0, Math.min(this.asset.duration, to));
    if (this.position < old) {
      for (const e of this.asset.events) if (e.availableAt > this.position) this.delivery.set(e.id, 'not-due');
    } else {
      // Only the skipped period is bypassed. Critical facts the player lost
      // before the seek stay pending; the viewer never chose to skip them.
      for (const e of this.asset.events) {
        if (e.availableAt > this.position) continue;
        const state = this.delivery.get(e.id);
        if (state === 'not-due' || inFlight.has(e.id)) this.delivery.set(e.id, 'bypassed');
      }
    }
    this.attempted = new Set(this.asset.cues.filter(c => c.start + c.margin < this.position).map(c => c.id));
    this.mode = 'controls'; this.record('seek', { from: old });
  }
  restart() {
    this.cancel('restart'); this.position = 0; this.attempted.clear();
    for (const e of this.asset.events) this.delivery.set(e.id, 'not-due');
    this.mode = 'controls'; this.record('restart');
  }
  tick(position) {
    if (!Number.isFinite(position) || this.mode !== 'playing') return null;
    this.position = Math.max(0, Math.min(position, this.asset.duration));
    if (this.active) {
      if (this.active.kind === 'cue' && this.position >= this.active.end - this.active.margin) this.controls('window-expired');
      return null;
    }
    for (const c of this.asset.cues) {
      if (this.attempted.has(c.id) || this.position < c.start+c.margin) continue;
      this.attempted.add(c.id);
      if (this.level === 'off') {
        for (const id of c.events) if (this.delivery.get(id) !== 'delivered') this.delivery.set(id, 'bypassed');
        this.record('cue-bypassed', { cue: c.id }); continue;
      }
      // A cue reached late (after buffering or a mid-window resume) may still
      // fit as a shorter reviewed variant; never rush or truncate audio.
      const order = LEVELS.slice(0, LEVELS.indexOf(this.level) + 1).reverse();
      const level = order.find(l => this.position + c.variants[l].duration + c.margin <= c.end);
      const v = c.variants[level ?? this.level];
      if (level && level !== this.level) this.record('level-fallback', { cue: c.id, from: this.level, to: level });
      if (!level) {
        for (const id of c.events) if (this.asset.events.find(e => e.id === id)?.critical && this.delivery.get(id) !== 'delivered') this.delivery.set(id, 'pending');
        this.record('late-cue', { cue: c.id });
        if (this.pending().length) { this.controls('critical-late'); return null; }
        continue;
      }
      this.active = { ...v, kind: 'cue', level, token: ++this.epoch, events: c.events, end: c.end, margin: c.margin, cue: c.id };
      this.record('audio-request', { token: this.active.token, cue: c.id, level });
      return this.active;
    }
    if (this.position >= this.asset.duration) this.mode = 'ended';
    return null;
  }
  /** Recheck the media clock at actual start; preparing audio is asynchronous. */
  canStart(token, position) {
    if (!this.active || token !== this.active.token) return false;
    if (this.active.kind === 'recovery') return this.mode === 'recovering';
    if (this.mode !== 'playing') return false;
    if (position + this.active.duration + this.active.margin > this.active.end) {
      this.position = position; this.controls('late-audio-start'); return false;
    }
    return true;
  }
  complete(token) {
    if (!this.active || this.active.token !== token) return false;
    for (const id of this.active.events) this.delivery.set(id, 'delivered');
    const recovery = this.active.kind === 'recovery';
    this.record('audio-complete', { token }); this.active = null;
    if (recovery) this.mode = 'controls';
    return true;
  }
  sceneAt(position = this.position) {
    return this.asset.scenes.find(s => position >= s.start && (position < s.end || position === this.asset.duration && s.end === position));
  }
  recover() {
    this.controls('recovery');
    const scene = this.sceneAt();
    const event = this.pending()[0] ?? this.asset.events.filter(e => e.scene === scene?.id && e.availableAt <= this.position).sort((a,b) => b.availableAt-a.availableAt)[0];
    if (!event) { this.record('recovery-unavailable'); return null; }
    this.active = { ...event.recovery, kind: 'recovery', events: [event.id], token: ++this.epoch };
    this.mode = 'recovering'; this.record('recovery', { event: event.id }); return this.active;
  }
  snapshot() {
    const delivery = Object.fromEntries(this.delivery);
    // An application termination cannot finish the audio that was in flight.
    // Persist it as recoverable without changing the live session's state.
    for (const id of this.active?.events ?? []) if (this.asset.events.find(e => e.id === id)?.critical && delivery[id] !== 'delivered') delivery[id] = 'pending';
    return { asset: this.asset.id, version: this.asset.version, position: this.position, level: this.level, delivery, attempted: [...this.attempted] };
  }
  restore(s) {
    if (!s || s.asset !== this.asset.id || s.version !== this.asset.version || !Number.isFinite(s.position) || s.position < 0 || s.position > this.asset.duration || !['off',...LEVELS].includes(s.level)) return false;
    this.cancel('restore'); this.position = s.position; this.level = s.level;
    for (const e of this.asset.events) {
      const value = s.delivery?.[e.id];
      this.delivery.set(e.id, e.availableAt > this.position ? 'not-due' : ['delivered','pending','bypassed'].includes(value) ? value : 'not-due');
    }
    this.attempted = new Set((Array.isArray(s.attempted) ? s.attempted : []).filter(id => this.asset.cues.some(c => c.id === id)));
    this.mode = 'controls'; return true;
  }
}

// src/format.js
/** m:ss for any duration; never assumes a short clip. */
function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Spoken form used in accessible names, e.g. "1 minute 12 seconds". */
function spokenDuration(seconds) {
  const s = Math.max(0, Math.round(seconds)), m = Math.floor(s / 60), r = s % 60;
  const parts = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (r || !m) parts.push(`${r} second${r === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** Prompt IDs are [a-z0-9_]; asset IDs may contain hyphens. */
const promptId = id => String(id).toLowerCase().replace(/[^a-z0-9]+/g, '_');

// src/keymap.js
/**
 * Remote and keyboard keys mapped to Sema actions. Fire TV / Vega WebView key
 * values are verified on the Vega Virtual Device (docs/vega/PLATFORM-FINDINGS.md);
 * the other codes keep desktop browsers and Android-based WebViews working.
 */
const BY_KEY = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'select', Select: 'select', Accept: 'select',
  Escape: 'back', GoBack: 'back', BrowserBack: 'back', Back: 'back',
  ContextMenu: 'menu', Menu: 'menu', m: 'menu', M: 'menu',
  MediaPlayPause: 'playpause', MediaPlay: 'play', MediaPause: 'pause',
  MediaFastForward: 'forward', FastForward: 'forward', MediaTrackNext: 'forward',
  MediaRewind: 'rewind', Rewind: 'rewind', MediaTrackPrevious: 'rewind',
};
const BY_CODE = {
  38: 'up', 40: 'down', 37: 'left', 39: 'right',
  13: 'select', 23: 'select',
  27: 'back', 4: 'back', 461: 'back', 10009: 'back',
  93: 'menu', 82: 'menu',
  179: 'playpause', 85: 'playpause', 415: 'play', 126: 'play', 127: 'pause',
  228: 'forward', 417: 'forward', 90: 'forward',
  227: 'rewind', 412: 'rewind', 89: 'rewind',
};

function actionForKey(event) {
  if (event.code === 'Space' || event.key === ' ') return 'space';
  return BY_KEY[event.key] ?? BY_CODE[event.keyCode] ?? null;
}

// src/voice.js
/**
 * Spoken guidance. Prefers pre-rendered Polly clips (same voice as the
 * narration, reliable completion events), falls back to speechSynthesis, and
 * never blocks the interface: a watchdog ends every utterance even when the
 * platform never reports completion, and any new request interrupts the last.
 */
function createVoice({ clips = {}, onChange = () => {} } = {}) {
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  let audio = null, timer = null, token = 0, speaking = false;
  const set = value => { if (speaking !== value) { speaking = value; onChange(value); } };
  function release() {
    clearTimeout(timer); timer = null;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio = null; }
  }
  function stop() {
    token++; release();
    try { synth?.cancel(); } catch { /* engine unavailable */ }
    set(false);
  }
  /** items: a prompt ID, {id, text}, or a list of them, spoken in order. */
  function say(items) {
    stop();
    const queue = (Array.isArray(items) ? items : [items]).map(i => typeof i === 'string' ? { id: i, text: clips[i]?.text } : i);
    const mine = token;
    const next = () => {
      if (mine !== token) return;
      release();
      const item = queue.shift();
      if (!item) { set(false); return; }
      set(true);
      // Completion, error and the watchdog can all fire; each item advances once.
      let settled = false;
      const advance = () => { if (!settled && mine === token) { settled = true; next(); } };
      const fallback = () => { if (!settled && mine === token) { settled = true; speak(item.text); } };
      const clip = clips[item.id];
      if (!clip) { fallback(); return; }
      const a = new Audio(clip.audio); audio = a;
      a.onended = advance; a.onerror = fallback;
      timer = setTimeout(advance, (clip.duration + 1.5) * 1000);
      try { a.play()?.catch?.(fallback); } catch { fallback(); }
    };
    const speak = text => {
      release();
      if (!synth || !text || typeof SpeechSynthesisUtterance === 'undefined') { next(); return; }
      let settled = false;
      const advance = () => { if (!settled && mine === token) { settled = true; next(); } };
      const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US';
      u.onend = u.onerror = advance;
      timer = setTimeout(advance, (text.split(/\s+/).length / 2.2 + 2) * 1000);
      try { synth.speak(u); } catch { advance(); }
    };
    next();
  }
  return { say, stop, get speaking() { return speaking; } };
}

// src/app.js

/*
 * Browser/WebView adapter for the Playback state machine. Packages arrive in
 * window.SEMA_DATA (generated by tools/bundle.js), so nothing is fetched at
 * runtime and the app works from file:// inside the Vega WebView.
 *
 * Remote contract: every view always has a focused control; spoken guidance
 * never blocks input (any action interrupts it); program audio, narration and
 * guidance never overlap because guidance only speaks while the film is paused.
 */
const $ = id => document.getElementById(id);
const DATA = window.SEMA_DATA ?? { films: [], prompts: {} };
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const FIXED = PARAMS.get('study') === 'fixed';
const CLIPS = DATA.prompts ?? {};
// Vega OS: the platform H.264/VP9 path stalls on the Virtual Device; VP8 WebM plays
// through (docs/vega/PLATFORM-FINDINGS.md). ?codec=h264 or ?codec=vp8 overrides.
const PREFER_WEBM = PARAMS.get('codec') === 'vp8' || (PARAMS.get('codec') !== 'h264' && /Kepler|Vega/i.test(navigator.userAgent));
const video = $('film');

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: playback still works */ } },
};
const prefs = { level: 'standard', chosen: false, guidance: true, textMode: false, ...store.get('sema-prefs-v1', {}) };
if (![...LEVELS, 'off'].includes(prefs.level)) prefs.level = 'standard';
const savePrefs = () => store.set('sema-prefs-v1', prefs);
const resumeKey = id => `sema-resume-v2:${id}`;

const films = (DATA.films ?? []).filter(f => DEBUG || !f.dev).map(f => ({
  ...f, errors: validatePackage(f.package, { allowFixture: !!f.allowFixture }),
}));

let view = 'catalog', film = null, player = null, lastFilmId = films[0]?.package.id ?? null;
let narration = null, lastSaved = 0, sawPlaying = false, bufferTimer = null, endedHandled = false;
let suppressFocusSpeech = false, focusSpeechTimer = null, sceneAsks = { scene: null, count: 0 }, suggested = false;
let pendingFocusSpeechTarget = null;
const voice = createVoice({ clips: CLIPS });

/* ---------- speech and status ---------- */
const clipText = id => CLIPS[id]?.text ?? DATA.promptTexts?.[id] ?? '';
/** ids: prompt ID, {id, text}, or a list of them. */
function say(ids, visible) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(i => typeof i === 'string' ? { id: i, text: clipText(i) } : i);
  setStatus(visible ?? list.map(i => i.text).join(' '));
  if (prefs.guidance) voice.say(list);
}
/** Visible status, mirrored to a screen-reader live region when guidance is off. */
function setStatus(message, { announce = true } = {}) {
  $('status').textContent = message;
  $('announcer').textContent = announce ? message : '';
}

const atEnd = () => !!player && player.position >= film.duration - 0.05;

/* ---------- focus ---------- */
const shown = el => !!el && !el.closest('[hidden]') && el.getAttribute('aria-disabled') !== 'true';
function focusOn(id) {
  const el = typeof id === 'string' ? $(id) : id;
  const target = shown(el) ? el : $(defaultFocusId());
  if (!shown(target)) return;
  suppressFocusSpeech = true; target.focus(); suppressFocusSpeech = false;
}
function defaultFocusId() {
  if (view === 'catalog') return lastFilmId ? `film-${lastFilmId}` : 'film-list';
  if (view === 'welcome') return `choose-${prefs.chosen ? prefs.level : 'standard'}`;
  if (!player) return 'return';
  const pending = player.pending().length > 0;
  if (player.mode === 'error') return 'retry';
  if (player.mode === 'recovering') return 'recover';
  if (player.mode === 'ended' || atEnd()) return pending ? 'recover' : 'return';
  return pending ? 'recover' : 'resume';
}
function currentView() { return view === 'catalog' ? $('catalog') : view === 'welcome' ? $('welcome') : $('controls'); }
function ensureFocus() {
  if (view === 'player' && player?.mode === 'playing') return;
  const active = document.activeElement;
  if (!active || active === document.body || !currentView().contains(active) || !shown(active)) focusOn(defaultFocusId());
}
function moveFocus(direction) {
  const scope = currentView();
  const items = [...scope.querySelectorAll('button')].filter(shown);
  const from = document.activeElement;
  if (!items.includes(from)) { focusOn(defaultFocusId()); speakFocused(); return; }
  const next = nearestInDirection(from.getBoundingClientRect(), items.filter(v => v !== from).map(v => ({ v, r: v.getBoundingClientRect() })), direction)?.v;
  if (next) next.focus();
  else if (prefs.guidance) speakFocused();  // at an edge: repeat where the viewer is instead of silence
}
/**
 * Spatial navigation. Wide buttons make centre-distance scoring jump rows
 * (observed on the Vega Virtual Device), so score by edge gap, and treat any
 * overlap on the perpendicular axis as "same row/column", which always wins.
 */
function nearestInDirection(from, candidates, direction) {
  const horizontal = direction === 'left' || direction === 'right';
  const gap = b => ({ right: b.left - from.right, left: from.left - b.right, down: b.top - from.bottom, up: from.top - b.bottom })[direction];
  const [lo, hi, blo, bhi] = horizontal ? ['top', 'bottom', 'top', 'bottom'] : ['left', 'right', 'left', 'right'];
  const centre = (b, a, z) => (b[a] + b[z]) / 2;
  return candidates.map(c => {
    const separation = Math.max(0, Math.max(from[lo], c.r[blo]) - Math.min(from[hi], c.r[bhi]));  // 0 when they overlap
    const offset = Math.abs(centre(c.r, blo, bhi) - centre(from, lo, hi));
    return { ...c, forward: gap(c.r), score: gap(c.r) + 1000 * separation + 0.01 * offset };
  }).filter(c => c.forward > -1).sort((a, b) => a.score - b.score)[0];
}
function speakFocused() {
  const el = document.activeElement;
  if (el?.dataset?.say) voice.say({ id: el.dataset.say, text: el.getAttribute('aria-label') || el.textContent });
}
document.addEventListener('focusin', event => {
  if (suppressFocusSpeech || !prefs.guidance) return;
  if (view === 'player' && ['playing', 'recovering'].includes(player?.mode)) return;
  // Coalesce rapid movement: only the control the viewer settles on is spoken.
  pendingFocusSpeechTarget = event.target;
  clearTimeout(focusSpeechTimer);
  focusSpeechTimer = setTimeout(() => { if (document.activeElement === pendingFocusSpeechTarget) speakFocused(); }, 180);
});

/* ---------- rendering ---------- */
function setAvailable(el, available) { el.setAttribute('aria-disabled', String(!available)); el.classList.toggle('unavailable', !available); }
function renderToggles() {
  document.querySelectorAll('[data-toggle="text"]').forEach(b => {
    b.textContent = `Description text: ${prefs.textMode ? 'on' : 'off'}`; b.setAttribute('aria-pressed', String(prefs.textMode));
    b.dataset.say = prefs.textMode ? 'label_text_on' : 'label_text_off';
  });
  document.querySelectorAll('[data-toggle="guidance"]').forEach(b => {
    b.textContent = `Spoken guidance: ${prefs.guidance ? 'on' : 'off'}`; b.setAttribute('aria-pressed', String(prefs.guidance));
    b.dataset.say = prefs.guidance ? 'label_guidance_on' : 'label_guidance_off';
  });
  // With guidance off, a screen reader announces status changes instead.
  $('announcer').setAttribute('aria-live', prefs.guidance ? 'off' : 'polite');
}
function render() {
  $('catalog').hidden = view !== 'catalog';
  $('welcome').hidden = view !== 'welcome';
  $('player').hidden = view !== 'player';
  document.body.classList.toggle('watching', view === 'player');
  renderToggles();
  if (view === 'player' && player) {
    const mode = player.mode, pending = player.pending().length;
    $('controls').hidden = mode === 'playing';
    $('control-title').textContent = film.title ?? film.id;
    $('mode-label').textContent = { recovering: 'DESCRIBING WHAT YOU MISSED', ended: 'FILM ENDED', error: 'PLAYBACK PROBLEM' }[mode] ?? 'PAUSED';
    $('position').textContent = `${formatTime(player.position)} / ${formatTime(film.duration)}`;
    const resume = $('resume'), atStart = player.position < 0.25;
    resume.textContent = pending ? 'Resume without recovering' : atStart ? 'Play film' : `Resume from ${formatTime(player.position)}`;
    resume.dataset.say = pending ? 'label_resume_skip' : atStart ? 'label_play' : 'label_resume';
    setAvailable(resume, mode !== 'error' && mode !== 'ended' && !atEnd());
    const recover = $('recover');
    recover.textContent = pending ? `What did I miss? (${pending} missed)` : 'What did I miss?';
    recover.dataset.say = pending ? 'label_recover_pending' : 'label_recover';
    recover.hidden = FIXED && !pending && mode !== 'recovering';
    setAvailable(recover, mode !== 'error');
    $('retry').hidden = mode !== 'error';
    $('level-group').hidden = FIXED;
    document.querySelectorAll('[data-level]').forEach(b => {
      const selected = b.dataset.level === player.level;
      b.setAttribute('aria-pressed', String(selected));
      b.dataset.say = `label_level_${b.dataset.level}${selected ? '_selected' : ''}`;
    });
  }
  document.querySelectorAll('[data-choose-level]').forEach(b => b.setAttribute('aria-pressed', String(prefs.chosen && b.dataset.chooseLevel === prefs.level)));
  ensureFocus();
}
function renderCatalog() {
  const list = $('film-list'); list.textContent = '';
  for (const f of films) {
    const p = f.package, b = document.createElement('button');
    b.className = 'film'; b.id = `film-${p.id}`; b.dataset.film = p.id; b.dataset.say = `film_${promptId(p.id)}`;
    b.setAttribute('aria-label', `${p.title ?? p.id}. ${spokenDuration(p.duration)}. ${f.errors.length ? 'Unavailable.' : 'Audio description available.'} ${p.synopsis ?? ''}`.trim());
    if (f.errors.length) b.classList.add('blocked');  // still focusable, so the reason can be heard
    const art = document.createElement('span'); art.className = 'art'; art.setAttribute('aria-hidden', 'true');
    if (f.poster) { const img = document.createElement('img'); img.src = f.poster; img.alt = ''; art.append(img); }
    const copy = document.createElement('span'); copy.className = 'film-copy';
    const badge = document.createElement('span'); badge.className = 'badge';
    badge.textContent = f.errors.length ? 'UNAVAILABLE · PACKAGE CHECK FAILED' : f.dev ? 'ENGINEERING FIXTURE' : 'AUDIO DESCRIPTION · 3 LEVELS';
    const title = document.createElement('strong'); title.textContent = p.title ?? p.id;
    const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = `${formatTime(p.duration)} · ${p.synopsis ?? ''}`;
    const credit = document.createElement('span'); credit.className = 'credit'; credit.textContent = p.credits ?? '';
    copy.append(badge, title, meta, credit); b.append(art, copy);
    b.addEventListener('click', () => openFilm(p.id));
    list.append(b);
  }
  const reviewed = films.filter(f => f.package.reviewStatus === 'approved').length;
  $('catalog-note').textContent = films.length
    ? `${films.length} film${films.length === 1 ? '' : 's'}. ${reviewed ? 'Descriptions drafted with Amazon Bedrock, voiced with Amazon Polly, and approved by a human reviewer.' : 'Engineering fixture only; not reviewed for publication.'}`
    : 'No films are packaged yet. Run the authoring pipeline, then npm run bundle.';
}

/* ---------- persistence ---------- */
function persist() { if (film && player) store.set(resumeKey(film.id), player.snapshot()); }

/* ---------- narration ---------- */
function stopNarration() {
  if (narration) { narration.onended = null; narration.onerror = null; narration.pause(); narration.removeAttribute('src'); }
  narration = null; $('caption').hidden = true;
}
function showCaption(text) { $('caption').textContent = text; $('caption').hidden = !prefs.textMode; }
function playNarration(cue) {
  stopNarration();
  const audio = new Audio(cue.audio); narration = audio; audio.preload = 'auto';
  const current = () => narration === audio && player?.active?.token === cue.token;
  audio.onended = () => {
    if (!current()) return;
    player.complete(cue.token); stopNarration(); persist();
    if (cue.kind === 'recovery') onRecoveryComplete(); else render();
  };
  audio.onerror = () => { if (current()) fail('error_audio'); };
  audio.addEventListener('canplay', () => {
    if (!current()) return;
    if (!player.canStart(cue.token, cue.kind === 'recovery' ? player.position : video.currentTime)) { stopNarration(); pauseForLoss(); return; }
    audio.play().then(() => {
      if (!current()) { audio.pause(); return; }
      player.record('audio-start', { token: cue.token, mediaPosition: video.currentTime });
      showCaption(cue.text);
    }).catch(() => { if (current()) fail('error_audio'); });
  }, { once: true });
  audio.load?.();
}

/* ---------- state transitions ---------- */
function openControls(reason, prompt, focusId) {
  if (!player || view !== 'player') return;
  clearTimeout(bufferTimer);
  video.pause(); stopNarration(); voice.stop();
  player.position = video.currentTime; player.controls(reason);
  render(); focusOn(focusId); say(prompt); persist();
}
function pauseForLoss() {
  video.pause(); stopNarration();
  if (player.mode === 'playing') player.controls('critical-late');
  render();
  if (player.pending().length) { focusOn('recover'); say('interrupted'); } else { focusOn('resume'); say('paused_resume'); }
  persist();
}
async function resume() {
  if (!player || view !== 'player' || player.mode === 'error') return;
  if (player.mode === 'ended' || atEnd()) { focusOn(defaultFocusId()); say(player.pending().length ? 'film_ended_pending' : 'film_ended'); return; }
  voice.stop(); stopNarration();
  if (player.mode === 'recovering') player.controls('cancel-recovery');
  if (!player.resume()) return;
  endedHandled = false; sawPlaying = false;
  render(); document.activeElement?.blur();
  await startVideo();
}
/** play() can reject, or (observed on the Vega Virtual Device after a seek) never settle. */
async function startVideo() {
  const generation = player;
  const started = await Promise.race([
    video.play().then(() => true, () => false),
    new Promise(resolve => setTimeout(() => resolve(sawPlaying), 5000)),
  ]);
  if (!started && player === generation && player.mode === 'playing' && !sawPlaying) fail('error_video');
}
function recover() {
  if (!player || view !== 'player' || player.mode === 'error') return;
  if (FIXED && !player.pending().length && player.mode !== 'recovering') { say('level_fixed'); return; }
  video.pause(); voice.stop(); stopNarration();
  if (player.mode !== 'ended' && player.mode !== 'recovering') player.position = video.currentTime;
  const cue = player.recover(); render();
  if (!cue) { focusOn('resume'); say('no_moment'); return; }
  const scene = player.sceneAt()?.id;
  sceneAsks = scene === sceneAsks.scene ? { scene, count: sceneAsks.count + 1 } : { scene, count: 1 };
  setStatus('Describing what you missed…', { announce: false });
  focusOn('recover');
  playNarration(cue); persist();
}
function onRecoveryComplete() {
  render();
  if (player.pending().length) { focusOn('recover'); say('recovery_more'); return; }
  // Adaptive suggestion: offered at most once per viewing, only while already
  // paused, after the viewer has asked about the same scene twice.
  if (!FIXED && !suggested && sceneAsks.count >= 2 && player.level !== 'rich' && player.level !== 'off') {
    suggested = true; player.record('suggestion-offered', { level: 'rich' });
    focusOn(document.querySelector('[data-level="rich"]')); say('suggest_rich'); return;
  }
  focusOn('resume'); say('recovery_complete');
}
function chooseLevel(level) {
  if (!player) return;
  if (FIXED) { say('level_fixed'); return; }
  if (player.mode === 'recovering') { stopNarration(); player.controls('cancel-recovery'); }
  video.pause(); stopNarration(); voice.stop();
  if (player.mode === 'playing') player.position = video.currentTime;
  if (suggested && level === 'rich') player.record('suggestion-accepted', { level });
  player.setLevel(level); prefs.level = level; prefs.chosen = true; savePrefs();
  render(); say(`level_${level}`); persist();
}
function seek(delta) {
  if (!player || view !== 'player' || player.mode === 'error') return;
  const wasPlaying = player.mode === 'playing';
  voice.stop(); stopNarration(); clearTimeout(bufferTimer);
  player.seek(video.currentTime + delta); video.currentTime = player.position; endedHandled = false;
  if (wasPlaying && player.resume()) { sawPlaying = false; render(); persist(); startVideo(); return; }
  video.pause(); render(); focusOn('resume'); say('seek_paused'); persist();
}
function startOver() {
  if (!player) return;
  video.pause(); voice.stop(); stopNarration();
  player.restart(); video.currentTime = 0; endedHandled = false; sceneAsks = { scene: null, count: 0 }; suggested = false;
  render(); focusOn('resume'); say('start_over'); persist();
}
function onEnded() {
  if (endedHandled || !player) return;
  endedHandled = true;
  if (player.mode === 'playing') player.tick(film.duration);
  video.pause(); stopNarration(); render();
  const pending = player.pending().length > 0;
  focusOn(pending ? 'recover' : 'return'); say(pending ? 'film_ended_pending' : 'film_ended'); persist();
}
function fail(prompt) {
  video.pause(); stopNarration(); voice.stop(); clearTimeout(bufferTimer);
  if (player && player.mode !== 'error') { player.position = video.currentTime || player.position; persist(); player.fail(prompt); }
  render(); focusOn('retry'); say(prompt);
}
function leave() {
  if (!player) { view = 'catalog'; render(); return; }
  video.pause(); voice.stop(); stopNarration(); clearTimeout(bufferTimer);
  if (!['error', 'ended'].includes(player.mode)) player.position = video.currentTime;
  if (player.mode !== 'error') { player.catalog(); persist(); }
  view = 'catalog'; render(); focusOn(`film-${film.id}`);
  say(['returning', { id: `film_${promptId(film.id)}`, text: `${film.title} is selected.` }]);
}
function openFilm(id) {
  const entry = films.find(f => f.package.id === id);
  if (!entry) return;
  lastFilmId = id;
  if (entry.errors.length) { say('error_package'); return; }
  voice.stop(); stopNarration();
  film = entry.package; player = new Playback(film, { allowFixture: true });
  sceneAsks = { scene: null, count: 0 }; suggested = false; endedHandled = false;
  video.src = (PREFER_WEBM && entry.webm) || film.video; video.load?.();
  const saved = store.get(resumeKey(film.id), null);
  const restored = saved ? player.restore(saved) : false;
  const changed = !!saved && !restored && saved.asset === film.id && saved.version !== film.version;
  if (saved && !restored) store.set(resumeKey(film.id), null);
  if (restored && player.position >= film.duration - 0.5) player.restart();
  player.level = FIXED ? 'standard' : prefs.level; player.enter();
  if (player.position > 0) { try { video.currentTime = player.position; } catch { /* set again on loadedmetadata */ } }
  if (!prefs.chosen && !FIXED) { view = 'welcome'; render(); focusOn('choose-standard'); say('onboarding'); return; }
  view = 'player'; render();
  if (player.pending().length) { focusOn('recover'); say('interrupted'); }
  else if (player.position > 0) { focusOn('resume'); say('resume_offer'); }
  else { focusOn('resume'); say(changed ? 'package_changed' : 'ready'); }
}
function chooseFirstLevel(level) {
  prefs.level = level; prefs.chosen = true; savePrefs();
  if (player) player.level = level;
  view = 'player'; render(); focusOn('resume');
  say([`level_${level}`, 'ready']);
}
function toggle(kind) {
  if (kind === 'text') {
    prefs.textMode = !prefs.textMode; savePrefs();
    if (!$('caption').textContent || !narration) $('caption').hidden = true; else $('caption').hidden = !prefs.textMode;
    render(); say(prefs.textMode ? 'text_on' : 'text_off');
  } else {
    // Confirm "off" in speech before going quiet; confirm "on" after.
    if (prefs.guidance) { say('prompts_off'); prefs.guidance = false; } else { prefs.guidance = true; say('prompts_on'); }
    savePrefs(); render();
  }
}

/* ---------- input ---------- */
function back() {
  if (view === 'catalog') return false;
  if (view === 'welcome') { view = 'catalog'; render(); focusOn(`film-${lastFilmId}`); say('returning'); return true; }
  if (player.mode === 'playing') { openControls('back', 'paused_return', 'return'); return true; }
  if (player.mode === 'recovering') { stopNarration(); player.controls('cancel-recovery'); render(); focusOn('resume'); say('recovery_stopped'); return true; }
  leave(); return true;
}
function playPause() {
  if (view !== 'player' || !player) return;
  if (player.mode === 'playing') openControls('transport-pause', 'paused_resume', 'resume');
  else if (player.mode === 'recovering') { stopNarration(); player.controls('cancel-recovery'); render(); focusOn('resume'); say('recovery_stopped'); }
  else resume();
}
document.addEventListener('keydown', event => {
  const action = actionForKey(event);
  if (!action) return;
  const playing = view === 'player' && player?.mode === 'playing';
  if (action === 'back') { if (back()) event.preventDefault(); return; }
  if (playing) {
    if (['select', 'menu', 'up', 'down'].includes(action)) { event.preventDefault(); openControls(action, 'paused_recover', 'recover'); return; }
    if (action === 'space') { event.preventDefault(); playPause(); return; }
  }
  if (action === 'playpause' || action === 'play' || action === 'pause') {
    event.preventDefault();
    if (action === 'playpause' || (action === 'play') !== playing) playPause();
    return;
  }
  if (action === 'forward' || action === 'rewind') { event.preventDefault(); seek(action === 'forward' ? 5 : -5); return; }
  if (action === 'menu') { event.preventDefault(); if (view === 'player') say('help'); return; }
  if (['up', 'down', 'left', 'right'].includes(action)) { event.preventDefault(); if (!playing) moveFocus(action); return; }
  if (action === 'select') {
    const active = document.activeElement;
    if (!active || active === document.body) { event.preventDefault(); ensureFocus(); speakFocused(); return; }
    // Some remotes send a non-Enter select key that does not activate buttons natively.
    if (event.key !== 'Enter' && active.tagName === 'BUTTON') { event.preventDefault(); active.click(); }
  }
});
function guarded(handler) {
  return event => {
    const el = event.currentTarget;
    if (el.getAttribute('aria-disabled') === 'true') {
      if (el.id === 'resume' && (player?.mode === 'ended' || atEnd())) say('film_ended');
      return;
    }
    handler(el);
  };
}
$('resume').addEventListener('click', guarded(resume));
$('recover').addEventListener('click', guarded(recover));
$('retry').addEventListener('click', guarded(() => openFilm(film.id)));
$('restart').addEventListener('click', guarded(startOver));
$('return').addEventListener('click', guarded(leave));
$('help').addEventListener('click', guarded(() => say('help')));
document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', guarded(el => chooseLevel(el.dataset.level))));
document.querySelectorAll('[data-choose-level]').forEach(b => { b.id = `choose-${b.dataset.chooseLevel}`; b.addEventListener('click', guarded(el => chooseFirstLevel(el.dataset.chooseLevel))); });
document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', guarded(el => toggle(el.dataset.toggle))));

/* ---------- media and lifecycle ---------- */
video.addEventListener('playing', () => { sawPlaying = true; clearTimeout(bufferTimer); });
video.addEventListener('waiting', () => {
  // Startup and post-seek waits are normal; only a stall during established
  // playback that lasts long enough to matter pauses the experience.
  if (!sawPlaying || player?.mode !== 'playing') return;
  clearTimeout(bufferTimer);
  bufferTimer = setTimeout(() => { if (player?.mode === 'playing' && video.readyState < 3) openControls('buffering', 'buffering', 'resume'); }, 900);
});
video.addEventListener('loadedmetadata', () => { if (player && Math.abs(video.currentTime - player.position) > 0.25) video.currentTime = player.position; });
video.addEventListener('error', () => { if (player && view === 'player') fail('error_video'); });
video.addEventListener('ended', onEnded);
document.addEventListener('visibilitychange', () => {
  if (!player || view !== 'player') return;
  if (document.hidden) {
    if (['playing', 'recovering'].includes(player.mode)) {
      video.pause(); stopNarration(); voice.stop();
      player.position = video.currentTime; player.controls('background'); persist(); render();
    }
  } else if (player.mode === 'controls') {
    render(); const pending = player.pending().length > 0;
    focusOn(pending ? 'recover' : 'resume'); say(pending ? 'interrupted' : 'paused_resume');
  }
});
if ('mediaSession' in navigator) {
  const handlers = { play: () => { if (player?.mode !== 'playing') playPause(); }, pause: () => { if (player?.mode === 'playing') playPause(); }, seekbackward: () => seek(-5), seekforward: () => seek(5) };
  for (const [action, handler] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ } }
}
function loop() {
  if (!player || view !== 'player' || player.mode !== 'playing') return;
  const cue = player.tick(video.currentTime);
  if (player.mode === 'ended') { onEnded(); return; }
  if (player.mode !== 'playing') { pauseForLoss(); return; }
  if (cue) playNarration(cue);
  if (performance.now() - lastSaved > 1000) { lastSaved = performance.now(); persist(); }
}
setInterval(loop, 30);

/* ---------- developer tools (?debug) ---------- */
if (DEBUG) {
  $('diagnostics').hidden = false;
  $('fault').addEventListener('click', () => openControls('injected-failure', 'interrupted', 'recover'));
  $('seek-ahead').addEventListener('click', () => seek(5));
  $('seek-back').addEventListener('click', () => seek(-5));
  $('logs').addEventListener('click', () => { $('event-log').textContent = JSON.stringify({ snapshot: player?.snapshot(), events: player?.log }, null, 2); });
}
if (FIXED) $('mode-badge').hidden = false;
if (window.SEMA_TEST) window.__sema = { loop, get player() { return player; }, get view() { return view; }, get narration() { return narration; }, voice, prefs };


/* ---------- start ---------- */
renderCatalog();
$('load-status').textContent = films.length ? '' : 'No packaged films found.';
render(); focusOn(defaultFocusId());
const first = films.find(f => f.package.id === lastFilmId)?.package;
say(first ? ['welcome', { id: `film_${promptId(first.id)}`, text: `${first.title} is selected.` }] : 'welcome');

})();
