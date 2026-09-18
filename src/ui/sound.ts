/* ============================================================================
 * Sons de synthèse (WebAudio) — aucun fichier externe, latence minimale.
 * Tous les sons sont optionnels : le jeu reste parfaitement jouable en silence.
 * ==========================================================================*/

type Voice = 'click' | 'place' | 'deal' | 'trick' | 'score' | 'belote' | 'win' | 'lose' | 'select' | 'error';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.7;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function setVolume(v: number): void {
  volume = v;
  if (master) master.gain.value = v;
}

export function unlockAudio(): void {
  ac();
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  return buf;
}

function tone(c: AudioContext, freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, glide?: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + delay);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, c.currentTime + delay + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + delay + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
  o.connect(g);
  g.connect(master!);
  o.start(c.currentTime + delay);
  o.stop(c.currentTime + delay + dur + 0.05);
}

function noise(c: AudioContext, dur: number, gain: number, freq: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass'): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master!);
  src.start(c.currentTime + delay);
}

export function playSound(voice: Voice): void {
  if (!enabled) return;
  const c = ac();
  if (!c || !master) return;
  switch (voice) {
    case 'select':
      tone(c, 880, 0.05, 'triangle', 0.06);
      break;
    case 'click':
      noise(c, 0.05, 0.12, 2600, 1.2);
      tone(c, 1400, 0.04, 'square', 0.03);
      break;
    case 'place':
      noise(c, 0.09, 0.22, 1500, 0.8);
      tone(c, 200, 0.12, 'sine', 0.14);
      break;
    case 'deal':
      for (let i = 0; i < 6; i++) {
        noise(c, 0.07, 0.09, 1800 + i * 120, 1.1, i * 0.075);
      }
      break;
    case 'trick':
      tone(c, 523.25, 0.16, 'triangle', 0.1);
      tone(c, 784, 0.22, 'triangle', 0.08, 0.08);
      break;
    case 'score':
      [523.25, 659.25, 783.99].forEach((f, i) => tone(c, f, 0.18, 'triangle', 0.07, i * 0.07));
      break;
    case 'belote':
      [1046.5, 1318.5, 1568].forEach((f, i) => tone(c, f, 0.5, 'sine', 0.11, i * 0.06));
      noise(c, 0.5, 0.05, 4200, 2, 0, 'highpass');
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, 0.6, 'triangle', 0.11, i * 0.13));
      break;
    case 'lose':
      [392, 349.23, 293.66].forEach((f, i) => tone(c, f, 0.5, 'sine', 0.09, i * 0.16));
      break;
    case 'error':
      tone(c, 180, 0.16, 'sawtooth', 0.07, 0, 120);
      break;
  }
}

export function vibrate(pattern: number | number[], enabled: boolean): void {
  if (!enabled) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}
