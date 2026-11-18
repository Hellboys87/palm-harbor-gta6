// Tiny WebAudio synth: no audio files, everything is oscillators and
// filtered noise. The context stays locked until the first user gesture,
// per browser policy. M toggles mute (persisted in localStorage).

import { MUTE_KEY } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch { muted = false; }

  // Continuous voices: engine hum and the police siren.
  let engineOsc = null, engineGain = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(master);
    engineOsc.start();
    sirenOsc = ctx.createOscillator();
    sirenGain = ctx.createGain();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = 0, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.3, freq = 1800) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Called every frame: engine pitch follows speed, siren wails when cops are near. */
    update(dt, engineSpeed, sirenNear) {
      if (!ctx) return;
      if (engineGain) {
        const target = muted ? 0 : Math.min(0.12, Math.abs(engineSpeed) / 345 * 0.12);
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        engineOsc.frequency.setTargetAtTime(50 + Math.abs(engineSpeed) * 0.55, ctx.currentTime, 0.08);
      }
      if (sirenGain) {
        sirenTimer -= dt;
        if (sirenTimer <= 0) { sirenHigh = !sirenHigh; sirenTimer = 0.42; }
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 940 : 660, ctx.currentTime, 0.05);
        sirenGain.gain.setTargetAtTime(!muted && sirenNear ? 0.045 : 0, ctx.currentTime, 0.1);
      }
    },
    shoot() { noise(0.11, 0.35, 2600); tone(150, 0.08, 'square', 0.12, 60); },
    melee() { noise(0.07, 0.2, 700); },
    crash(strength = 1) { noise(0.22, 0.3 * strength, 500); tone(70, 0.2, 'sine', 0.25 * strength, 40); },
    pickup() { tone(880, 0.09, 'sine', 0.18); tone(1320, 0.14, 'sine', 0.18, 0, 0.07); },
    cash() { tone(1180, 0.07, 'square', 0.1); tone(1560, 0.12, 'square', 0.1, 0, 0.06); },
    sting() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, 0, i * 0.11)); },
    fail() { tone(330, 0.25, 'sawtooth', 0.14, 220); tone(220, 0.4, 'sawtooth', 0.14, 150, 0.2); },
    enter() { tone(300, 0.08, 'sine', 0.12, 420); },
    hurt() { tone(180, 0.12, 'square', 0.15, 90); },
  };
}
