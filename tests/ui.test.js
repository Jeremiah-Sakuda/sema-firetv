// Remote-flow regression tests: the real bundle in jsdom with stubbed media.
// They check what a viewer who cannot see the screen depends on: where focus
// lands after every transition, and what Sema says.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBundle } from '../tools/bundle.js';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*><\/script>/g, '');
const bundle = buildBundle();  // in memory: tests never rewrite tracked build files
const fixture = JSON.parse(fs.readFileSync('media/fixture/package.json', 'utf8'));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const CHOSEN = { level: 'standard', chosen: true, guidance: true };
const promptTexts = JSON.parse(fs.readFileSync('pipeline/prompts.json', 'utf8'));
const windows = [];
afterEach(async () => { await flush(); await flush(); while (windows.length) windows.pop().close(); });

function boot({ prefs, search = '', films, resume, prompts = {} } = {}) {
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
  w.SEMA_DATA = { films: films ?? [{ package: fixture, poster: null, dev: false, allowFixture: true }], prompts, promptTexts };
  w.eval(bundle);
  const $ = id => w.document.getElementById(id);
  const active = () => w.document.activeElement?.id || w.document.activeElement?.tagName;
  const key = (k, extra = {}) => (w.document.activeElement ?? w.document.body).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  const video = $('film');
  const at = async t => { video.currentTime = t; w.__sema.loop(); await flush(); await flush(); };
  const finishAudio = async () => { await flush(); await flush(); audios.at(-1)._playing = false; audios.at(-1).dispatchEvent(new w.Event('ended')); await flush(); };
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
  assert.match(s.$('status').textContent, /^Paused\. What did I miss\?/);
  assert.equal(s.app.lastSpoken.at(-1), 'label_recover_pending', 'speech names the focused control');
  s.$('recover').click();
  assert.equal(s.app.player.mode, 'recovering');
  assert.equal(s.active(), 'recover');
  await s.finishAudio();
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'delivered');
  assert.equal(s.active(), 'resume');
  assert.match(s.$('status').textContent, /^Description complete\. Resume from 0:02/);
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

test('fixed-Standard pause announces the focused Resume when elective recovery is hidden', async () => {
  const s = boot({ prefs: CHOSEN, search: '?study=fixed' });
  await playing(s);
  await s.at(1);
  s.w.document.activeElement.blur(); s.key('Enter');
  assert.equal(s.$('recover').hidden, true);
  assert.equal(s.active(), 'resume');
  assert.equal(s.app.lastSpoken.at(-1), 'label_resume');
});

test('delayed focus speech cannot play over a recovery started before its debounce', async () => {
  const s = boot({ prefs: CHOSEN, prompts: { label_recover_pending: { text: 'What did I miss?', audio: 'focus.mp3', duration: 2 } } });
  await playing(s); await s.at(2.6);
  s.w.document.activeElement.blur(); s.key('Enter');
  s.$('resume').focus(); s.$('recover').focus();
  s.$('recover').click();
  await new Promise(resolve => setTimeout(resolve, 230));
  assert.equal(s.app.player.mode, 'recovering');
  assert.equal(s.audios.filter(a => a.src.endsWith('/focus.mp3')).length, 0);
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
    '[data-level="essential"]': [106, 238, 727, 790], '[data-level="standard"]': [250, 397, 727, 790],
    '[data-level="rich"]': [409, 543, 727, 790], '[data-level="off"]': [556, 690, 727, 790],
    '#resume': [106, 356, 807, 852], '#recover': [368, 607, 807, 852], '#restart': [619, 733, 807, 852], '#return': [747, 914, 807, 852],
    '#controls [data-toggle="text"]': [106, 268, 868, 910], '#controls [data-toggle="guidance"]': [280, 445, 868, 910], '#help': [457, 602, 868, 910],
  };
  for (const [selector, [left, right, top, bottom]] of Object.entries(layout)) {
    s.w.document.querySelector(selector).getBoundingClientRect = () => ({ left, right, top, bottom, x: left, y: top, width: right - left, height: bottom - top });
  }
  const from = (selector, keyName) => { s.w.document.querySelector(selector).focus(); s.key(keyName); return s.w.document.activeElement; };
  assert.equal(from('#resume', 'ArrowRight').id, 'recover', 'Right stays in the action row');
  assert.equal(from('[data-level="essential"]', 'ArrowDown').id, 'resume', 'Down goes to the next row, not two rows');
  assert.equal(from('[data-level="rich"]', 'ArrowDown').id, 'recover', 'Down picks the action-row button most directly below');
  assert.equal(from('#resume', 'ArrowUp').dataset.level, 'essential', 'Up from Play lands on Essential, never Off');
  assert.equal(from('#controls [data-toggle="guidance"]', 'ArrowUp').id, 'recover', 'Up does not skip the action row');
  assert.equal(from('#controls [data-toggle="text"]', 'ArrowUp').id, 'resume');
  assert.equal(from('#recover', 'ArrowUp').dataset.level, 'rich');
  assert.equal(from('#return', 'ArrowRight').id, 'return', 'Right at the row end stays put');
});

