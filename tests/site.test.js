import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { buildSite } from '../tools/build-site.js';
import { MODULES } from '../tools/bundle.js';
import { setup } from './helpers/release-fixture.js';

function site(t) {
  const s = setup(t);
  for (const file of ['index.html', 'style.css', ...MODULES]) s.write(file, fs.readFileSync(file, 'utf8'));
  s.out = path.join(s.root, 'site');
  s.build = () => buildSite({ root: s.root, out: s.out, probe: s.probe });
  return s;
}

test('session output includes every referenced movie, narration and guidance asset', t => {
  const s = site(t); assert.equal(s.build().films, 2);
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(s.out, 'src/data.js'), 'utf8'), context);
  const data = context.window.SEMA_DATA;
  for (const film of data.films) {
    for (const file of [film.package.video, film.webm,
      ...film.package.cues.flatMap(c => Object.values(c.variants).map(v => v.audio)),
      ...film.package.events.map(e => e.recovery.audio)]) assert.ok(fs.existsSync(path.join(s.out, file)), file);
  }
  for (const clip of Object.values(data.prompts)) assert.ok(fs.existsSync(path.join(s.out, clip.audio)));
  assert.ok(fs.existsSync(path.join(s.out, '.nojekyll')));
  s.build(); assert.ok(fs.existsSync(path.join(s.out, 'src/bundle.js')), 'owned output may be rebuilt');
});

test('stale guidance or altered approved bytes block session builds and preserve prior output', t => {
  const s = site(t); s.build();
  const before = fs.readFileSync(path.join(s.out, 'src/data.js'), 'utf8');
  s.write('pipeline/prompts.json', { welcome: 'Changed instructions.' });
  assert.throws(s.build, /GUIDANCE_STALE/);
  assert.equal(fs.readFileSync(path.join(s.out, 'src/data.js'), 'utf8'), before);
  s.write('pipeline/prompts.json', { welcome: 'Welcome.' });
  s.write('media/alpha/recover-envelope-hidden.mp3', 'unreviewed audio');
  assert.throws(s.build, /APPROVED_CONTENT_CHANGED/);
});

test('session builder rejects missing films and source or unowned output directories', t => {
  const s = site(t);
  for (const out of [s.root, path.dirname(s.root), path.join(s.root, 'media'), path.join(s.root, 'src', 'site')])
    assert.throws(() => buildSite({ root: s.root, out, probe: s.probe }), /project source/);
  s.write('site/keep.txt', 'owned by someone else');
  assert.throws(s.build, /not owned/);
  assert.equal(fs.readFileSync(path.join(s.out, 'keep.txt'), 'utf8'), 'owned by someone else');
  fs.rmSync(s.out, { recursive: true });
  fs.unlinkSync(path.join(s.root, s.films[0].package));
  assert.throws(s.build, /MISSING_FILE/);
  assert.equal(fs.existsSync(s.out), false);
});


test('site copies independent moment audio and rejects changed names without replacing prior output', t => {
  const s=site(t),id='moment_alpha_envelope_hidden',audio=`media/moment-labels/${id}.mp3`;
  s.write('content/moment-labels.json',{alpha:{'envelope-hidden':'Hidden envelope'}});
  s.write(audio,'identity bytes');s.durations.set(audio,1);
  s.write('media/moment-labels/prompts.json',{[id]:{text:'Hidden envelope.',audio,duration:1,sha256:crypto.createHash('sha256').update('identity bytes').digest('hex')}});
  s.build();assert.equal(fs.readFileSync(path.join(s.out,audio),'utf8'),'identity bytes');
  const before=fs.readFileSync(path.join(s.out,'src/data.js'),'utf8');
  s.write(audio,'changed same-duration words');assert.throws(s.build,/GUIDANCE_CHANGED/);
  assert.equal(fs.readFileSync(path.join(s.out,'src/data.js'),'utf8'),before);
});
