import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Playback } from '../src/playback.js';
import { createPlaybackSession } from '../src/playback-session.js';
const fixture = JSON.parse(fs.readFileSync('media/fixture/package.json'));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function boot({ audioReady = 4, audioPlay } = {}) {
  let playback = new Playback(fixture, { allowFixture: true }); playback.enter(); playback.resume();
  const timers = new Map(), intervals = new Map(), events = [], requests = [], audios = [];
  let serial = 0, stoppedVoice = 0;
  class Media extends EventTarget {
    constructor(src) { super(); this.src = src; this.currentTime = 0; this.readyState = 4; this.volume = 1; this.paused = false; }
    pause() { this.paused = true; }
    removeAttribute(name) { delete this[name]; }
    emit(type) { this.dispatchEvent(new Event(type)); this[`on${type}`]?.(); }
    load() {}
  }
  const video = new Media('film.webm');
  video.play = () => { video.paused = false; return new Promise((resolve,reject) => requests.push({resolve,reject})); };
  const environment = {
    Audio: class extends Media { constructor(src) { super(src); this.readyState = audioReady; this.playCalls = 0; audios.push(this); }
      play() { this.playCalls++; return audioPlay ? audioPlay(this) : Promise.resolve(); } },
    performance: { now: () => 0 },
    setTimeout(fn,ms) { const id=++serial;timers.set(id,{fn,ms});return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval(fn,ms) { const id=++serial;intervals.set(id,{fn,ms});return id; }, clearInterval(id) { intervals.delete(id); },
  };
  const session = createPlaybackSession({video,voice:{stop(){stoppedVoice++;}},getPlayback:()=>playback,onEvent:e=>events.push(e),environment});
  const fire = ms => {const [id,t]=[...timers].find(([,v])=>v.ms===ms);timers.delete(id);t.fn();};
  return {session,video,requests,timers,intervals,events,audios,fire,get playback(){return playback;},swap:p=>{playback=p;},get stoppedVoice(){return stoppedVoice;}};
}
test('a superseded video rejection cannot fail the newer attempt', async () => {
  const s=boot();const old=s.session.playVideo();s.session.pause();const next=s.session.playVideo();
  s.requests[0].reject(new Error('old request'));await flush();assert.equal(await old,'cancelled');
  assert.equal(s.events.some(e=>e.type==='video-failed'),false);
  s.video.emit('playing');assert.equal(await next,'started');s.requests[1].resolve();await flush();
  assert.equal(s.timers.size,0);assert.equal(s.events.some(e=>e.type==='video-failed'),false);
});
test('a cancelled watchdog cannot settle a subsequent attempt', async () => {
  const s=boot();const old=s.session.playVideo();const timeout=[...s.timers.values()][0].fn;
  const next=s.session.playVideo();timeout();assert.equal(await old,'cancelled');
  assert.equal(s.events.some(e=>e.type==='video-failed'),false);s.video.emit('playing');assert.equal(await next,'started');
});
test('pause settles a hung request and releases its watchdog immediately', async () => {
  const s=boot();const result=s.session.playVideo();s.session.pause();
  assert.equal(await result,'cancelled');assert.equal(s.timers.size,0);assert.equal(s.video.paused,true);assert.equal(s.stoppedVoice,1);
});
test('only the current rejected or synchronously throwing attempt reports failure', async () => {
  const s=boot();const result=s.session.playVideo();s.requests[0].reject(new Error('decoder'));
  assert.equal(await result,'failed');assert.equal(s.events.filter(e=>e.type==='video-failed').length,1);assert.equal(s.timers.size,0);
  s.video.play=()=>{throw new Error('platform unavailable');};assert.equal(await s.session.playVideo(),'failed');
  assert.equal(s.events.filter(e=>e.type==='video-failed').length,2);assert.equal(s.timers.size,0);
});
test('a current video start watchdog reports failure once; late resolution is ignored', async () => {
  const s=boot();const result=s.session.playVideo();s.fire(5000);assert.equal(await result,'failed');
  s.requests[0].resolve();await flush();assert.equal(s.events.filter(e=>e.type==='video-failed').length,1);assert.equal(s.timers.size,0);
});
test('changing films makes an outstanding video outcome harmless', async () => {
  const s=boot();const result=s.session.playVideo();const other=new Playback(fixture,{allowFixture:true});other.enter();other.resume();s.swap(other);
  s.requests[0].reject(new Error('old film'));assert.equal(await result,'cancelled');assert.equal(s.events.some(e=>e.type==='video-failed'),false);
});
test('cancelled canplay readiness cannot restart audio or deliver an interrupted fact', () => {
  const s=boot({audioReady:0});s.video.currentTime=2.6;const cue=s.playback.tick(2.6);s.session.narrate(cue);
  const audio=s.audios.at(-1);s.session.pause();s.playback.controls('pause');audio.emit('canplay');
  assert.equal(audio.playCalls,0);assert.equal(audio.src,undefined);assert.equal(s.playback.pending().length,1);
  assert.equal(s.events.some(e=>e.type==='narration-completed'),false);assert.equal(s.timers.size,0);
});
test('recovery start timeout preserves the critical fact and never completes it', () => {
  const s=boot({audioPlay:()=>new Promise(()=>{})});s.playback.tick(2.6);s.playback.controls('pause');s.session.narrate(s.playback.recover());
  s.fire(5000);assert.equal(s.events.filter(e=>e.type==='narration-failed').length,1);assert.equal(s.playback.pending().length,1);
  assert.equal(s.events.some(e=>e.type==='narration-completed'),false);s.session.reset();assert.equal(s.timers.size,0);
});
test('pause invalidates a queued buffering outcome', async () => {
  const s=boot();const playing=s.session.playVideo();s.video.emit('playing');await playing;
  s.video.readyState=2;s.video.emit('waiting');const old=[...s.timers.values()].find(t=>t.ms===900).fn;
  s.session.pause();old();assert.equal(s.events.some(e=>e.type==='video-stalled'),false);assert.equal(s.timers.size,0);
});
test('reset releases preload, narration and volume timers', async () => {
  const s=boot();s.video.currentTime=1.2;s.session.prepareNext();const preload=s.audios.at(-1);
  s.video.currentTime=2.6;s.session.narrate(s.playback.tick(2.6));await flush();
  assert.equal(preload.playCalls,1);assert.ok(s.intervals.size);s.session.reset();
  assert.equal(preload.src,undefined);assert.equal(s.timers.size,0);assert.equal(s.intervals.size,0);assert.equal(s.video.volume,1);
});
