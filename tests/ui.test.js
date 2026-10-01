// Remote-flow regression tests: the real bundle in jsdom with stubbed media.
// They check what a viewer who cannot see the screen depends on: where focus
// lands after every transition, and what Sema says.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

execFileSync('node', ['tools/bundle.js'], { stdio: 'ignore' });
const html = fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*><\/script>/g, '');
const bundle = fs.readFileSync('src/bundle.js', 'utf8');
const fixture = JSON.parse(fs.readFileSync('media/fixture/package.json', 'utf8'));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const CHOSEN = { level: 'standard', chosen: true, guidance: true };
const promptTexts = JSON.parse(fs.readFileSync('pipeline/prompts.json', 'utf8'));
const windows = [];
afterEach(async () => { await flush(); await flush(); while (windows.length) windows.pop().close(); });

function boot({ prefs, search = '', films, resume } = {}) {
  const dom = new JSDOM(html, { url: `http://localhost/${search}`, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window, audios = [];
  windows.push(w);
  const proto = w.HTMLMediaElement.prototype;
  Object.defineProperty(proto, 'currentTime', { get() { return this._t ?? 0; }, set(v) { this._t = v; }, configurable: true });
  Object.defineProperty(proto, 'readyState', { get() { return 4; }, configurable: true });
  proto.play = function () { this._playing = true; setTimeout(() => this.dispatchEvent(new w.Event('playing'))); return Promise.resolve(); };
  proto.pause = function () { this._playing = false; };
  proto.load = function () { if (this.tagName === 'AUDIO') setTimeout(() => this.dispatchEvent(new w.Event('canplay'))); };
  w.Audio = function (src) { const a = w.document.createElement('audio'); if (src) a.src = src; audios.push(a); return a; };
  let fetched = false; w.fetch = () => { fetched = true; return Promise.reject(new Error('no fetch')); };
  if (prefs) w.localStorage.setItem('sema-prefs-v1', JSON.stringify(prefs));
  if (resume) w.localStorage.setItem(`sema-resume-v2:${fixture.id}`, JSON.stringify(resume));
  w.SEMA_TEST = true;
  w.SEMA_DATA = { films: films ?? [{ package: fixture, poster: null, dev: false, allowFixture: true }], prompts: {}, promptTexts };
  w.eval(bundle);
  const $ = id => w.document.getElementById(id);
  const active = () => w.document.activeElement?.id || w.document.activeElement?.tagName;
  const key = (k, extra = {}) => (w.document.activeElement ?? w.document.body).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  const video = $('film');
  const at = async t => { video.currentTime = t; w.__sema.loop(); await flush(); await flush(); };
  const finishAudio = async () => { await flush(); await flush(); audios.at(-1).dispatchEvent(new w.Event('ended')); await flush(); };
  return { w, $, app: w.__sema, audios, active, key, at, finishAudio, video, fetched: () => fetched };
}
async function playing(s) { s.$(`film-${fixture.id}`).click(); s.$('resume').click(); await flush(); await flush(); assert.equal(s.app.player.mode, 'playing'); }

test('launch focuses the first film and never fetches at runtime', () => {
  const s = boot();
  assert.equal(s.active(), `film-${fixture.id}`);
  assert.equal(s.fetched(), false);
});

test('first run: onboarding focuses the suggested level, then Play', () => {
  const s = boot();
  s.$(`film-${fixture.id}`).click();
  assert.equal(s.app.view, 'welcome');
  assert.equal(s.active(), 'choose-standard');
  s.$('choose-rich').click();
  assert.equal(s.app.view, 'player');
  assert.equal(s.active(), 'resume');
  assert.equal(s.$('resume').textContent, 'Play film');
  assert.equal(JSON.parse(s.w.localStorage.getItem('sema-prefs-v1')).level, 'rich');
  assert.equal(s.app.player.level, 'rich');
});

test('core loop: interrupt, recover, resume — focus is never lost', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(2.6);
  assert.ok(s.app.narration, 'Standard cue requested from the media clock');
  s.w.document.activeElement.blur();
  s.key('Enter');                                   // Select during playback
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.active(), 'recover');
  assert.match(s.$('recover').textContent, /1 missed/);
  assert.match(s.$('status').textContent, /What did I miss is selected/);
  s.$('recover').click();
  assert.equal(s.app.player.mode, 'recovering');
  assert.equal(s.active(), 'recover');
  await s.finishAudio();
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'delivered');
  assert.equal(s.active(), 'resume');
  assert.match(s.$('status').textContent, /Resume is selected/);
  s.$('resume').click(); await flush();
  assert.equal(s.app.player.mode, 'playing');
});

test('end of film is announced and focused even when the clock reaches the end first', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(2.6); await s.finishAudio();
  await s.at(9.6); await s.finishAudio();
  await s.at(15);
  assert.equal(s.app.player.mode, 'ended');
  assert.notEqual(s.active(), 'BODY');
  assert.match(s.$('status').textContent, /film has ended/);
  assert.equal(s.$('resume').getAttribute('aria-disabled'), 'true');
});

test('Back pauses, Back again returns to the catalog with focus on the same film; reopening offers resume', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(1.5);
  s.w.document.activeElement.blur();
  s.key('Escape');
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.active(), 'return');
  s.key('Escape');
  assert.equal(s.app.view, 'catalog');
  assert.equal(s.active(), `film-${fixture.id}`);
  s.$(`film-${fixture.id}`).click();
  assert.equal(s.active(), 'resume');
  assert.match(s.$('resume').textContent, /Resume from 0:01/);
});

