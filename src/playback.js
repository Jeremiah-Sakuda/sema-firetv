import { LEVELS, validatePackage } from './package.js';

/** Pure media-clock state machine. Audio/UI side effects belong to the adapter. */
export class Playback {
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
