/* audio.js – Web Audio sound effects */
window.Sound = (function () {
  let ctx = null;
  let enabled = true;
  let volume = 0.3;

  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    }
    return ctx;
  }

  function beep(freq, dur, type = 'sine', vol = 1) {
    if (!enabled) return;
    const c = ensure(); if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume * vol;
    osc.connect(gain).connect(c.destination);
    const t = c.currentTime;
    gain.gain.setValueAtTime(volume * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  }

  return {
    setEnabled(v) { enabled = v; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); },
    key()     { beep(800, 0.03, 'triangle', 0.5); },
    error()   { beep(180, 0.10, 'sawtooth', 0.8); },
    complete(){ beep(660, 0.09); setTimeout(() => beep(880, 0.12), 90); },
    unlock()  { ensure()?.resume(); },
  };
})();