for (const action of ['help', 'menu', 'text', 'guidance-off', 'guidance-on']) {
  test(`${action} cancels recovery before guidance and keeps the critical fact pending`, async () => {
    const clips = Object.fromEntries(['recovery_stopped', 'help', 'text_on', 'prompts_on', 'prompts_off']
      .map(id => [id, { text: promptTexts[id], audio: `${id}.mp3`, duration: 2 }]));
    const s = boot({ prefs: { ...CHOSEN, guidance: action !== 'guidance-on' }, prompts: clips });
    await playing(s); await s.at(2.6);
    s.w.document.activeElement.blur(); s.key('Enter'); s.$('recover').click();
    await flush(); await flush();
    const recovery = s.app.narration;
    const staleEnd = recovery.onended;
    assert.equal(recovery._playing, true);
    if (action === 'menu') s.key('m');
    else if (action === 'help') s.$('help').click();
    else s.w.document.querySelector(`#controls [data-toggle="${action === 'text' ? 'text' : 'guidance'}"]`).click();
    await flush();
    assert.equal(recovery._playing, false);
    assert.equal(s.app.narration, null);
    assert.equal(s.app.player.mode, 'controls');
    assert.equal(s.active(), 'resume');
    assert.equal(s.app.player.delivery.get('envelope-hidden'), 'pending');
    assert.match(s.$('status').textContent, /Description stopped/);
    assert.equal(s.audios.filter(a => a._playing).length, 1, 'only the stopped-recovery confirmation plays');
    staleEnd();
    assert.equal(s.app.player.delivery.get('envelope-hidden'), 'pending', 'stale completion cannot mark it heard');
    await s.finishAudio(); await flush();
    assert.equal(s.audios.filter(a => a._playing).length, 1, 'requested guidance follows the confirmation');
    s.$('recover').click(); await s.finishAudio();
    assert.equal(s.app.player.delivery.get('envelope-hidden'), 'delivered');
  });
}

const spokenFocusMatches = s => {
  const el = s.w.document.activeElement;
  assert.ok(el && el !== s.w.document.body, 'something has focus');
  assert.equal(s.app.lastSpoken.at(-1), el.dataset.say, `speech names "${s.app.lastSpoken.at(-1)}" but focus is on ${el.id || el.dataset.level}`);
};

test('every state announcement ends with the control that actually has focus', async () => {
  const s = boot();
  spokenFocusMatches(s);                                    // launch: welcome + film
  s.$(`film-${fixture.id}`).click(); spokenFocusMatches(s);  // onboarding + suggested level
  s.$('choose-standard').click(); spokenFocusMatches(s);    // ready + Play
  s.$('resume').click(); await flush(); await flush();
  await s.at(2.6); s.w.document.activeElement.blur(); s.key('Enter'); spokenFocusMatches(s);  // paused + recover
  s.$('recover').click(); await s.finishAudio(); spokenFocusMatches(s);                      // complete + resume
  s.key('MediaFastForward'); await flush(); s.key('Enter'); spokenFocusMatches(s);            // paused after a skip
  s.key('Escape'); spokenFocusMatches(s);                   // back to catalog + film
  s.$(`film-${fixture.id}`).click(); spokenFocusMatches(s); // resume offer + Resume
  s.$('resume').click(); await flush(); await s.at(15); spokenFocusMatches(s);                 // film ended
  s.video.dispatchEvent(new s.w.Event('error')); spokenFocusMatches(s);                       // error + Try again
});

