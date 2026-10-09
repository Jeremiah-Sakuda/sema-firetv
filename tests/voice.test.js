import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice } from '../src/voice.js';

function boot({ speech = true, reject = false } = {}) {
  const audios = [], utterances = [], changes = [], events = [], failures = [], timers = new Map();
  let serial = 0;
  const environment = {
    Audio: class {
      constructor(src) { this.src = src; audios.push(this); }
      play() { return reject ? Promise.reject(new Error('decoder')) : Promise.resolve(); }
      pause() { this.paused = true; }
      removeAttribute(name) { delete this[name]; }
    },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: speech ? { speak(u) { utterances.push(u); }, cancel() {} } : null,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const clips = { first: { text: 'First.', audio: 'first.mp3', duration: 1 }, second: { text: 'Second.', audio: 'second.mp3', duration: 2 } };
  const voice = createVoice({ clips, environment, onChange: v => changes.push(v), onEvent: e => events.push(e), onFailure: e => failures.push(e) });
  const expire = () => { const [id, t] = [...timers][0]; timers.delete(id); t.fn(); };
  return { voice, audios, utterances, changes, events, failures, timers, expire };
}

test('guidance queues clips and ignores duplicate completion callbacks', () => {
  const s = boot(); s.voice.say(['first', 'second']);
  const ended = s.audios[0].onended;
  s.audios[0].onplaying(); ended(); ended();
  assert.equal(s.audios.length, 2);
  s.audios[1].onplaying(); s.audios[1].onended();
  assert.equal(s.voice.speaking, false); assert.equal(s.timers.size, 0);
  assert.deepEqual(s.changes, [true, false]);
});

test('clip completion watchdog starts at playing, then advances exactly once', () => {
  const s = boot(); s.voice.say(['first', 'second']);
  assert.equal([...s.timers.values()][0].ms, 5000);
  s.audios[0].onplaying(); assert.equal([...s.timers.values()][0].ms, 2500);
  const ended = s.audios[0].onended;
  s.expire(); ended();
  assert.equal(s.audios.length, 2);
  assert.equal(s.events.filter(e => e.type === 'clip-watchdog').length, 1);
});

test('rejected playback falls back to speech and continues the queue', async () => {
  const s = boot({ reject: true }); s.voice.say(['first', 'second']);
  await Promise.resolve();
  assert.equal(s.utterances[0].text, 'First.');
  s.utterances[0].onend(); await Promise.resolve();
  assert.equal(s.utterances[1].text, 'Second.');
  s.utterances[1].onerror(); assert.equal(s.voice.speaking, false);
});

test('a clip that never starts falls back; unavailable speech never blocks input', () => {
  const s = boot({ speech: false }); s.voice.say(['first', 'second']);
  s.expire(); assert.equal(s.audios.length, 2);
  s.expire(); assert.equal(s.voice.speaking, false);
  assert.equal(s.timers.size, 0);
});

test('missing clips use speech, and a missing speech end event has a watchdog', () => {
  const s = boot(); s.voice.say([{ id: 'missing', text: 'Use the remote.' }, 'first']);
  assert.equal(s.utterances[0].lang, 'en-US');
  s.expire(); assert.equal(s.audios.length, 1);
  s.utterances[0].onend(); assert.equal(s.audios.length, 1);
  s.voice.stop(); assert.equal(s.voice.speaking, false); assert.equal(s.timers.size, 0);
});

test('new guidance cancels the old request and late callbacks cannot start its next item', async () => {
  const s = boot({ reject: true }); s.voice.say(['first', 'second']);
  const oldEnd = s.audios[0].onended, oldPlaying = s.audios[0].onplaying;
  s.voice.say('second'); oldEnd(); oldPlaying(); await Promise.resolve();
  assert.equal(s.audios.length, 2); assert.equal(s.utterances.length, 1);
  assert.equal(s.utterances[0].text, 'Second.');
  assert.equal(s.audios[0].paused, true);
  assert.equal(s.events.filter(e => e.type === 'clip-playing').length, 0);
});

test('speech engine and Audio constructor exceptions leave guidance usable', () => {
  const environment = { Audio: class { constructor() { throw new Error('no decoder'); } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: { cancel() { throw new Error('no engine'); }, speak() { throw new Error('no engine'); } },
    setTimeout: () => 1, clearTimeout: () => {} };
  const voice = createVoice({ clips: { first: { audio: 'a.mp3', text: 'Hello.', duration: 1 } }, environment });
  assert.doesNotThrow(() => voice.say('first')); assert.equal(voice.speaking, false);
});

test('exhausted clip and speech report the failed prompt; stop cancels stale failures', () => {
  const s = boot({speech: false}); s.voice.say('first');
  const stale = s.audios[0].onerror;
  s.expire();
  assert.deepEqual(s.failures, [{id: 'first', text: 'First.', reason: 'speech-unavailable'}]);
  s.voice.say('second'); s.voice.stop(); stale();
  assert.equal(s.failures.length, 1);
  assert.equal(s.timers.size, 0);
});
test('speech errors and watchdogs are failures, never successful delivery', () => {
  const s = boot(); s.voice.say({id: 'missing', text: 'Help.'});
  s.utterances[0].onerror(); assert.equal(s.failures[0].reason, 'speech-error');
  s.voice.say({id: 'missing', text: 'Help.'}); s.expire();
  assert.equal(s.failures[1].reason, 'speech-timeout');
  s.voice.say('first'); s.audios[0].onplaying(); s.expire();
  assert.equal(s.failures[2].reason, 'clip-completion-timeout');
});
