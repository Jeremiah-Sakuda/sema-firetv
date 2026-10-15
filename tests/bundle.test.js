import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildData } from '../tools/bundle.js';

function root(t, { clips = {}, catalog = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-bundle-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (f, v) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), typeof v === 'string' ? v : JSON.stringify(v)); };
  write('media/catalog.json', { films: catalog });
  write('pipeline/prompts.json', { paused: 'Paused.', ready: 'Ready.' });
  clips=Object.fromEntries(Object.entries(clips).map(([id,c])=>[id,{...c,sha256:crypto.createHash('sha256').update('mp3').digest('hex')}]));
  write('media/prompts/prompts.json', clips);
  for (const c of Object.values(clips)) write(c.audio, 'mp3');
  return dir;
}

test('a recorded prompt is used only while it says the current text', t => {
  const dir = root(t, { clips: { paused: { text: 'Paused. Resume is selected.', audio: 'media/prompts/paused.mp3', duration: 1 },
    ready: { text: 'Ready.', audio: 'media/prompts/ready.mp3', duration: 1 } } });
  const { data, staleClips, missingClips } = buildData(dir);
  assert.deepEqual(Object.keys(data.prompts), ['ready']);
  assert.deepEqual(staleClips, ['paused']);
  assert.deepEqual(missingClips, ['paused']);
  assert.equal(data.promptTexts.paused, 'Paused.');
});

test('pending catalog entries are left out of the build', t => {
  const dir = root(t, { catalog: [{ id: 'later', package: 'media/later/package.json', status: 'pending' }] });
  assert.deepEqual(buildData(dir).data.films, []);
});

test('build output is deterministic', t => {
  const dir = root(t);
  assert.equal(JSON.stringify(buildData(dir).data), JSON.stringify(buildData(dir).data));
});

test('all open-film moments have short recorded identities independent of timed narration', t => {
  const catalog = JSON.parse(fs.readFileSync('preview/media/catalog.json')).films;
  const dir = root(t, {catalog, clips: JSON.parse(fs.readFileSync('media/prompts/prompts.json'))});
  fs.mkdirSync(path.join(dir,'content'),{recursive:true});
  fs.copyFileSync('content/moment-labels.json',path.join(dir,'content/moment-labels.json'));
  fs.copyFileSync('pipeline/prompts.json', path.join(dir,'pipeline/prompts.json'));
  for (const entry of catalog) {
    const pkg = JSON.parse(fs.readFileSync(`preview/${entry.package}`));
    fs.mkdirSync(path.dirname(path.join(dir,entry.package)), {recursive:true});
    fs.writeFileSync(path.join(dir,entry.package), JSON.stringify(pkg));
    for (const clip of [...pkg.events.map(e=>e.recovery), ...pkg.cues.map(c=>c.variants.essential)]) {
      const target = path.join(dir,clip.audio); fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(`preview/${clip.audio}`,target);
    }
  }
  fs.cpSync('media/moment-labels',path.join(dir,'media/moment-labels'),{recursive:true});
  const {data, missingClips, missingMomentClips} = buildData(dir, () => {}, {preview:true});
  assert.equal(missingClips.length, 0);
  assert.equal(missingMomentClips.length, 0);
  assert.equal(Object.keys(data.momentPrompts).length, 25);
  for (const film of data.films) for (const event of film.package.events) {
    const clip = data.momentPrompts[event.labelPrompt];
    assert.ok(clip && fs.existsSync(path.join(dir,clip.audio)));
    assert.equal(clip.text, `${event.label}.`);
    assert.notEqual(clip.audio,event.recovery.audio);
    assert.ok(clip.text.length < event.recovery.text.length, 'identity is shorter than the answer');
    assert.ok(clip.duration > 0 && clip.duration < 5);
  }
  const id = Object.keys(data.momentPrompts)[0];
  fs.writeFileSync(path.join(dir,data.momentPrompts[id].audio),'changed recording');
  assert.deepEqual(buildData(dir,()=>{}, {preview:true}).missingMomentClips,[id], 'changed identity bytes cannot masquerade as the recorded name');
});


test('supplemental option recordings require current text and intact bytes', t => {
  const dir=root(t);fs.mkdirSync(path.join(dir,'content'),{recursive:true});
  fs.copyFileSync('content/interface-prompts.json',path.join(dir,'content/interface-prompts.json'));
  fs.cpSync('media/interface',path.join(dir,'media/interface'),{recursive:true});
  const data=buildData(dir);assert.equal(Object.keys(data.data.prompts).length,4);
  assert.equal(data.data.prompts.options_open.text,'Viewing options opened.');
  fs.writeFileSync(path.join(dir,'media/interface/options_open.mp3'),'altered');
  assert.ok(buildData(dir).missingClips.includes('options_open'));
});


test('altered Polly bytes and missing fingerprints cannot enter the bundle', t => {
  const dir=root(t,{clips:{ready:{text:'Ready.',audio:'media/prompts/ready.mp3',duration:1}}});
  assert.ok(buildData(dir).data.prompts.ready);fs.writeFileSync(path.join(dir,'media/prompts/ready.mp3'),'other bytes');
  assert.equal(buildData(dir).data.prompts.ready,undefined);
  const file=path.join(dir,'media/prompts/prompts.json'),rows=JSON.parse(fs.readFileSync(file));delete rows.ready.sha256;
  fs.writeFileSync(file,JSON.stringify(rows));assert.ok(buildData(dir).missingClips.includes('ready'));
});
