"use client";

// Tasteful, dependency-free trade feedback: a confetti burst + a bright chord
// on a win, a short low tone on a loss. All best-effort — never throws, and a
// muted flag (localStorage "st_sound=off") silences audio.

function soundOn(): boolean {
  try {
    return localStorage.getItem("st_sound") !== "off";
  } catch {
    return true;
  }
}

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

// Call this from a user gesture (e.g. placing a trade) so the audio context is
// created + resumed while a gesture is active. Browsers block audio started
// later (at settle time) unless the context was unlocked during a gesture —
// this is why trades could settle silently.
export function primeAudio(): void {
  if (!soundOn()) return;
  ctx();
}

function tone(freq: number, start: number, dur: number, gain = 0.14, type: OscillatorType = "sine") {
  const ac = ctx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ac.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* ignore */
  }
}

export function playWinSound() {
  if (!soundOn()) return;
  // Rising major arpeggio.
  tone(523.25, 0, 0.18); // C5
  tone(659.25, 0.09, 0.18); // E5
  tone(783.99, 0.18, 0.28); // G5
}

export function playLoseSound() {
  if (!soundOn()) return;
  tone(196, 0, 0.28, 0.1, "triangle"); // low G3 thud
}

export function celebrateWin() {
  // Confetti removed by request — keep just the win sound.
  playWinSound();
}

export function signalLoss() {
  playLoseSound();
}