test('an arrow press with nothing focused lands on the default control, not "Off"', async () => {
  const s = boot({ prefs: CHOSEN });
  s.$(`film-${fixture.id}`).click();
  s.w.document.activeElement.blur();
  s.key('ArrowDown');
  assert.equal(s.active(), 'resume');
});

test('with guidance off, status is announced through a live region but recovery text is not doubled', async () => {
  const s = boot({ prefs: { ...CHOSEN, guidance: false } });
  await playing(s);
  await s.at(2.6);
  s.w.document.activeElement.blur(); s.key('Enter');
  assert.equal(s.$('announcer').getAttribute('aria-live'), 'polite');
  assert.match(s.$('announcer').textContent, /What did I miss/);
  s.$('recover').click();
  assert.equal(s.$('announcer').textContent, '');
});

test('asking twice about one scene offers Rich once, while already paused', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(2.6); await s.finishAudio();           // envelope cue delivered
  for (let i = 0; i < 2; i++) {
    await s.at(5 + i);
    s.w.document.activeElement?.blur(); s.key('Enter');
    s.$('recover').click(); await s.finishAudio();
    if (i === 0) { assert.equal(s.active(), 'resume'); s.$('resume').click(); await flush(); }
  }
  assert.equal(s.w.document.activeElement.dataset.level, 'rich');
  assert.ok(s.app.player.log.some(e => e.type === 'suggestion-offered'));
});

test('a package that fails validation is listed as unavailable and cannot play', () => {
  const broken = { ...fixture, id: 'broken', cues: [] };
  const s = boot({ films: [{ package: broken, poster: null, dev: false, allowFixture: true }] });
  const card = s.$('film-broken');
  assert.ok(card.classList.contains('blocked'));
  assert.match(card.getAttribute('aria-label'), /Unavailable/);
  card.click();
  assert.equal(s.app.view, 'catalog');
  assert.match(s.$('status').textContent, /did not pass its checks|failed its checks/);
});

test('fixed-Standard study mode hides elective controls but keeps critical recovery', async () => {
  const s = boot({ prefs: { ...CHOSEN, level: 'rich' }, search: '?study=fixed' });
  await playing(s);
  assert.equal(s.app.player.level, 'standard');
  assert.equal(s.$('level-group').hidden, true);
  await s.at(2.6);
  s.w.document.activeElement.blur(); s.key('Enter');
  assert.equal(s.$('recover').hidden, false, 'pending critical recovery stays available');
});

test('a changed package version discards the old resume point', () => {
  const s = boot({ prefs: CHOSEN, resume: { asset: fixture.id, version: 'old', position: 6, level: 'standard', delivery: {}, attempted: [] } });
  s.$(`film-${fixture.id}`).click();
  assert.equal(s.app.player.position, 0);
  assert.match(s.$('status').textContent, /updated since you last watched/);
});

test('a jump past a cue window marks the critical fact recoverable instead of silently ending', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(2.6); await s.finishAudio();
  await s.at(15);
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.active(), 'recover');
  assert.match(s.$('status').textContent, /interrupted/);
});

test('resuming at the end is refused with a spoken reason, not a silent no-op', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(2.6); await s.finishAudio(); await s.at(9.6); await s.finishAudio(); await s.at(15);
  s.$('resume').click(); await flush();
  assert.equal(s.app.player.mode, 'ended');
  assert.match(s.$('status').textContent, /film has ended/);
});

test('D-pad moves within rows and between adjacent rows (layout measured on the Vega Virtual Device)', () => {
  const s = boot({ prefs: CHOSEN });
  s.$(`film-${fixture.id}`).click();
  // Button rectangles from docs/vega/screenshots (1920x1080 WebView), which exposed row-skipping.
  const layout = {
    '[data-level="off"]': [106, 238, 727, 790], '[data-level="essential"]': [250, 397, 727, 790],
    '[data-level="standard"]': [409, 543, 727, 790], '[data-level="rich"]': [556, 690, 727, 790],
    '#resume': [106, 356, 807, 852], '#recover': [368, 607, 807, 852], '#restart': [619, 733, 807, 852], '#return': [747, 914, 807, 852],
    '#controls [data-toggle="text"]': [106, 268, 868, 910], '#controls [data-toggle="guidance"]': [280, 445, 868, 910], '#help': [457, 602, 868, 910],
  };
  for (const [selector, [left, right, top, bottom]] of Object.entries(layout)) {
    s.w.document.querySelector(selector).getBoundingClientRect = () => ({ left, right, top, bottom, x: left, y: top, width: right - left, height: bottom - top });
  }
  const from = (selector, keyName) => { s.w.document.querySelector(selector).focus(); s.key(keyName); return s.w.document.activeElement; };
  assert.equal(from('#resume', 'ArrowRight').id, 'recover', 'Right stays in the action row');
  assert.equal(from('[data-level="essential"]', 'ArrowDown').id, 'resume', 'Down goes to the next row, not two rows');
  assert.equal(from('[data-level="rich"]', 'ArrowDown').id, 'restart', 'Down picks the action-row button most directly below');
  assert.equal(from('#controls [data-toggle="guidance"]', 'ArrowUp').id, 'recover', 'Up does not skip the action row');
  assert.equal(from('#controls [data-toggle="text"]', 'ArrowUp').id, 'resume');
  assert.equal(from('#recover', 'ArrowUp').dataset.level, 'standard');
  assert.equal(from('#return', 'ArrowRight').id, 'return', 'Right at the row end stays put');
});
