import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AudioManager } from '../src/js/audio-manager.js';
import { setupAudioContextMocks } from './helpers/audio-context-mock.js';

describe('AudioManager queue ops', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('removeTrackAt cleans up and advances when removing current', () => {
    const { createMediaElementSource } = setupAudioContextMocks();
    const mgr = new AudioManager();
    const mk = (name) => ({ name, path: name, audio: { play: vi.fn(), pause: vi.fn(), currentTime: 0 }, duration: 0, isVideo: false, source: null });
    mgr.queue = [mk('a'), mk('b'), mk('c')];
    // Start playing index 1
    mgr.playTrack(1);
    expect(createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(mgr.currentIndex).toBe(1);
    expect(mgr.isPlaying).toBe(true);

    // Remove the currently playing track
    mgr.removeTrackAt(1);
    // Should advance to what was next (now at same index), keep playing
    expect(mgr.queue.map(t => t.name)).toEqual(['a','c']);
    expect(mgr.currentIndex).toBe(1);
    expect(mgr.isPlaying).toBe(true);
  });

  it('moveTrackToNext reorders relative to current and preserves indices', () => {
    setupAudioContextMocks();
    const mgr = new AudioManager();
    const mk = (name) => ({ name, path: name, audio: {}, duration: 0, isVideo: false, source: null });
    mgr.queue = [mk('a'), mk('b'), mk('c'), mk('d')];
    mgr.currentIndex = 2; // playing 'c'

    // Move 'a' to play next after current 'c'
    mgr.moveTrackToNext(0);
    expect(mgr.queue.map(t => t.name)).toEqual(['b','c','a','d']);
    expect(mgr.currentIndex).toBe(1); // current shifts left as item before moved past it

    // Moving already-next should no-op
    mgr.moveTrackToNext(2); // 'a' is already next
    expect(mgr.queue.map(t => t.name)).toEqual(['b','c','a','d']);
    expect(mgr.currentIndex).toBe(1);
  });
});

