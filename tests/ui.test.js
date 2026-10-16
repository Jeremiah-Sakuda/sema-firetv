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
const promptTexts = {...JSON.parse(fs.readFileSync('pipeline/prompts.json', 'utf8')), ...JSON.parse(fs.readFileSync('content/interface-prompts.json', 'utf8'))};
const windows = [];
afterEach(async () => { await flush(); await flush(); while (windows.length) windows.pop().close(); });

function boot({ prefs, search = '', films, resume, prompts = {}, momentPrompts = {}, audioPlay, videoPlay, preview = false, speech = true, bridge = null } = {}) {
  const dom = new JSDOM(html, { url: `http://localhost/${search}`, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window, audios = [];
  windows.push(w);
  const proto = w.HTMLMediaElement.prototype;
  Object.defineProperty(proto, 'currentTime', { get() { return this._t ?? 0; }, set(v) { this._t = v; }, configurable: true });
  Object.defineProperty(proto, 'readyState', { get() { return this._readyState ?? 4; }, configurable: true });
  proto.play = function () { if (this.tagName === 'VIDEO' && videoPlay) return videoPlay(this); if (this.tagName === 'AUDIO' && audioPlay) return audioPlay(this); this._playing = true; setTimeout(() => this.dispatchEvent(new w.Event('playing'))); return Promise.resolve(); };
  proto.pause = function () { this._playing = false; };
  proto.load = function () { if (this.tagName === 'AUDIO') setTimeout(() => this.dispatchEvent(new w.Event('canplay'))); };
  w.Audio = function (src) { const a = w.document.createElement('audio'); if (src) a.src = src; audios.push(a); return a; };
  let fetched = false; w.fetch = () => { fetched = true; return Promise.reject(new Error('no fetch')); };
  if (prefs) w.localStorage.setItem('sema-prefs-v1', JSON.stringify(prefs));
  if (resume) w.localStorage.setItem(`sema-resume-v2:${fixture.id}`, JSON.stringify(resume));
  if (speech) {
    w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    w.speechSynthesis = { speak(u) { setTimeout(() => u.onend?.(), 0); }, cancel() {} };
  }
  if (bridge) w.ReactNativeWebView = { postMessage: m => bridge.push(JSON.parse(m)) };
  w.SEMA_TEST = true;
  w.SEMA_DATA = { films: films ?? [{ package: fixture, poster: null, dev: false, allowFixture: true, standardMix: "media/fixture/standard.mp4" }], prompts, momentPrompts, promptTexts, preview };
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

test('actual delayed audio start rechecks the film clock and retains a critical fact', async () => {
  let requested;
  const s = boot({ prefs: CHOSEN, audioPlay: a => { requested = a; return new Promise(() => {}); } });
  await playing(s); await s.at(2.6);
  assert.ok(requested);
  s.video.currentTime = 6.5;
  requested.dispatchEvent(new s.w.Event('playing'));
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'pending');
  assert.equal(s.app.narration, null);
  assert.equal(s.active(), 'recover');
  assert.ok(s.app.player.log.some(e => e.reason === 'late-audio-start'));
});

test('actual delayed optional audio is dropped without interrupting playback', async () => {
  const optional = structuredClone(fixture); optional.events[0].critical = false;
  let requested;
  const s = boot({ prefs: CHOSEN, films: [{ package: optional, dev: false, allowFixture: true }],
    audioPlay: a => { requested = a; return new Promise(() => {}); } });
  await playing(s); await s.at(2.6); s.video.currentTime = 6.5;
  requested.dispatchEvent(new s.w.Event('playing'));
  assert.equal(s.app.player.mode, 'playing');
  assert.equal(s.app.narration, null);
  assert.equal(s.app.player.pending().length, 0);
});

test('a recovery that never starts times out without marking its fact delivered', async () => {
  const s = boot({ prefs: CHOSEN, audioPlay: () => new Promise(() => {}) });
  await playing(s); await s.at(2.6); s.key('Enter');
  const timers = [], original = s.w.setTimeout.bind(s.w);
  s.w.setTimeout = (fn, ms) => { const id = original(fn, ms); timers.push({ fn, ms }); return id; };
  s.$('recover').click();
  assert.equal(s.app.player.mode, 'recovering');
  timers.find(t => t.ms === 5000).fn();
  assert.equal(s.app.player.mode, 'error');
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'pending');
  assert.equal(s.active(), 'retry');
});

test('measured narration onset is logged once even with playing and play resolution', async () => {
  const s = boot({ prefs: CHOSEN }); await playing(s); await s.at(2.6);
  const starts = s.app.player.log.filter(e => e.type === 'audio-start');
  assert.equal(starts.length, 1);
  assert.ok(Number.isFinite(starts[0].onsetMs));
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'not-due');
  await s.finishAudio(); assert.equal(s.app.player.delivery.get('envelope-hidden'), 'delivered');
});

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
  assert.match(s.$('recover').textContent, /Hear missed description \(1\)/);
  assert.match(s.$('status').textContent, /^Paused\. Hear missed description/);
  assert.equal(s.app.lastSpoken.at(-1), 'label_recover_pending', 'speech names the focused control');
  s.$('recover').click();
  assert.equal(s.app.player.mode, 'recovering');
  assert.equal(s.active(), 'recover');
  await s.finishAudio();
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'delivered');
  assert.equal(s.active(), 'resume');
  assert.match(s.$('status').textContent, /^Description complete\. Resume from 0:02\.$/, 'each spoken piece reads as its own sentence');
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
  assert.match(s.$('transport-hint').textContent, /Back: pause$/);
  await s.at(1.5);
  s.w.document.activeElement.blur();
  s.key('Escape');
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.active(), 'return');
  assert.match(s.$('transport-hint').textContent, /Back: catalog$/);
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
  // VoiceView reads the focused control itself; the live region says only what happened.
  assert.equal(s.$('announcer').textContent, 'Paused.');
  assert.equal(s.active(), 'recover');
  s.$('recover').click();
  assert.equal(s.$('announcer').textContent, '');
});

