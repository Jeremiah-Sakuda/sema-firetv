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
const report={at:new Date().toISOString(),scope:'Real browser decoding and media events; audio output muted, not a human listening test.',runs:[],interactions:[],errors:[]};
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
  const paused=await page.locator('video').evaluate(v=>v.currentTime);
  await page.locator('#recover').click();await page.waitForFunction(()=>window.__sema.narration!==null);
  await page.waitForTimeout(400);await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__sema.player.pending().length),1);
  await page.locator('#recover').click();await page.waitForFunction(()=>window.__sema.player.mode==='controls',{},{timeout:20000});
  assert.equal(await page.evaluate(()=>window.__sema.player.pending().length),0);
  await page.locator('#earlier').click();await page.waitForFunction(()=>window.__sema.player.mode==='controls',{},{timeout:20000});
  const current=await page.locator('video').evaluate(v=>v.currentTime);assert.ok(Math.abs(paused-current)<0.05);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'earlier');
  assert.ok(await page.locator('#earlier').getAttribute('data-moment-prompt'));
  assert.ok(await page.locator('#moment-context').isVisible());
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
try{
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
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
