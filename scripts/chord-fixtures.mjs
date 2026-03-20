const NOTE_OFFSETS = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11
};

export const CHORD_FIXTURES = [
  {
    id: 'c-major-open',
    expected: 'C',
    notes: [
      { pitch: 'C3', gain: 1.0 },
      { pitch: 'G3', gain: 0.85 },
      { pitch: 'C4', gain: 0.95 },
      { pitch: 'E4', gain: 0.82 },
      { pitch: 'G4', gain: 0.72 }
    ],
    durationMs: 1800,
    strumMs: 14,
    noiseAmount: 0.002,
    vibratoHz: 5.2,
    vibratoCents: 2
  },
  {
    id: 'a-minor-strum',
    expected: 'Am',
    notes: [
      { pitch: 'A2', gain: 0.92 },
      { pitch: 'E3', gain: 0.7 },
      { pitch: 'A3', gain: 1.0 },
      { pitch: 'C4', gain: 0.9 },
      { pitch: 'E4', gain: 0.76 }
    ],
    durationMs: 1900,
    strumMs: 18,
    noiseAmount: 0.0025,
    vibratoHz: 4.8,
    vibratoCents: 3,
    detuneCents: -2
  },
  {
    id: 'g7-voiced',
    expected: 'G7',
    notes: [
      { pitch: 'G2', gain: 0.95 },
      { pitch: 'F3', gain: 0.76 },
      { pitch: 'B3', gain: 0.8 },
      { pitch: 'D4', gain: 0.7 },
      { pitch: 'G4', gain: 0.62 }
    ],
    durationMs: 2000,
    strumMs: 12,
    noiseAmount: 0.002,
    vibratoHz: 5.4,
    vibratoCents: 2
  },
  {
    id: 'dsus4-piano',
    expected: 'Dsus4',
    notes: [
      { pitch: 'D3', gain: 1.0 },
      { pitch: 'A3', gain: 0.72 },
      { pitch: 'G4', gain: 0.82 }
    ],
    durationMs: 1500,
    strumMs: 0,
    noiseAmount: 0.0012,
    attackMs: 10,
    decayMs: 220,
    sustainLevel: 0.64
  },
  {
    id: 'e5-power',
    expected: 'E5',
    notes: [
      { pitch: 'E2', gain: 1.0 },
      { pitch: 'B2', gain: 0.72 },
      { pitch: 'E3', gain: 0.92 },
      { pitch: 'B3', gain: 0.66 }
    ],
    durationMs: 1400,
    strumMs: 9,
    noiseAmount: 0.0035,
    vibratoHz: 5.0,
    vibratoCents: 1.5
  }
];

const DEFAULT_PARTIALS = [
  { multiple: 1, gain: 1.0 },
  { multiple: 2, gain: 0.43 },
  { multiple: 3, gain: 0.22 },
  { multiple: 4, gain: 0.1 }
];

const normalizeNote = (note) => {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note);
  if (!match) throw new Error(`Invalid note: ${note}`);
  return { name: match[1], octave: Number(match[2]) };
};