test('repeated Revisit keeps Resume focused and does not change the chosen detail', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(2.6); await s.finishAudio();           // envelope cue delivered
  for (let i = 0; i < 2; i++) {
    await s.at(5 + i);
    s.w.document.activeElement?.blur(); s.key('Enter');
    s.$('recover').click(); await s.finishAudio();
    if (i === 0) { assert.equal(s.active(), 'resume'); s.$('resume').click(); await flush(); }
  }
  assert.equal(s.active(), 'resume');
  assert.equal(s.app.player.level, 'standard');
  assert.ok(!s.app.player.log.some(e => e.type === 'suggestion-offered'));
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

test('fixed Standard uses a mixed soundtrack and never schedules separate narration or recovery', async () => {
  const s = boot({ prefs: { ...CHOSEN, level: 'rich' }, search: '?study=fixed' });
  await playing(s);
  assert.equal(s.app.player.level, 'standard');
  assert.equal(s.$('level-group').hidden, true);
  assert.equal(s.$('detail-label').hidden, true);
  await s.at(2.6);
  s.w.document.activeElement.blur(); s.key('Enter');
  assert.equal(s.$('recover').hidden, true);
  assert.equal(s.$('earlier').hidden, true);
  assert.match(s.video.src, /standard.mp4$/);
  assert.equal(s.app.narration, null);
  assert.equal(s.app.player.pending().length, 0);
  assert.equal(s.app.player.log.filter(e => e.type === 'cue-start').length, 0);
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

test('D-pad follows the viewing, detail and utility rows', () => {
  const s = boot({ prefs: CHOSEN });
  s.$(`film-${fixture.id}`).click();
  // Button rectangles measured on the 1920x1080 Vega WebView, which exposed row-skipping.
  s.$('more-options').click();
  const layout = {
    '#resume': [106,356,600,680], '#recover': [368,607,600,680], '#earlier': [619,914,600,680],
    '[data-level="essential"]': [106,240,720,780], '[data-level="standard"]': [258,392,720,780],
    '[data-level="rich"]': [409,543,720,780], '[data-level="off"]': [556,690,720,780],
    '#more-options': [106,268,820,875], '#return': [280,480,820,875],
    '#controls [data-toggle="text"]': [106,268,910,965], '#controls [data-toggle="guidance"]': [280,445,910,965],
    '#help': [457,602,910,965], '#restart': [619,760,910,965],
  };
  for (const [selector,[left,right,top,bottom]] of Object.entries(layout)) s.w.document.querySelector(selector).getBoundingClientRect = () => ({left,right,top,bottom,x:left,y:top,width:right-left,height:bottom-top});
  const from = (selector,keyName) => {s.w.document.querySelector(selector).focus();s.key(keyName);return s.w.document.activeElement;};
  assert.equal(from('#resume','ArrowRight').id,'recover');
  assert.equal(from('[data-level="essential"]','ArrowUp').id,'resume');
  assert.equal(from('[data-level="rich"]','ArrowUp').id,'recover');
  assert.equal(from('#resume','ArrowDown').dataset.level,'standard', 'entering the level row lands on the selected level');
  assert.equal(from('#controls [data-toggle="guidance"]','ArrowUp').id,'return');
  assert.equal(from('#controls [data-toggle="text"]','ArrowUp').id,'more-options');
  assert.equal(from('#more-options','ArrowUp').dataset.level,'standard');
  assert.equal(from('#recover','ArrowDown').dataset.level,'standard', 'Down from Revisit never lands on Off');
  assert.equal(from('#restart','ArrowRight').id,'restart');
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

test('completion speech names Resume after repeated latest-moment requests', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s);
  await s.at(2.6); await s.finishAudio();
  for (let i = 0; i < 2; i++) {
    await s.at(5 + i); s.w.document.activeElement?.blur(); s.key('Enter');
    s.$('recover').click(); await s.finishAudio();
    if (i === 0) { s.$('resume').click(); await flush(); }
  }
  assert.equal(s.active(), 'resume');
  assert.deepEqual([...s.app.lastSpoken], ['recovery_complete', 'label_resume']);
  spokenFocusMatches(s);
  assert.ok(!s.app.lastSpoken.some(id => /move|selected/.test(s.w.SEMA_DATA.promptTexts[id] ?? '')), 'no directions or focus claims in prompt text');
});

test('Start over needs a second Select; leaving the button cancels it', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s); await s.at(4); s.w.document.activeElement.blur(); s.key('Enter');
  s.$('more-options').click(); s.$('restart').focus(); s.$('restart').click();
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


test('earlier moments can be revisited while the film clock stays paused', async () => {
  const s = boot({ prefs: CHOSEN }); await playing(s);
  await s.at(2.6); await s.finishAudio(); await s.at(9.6); await s.finishAudio();
  s.key('Enter'); const position = s.video.currentTime;
  s.$('recover').click(); assert.equal(s.app.player.active.events[0], 'door-open');
  await s.finishAudio(); s.$('earlier').click();
  assert.equal(s.app.player.active.events[0], 'envelope-hidden');
  assert.equal(s.video.currentTime, position);
  await s.finishAudio(); assert.equal(s.$('earlier').getAttribute('aria-disabled'), 'true');
});

test('Earlier moment pressed during the oldest moment lets the description finish', async () => {
  const s = boot({ prefs: CHOSEN }); await playing(s);
  await s.at(2.6); await s.finishAudio(); await s.at(9.6); await s.finishAudio();
  s.key('Enter'); s.$('recover').click(); await s.finishAudio();
  s.$('earlier').click(); assert.equal(s.app.player.active.events[0], 'envelope-hidden');
  const label = s.$('earlier').getAttribute('aria-label');
  s.$('earlier').focus(); s.$('earlier').click();                 // no older moment while this one plays
  assert.equal(s.app.player.mode, 'recovering', 'the oldest description is not cut off');
  assert.equal(s.active(), 'earlier');
  assert.equal(s.$('earlier').getAttribute('aria-label'), label, 'the focused name does not change mid-description');
  assert.equal(s.app.lastSpoken.includes('recovery_stopped'), false);
  await s.finishAudio();
  assert.equal(s.active(), 'resume');
  assert.equal(s.app.lastSpoken[0], 'recovery_complete');
});

test('Play/Pause during a critical description focuses the missed description', async () => {
  const s = boot({ prefs: CHOSEN }); await playing(s); await s.at(2.6);
  assert.ok(s.app.player.active, 'critical cue is speaking');
  s.key(' ');
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'pending');
  assert.equal(s.active(), 'recover');
  assert.equal(s.app.lastSpoken.at(-1), 'label_recover_pending');
});

test('an audio error on a timed cue keeps the film recoverable instead of failing it', async () => {
  let requested;
  const s = boot({ prefs: CHOSEN, audioPlay: a => { requested = a; return new Promise(() => {}); } });
  await playing(s); await s.at(2.6); assert.ok(requested);
  requested.dispatchEvent(new s.w.Event('error'));
  assert.notEqual(s.app.player.mode, 'error');
  assert.equal(s.app.player.delivery.get('envelope-hidden'), 'pending');
  assert.equal(s.active(), 'recover');
});

test('the film ending during its last description still ends with focused controls', async () => {
  // An optional final cue is dropped at the end without pausing, which used to leave the player "playing".
  const optionalEnd = { ...fixture, events: fixture.events.map(e => e.id === 'door-open' ? { ...e, critical: false } : e) };
  const s = boot({ prefs: CHOSEN, films: [{ package: optionalEnd, poster: null, dev: false, allowFixture: true }] }); await playing(s);
  await s.at(2.6); await s.finishAudio(); await s.at(9.6);
  assert.ok(s.app.player.active, 'final cue is still speaking');
  s.video.currentTime = 15; s.video.dispatchEvent(new s.w.Event('ended')); await flush();
  assert.equal(s.app.player.active, null);
  assert.equal(s.app.player.mode, 'ended');
  assert.equal(s.$('controls').closest('[hidden]'), null);
  assert.equal(s.active(), 'return');
  assert.equal(s.app.lastSpoken[0], 'film_ended');
});

test('review packages only open inside an explicitly marked review build', () => {
  const draft = { ...fixture, reviewStatus: 'draft' };
  const films = [{ package: draft, allowDraft: true }];
  const release = boot({ films, prefs: CHOSEN }); release.$(`film-${draft.id}`).click();
  assert.equal(release.app.view, 'catalog');
  const review = boot({ films, preview: true, prefs: CHOSEN }); review.$(`film-${draft.id}`).click();
  assert.equal(review.app.view, 'player');
});

test('Standard plus revisit comparison keeps recovery but locks detail', async () => {
  const s = boot({ prefs: { ...CHOSEN, level: 'rich' }, search: '?study=recovery' });
  await playing(s); await s.at(2.6); s.key('Enter');
  assert.equal(s.app.player.level, 'standard'); assert.equal(s.$('level-group').hidden, true);
  assert.equal(s.$('detail-label').hidden, true);
  assert.equal(s.$('recover').hidden, false); s.$('recover').click();
  assert.equal(s.app.player.mode, 'recovering');
});

test('fixed comparison fails visibly when a mixed baseline is absent', () => {
  const s = boot({ search: '?study=fixed', films: [{ package: fixture, allowFixture: true }] });
  s.$(`film-${fixture.id}`).click(); assert.equal(s.app.view, 'catalog');
  assert.match(s.$('status').textContent, /Standard comparison soundtrack/);
});

test('unavailable guidance keeps retry recoverable and Back enables screen-reader access', async () => {
  const s = boot({prefs: CHOSEN, speech: false});
  assert.equal(s.$('guidance-error').hidden, false);
  assert.equal(s.active(), 'guidance-retry');
  assert.equal(s.$('catalog').inert, true);
  s.w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  s.w.speechSynthesis = { speak(u) { u.onend(); }, cancel() {} };
  // The existing voice captures its engine at startup: no engine can be enabled
  // retroactively here. A retry must remain recoverable rather than dismissing failure.
  s.$('guidance-retry').click();
  assert.equal(s.$('guidance-error').hidden, false);
  s.key('Escape');
  assert.equal(s.app.view, 'catalog'); assert.equal(s.app.prefs.guidance, false);
  assert.equal(s.$('guidance-error').hidden, true);
  assert.equal(s.$('catalog').inert, false);
  assert.equal(s.$('announcer').getAttribute('aria-live'), 'polite');
});
test('a failed clip pauses the film and retry can recover without losing position', async () => {
  const s = boot({prefs: CHOSEN, speech: false, prompts: Object.fromEntries(Object.entries(promptTexts).map(([id,text]) => [id,{text,audio:`${id}.mp3`,duration:1}]))});
  await playing(s); await s.at(1.5); s.key('Enter');
  s.audios.at(-1).dispatchEvent(new s.w.Event('error'));
  assert.equal(s.active(), 'guidance-retry');
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.video.currentTime, 1.5);
  s.$('guidance-retry').click();
  await s.finishAudio(); await s.finishAudio();
  assert.equal(s.$('guidance-error').hidden, true);
  assert.equal(s.video.currentTime, 1.5);
});
test('earlier-moment browsing keeps focus on Earlier while another past moment exists', async () => {
  const pkg = structuredClone(fixture);
  pkg.events.push({...pkg.events[0],id:'oldest',availableAt:0.5,critical:false});
  const s = boot({prefs:CHOSEN,films:[{package:pkg,allowFixture:true}]});
  await playing(s); await s.at(2.6); await s.finishAudio(); await s.at(9.6); await s.finishAudio();
  s.key('Enter'); s.$('recover').click(); await s.finishAudio();
  s.$('earlier').click();
  assert.equal(s.app.player.mode, 'recovering'); assert.equal(s.active(), 'earlier', 'focus is not pulled away while the moment plays');
  await s.finishAudio();
  assert.equal(s.active(), 'earlier'); assert.match(s.$('moment-context').textContent, /Last described at/);
  s.$('earlier').click();
  assert.equal(s.active(), 'earlier', 'still on Earlier while the last earlier moment plays');
  await s.finishAudio();
  assert.equal(s.active(), 'resume');
});

test('with guidance off, no announcement names the focused control (VoiceView already reads it)', async () => {
  const s = boot({ prefs: { ...CHOSEN, guidance: false, guidanceChosen: true } });
  const labelled = () => [...s.app.lastSpoken].some(id => /^label_|^film_/.test(id));
  assert.equal(labelled(), false, 'welcome');
  s.$(`film-${fixture.id}`).click(); assert.equal(labelled(), false, 'ready');
  await playing(s); await s.at(2.6); s.w.document.activeElement.blur(); s.key('Enter'); assert.equal(labelled(), false, 'paused');
  s.$('recover').click(); await s.finishAudio(); assert.equal(labelled(), false, 'recovery complete');
  s.key('Escape'); assert.equal(labelled(), false, 'returning');
});

test("VoiceView detected by the Vega host turns Sema's voice off, unless the viewer chose", () => {
  const sent = [];
  const s = boot({ prefs: CHOSEN, bridge: sent });
  assert.equal(s.app.lastSpoken.length, 0, 'on Vega, the first words wait for the screen-reader state');
  s.w.__semaScreenReader(true);
  assert.equal(s.app.prefs.guidance, false);
  assert.equal(s.$('announcer').getAttribute('aria-live'), 'off', 'VoiceView speaks status through the native API, not twice');
  assert.equal([...s.app.lastSpoken][0], 'welcome');
  assert.ok(sent.some(m => m.sema === 'announce' && /^Welcome to Sema/.test(m.text)), 'startup goes to VoiceView through the host');
  assert.ok(sent.some(m => m.sema === 'screen-reader' && m.on === true));
  s.$(`film-${fixture.id}`).click(); s.$('resume').click(); s.key('Enter');
  assert.equal(sent.filter(m => m.sema === 'announce').at(-1).text, 'Paused.', 'state changes reach VoiceView without naming the focused control');
  const before = sent.filter(m => m.sema === 'announce').length;
  s.w.__semaScreenReader(false);
  assert.equal(s.app.prefs.guidance, true, 'automatic choice follows the screen reader');
  s.key('Escape');
  assert.equal(sent.filter(m => m.sema === 'announce').length, before, "Sema's own voice speaks again; nothing goes to VoiceView");
  s.w.document.querySelector('#welcome [data-toggle="guidance"], [data-toggle="guidance"]').click();  // explicit: off
  s.w.__semaScreenReader(false);
  assert.equal(s.app.prefs.guidance, false, 'an explicit choice is never overridden');
});

test('on Vega, startup still speaks if the host never reports a screen-reader state', async () => {
  const s = boot({ prefs: CHOSEN, bridge: [] });
  assert.equal(s.app.lastSpoken.length, 0);
  await new Promise(r => setTimeout(r, 1300));
  assert.equal([...s.app.lastSpoken][0], 'welcome');
});

test('a browser blocking sound before the first key press does not show the failure dialog', async () => {
  const clips = Object.fromEntries(Object.entries(promptTexts).map(([id, text]) => [id, { text, audio: `${id}.mp3`, duration: 1 }]));
  let blocked = true;
  const s = boot({ prefs: CHOSEN, prompts: clips, audioPlay: a => blocked ? Promise.reject(new Error('NotAllowedError')) : (a._playing = true, Promise.resolve()) });
  s.w.speechSynthesis = { speak(u) { setTimeout(() => u.onerror?.({ error: 'not-allowed' })); }, cancel() {} };
  await flush(); await flush(); await flush();
  assert.equal(s.app.guidanceFailed, false);
  assert.equal(s.$('guidance-error').hidden, true, 'no dialog before any interaction');
  blocked = false;
  s.key('ArrowDown');                                     // first interaction: guidance works from here
  assert.equal(s.$('guidance-error').hidden, true);
});

test('Space resumes from the paused controls instead of pressing the focused button', async () => {
  const s = boot({ prefs: CHOSEN });
  await playing(s); await s.at(1); s.w.document.activeElement.blur(); s.key('Enter');
  s.$('restart').focus();
  s.key(' ', { code: 'Space' }); await flush();
  assert.equal(s.app.player.mode, 'playing');
  assert.equal(s.app.player.position, 1, 'Start over was not pressed');
});

test('level buttons have separated accessible names', () => {
  const s = boot({ prefs: CHOSEN });
  for (const b of s.w.document.querySelectorAll('[data-level], [data-choose-level]')) assert.match(b.getAttribute('aria-label'), /^\w+, /);
});


test('a video stall immediately cancels description and preserves a critical fact for recovery', async () => {
  const s = boot({prefs: CHOSEN});
  await playing(s); await s.at(2.6);
  const audio = s.app.narration;
  assert.ok(audio && audio._playing);
  s.video._readyState = 2;
  s.video.dispatchEvent(new s.w.Event('waiting'));
  assert.equal(audio._playing, false, 'description stops in the waiting event, without a 900ms drift');
  assert.equal(s.app.narration, null);
  assert.equal(s.app.player.mode, 'controls');
  assert.equal(s.app.player.pending().length, 1);
  assert.equal(s.active(), 'recover');
  const position = s.video.currentTime;
  audio.dispatchEvent(new s.w.Event('ended'));
  assert.equal(s.app.player.pending().length, 1, 'late completion cannot mark interrupted speech heard');
  s.$('recover').click(); await s.finishAudio();
  assert.equal(s.app.player.pending().length, 0);
  assert.equal(s.video.currentTime, position);
});

test('a brief wait between descriptions does not unnecessarily interrupt playback', async () => {
  const s = boot({prefs: CHOSEN});
  await playing(s); await s.at(1);
  s.video._readyState = 2; s.video.dispatchEvent(new s.w.Event('waiting'));
  assert.equal(s.app.player.mode, 'playing');
  s.video._readyState = 4; s.video.dispatchEvent(new s.w.Event('playing'));
  assert.equal(s.app.player.mode, 'playing');
});

test('moment content never expands the remote action labels', async () => {
  const pkg = structuredClone(fixture);
  for (const event of pkg.events) {
    event.label = 'A deliberately long description of a visual moment with many details';
    event.labelPrompt = 'test_moment';
  }
  const s = boot({prefs: CHOSEN, films:[{package:pkg,allowFixture:true}],
    prompts:{test_moment:{text:pkg.events[0].label,audio:'moment.mp3',duration:1}}});
  await playing(s); await s.at(2.6); await s.finishAudio(); s.key('Enter');
  assert.equal(s.$('recover').textContent, 'Revisit latest moment');
  assert.match(s.$('recover').getAttribute('aria-label'), /deliberately long/, 'screen readers keep moment orientation');
  assert.equal(s.$('earlier').textContent, 'Earlier moment');
  s.$('recover').click(); await s.finishAudio();
  assert.match(s.$('moment-context').textContent, /deliberately long/);
  assert.equal(s.$('recover').textContent, 'Revisit latest moment');
});


test('a moment without a timed clip has an identifying accessible name without replaying its answer on focus', async () => {
  const pkg = structuredClone(fixture);
  pkg.events[0].label = 'Mechanical hand';
  const s = boot({prefs:CHOSEN,films:[{package:pkg,allowFixture:true}]});
  await playing(s); await s.at(2.6); await s.finishAudio(); s.key('Enter');
  assert.match(s.$('recover').getAttribute('aria-label'), /Mechanical hand.*At/);
  assert.equal(s.$('recover').dataset.momentPrompt, undefined);
  assert.equal(s.$('recover').textContent, 'Revisit latest moment');
});


test('guidance alone plays the recorded identity of an untimed bridge moment', async () => {
  const pkg = JSON.parse(fs.readFileSync('preview/media/tears-of-steel/package.json'));
  const momentPrompts = JSON.parse(fs.readFileSync('media/moment-labels/prompts.json'));
  for (const event of pkg.events) {
    const id = `moment_${pkg.id}_${event.id}`.replace(/-/g,'_');
    event.label = momentPrompts[id].text.replace(/[.!?]$/,''); event.labelPrompt = id;
  }
  const data = {prompts:JSON.parse(fs.readFileSync('media/prompts/prompts.json')),momentPrompts};
  const s = boot({prefs:CHOSEN,films:[{package:pkg,allowDraft:true}],prompts:data.prompts,momentPrompts,preview:true,speech:false});
  s.$('film-tears-of-steel').click();
  s.app.player.seek(35); s.video.currentTime=35;
  s.w.document.querySelector('[data-level="standard"]').click();
  s.$('recover').click(); await flush(); await flush();
  s.app.narration.dispatchEvent(new s.w.Event('ended'));
  s.$('earlier').focus(); await new Promise(r=>setTimeout(r,220));
  const generic = s.audios.at(-1);
  assert.match(generic.src,/label_earlier/);
  generic.dispatchEvent(new s.w.Event('ended')); await flush();
  const identity = data.momentPrompts.moment_tears_of_steel_pair_on_bridge;
  assert.ok(s.audios.at(-1).src.endsWith(identity.audio));
  assert.equal(identity.text,'People on the bridge.');
  assert.equal(s.app.guidanceFailed,false);
});


test('moment context separates the completed answer from the next control and does not mislabel cancelled audio', async () => {
  const pkg=structuredClone(fixture);
  pkg.events[0].label='First moment';pkg.events[1].label='Second moment';
  pkg.events.push({...pkg.events[0],id:'older',label:'Older moment',availableAt:0.5,critical:false});
  const s=boot({prefs:CHOSEN,films:[{package:pkg,allowFixture:true}]});
  await playing(s);await s.at(2.6);await s.finishAudio();await s.at(9.6);await s.finishAudio();
  s.key('Enter');s.$('recover').click();await s.finishAudio();
  assert.match(s.$('moment-context').textContent,/Last described.*Second moment[\s\S]*Next earlier.*First moment/);
  s.$('earlier').click();await flush();
  assert.match(s.$('moment-context').textContent,/Describing.*First moment/);
  const stale=s.app.narration.onended;s.key('Escape');stale();
  assert.match(s.$('moment-context').textContent,/Selected moment.*First moment/);
  assert.doesNotMatch(s.$('moment-context').textContent,/Last described.*First moment/);
  s.$('recover').click();await s.finishAudio();s.$('earlier').click();await s.finishAudio();
  assert.match(s.$('moment-context').textContent,/Last described.*First moment[\s\S]*Next earlier.*Older moment/);
  s.$('resume').click();await flush();s.key('Enter');
  assert.match(s.$('moment-context').textContent,/Last described.*First moment/, 'resuming does not erase the last completed description');
});


test('More options preserves the paused frame, closes with Back and stays closed after resume', async () => {
  const s=boot({prefs:CHOSEN});await playing(s);await s.at(1);s.key('Enter');
  assert.equal(s.$('viewing-options').hidden,true);
  s.$('more-options').click();
  assert.equal(s.$('more-options').getAttribute('aria-expanded'),'true');
  assert.equal(s.w.document.activeElement.dataset.toggle,'text');
  assert.equal(s.app.lastSpoken[0],'options_open');
  s.key('Escape');
  assert.equal(s.app.view,'player');assert.equal(s.active(),'more-options');
  assert.equal(s.$('viewing-options').hidden,true);assert.equal(s.video.currentTime,1);
  assert.match(s.$('transport-hint').textContent,/Back: catalog$/);
  s.$('more-options').click();s.$('resume').click();await flush();s.key('Enter');
  assert.equal(s.$('viewing-options').hidden,true);assert.equal(s.active(),'recover');
});

test('opening options stops a recovery without delivering its critical fact', async () => {
  const s=boot({prefs:CHOSEN});await playing(s);await s.at(2.6);s.key('Enter');s.$('recover').click();await flush();
  const stale=s.app.narration.onended;s.$('more-options').click();stale();
  assert.equal(s.app.player.mode,'controls');assert.equal(s.app.narration,null);
  assert.equal(s.app.player.pending().length,1);assert.equal(s.$('viewing-options').hidden,false);
  assert.equal(s.app.lastSpoken[0],'recovery_stopped');
});

test('guidance failure can continue with detected VoiceView without losing pending narration', async () => {
  const sent=[];const s=boot({prefs:{...CHOSEN,guidance:false,guidanceChosen:true},speech:false,bridge:sent});
  s.w.__semaScreenReader(true);await playing(s);await s.at(2.6);s.key('Enter');s.$('more-options').click();
  s.w.document.querySelector('#controls [data-toggle="guidance"]').click();await flush();
  assert.equal(s.app.guidanceFailed,true);assert.equal(s.$('guidance-continue').hidden,false);
  const at=s.video.currentTime;s.$('guidance-continue').click();
  assert.equal(s.app.guidanceFailed,false);assert.equal(s.app.prefs.guidance,false);
  assert.equal(s.app.player.mode,'controls');assert.equal(s.app.player.pending().length,1);
  assert.equal(s.video.currentTime,at);assert.equal(s.active(),'recover');
  assert.equal(s.$('announcer').getAttribute('aria-live'),'off');
  assert.match(sent.filter(m=>m.sema==='announce').at(-1).text,/VoiceView can read the controls/);
});

test('a VoiceView continuation is never offered when no screen reader is detected', async () => {
  const s=boot({prefs:{...CHOSEN,guidanceChosen:true},speech:false,bridge:[]});
  s.w.__semaScreenReader(false);await flush();
  assert.equal(s.app.guidanceFailed,true);assert.equal(s.$('guidance-continue').hidden,true);
  s.$('guidance-continue').click();assert.equal(s.app.guidanceFailed,true);
  s.w.__semaScreenReader(true);assert.equal(s.$('guidance-continue').hidden,false);
  s.w.__semaScreenReader(false);assert.equal(s.$('guidance-continue').hidden,true);
});


test('a late native startup response cannot replace current option speech or move its focus', async () => {
  const s=boot({prefs:CHOSEN,bridge:[]});s.$(`film-${fixture.id}`).click();s.$('more-options').click();
  assert.equal(s.w.document.activeElement.dataset.toggle,'text');
  const before=[...s.app.lastSpoken];s.w.__semaScreenReader(false);
  assert.deepEqual([...s.app.lastSpoken],before);assert.equal(s.w.document.activeElement.dataset.toggle,'text');
  assert.equal(s.$('viewing-options').hidden,false);
});


test('stale video failures across pause, resume and seek never fail the new playback attempt', async () => {
  const requests=[];const s=boot({prefs:CHOSEN,videoPlay:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))});
  s.$(`film-${fixture.id}`).click();s.$('resume').click();s.key('Enter');s.$('resume').click();
  requests[0].reject(new Error('cancelled first play'));await flush();assert.equal(s.app.player.mode,'playing');
  s.key('MediaFastForward');assert.equal(requests.length,3);
  requests[1].reject(new Error('cancelled pre-seek play'));await flush();
  assert.equal(s.app.player.mode,'playing');assert.equal(s.app.player.position,5);
  requests[2].reject(new Error('current play genuinely failed'));await flush();
  assert.equal(s.app.player.mode,'error');assert.equal(s.active(),'retry');
  assert.equal(s.app.player.log.filter(e=>e.type==='error').length,1);
});
