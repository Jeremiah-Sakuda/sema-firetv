import test from 'node:test';
import assert from 'node:assert/strict';
import { Playback } from '../src/playback.js';
import { validatePackage } from '../src/package.js';

function fixture() {
  const speech = { text: 'An envelope moves.', audio: 'media/line.mp3', duration: 1 };
  return { id:'test', version:'1', duration:15, video:'media/test.mp4', reviewStatus:'approved', rights:'Original test fixture',
    scenes:[{id:'a',start:0,end:8},{id:'b',start:8,end:15}], dialogue:[{start:0,end:2},{start:7,end:9}],
    events:[{id:'key',scene:'a',availableAt:2,critical:true,recovery:speech},{id:'door',scene:'b',availableAt:9,critical:true,recovery:speech}],
    cues:[{id:'c1',events:['key'],start:2,end:7,margin:.2,variants:{essential:speech,standard:speech,rich:speech}}, {id:'c2',events:['door'],start:9,end:15,margin:.2,variants:{essential:speech,standard:speech,rich:speech}}] };
}
const player = () => { const p = new Playback(fixture()); p.enter(); p.resume(); return p; };

test('final measured audio longer than a window is rejected', () => { const a=fixture(); a.cues[0].variants.rich={...a.cues[0].variants.rich,duration:4.7}; assert.match(validatePackage(a).join(' '),/does not fit/); });
test('future facts, dialogue overlap, duplicate IDs and missing approval reject publishing', () => {
  const a=fixture(); a.events[0].availableAt=3; a.cues[0].start=1; a.cues[1].id='c1'; a.reviewStatus='fixture';
  const errors=validatePackage(a).join(' '); for(const reason of ['future','dialogue','Unique cue','approval']) assert.ok(errors.includes(reason));
});
test('missing level, traversal path, missing critical coverage reject', () => {
  const a=fixture(); delete a.cues[0].variants.rich; a.events[0].recovery={text:'x',duration:1,audio:'../secret'}; a.cues.pop();
  assert.ok(validatePackage(a).length>=3);
});
test('fixture permission is opt-in', () => { const a=fixture(); a.reviewStatus='fixture'; assert.throws(()=>new Playback(a)); assert.doesNotThrow(()=>new Playback(a,{allowFixture:true})); });
test('cue begins from media time and delivers only on completion', () => {
  const p=player(); assert.equal(p.tick(2),null); const cue=p.tick(2.3); assert.equal(p.delivery.get('key'),'not-due');
  assert.equal(p.canStart(cue.token,2.4),true); assert.equal(p.complete(cue.token),true); assert.equal(p.delivery.get('key'),'delivered'); assert.equal(p.tick(3),null);
});
test('critical interruption survives a scene change and recovery requires explicit resume', () => {
  const p=player(); p.tick(2.3); p.controls(); assert.equal(p.pending()[0].id,'key'); p.resume(); p.tick(8.1);
  const recovery=p.recover(); assert.deepEqual(recovery.events,['key']); p.complete(recovery.token);
  assert.equal(p.mode,'controls'); assert.equal(p.delivery.get('key'),'delivered');
});
test('stale audio completion cannot deliver cancelled facts', () => {
  const p=player(); const cue=p.tick(2.3); p.controls(); const recovery=p.recover();
  assert.equal(p.complete(cue.token),false); assert.equal(p.canStart(cue.token,3),false); assert.equal(p.delivery.get('key'),'pending'); assert.ok(p.complete(recovery.token));
});
test('late critical cue pauses instead of speaking into dialogue', () => { const p=player(); assert.equal(p.tick(6.9),null); assert.equal(p.mode,'controls'); assert.equal(p.pending()[0].id,'key'); });
test('async audio loading gets a second fit check', () => { const p=player();const c=p.tick(2.3); assert.equal(p.canStart(c.token,6.9),false); assert.equal(p.mode,'controls'); assert.equal(p.pending().length,1); });
test('active audio exceeding window is cancelled', () => { const p=player(); p.tick(2.3); p.tick(6.81); assert.equal(p.mode,'controls'); assert.equal(p.active,null); assert.equal(p.pending().length,1); });
test('forward seek intentionally bypasses, backward seek allows another pass', () => {
  const p=player();p.tick(2.3);p.seek(8);assert.equal(p.delivery.get('key'),'bypassed');assert.equal(p.pending().length,0);
  p.seek(0);assert.equal(p.delivery.get('key'),'not-due');p.resume();assert.ok(p.tick(2.3));
});
test('Off bypasses pending information without claiming delivery', () => { const p=player();p.tick(2.3);p.setLevel('off');assert.equal(p.delivery.get('key'),'bypassed');p.resume();p.tick(10);assert.equal(p.delivery.get('door'),'bypassed'); });
test('recovery before first beat and at a fresh scene is unavailable', () => { const p=player();assert.equal(p.recover(),null);p.seek(8.1);assert.equal(p.recover(),null);assert.equal(p.mode,'controls'); });
test('repeated recovery cancels previous generation without overlap', () => { const p=player();p.tick(2.3);const first=p.recover();const second=p.recover();assert.notEqual(first.token,second.token);assert.equal(p.complete(first.token),false);assert.equal(p.complete(second.token),true); });
test('catalog save/restore keeps pending facts; new package refuses old snapshot', () => {
  const p=player();p.tick(2.3);p.catalog();const s=p.snapshot();const next=player();assert.equal(next.restore(s),true);assert.equal(next.pending().length,1);assert.equal(next.mode,'controls');
  assert.equal(next.restore({...s,version:'different'}),false);assert.equal(next.restore({...s,position:NaN}),false);
});
test('restart resets delivered and pending state', () => {const p=player();p.tick(2.3);p.controls();p.restart();assert.equal(p.pending().length,0);assert.equal(p.position,0);assert.equal(p.mode,'controls');});
test('resume with pending loss does not force repeated interruptions', () => {const p=player();p.tick(2.3);p.controls();p.resume();p.tick(4);assert.equal(p.mode,'playing');assert.equal(p.pending().length,1);});
test('abrupt restart restores in-flight critical narration as pending', () => {const p=player();p.tick(2.3);const saved=p.snapshot();assert.equal(p.delivery.get('key'),'not-due');const next=player();next.restore(saved);assert.equal(next.pending()[0].id,'key');});
test('forward seek keeps earlier player-lost critical facts pending', () => {
  const p=player(); p.tick(2.3); p.controls(); assert.equal(p.delivery.get('key'),'pending');
  p.resume(); p.tick(8.5); p.seek(12);
  assert.equal(p.delivery.get('key'),'pending'); assert.equal(p.delivery.get('door'),'bypassed'); assert.equal(p.pending()[0].id,'key');
});
test('forward seek bypasses skipped facts that were never described', () => { const p=player(); p.seek(10); assert.equal(p.delivery.get('key'),'bypassed'); assert.equal(p.pending().length,0); });
test('a late cue falls back to a shorter reviewed variant instead of being lost', () => {
  const a=fixture(); a.cues[0].variants.rich={...a.cues[0].variants.rich,duration:4}; a.cues[0].variants.standard={...a.cues[0].variants.standard,duration:2};
  const p=new Playback(a); p.level='rich'; p.enter(); p.resume();
  const cue=p.tick(4.5); assert.equal(cue.level,'standard'); assert.equal(cue.duration,2); assert.ok(p.log.some(e=>e.type==='level-fallback'));
  assert.equal(p.canStart(cue.token,4.5),true);
});
test('a late cue that fits no variant becomes recoverable', () => {
  const a=fixture(); for (const l of ['essential','standard','rich']) a.cues[0].variants[l]={...a.cues[0].variants[l],duration:3};
  const p=new Playback(a); p.enter(); p.resume(); assert.equal(p.tick(4.5),null); assert.equal(p.mode,'controls'); assert.equal(p.pending()[0].id,'key');
});
test('sceneAt maps positions, including the final instant', () => { const p=player(); assert.equal(p.sceneAt(0).id,'a'); assert.equal(p.sceneAt(8).id,'b'); assert.equal(p.sceneAt(15).id,'b'); });