export const noteToFrequency = (note) => {
  const { name, octave } = normalizeNote(note);
  const semitone = NOTE_OFFSETS[name];
  if (semitone == null) throw new Error(`Unknown note name: ${name}`);
  const midi = semitone + (octave + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
};

const createPrng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const envelopeAt = (timeSec, noteStartSec, durationSec, options) => {
  const attackSec = (options.attackMs ?? 18) / 1000;
  const decaySec = (options.decayMs ?? 160) / 1000;
  const releaseSec = (options.releaseMs ?? 180) / 1000;
  const sustain = options.sustainLevel ?? 0.72;
  const localTime = timeSec - noteStartSec;
  if (localTime <= 0 || localTime >= durationSec + releaseSec) return 0;
  if (localTime < attackSec) return localTime / Math.max(attackSec, 1e-6);
  if (localTime < attackSec + decaySec) {
    const decayT = (localTime - attackSec) / Math.max(decaySec, 1e-6);
    return 1 - ((1 - sustain) * decayT);
  }
  if (localTime < durationSec) return sustain;
  const releaseT = (localTime - durationSec) / Math.max(releaseSec, 1e-6);
  return sustain * Math.max(0, 1 - releaseT);
};

export const renderChordSignal = (fixture, {
  sampleRate = 44100,
  extraTailMs = 240
} = {}) => {
  const durationMs = fixture.durationMs ?? 1600;
  const totalDurationSec = (durationMs + extraTailMs) / 1000;
  const totalSamples = Math.ceil(totalDurationSec * sampleRate);
  const signal = new Float32Array(totalSamples);
  const prng = createPrng(
    fixture.seed ??
    [...fixture.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0xC0DA)
  );
  const detuneCents = fixture.detuneCents ?? 0;
  const vibratoHz = fixture.vibratoHz ?? 0;
  const vibratoDepth = (fixture.vibratoCents ?? 0) / 1200;
  const noteSpacingSec = (fixture.strumMs ?? 0) / 1000;
  const noteDurationSec = durationMs / 1000;

  fixture.notes.forEach((note, noteIndex) => {
    const baseFrequency = noteToFrequency(note.pitch) * Math.pow(2, detuneCents / 1200);
    const startSec = noteIndex * noteSpacingSec;
    for (let i = 0; i < totalSamples; i++) {
      const timeSec = i / sampleRate;
      const env = envelopeAt(timeSec, startSec, noteDurationSec, fixture);
      if (env <= 0) continue;
      const vibratoFactor = vibratoHz > 0
        ? Math.pow(2, Math.sin(2 * Math.PI * vibratoHz * timeSec) * vibratoDepth)
        : 1;
      let sample = 0;
      for (const partial of (fixture.partials || DEFAULT_PARTIALS)) {
        const frequency = baseFrequency * partial.multiple * vibratoFactor;
        const phase = 2 * Math.PI * frequency * (timeSec - startSec);
        sample += Math.sin(phase) * partial.gain;
      }
      signal[i] += sample * (note.gain ?? 1) * env;
    }
  });

  const noiseAmount = fixture.noiseAmount ?? 0;
  if (noiseAmount > 0) {
    for (let i = 0; i < totalSamples; i++) {
      signal[i] += (prng() * 2 - 1) * noiseAmount;
    }
  }

  let peak = 0;
  for (let i = 0; i < totalSamples; i++) peak = Math.max(peak, Math.abs(signal[i]));
  if (peak > 0) {
    const gain = 0.92 / peak;
    for (let i = 0; i < totalSamples; i++) signal[i] *= gain;
  }

  return signal;
};

const hannWindow = (frame, size) => {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    out[i] = (frame[i] || 0) * w;
  }
  return out;
};

const bitReverse = (index, bits) => {
  let reversed = 0;
  for (let i = 0; i < bits; i++) {
    reversed = (reversed << 1) | ((index >> i) & 1);
  }
  return reversed;
};

const fftInPlace = (real, imag) => {
  const size = real.length;
  const levels = Math.log2(size);
  for (let i = 0; i < size; i++) {
    const j = bitReverse(i, levels);
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2;
    const step = (-2 * Math.PI) / span;
    for (let start = 0; start < size; start += span) {
      for (let i = 0; i < half; i++) {
        const angle = step * i;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const evenIndex = start + i;
        const oddIndex = evenIndex + half;
        const tre = (real[oddIndex] * cos) - (imag[oddIndex] * sin);
        const tim = (real[oddIndex] * sin) + (imag[oddIndex] * cos);
        real[oddIndex] = real[evenIndex] - tre;
        imag[oddIndex] = imag[evenIndex] - tim;
        real[evenIndex] += tre;
        imag[evenIndex] += tim;
      }
    }
  }
};

export const signalFrameToDbBins = (frame, fftSize) => {
  const windowed = hannWindow(frame, fftSize);
  const real = Float64Array.from(windowed);
  const imag = new Float64Array(fftSize);
  fftInPlace(real, imag);
  const out = new Float32Array(fftSize / 2);
  for (let i = 0; i < out.length; i++) {
    const magnitude = Math.hypot(real[i], imag[i]) / Math.max(1, fftSize / 2);
    out[i] = 20 * Math.log10(Math.max(1e-8, magnitude));
  }
  return out;
};

export const buildFixtureFrames = (fixture, {
  sampleRate = 44100,
  fftSize = 4096,
  hopSize = 1024
} = {}) => {
  const signal = renderChordSignal(fixture, { sampleRate });
  const frames = [];
  for (let start = 0; start + fftSize <= signal.length; start += hopSize) {
    const frame = signal.subarray(start, start + fftSize);
    frames.push(signalFrameToDbBins(frame, fftSize));
  }
  return {
    signal,
    frames,
    fftSize,
    hopSize,
    sampleRate,
    frameDurationMs: hopSize / sampleRate * 1000
  };
};

export const createFrameAnalyser = (frames, fftSize) => {
  let index = 0;
  return {
    fftSize,
    setFrame(nextIndex) {
      index = Math.max(0, Math.min(nextIndex, frames.length - 1));
    },
    getFloatFrequencyData(out) {
      out.set(frames[index] || new Float32Array(out.length));
    }
  };
};
