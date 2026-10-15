import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const module=await import(process.env.SEMA_PLAYWRIGHT_MODULE || 'playwright');
const {chromium}=module.default ?? module;
const base=process.env.SEMA_URL || 'http://127.0.0.1:4175';
const output=path.resolve(process.env.SEMA_BROWSER_OUT || 'artifacts/browser');
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.SEMA_CHROME || undefined,headless:true,
  args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--mute-audio']});
const report={at:new Date().toISOString(),scope:'Real browser decoding and media events; audio output muted.',runs:[],interactions:[],errors:[]};
async function pageFor(query=''){
  const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400 && !r.url().endsWith('favicon.ico'))report.errors.push(`${r.status()} ${r.url()}`)});
  await page.addInitScript(()=>{window.SEMA_TEST=true;window.semaDiagnostics=[];window.ReactNativeWebView={postMessage:s=>{try{window.semaDiagnostics.push(JSON.parse(s))}catch{}}};});
  await page.goto(base+query); await page.waitForSelector('#film-sintel-dragon');return{page,context};
}
async function fullRun(film,level,codec='h264',fixed=false){
  const {page,context}=await pageFor(`/?codec=${codec}${fixed?'&study=fixed':''}`);
  await page.locator(`#film-${film}`).click();
  if(!fixed)await page.locator(`[data-choose-level=${level}]`).click();
  await page.locator('#resume').click();
  const started=Date.now();
  await page.waitForFunction(()=>['ended','error','controls'].includes(window.__sema.player.mode),null,{timeout:100000});
  const result=await page.evaluate(()=>({state:window.__sema.player.mode,position:window.__sema.player.position,
    duration:document.querySelector('video').duration,source:document.querySelector('video').currentSrc,
    expectedCues:window.SEMA_DATA.films.find(f=>f.package.id===window.__sema.player.asset.id).package.cues.length,
    log:window.__sema.player.log,media:document.querySelector('video').getVideoPlaybackQuality?.()}));
  result.film=film;result.level=fixed?'fixed-standard':level;result.codec=codec;result.wallSeconds=(Date.now()-started)/1000;
  report.runs.push(result);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  assert.equal(result.state,'ended',JSON.stringify(result));assert.ok(result.position>=71.9);
  const completions=result.log.filter(e=>e.type==='audio-complete');
  if(!fixed)assert.equal(completions.length,result.expectedCues,`${film}/${level}: incomplete cue playback`);
  else assert.equal(result.log.filter(e=>e.type==='audio-request').length,0);
  console.log('PASS full playback',film,level,codec,fixed?'fixed':'adjustable');await context.close();
}
async function interaction(film,critical){
  const {page,context}=await pageFor('/?codec=vp8');
  await page.locator(`#film-${film}`).click();await page.locator('[data-choose-level=standard]').click();await page.locator('#resume').click();
  await page.waitForFunction(id=>window.__sema.player.active?.events.includes(id),critical,{timeout:70000});
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__sema.player.pending().length),1);
  await page.locator('[data-level=rich]').click();
  const actionBoxes = await page.locator('#controls .actions button:not([hidden])').evaluateAll(bs => bs.map(b => ({id:b.id,x:b.getBoundingClientRect().x,width:b.getBoundingClientRect().width})));
  const paused=await page.locator('video').evaluate(v=>v.currentTime);
  await page.locator('#recover').click();await page.waitForFunction(()=>window.__sema.narration!==null);
  await page.waitForTimeout(400);await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__sema.player.pending().length),1);
  await page.locator('#recover').click();await page.waitForFunction(()=>window.__sema.player.mode==='controls',{},{timeout:20000});
  assert.equal(await page.evaluate(()=>window.__sema.player.pending().length),0);
  await page.locator('#earlier').click();await page.waitForFunction(()=>window.__sema.player.mode==='controls',{},{timeout:20000});
  const current=await page.locator('video').evaluate(v=>v.currentTime);assert.ok(Math.abs(paused-current)<0.05);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'earlier');
  const nextPreview = await page.evaluate(() => {
    const p = window.__sema.player;
    const selected = p.log.filter(e => e.type === 'recovery').at(-1).event;
    const moments = p.asset.events.filter(e => e.availableAt <= p.position).sort((a,b) => b.availableAt-a.availableAt);
    const next = moments[moments.findIndex(e => e.id === selected) + 1];
    return next?.labelPrompt ?? null;
  });
  assert.equal(await page.locator('#earlier').getAttribute('data-moment-prompt'), nextPreview,
    'only moments with a short form have a preview; full recovery speech is never substituted');
  assert.ok(await page.locator('#moment-context').isVisible());
  assert.match(await page.locator('#moment-context').textContent(), /Last described[\s\S]*Next earlier/, 'the completed answer and next target are explicitly distinguished');
  assert.equal(await page.locator('#earlier').textContent(), 'Earlier moment');
  const afterBoxes = await page.locator('#controls .actions button:not([hidden])').evaluateAll(bs => bs.map(b => ({id:b.id,x:b.getBoundingClientRect().x,width:b.getBoundingClientRect().width})));
  assert.deepEqual(afterBoxes, actionBoxes, 'moment labels preserve remote columns and widths');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'recover');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');
  const logs=await page.evaluate(()=>window.__sema.player.log);
  const spoken=await page.evaluate(()=>window.semaDiagnostics.filter(x=>x.sema==='guidance'));
  assert.ok(spoken.some(x=>x.type==='clip-playing'),'recorded guidance begins');
  await page.screenshot({path:path.join(output,film+'-controls.png')});
  report.interactions.push({film,paused,current,logs,spoken});
  await page.locator('#resume').click();await page.waitForFunction(()=>window.__sema.player.mode==='ended',null,{timeout:65000});
  console.log('PASS interrupt, change level, interrupt revisit, retry, earlier moment, resume',film);await context.close();
}
async function guidanceFailureRun(){
  const {page,context}=await pageFor('/?codec=vp8');
  await page.addInitScript(()=>Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true}));
  await page.route('**/media/prompts/*.mp3',route=>route.abort());
  await page.reload();
  await page.locator('#guidance-error').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'guidance-retry');
  for(const width of [1920,375]){
    await page.setViewportSize({width,height:width===375?812:1080});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const box=await page.locator('#guidance-error').boundingBox();
    assert.ok(box.x>=0 && box.x+box.width<=width);
    await page.screenshot({path:path.join(output,`guidance-error-${width}.png`)});
  }
  await page.unroute('**/media/prompts/*.mp3');
  await page.locator('#guidance-retry').click();
  await page.locator('#guidance-error').waitFor({state:'hidden'});
  await page.waitForTimeout(6000);
  assert.equal(await page.locator('#guidance-error').isVisible(),false);
  console.log('PASS unavailable guidance, focused recovery, retry and responsive error layout');
  report.guidanceRecovery=true;await context.close();
}
async function identityRun(){
  const {page,context}=await pageFor('/?codec=vp8');
  const played=await page.evaluate(async()=>{
    window.__semaScreenReader(false);window.__sema.voice.stop();
    const result=[];
    for(const [id,clip] of Object.entries(window.SEMA_DATA.momentPrompts)){
      await new Promise((resolve,reject)=>{
        const a=new Audio(clip.audio), timer=setTimeout(()=>{a.pause();reject(new Error(id+': identity audio timeout'));},7000);
        a.onended=()=>{clearTimeout(timer);result.push({id,text:clip.text,duration:a.duration,expected:clip.duration});resolve();};
        a.onerror=()=>{clearTimeout(timer);reject(new Error(id+': identity decode error'));};
        a.play().catch(reject);
      });
    }
    return result;
  });
  assert.equal(played.length,25);
  for(const clip of played){assert.ok(clip.duration>0&&clip.duration<5);assert.ok(Math.abs(clip.duration-clip.expected)<0.15);}
  report.identities=played;console.log('PASS decode and complete all 25 short identity recordings');await context.close();
}
async function remoteFlowRun(){
  const {page,context}=await pageFor('/?codec=vp8');
  await page.locator('#film-tears-of-steel').click();
  await page.locator('[data-choose-level=standard]').click();
  await page.locator('#resume').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('video').currentTime>=38,null,{timeout:55000});
  assert.match(await page.locator('#transport-hint').textContent(),/Back: pause$/);
  await page.keyboard.press('Enter');
  const paused=await page.locator('video').evaluate(v=>v.currentTime);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'recover');
  assert.match(await page.locator('#transport-hint').textContent(),/Back: catalog$/);
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__sema.player.mode==='recovering');
  assert.equal(await page.locator('#transport-hint').textContent(),'Back: stop description');
  await page.waitForFunction(()=>window.__sema.player.mode==='controls'&&document.activeElement.id==='resume',null,{timeout:15000});
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'recover');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'earlier');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__sema.player.mode==='recovering');
  const described=await page.evaluate(()=>window.__sema.player.active.events[0]);
  assert.equal(described,'pair-on-bridge');
  await page.waitForFunction(()=>window.__sema.player.mode==='controls',null,{timeout:15000});
  assert.ok(Math.abs(await page.locator('video').evaluate(v=>v.currentTime)-paused)<0.05);
  await page.locator('#more-options').focus();await page.keyboard.press('Enter');
  assert.match(await page.locator('#transport-hint').textContent(),/Back: close options$/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#viewing-options').isVisible(),false);
  assert.match(await page.locator('#transport-hint').textContent(),/Back: catalog$/);
  await page.locator('#recover').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__sema.player.mode==='recovering');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__sema.player.mode),'controls');
  assert.match(await page.locator('#transport-hint').textContent(),/Back: catalog$/);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.__sema.player.mode==='playing');
  assert.match(await page.locator('#transport-hint').textContent(),/Back: pause$/);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__sema.player.mode),'controls');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__sema.view),'catalog');
  report.remoteFlow={film:'tears-of-steel',paused,earlier:described,rightPressesAfterCompletion:2,backHintsMatchActions:true};
  await context.close();console.log('PASS keyboard Revisit, two-step Earlier, resume and state-specific Back hints');
}

