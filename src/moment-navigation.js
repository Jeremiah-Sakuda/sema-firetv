/** Moment selection shared by playback, the remote adapter and workload tools.
 * A page contains at most six rows. Larger ranges subdivide until rows are
 * individual moments. Filtering happens before grouping: even range labels
 * must never expose a future moment. This module never moves the film clock.
 */
export function createMomentNavigation(events) {
  const ordered = [...events].sort((a, b) => b.availableAt - a.availableAt);
  const available = position => ordered.filter(e => e.availableAt <= position);
  function view(position, { cursorId = null, pendingIds = [] } = {}) {
    const moments = available(position);
    const pending = new Set(pendingIds);
    const missed = moments.filter(e => pending.has(e.id)).sort((a, b) => a.availableAt - b.availableAt)[0];
    const revisit = missed ?? moments[0] ?? null;
    const anchor = moments.find(e => e.id === cursorId) ?? revisit;
    return { available: moments, latest: moments[0] ?? null, revisit,
      earlier: anchor ? moments[moments.indexOf(anchor) + 1] ?? null : null };
  }
  function rows(moments, path) {
    if (moments.length <= 6) return moments.map(event => ({ kind: 'moment', event, key: event.id }));
    const size = Math.ceil(moments.length / 6), result = [];
    for (let start = 0; start < moments.length; start += size) {
      const range = moments.slice(start, start + size);
      if (range.length === 1) { result.push({ kind: 'moment', event: range[0], key: range[0].id }); continue; }
      result.push({ kind: 'range', key: `range-${range[0].id}-${range.at(-1).id}`,
        path: [...path, result.length], first: range.at(-1), last: range[0], count: range.length, range });
    }
    return result;
  }
  function page(position, path = [], anchorId = null) {
    let moments = available(position), trail = [];
    for (const index of path) {
      if (!Number.isInteger(index)) break;
      const selected = rows(moments, trail)[index];
      if (selected?.kind !== 'range') break;
      moments = selected.range; trail = selected.path;
    }
    const entries = rows(moments, trail);
    const focusIndex = Math.max(0, entries.findIndex(row => row.kind === 'moment'
      ? row.event.id === anchorId : row.range.some(e => e.id === anchorId)));
    return { path: trail, count: moments.length, focusIndex,
      items: entries.map(({ range, ...row }) => row) };
  }
  return { view, page };
}
