/**
 * Spoken guidance. Prefers pre-rendered Polly clips (same voice as the
 * narration, reliable completion events), falls back to speechSynthesis, and
 * never blocks the interface: a watchdog ends every utterance even when the
 * platform never reports completion, and any new request interrupts the last.
 */
export function createVoice({ clips = {}, onChange = () => {} } = {}) {
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  let audio = null, timer = null, token = 0, speaking = false;
  const set = value => { if (speaking !== value) { speaking = value; onChange(value); } };
  function release() {
    clearTimeout(timer); timer = null;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio = null; }
  }
  function stop() {
    token++; release();
    try { synth?.cancel(); } catch { /* engine unavailable */ }
    set(false);
  }
  /** items: a prompt ID, {id, text}, or a list of them, spoken in order. */
  function say(items) {
    stop();
    const queue = (Array.isArray(items) ? items : [items]).map(i => typeof i === 'string' ? { id: i, text: clips[i]?.text } : i);
    const mine = token;
    const next = () => {
      if (mine !== token) return;
      release();
      const item = queue.shift();
      if (!item) { set(false); return; }
      set(true);
      // Completion, error and the watchdog can all fire; each item advances once.
      let settled = false;
      const advance = () => { if (!settled && mine === token) { settled = true; next(); } };
      const fallback = () => { if (!settled && mine === token) { settled = true; speak(item.text); } };
      const clip = clips[item.id];
      if (!clip) { fallback(); return; }
      const a = new Audio(clip.audio); audio = a;
      a.onended = advance; a.onerror = fallback;
      timer = setTimeout(advance, (clip.duration + 1.5) * 1000);
      try { a.play()?.catch?.(fallback); } catch { fallback(); }
    };
    const speak = text => {
      release();
      if (!synth || !text || typeof SpeechSynthesisUtterance === 'undefined') { next(); return; }
      let settled = false;
      const advance = () => { if (!settled && mine === token) { settled = true; next(); } };
      const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US';
      u.onend = u.onerror = advance;
      timer = setTimeout(advance, (text.split(/\s+/).length / 2.2 + 2) * 1000);
      try { synth.speak(u); } catch { advance(); }
    };
    next();
  }
  return { say, stop, get speaking() { return speaking; } };
}