test('the Rich suggestion names Rich, and Down from it reaches the action row', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(2.6); await s.finishAudio();
  for (let i = 0; i < 2; i++) {
    await s.at(5 + i); s.w.document.activeElement?.blur(); s.key('Enter');
    s.$('recover').click(); await s.finishAudio();
    if (i === 0) { s.$('resume').click(); await flush(); }
  }
  assert.equal(s.w.document.activeElement.dataset.level, 'rich');
  assert.deepEqual([...s.app.lastSpoken].slice(0, 2), ['recovery_complete', 'suggest_rich']);
  spokenFocusMatches(s);
  assert.ok(!s.app.lastSpoken.some(id => /move|selected/.test(s.w.SEMA_DATA.promptTexts[id] ?? '')), 'no directions or focus claims in prompt text');
});

test('Start over needs a second Select; leaving the button cancels it', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s); await s.at(4); s.w.document.activeElement.blur(); s.key('Enter');
  s.$('restart').focus(); s.$('restart').click();
  assert.equal(s.app.player.position, 4, 'first Select only asks');
  assert.match(s.$('restart').textContent, /again/);
  assert.equal(s.app.lastSpoken[0], 'start_over_confirm');
  s.$('resume').focus();                                   // moving away disarms
  assert.equal(s.$('restart').textContent, 'Start over');
  s.$('restart').focus(); s.$('restart').click(); s.$('restart').click();
  assert.equal(s.app.player.position, 0);
  assert.match(s.$('status').textContent, /^Back at the start/);
});

test('an arrow during recovery stops it, keeps the fact pending, and names the new control', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s); await s.at(2.6); s.w.document.activeElement.blur(); s.key('Enter');
  s.$('recover').click(); await flush();
  assert.equal(s.app.player.mode, 'recovering');
  s.key('ArrowLeft');
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.app.narration, null);
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'pending');
  assert.equal(s.app.lastSpoken[0], 'recovery_stopped');
  spokenFocusMatches(s);
});

test('Left and Right during playback open the controls instead of being swallowed', async () => {
  for (const k of ['ArrowLeft', 'ArrowRight']) {
    const s = boot({ prefs: CHOSEN });
    await playing(s); await s.at(1); s.w.document.activeElement.blur(); s.key(k);
    assert.equal(s.app.player.mode, 'controls'); assert.equal(s.app.player.position, 1, 'no seek');
  }
});

test('the next cue is preloaded before it is due and used when it starts', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(1.2);
  assert.equal(s.app.preload?.key, 'envelope:standard');
  const preloaded = s.app.preload.audio;
  await s.at(2.6);
  assert.equal(s.app.narration, preloaded);
  assert.ok(s.app.player.log.some(e => e.type === 'audio-start'));
});

test('the film is ducked under narration and restored afterwards', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s); await s.at(2.6);
  await new Promise(r => setTimeout(r, 300));
  assert.ok(s.video.volume < 0.5, `ducked (volume ${s.video.volume})`);
  await s.finishAudio(); await new Promise(r => setTimeout(r, 300));
  assert.equal(s.video.volume, 1);
});

test('Back on the catalog asks the Vega host to exit; in a browser it is left alone', () => {
  const s = boot({ prefs: CHOSEN });
  const notHandled = s.w.document.body.dispatchEvent(new s.w.KeyboardEvent('keydown', { key: 'GoBack', bubbles: true, cancelable: true }));
  assert.equal(notHandled, true, 'browser: default not prevented');
  const sent = []; s.w.ReactNativeWebView = { postMessage: m => sent.push(JSON.parse(m)) };
  s.key('GoBack');
  assert.deepEqual(sent.filter(m => m.sema === 'exit'), [{ sema: 'exit' }]);
});
