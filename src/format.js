/** m:ss for any duration; never assumes a short clip. */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Spoken form used in accessible names, e.g. "1 minute 12 seconds". */
export function spokenDuration(seconds) {
  const s = Math.max(0, Math.round(seconds)), m = Math.floor(s / 60), r = s % 60;
  const parts = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (r || !m) parts.push(`${r} second${r === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** Prompt IDs are [a-z0-9_]; asset IDs may contain hyphens. */
export const promptId = id => String(id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
