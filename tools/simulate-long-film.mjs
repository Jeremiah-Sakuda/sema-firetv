// Synthetic workload and navigation experiment; never a human-effort measurement.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Playback } from '../src/playback.js';
import { validatePackage } from '../src/package.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sources=['sintel-dragon','tears-of-steel'].map(id=>JSON.parse(fs.readFileSync(path.join(root,'preview/media',id,'package.json'))));
const out=path.join(root,'artifacts/extended-review');fs.mkdirSync(out,{recursive:true});
const round=n=>Math.round(n*1000)/1000;
function sourceCommit(){
  try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
  catch{return null;} // A downloaded source archive may have no Git metadata.
}
function film(blocks){
  const p={id:`synthetic-${blocks}-blocks`,version:'simulation-1',title:'Synthetic repeated-excerpt workload',reviewStatus:'draft',rights:'Simulation using repeated CC BY source metadata; not a newly authored film.',video:'simulation/not-rendered.mp4',duration:0,scenes:[],events:[],cues:[],dialogue:[]};
  for(let i=0;i<blocks;i++){
    const s=sources[i%sources.length],offset=p.duration,prefix=`b${i}-`;
    p.scenes.push(...s.scenes.map(x=>({...x,id:prefix+x.id,start:x.start+offset,end:x.end+offset})));
    p.events.push(...s.events.map(x=>({...structuredClone(x),id:prefix+x.id,scene:prefix+x.scene,availableAt:x.availableAt+offset})));
    p.cues.push(...s.cues.map(x=>({...structuredClone(x),id:prefix+x.id,start:x.start+offset,end:x.end+offset,events:x.events.map(id=>prefix+id)})));
    p.dialogue.push(...s.dialogue.map(x=>({start:x.start+offset,end:x.end+offset})));
    p.duration+=s.duration;
  }
  assert.deepEqual(validatePackage(p,{allowDraft:true}),[]);return p;
}
function workload(p){
  const items=[...p.cues.flatMap(c=>Object.values(c.variants).map(v=>({duration:v.duration,kind:'timed'}))),...p.events.map(e=>({duration:e.recovery.duration,kind:'revisit'}))];
  const recoverySeconds=p.events.reduce((n,e)=>n+e.recovery.duration,0);
  const scenarios=[{name:'light',decisionSeconds:5,reworkFraction:0.05,editSeconds:45},{name:'moderate',decisionSeconds:15,reworkFraction:0.15,editSeconds:90},{name:'heavy',decisionSeconds:30,reworkFraction:0.30,editSeconds:180}].map(a=>{
    const edits=Math.ceil(items.length*a.reworkFraction);
    // Spread selected items across the workload; deterministic and reproducible.
    const selected=Array.from({length:edits},(_,i)=>items[Math.floor(i*items.length/edits)]);
    const seconds={watchSource:p.duration,watchThreeTimedLevels:3*p.duration,listenToRevisit:recoverySeconds,decisions:items.length*a.decisionSeconds,edit:edits*a.editSeconds,recheck:selected.reduce((n,x)=>n+x.duration+6,0)};
    return {...a,editedItems:edits,componentsMinutes:Object.fromEntries(Object.entries(seconds).map(([k,v])=>[k,round(v/60)])),simulatedEditorialMinutes:round(Object.values(seconds).reduce((a,b)=>a+b,0)/60)};
  });
  return {items:items.length,timedVariants:p.cues.length*3,revisitVariants:p.events.length,assumptions:'One uninterrupted source watch, one full pass at each of three levels, each Revisit recording heard once, decision time for every variant, selected edits followed by six seconds of context plus the edited audio. All decision/edit times and rework rates are assumptions. No breaks, collaboration, render/network wait, new-film annotation, or unseen-content complexity included. Repeated clips do not provide novel-film comprehension evidence.',scenarios};
}
function navigation(p){
  const player=new Playback(p,{allowDraft:true});player.enter();player.seek(p.duration-0.01);
  const events=p.events.filter(e=>e.availableAt<=player.position).sort((a,b)=>b.availableAt-a.availableAt);
  const results=[];
  for(const lookback of [30,60,180,300]){
    const target=events.find(e=>e.availableAt<=player.position-lookback);if(!target)continue;
    const hops=events.indexOf(target),visited=[];let listenSeconds=0;
    // Drive the real scheduler; the adapter supplies the same descending event order as Earlier.
    for(let i=0;i<=hops;i++){
      const audio=player.recover(events[i].id);assert(audio);assert.equal(player.active.events[0],events[i].id);
      listenSeconds+=audio.duration;visited.push(events[i].id);assert(player.complete(audio.token));
    }
    results.push({lookbackSeconds:lookback,earlierPresses:hops,descriptionsIncludingLatest:visited.length,audioSecondsIfAllHeard:round(listenSeconds),minimumButtonPressesAfterRevisit:hops+2,buttonPressAssumption:'After completed Revisit, two Right presses reach Earlier, then one Select per earlier event. Excludes label prompts and input latency. Skipping audio saves time but does not prove the viewer can identify the target.'});
  }
  return results;
}
function exercise(p){
  const start=performance.now();let calls=0,cues=0,checks=0,maxTickMs=0;
  for(const level of ['essential','standard','rich']){
    const player=new Playback(p,{allowDraft:true});player.enter();player.setLevel(level);player.resume();
    let end=-1;
    for(let ms=0;ms<=p.duration*1000;ms+=30){
      const t=ms/1000;
      if(player.active&&t>=end){assert(player.complete(player.active.token));}
      const at=performance.now(),a=player.tick(t);maxTickMs=Math.max(maxTickMs,performance.now()-at);calls++;
      if(a){assert(player.canStart(a.token,t));for(const id of a.events){assert(p.events.find(e=>e.id===id).availableAt<=t);checks++;}end=t+a.duration;cues++;}
      assert.notEqual(player.mode,'controls','normal playback unexpectedly paused');
    }
    if(player.active)player.complete(player.active.token);
    assert.equal(player.mode,'ended');
  }
  // Interrupt a critical cue near the end, retain it across save/restore, and retry.
  const c=p.cues.findLast(c=>c.events.some(id=>p.events.find(e=>e.id===id).critical));
  const player=new Playback(p,{allowDraft:true});player.enter();player.seek(c.start-0.1);player.resume();
  const a=player.tick(c.start+c.margin+0.01);assert(a);player.controls('simulated-interruption');
  assert(player.pending().length);assert.equal(player.complete(a.token),false);
  const restored=new Playback(p,{allowDraft:true});assert(restored.restore(player.snapshot()));
  const pending=restored.pending()[0].id,recovery=restored.recover();assert.equal(recovery.events[0],pending);restored.complete(recovery.token);assert.equal(restored.pending().length,0);
  const future=p.events.find(e=>e.availableAt>restored.position);if(future)assert.equal(restored.recover(future.id),null);
  return {schedulerCalls:calls,timedClipsCompleted:cues,availabilityChecks:checks,criticalInterruptionRestorePassed:true,futureSelectionRejected:!!future,computeMilliseconds:round(performance.now()-start),maximumSingleTickMilliseconds:round(maxTickMs),scope:'Node state-machine execution with synthetic clock and immediate completion callbacks; not real-time video decoding or device latency.'};
}
const report={kind:'simulation',humanReviewMinutesMeasured:null,deviceInteractionMeasured:false,createdAt:new Date().toISOString(),sourceCommit:sourceCommit(),sourceFiles:sources.map(p=>({id:p.id,version:p.version,duration:p.duration,packageSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'preview/media',p.id,'package.json'))).digest('hex')})),runs:[10,20,50].map(blocks=>{const p=film(blocks);return {durationMinutes:p.duration/60,blocks,visualMoments:p.events.length,cues:p.cues.length,workload:workload(p),navigation:navigation(p),execution:exercise(p)};})};
fs.writeFileSync(path.join(out,'long-film-simulation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
