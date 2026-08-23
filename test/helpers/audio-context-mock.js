import { vi } from 'vitest';

export class FakeNode {
  constructor() {
    this.connect = vi.fn();
    this.disconnect = vi.fn();
  }
}

export class FakeAnalyser extends FakeNode {
  constructor() {
    super();
    this.fftSize = 0;
    this.smoothingTimeConstant = 0;
    this.minDecibels = 0;
    this.maxDecibels = 0;
    this.frequencyBinCount = 1024;
  }

  getByteFrequencyData(array) {
    if (array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.sin(i) * 128 + 128;
      }
    }
  }

  getByteTimeDomainData(array) {
    if (array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = 128;
      }
    }
  }
}

export class FakeGain extends FakeNode {
  constructor() {
    super();
    this.gain = { value: 1 };
  }
}

export class FakeFilter extends FakeNode {
  constructor() {
    super();
    this.frequency = { value: 0 };
    this.gain = { value: 0 };
    this.Q = { value: 0 };
  }
}

export function setupAudioContextMocks() {
  global.document = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const createMediaElementSource = vi.fn((audio) => {
    if (audio._connected) throw new Error('already connected');
    audio._connected = true;
    const node = new FakeNode();
    node.mediaElement = audio;
    return node;
  });

  class FakeAudioContext {
    constructor() {
      this.createAnalyser = vi.fn(() => new FakeAnalyser());
      this.createBiquadFilter = vi.fn(() => new FakeFilter());
      this.createGain = vi.fn(() => new FakeGain());
      this.createMediaElementSource = createMediaElementSource;
      this.destination = new FakeNode();
      this.state = 'running';
    }
  }

  global.AudioContext = FakeAudioContext;

  return {
    createMediaElementSource,
    FakeNode,
    FakeAnalyser,
    FakeGain,
    FakeFilter,
    FakeAudioContext
  };
}