async function polishRun(){
  const {page,context}=await pageFor('/?codec=vp8');
  await page.locator('#film-tears-of-steel').click();await page.locator('[data-choose-level=standard]').click();
  assert.equal(await page.locator('#review-banner').isVisible(),false,'prototype notice stays out of the film');
  assert.equal(await page.locator('#viewing-options').isVisible(),false);
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(()=>window.__sema.lastSpoken.includes('welcome')),false,'late native startup does not replace current viewing instructions');
  const at=await page.locator('video').evaluate(v=>v.currentTime);
  for(const width of [1920,1280,375]){
    await page.setViewportSize({width,height:width===375?812:width===1280?720:1080});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#more-options').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#more-options').getAttribute('aria-expanded'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.toggle),'text');
    const box=await page.locator('#controls [data-toggle=text]').boundingBox();
    const height=(await page.viewportSize()).height;assert.ok(box.y>=0&&box.y+box.height<=height);
    await page.screenshot({path:path.join(output,`options-${width}.png`)});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#viewing-options').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'more-options');
    assert.equal(await page.evaluate(()=>window.__sema.view),'player');
  }
  assert.equal(await page.locator('video').evaluate(v=>v.currentTime),at);
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('#recover').focus();await page.screenshot({path:path.join(output,'viewing-controls.png')});
  const clips=await page.evaluate(async()=>{
    window.__sema.voice.stop();const result=[];
    for(const [id,clip] of Object.entries(window.SEMA_DATA.prompts).filter(([,c])=>c.audio.startsWith('media/interface/'))){
      await new Promise((resolve,reject)=>{const a=new Audio(clip.audio),t=setTimeout(()=>{a.pause();reject(new Error(id+' timeout'));},7000);
        a.onended=()=>{clearTimeout(t);result.push({id,duration:a.duration,text:clip.text});resolve();};a.onerror=()=>reject(new Error(id+' decode error'));a.play().catch(reject);});
    }return result;
  });assert.equal(clips.length,4);assert.ok(clips.every(c=>c.duration>0&&c.duration<5));
  report.polish={pausedFramePreserved:true,optionWidths:[1920,1280,375],recordedOptions:clips};
  await context.close();
  const recovery=await pageFor('/?codec=vp8');
  await recovery.page.addInitScript(()=>Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true}));
  await recovery.page.route('**/media/prompts/*.mp3',route=>route.abort());await recovery.page.reload();
  await recovery.page.locator('#guidance-error').waitFor({state:'visible'});
  assert.equal(await recovery.page.locator('#guidance-continue').isVisible(),false);
  await recovery.page.evaluate(()=>window.__semaScreenReader(true));
  await recovery.page.locator('#guidance-continue').click();
  assert.equal(await recovery.page.locator('#guidance-error').isVisible(),false);
  assert.equal(await recovery.page.evaluate(()=>window.__sema.prefs.guidance),false);
  assert.equal(await recovery.page.evaluate(()=>document.activeElement.id),'film-sintel-dragon');
  report.polish.detectedVoiceViewRecovery=true;await recovery.context.close();
  const fixed=await pageFor('/?study=fixed');await fixed.page.locator('#film-tears-of-steel').click();
  assert.equal(await fixed.page.locator('#level-group').isVisible(),false);
  assert.equal(await fixed.page.locator('#detail-label').isVisible(),false);
  report.polish.fixedDetailHidden=true;await fixed.context.close();
  console.log('PASS option disclosure, Back/focus, three viewport sizes, four recorded prompts, detected-VoiceView recovery and fixed-mode layout');
}
try{
  if(!process.env.SEMA_BROWSER_SCOPE || process.env.SEMA_BROWSER_SCOPE==='polish') { await polishRun(); await remoteFlowRun(); }
  if(process.env.SEMA_BROWSER_SCOPE!=='polish'){
  if(!process.env.SEMA_BROWSER_SCOPE || process.env.SEMA_BROWSER_SCOPE==='identities') await identityRun();
  if(process.env.SEMA_BROWSER_SCOPE!=='identities'){
  if(process.env.SEMA_BROWSER_SCOPE!=='interactions') await guidanceFailureRun();
  if(process.env.SEMA_BROWSER_SCOPE!=='guidance'){
  const {page,context}=await pageFor('/');await page.screenshot({path:path.join(output,'catalog.png')});
  assert.equal(await page.locator('#review-banner').isVisible(),true);
  await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(output,'mobile.png')});await context.close();
  if(process.env.SEMA_BROWSER_SCOPE!=='interactions'){
  for(const level of ['essential','standard','rich'])await Promise.all(['sintel-dragon','tears-of-steel'].map(film=>fullRun(film,level,level==='standard'?'h264':'vp8')));
  await Promise.all(['sintel-dragon','tears-of-steel'].map(film=>fullRun(film,'standard','vp8',true)));
  }
  await Promise.all([interaction('sintel-dragon','injured-dragon'),interaction('tears-of-steel','forty-years-later')]);
  }
  }
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
