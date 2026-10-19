import test from 'node:test';
import assert from 'node:assert/strict';
import { createMomentNavigation } from '../src/moment-navigation.js';

const events = Array.from({ length: 125 }, (_, i) => ({ id: `moment-${i}`, availableAt: i * 5 + 1, label: `Visual fact ${i}` }));
test('Revisit and Earlier share reveal filtering and pending critical priority', () => {
  const nav = createMomentNavigation(events);
  assert.equal(nav.view(0).revisit, null);
  assert.equal(nav.view(1).revisit.id, 'moment-0');
  assert.equal(nav.view(1).earlier, null);
  const state = nav.view(50, { pendingIds: ['moment-7', 'moment-3', 'moment-100'] });
  assert.equal(state.revisit.id, 'moment-3');
  assert.equal(state.earlier.id, 'moment-2');
  assert.equal(nav.view(50, { cursorId: 'moment-8', pendingIds: ['moment-3'] }).earlier.id, 'moment-7');
  assert.equal(nav.view(50, { cursorId: 'moment-100' }).earlier.id, 'moment-8');
});
test('every revealed moment is reachable through bounded ranges, with no future label', () => {
  const nav = createMomentNavigation(events);
  for (const at of [0, 1, 30, 100, 621]) {
    const found = [], walk = path => {
      const page = nav.page(at, path);
      assert.ok(page.items.length <= 6);
      for (const row of page.items) {
        if (row.kind === 'moment') { assert.ok(row.event.availableAt <= at); found.push(row.event.id); }
        else { assert.ok(row.first.availableAt <= at && row.last.availableAt <= at); assert.ok(row.count > 1); walk(row.path); }
      }
    };
    walk([]);
    assert.deepEqual(found, nav.view(at).available.map(e => e.id));
    assert.equal(new Set(found).size, found.length);
  }
});
test('deep paths and anchors cannot expose future moments after a rewind', () => {
  const nav = createMomentNavigation(events);
  const page = nav.page(621, [5, 4]);
  assert.ok(page.path.length === 2);
  const rewound = nav.page(2, page.path, 'moment-100');
  assert.deepEqual(rewound.path, []);
  assert.deepEqual(rewound.items.map(x => x.event.id), ['moment-0']);
  assert.equal(nav.page(621, [], 'moment-0').focusIndex, 5);
});
test('tied reveal times keep input order and each moment can still be selected', () => {
  const tied = events.slice(0, 15).map(e => ({ ...e, availableAt: 10 }));
  const nav = createMomentNavigation(tied);
  assert.deepEqual(nav.view(10).available, tied);
  assert.equal(nav.view(9).available.length, 0);
  assert.equal(nav.page(10, [], 'moment-14').focusIndex, 4);
});
