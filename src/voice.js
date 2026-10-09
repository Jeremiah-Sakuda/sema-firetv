/**
 * Spoken guidance. Prefers pre-rendered Polly clips (same voice as the
 * narration, reliable completion events), falls back to speechSynthesis, and
 * never blocks the interface: a watchdog ends every utterance even when the
 * platform never reports completion, and any new request interrupts the last.
 */
export function createVoice({ clips = {}, onChange = () => {}, onEvent = () => {}, onFailure = () => {}, environment = globalThis } = {}) {
  const synth = environment.speechSynthesis;
  const AudioClass = environment.Audio, Utterance = environment.SpeechSynthesisUtterance;
  let audio = null, timer = null, token = 0, speaking = false;
  const set = value => { if (speaking !== value) { speaking = value; onChange(value); } };
  function release() {
    environment.clearTimeout(timer); timer = null;
    if (audio) { audio.onended = null; audio.onerror = null; audio.onplaying = null; audio.pause(); audio.removeAttribute('src'); audio = null; }
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
      const failed = reason => {
        if (mine !== token) return;
        try { onFailure({ id: item.id, text: item.text, reason }); } catch { /* reporting must not trap input */ }
        next();
      };
      const fallback = () => { if (!settled && mine === token) { settled = true; speak(item, failed); } };
      const clip = clips[item.id];
      if (!clip) { fallback(); return; }
      const report = type => { try { onEvent({ type, id: item.id, duration: clip.duration }); } catch { /* diagnostics cannot block input */ } };
      let a;
      try { a = new AudioClass(clip.audio); audio = a; } catch { report('clip-error'); fallback(); return; }
      a.onplaying = () => {
        if (settled || mine !== token || audio !== a) return;
        report('clip-playing');
        environment.clearTimeout(timer);
        timer = environment.setTimeout(() => { report('clip-watchdog'); if (!settled && mine === token) { settled = true; release(); failed('clip-completion-timeout'); } }, (clip.duration + 1.5) * 1000);
      };
      a.onended = () => { report('clip-ended'); advance(); };
      a.onerror = () => { report('clip-error'); fallback(); };
      timer = environment.setTimeout(() => { report('clip-start-timeout'); fallback(); }, 5000);
      report('clip-requested');
      try { a.play()?.catch?.(fallback); } catch { fallback(); }
    };
    const speak = (item, failed) => {
      release();
      const text = item.text;
      if (!synth || !text || !Utterance) { failed('speech-unavailable'); return; }
      let settled = false;
      const finish = reason => {
        if (settled || mine !== token) return;
        settled = true;
        if (reason) {
          // Stop an engine that failed to signal completion before another item starts.
          try { synth.cancel(); } catch { /* unavailable engine */ }
          failed(reason);
        } else next();
      };
      try {
        const u = new Utterance(text); u.lang = 'en-US';
        u.onend = () => finish(); u.onerror = () => finish('speech-error');
        timer = environment.setTimeout(() => finish('speech-timeout'), (text.split(/\s+/).length / 2.2 + 2) * 1000);
        synth.speak(u);
      } catch { finish('speech-error'); }
    };
    next();
  }
  return { say, stop, get speaking() { return speaking; } };
}
