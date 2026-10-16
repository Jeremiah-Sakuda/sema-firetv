// The publisher integration path in docs/INTEGRATION.md, run in plain Node:
// the scheduler needs no DOM, media element or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Playback } from '../src/playback.js';
const pkg = JSON.parse(fs.readFileSync('media/fixture/package.json'));

test('the documented integration sequence runs without a browser', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const p = new Playback(pkg, { allowFixture: true });
  p.enter(); p.setLevel('standard'); p.resume();
  let cue = p.tick(2.6);
  assert.ok(cue, 'a timed cue is due');
  assert.equal(p.canStart(cue.token, 2.6), true);
  p.complete(cue.token);
  assert.equal(p.delivery.get('envelope-hidden'), 'delivered');
  cue = p.tick(9.6);
  assert.ok(cue);
  p.controls('pause');                                    // the viewer pauses mid-description
  assert.deepEqual(p.pending().map(e => e.id), ['door-open'], 'a cut-off critical fact is never counted as heard');
  const revisit = p.recover();
  assert.equal(revisit.events[0], 'door-open', 'Revisit offers the missed fact first');
  p.complete(revisit.token);
  assert.equal(p.pending().length, 0);
  assert.equal(p.recover('envelope-hidden').events[0], 'envelope-hidden', 'Earlier moment');
});

test('the scheduler never selects a future moment and refuses unapproved packages by default', () => {
  const p = new Playback(pkg, { allowFixture: true });
  p.enter(); p.resume(); p.tick(5);
  assert.equal(p.recover('door-open'), null, 'door-open becomes available at 9 s');
  assert.throws(() => new Playback({ ...pkg, reviewStatus: 'draft' }), /approval/);
});
