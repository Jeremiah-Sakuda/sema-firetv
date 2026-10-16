/** Own physical media lifetimes; Playback owns story and scheduling policy. */
export function createPlaybackSession({ video, voice, getPlayback, onEvent = () => {}, environment = globalThis }) {
  let videoAttempt = null, videoEpoch = 0, videoStarted = false, bufferTimer = null;
  let narration = null, preload = null, duckTimer = null;
  const emit = (type, detail = {}) => onEvent({ type, ...detail });
  const clearBuffer = () => { environment.clearTimeout(bufferTimer); bufferTimer = null; };
  function cancelVideo() {
    videoEpoch++; clearBuffer(); videoStarted = false;
    if (videoAttempt) {
      const old = videoAttempt; videoAttempt = null;
      environment.clearTimeout(old.timer); old.resolve('cancelled');
    }
  }
  function playVideo() {
    cancelVideo();
    const playback = getPlayback();
    return new Promise(resolve => {
      const attempt = { playback, resolve, timer: null };
      videoAttempt = attempt;
      const finish = outcome => {
        if (videoAttempt !== attempt) return;
        videoAttempt = null; environment.clearTimeout(attempt.timer);
        const result = getPlayback() === playback && playback?.mode === 'playing' ? outcome : 'cancelled';
        resolve(result);
        // Dispatch failure inside the attempt guard, not in a later caller microtask.
        if (result === 'failed') emit('video-failed');
      };
      attempt.finish = finish;
      attempt.timer = environment.setTimeout(() => finish(videoStarted ? 'started' : 'failed'), 5000);
      try { Promise.resolve(video.play()).then(() => finish('started'), () => finish(videoStarted ? 'started' : 'failed')); }
      catch { finish('failed'); }
    });
  }
  video.addEventListener('playing', () => {
    if (getPlayback()?.mode !== 'playing') return;
    videoStarted = true; clearBuffer(); videoAttempt?.finish('started');
  });
  video.addEventListener('waiting', () => {
    const playback = getPlayback();
    if (!videoStarted || playback?.mode !== 'playing') return;
    clearBuffer();
    if (playback.active?.kind === 'cue') {
      emit('video-stalled', { duringNarration: true, critical: playback.active.events.some(id => playback.critical(id)) });
      return;
    }
    const epoch = videoEpoch;
    bufferTimer = environment.setTimeout(() => {
      bufferTimer = null;
      if (epoch === videoEpoch && getPlayback() === playback && playback.mode === 'playing' && video.readyState < 3)
        emit('video-stalled', { duringNarration: false });
    }, 900);
  });
  function duck(on) {
    const target = on ? 0.35 : 1;
    environment.clearInterval(duckTimer); duckTimer = null;
    if (Math.abs((video.volume ?? 1) - target) < 0.01) return;
    duckTimer = environment.setInterval(() => {
      const v = video.volume, next = Math.abs(target - v) <= 0.08 ? target : v + Math.sign(target - v) * 0.08;
      try { video.volume = next; } catch { /* platform volume unsupported */ }
      if (next === target) { environment.clearInterval(duckTimer); duckTimer = null; }
    }, 20);
  }
  function stopNarration() {
    const old = narration; narration = null;
    if (old) {
      environment.clearTimeout(old.timer);
      old.audio.onended = null; old.audio.onerror = null; old.audio.onplaying = null;
      old.audio.removeEventListener?.('canplay', old.start);
      old.audio.pause(); old.audio.removeAttribute('src');
    }
    duck(false); emit('narration-stopped');
  }
  function pause() { cancelVideo(); video.pause(); stopNarration(); voice.stop(); }
  function dropPreload() {
    if (preload) { preload.audio.removeAttribute('src'); preload = null; }
  }
  function reset() {
    pause(); dropPreload(); environment.clearInterval(duckTimer); duckTimer = null;
    try { video.volume = 1; } catch { /* platform volume unsupported */ }
  }
  function prepareNext() {
    const playback = getPlayback();
    if (narration && (!playback?.active || narration.playback !== playback || playback.active.token !== narration.cue.token)) stopNarration();
    if (!playback || playback.mode !== 'playing' || playback.level === 'off') return;
    const t = video.currentTime;
    const next = playback.asset.cues.find(c => !playback.attempted.has(c.id) && c.start + c.margin > t);
    if (!next || next.start + next.margin - t > 2.5) return;
    const key = `${next.id}:${playback.level}`;
    if (preload?.key === key) return;
    dropPreload();
    try {
      const audio = new environment.Audio(next.variants[playback.level].audio);
      audio.preload = 'auto'; audio.load?.(); preload = { key, audio };
    } catch { /* preloading is optional; narrate reports actual playback failures */ }
  }
  function narrate(cue) {
    stopNarration();
    const playback = getPlayback(), requestedAt = environment.performance.now();
    const wasPreloaded = cue.kind === 'cue' && preload?.key === `${cue.cue}:${cue.level}`;
    let audio;
    try { audio = wasPreloaded ? preload.audio : new environment.Audio(cue.audio); }
    catch { dropPreload(); emit('narration-failed', { cue }); return; }
    if (wasPreloaded) preload = null; else dropPreload();
    const attempt = { audio, playback, cue, timer: null, started: false, requested: false, start: null };
    narration = attempt; audio.preload = 'auto';
    const current = () => narration === attempt && getPlayback() === playback && playback?.active?.token === cue.token;
    const lost = paused => { stopNarration(); emit('narration-lost', { cue, paused }); };
    const fail = () => { if (current()) emit('narration-failed', { cue }); };
    // A timed cue that cannot play is handled like one that never starts:
    // optional detail is dropped and a critical fact becomes recoverable.
    // Only a failed recovery, which the viewer asked for, reports an error.
    const failed = () => {
      if (!current()) return;
      if (cue.kind === 'recovery') { fail(); return; }
      playback.record('audio-error', { token: cue.token });
      playback.position = video.currentTime;
      lost(playback.lose('audio-error'));
    };
    audio.onended = () => {
      if (!current()) return;
      const delivered = playback.complete(cue.token);
      stopNarration(); emit('narration-completed', { cue, delivered });
    };
    audio.onerror = failed;
    const timeout = () => {
      if (!current()) return;
      playback.record('audio-timeout', { token: cue.token, kind: cue.kind, started: attempt.started });
      if (cue.kind === 'recovery') { fail(); return; }
      playback.position = video.currentTime;
      lost(playback.lose('audio-timeout'));
    };
    attempt.timer = environment.setTimeout(timeout, 5000);
    const canStart = () => playback.canStart(cue.token, cue.kind === 'recovery' ? playback.position : video.currentTime);
    const started = () => {
      if (!current() || attempt.started) return;
      if (!canStart()) { lost(playback.mode !== 'playing'); return; }
      attempt.started = true; environment.clearTimeout(attempt.timer);
      attempt.timer = environment.setTimeout(timeout, (cue.duration + 1.5) * 1000);
      playback.record('audio-start', { token: cue.token, mediaPosition: video.currentTime,
        preloaded: !!wasPreloaded, onsetMs: Math.round(environment.performance.now() - requestedAt) });
      if (cue.kind === 'cue') duck(true);
      emit('narration-started', { cue });
    };
    audio.onplaying = started;
    attempt.start = () => {
      if (!current() || attempt.requested) return;
      if (!canStart()) { lost(playback.mode !== 'playing'); return; }
      attempt.requested = true;
      try {
        audio.play()?.then?.(() => { if (current()) started(); else audio.pause(); }, failed);
      } catch { failed(); }
    };
    if (audio.readyState >= 3) attempt.start();
    else { audio.addEventListener('canplay', attempt.start, { once: true }); audio.load?.(); }
  }
  return { playVideo, pause, reset, narrate, stopNarration, prepareNext,
    get narrating() { return !!narration; },
    // Read-only diagnostics retain the existing SEMA_TEST hooks, not presentation dependencies.
    inspect() { return { narration: narration?.audio ?? null, preload }; } };
}
