// Every sound is synthesized with WebAudio: no audio files, no network. One shared noise
// buffer is filtered and shaped for gunshots and explosions; short oscillators make the
// beeps, clicks and chimes. The context is created on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function burst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0) {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration);
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
    shot(kind) {
      if (kind === 'rifle') { burst(0.14, 900, 0.9); tone(160, 0.09, 0.35, 'square', 60); }
      else if (kind === 'smg') { burst(0.1, 1400, 0.7); tone(220, 0.06, 0.25, 'square', 90); }
      else { burst(0.12, 700, 0.8); tone(130, 0.1, 0.4, 'square', 50); }
    },
    distantShot() { burst(0.18, 420, 0.22); },
    dry() { tone(1200, 0.04, 0.15, 'square'); },
    reload() { tone(900, 0.05, 0.18, 'square'); setTimeout(() => tone(620, 0.05, 0.18, 'square'), 160); },
    hit() { tone(1400, 0.06, 0.25, 'sine'); },
    kill() { tone(880, 0.09, 0.3, 'sine'); setTimeout(() => tone(1320, 0.12, 0.3, 'sine'), 90); },
    hurt() { tone(180, 0.15, 0.35, 'sawtooth', 90); },
    beep() { tone(1046, 0.09, 0.25, 'sine'); },
    plantTick() { tone(1568, 0.06, 0.2, 'sine'); },
    explosion() {
      burst(0.9, 240, 1.0);
      tone(70, 0.7, 0.6, 'sine', 32);
    },
    grenadePin() { tone(2000, 0.03, 0.2, 'square'); },
    roundWin() {
      tone(523, 0.14, 0.3, 'sine');
      setTimeout(() => tone(659, 0.14, 0.3, 'sine'), 140);
      setTimeout(() => tone(784, 0.22, 0.3, 'sine'), 280);
    },
    roundLose() {
      tone(392, 0.16, 0.3, 'sine');
      setTimeout(() => tone(311, 0.26, 0.3, 'sine'), 170);
    },
    buy() { tone(1046, 0.07, 0.22, 'sine'); setTimeout(() => tone(1318, 0.1, 0.22, 'sine'), 70); },
    denied() { tone(220, 0.12, 0.25, 'square', 160); },
  };
}
