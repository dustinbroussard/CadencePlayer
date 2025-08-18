import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioManager } from '../src/js/audio-manager.js';

describe('AudioManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses MediaElementSource when replaying the same track', () => {
    global.document = { addEventListener: vi.fn() };

    class FakeNode {
      constructor() {
        this.connect = vi.fn();
        this.disconnect = vi.fn();
      }
    }

    class FakeAnalyser extends FakeNode {
      constructor() {
        super();
        this.fftSize = 0;
        this.smoothingTimeConstant = 0;
        this.minDecibels = 0;
        this.maxDecibels = 0;
      }
    }

    class FakeGain extends FakeNode {
      constructor() {
        super();
        this.gain = { value: 1 };
      }
    }

    class FakeFilter extends FakeNode {
      constructor() {
        super();
        this.frequency = { value: 0 };
        this.gain = { value: 0 };
        this.Q = { value: 0 };
      }
    }

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

    const mgr = new AudioManager();
    const audio = { play: vi.fn(), pause: vi.fn(), currentTime: 0 };
    mgr.queue = [{ audio, name: 't', path: 'p', duration: 0, source: null }];

    mgr.playTrack(0);
    mgr.playTrack(0);

    expect(createMediaElementSource).toHaveBeenCalledTimes(1);
  });
});

