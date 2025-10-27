import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AudioManager } from '../src/js/audio-manager.js';

describe('AudioManager.moveTrack', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function setupAudioContextMocks() {
    global.document = { addEventListener: vi.fn() };

    class FakeNode {
      constructor() { this.connect = vi.fn(); this.disconnect = vi.fn(); }
    }
    class FakeAnalyser extends FakeNode { constructor(){ super(); this.fftSize=0; this.smoothingTimeConstant=0; this.minDecibels=0; this.maxDecibels=0; } }
    class FakeGain extends FakeNode { constructor(){ super(); this.gain = { value: 1 }; } }
    class FakeFilter extends FakeNode { constructor(){ super(); this.frequency={value:0}; this.gain={value:0}; this.Q={value:0}; } }
    class FakeAudioContext {
      constructor(){
        this.createAnalyser = vi.fn(() => new FakeAnalyser());
        this.createBiquadFilter = vi.fn(() => new FakeFilter());
        this.createGain = vi.fn(() => new FakeGain());
        this.createMediaElementSource = vi.fn((audio) => { const n=new FakeNode(); n.mediaElement = audio; return n; });
        this.destination = new FakeNode();
        this.state = 'running';
      }
    }
    global.AudioContext = FakeAudioContext;
  }

  it('updates currentIndex correctly when moving tracks', () => {
    setupAudioContextMocks();
    const mgr = new AudioManager();
    const mk = (name) => ({ name, path: name, audio: {}, duration: 0, isVideo: false, source: null });
    mgr.queue = [mk('a'), mk('b'), mk('c'), mk('d')];
    mgr.currentIndex = 1; // playing 'b'
    mgr.isPlaying = true;

    // Move 'a'(0) to after current ('b' at 1) => toIndex 2
    mgr.moveTrack(0, 2);
    expect(mgr.queue.map(t => t.name)).toEqual(['b','a','c','d']);
    // currentIndex should shift down by 1 because an item before current moved past it
    expect(mgr.currentIndex).toBe(0);

    // Move current item ('b' at index 0) to last
    mgr.moveTrack(0, 3);
    expect(mgr.queue.map(t => t.name)).toEqual(['a','c','d','b']);
    expect(mgr.currentIndex).toBe(3);
  });
});

