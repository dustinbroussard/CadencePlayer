import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AudioManager } from '../src/js/audio-manager.js';
import { setupAudioContextMocks } from './helpers/audio-context-mock.js';

describe('AudioManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses MediaElementSource when replaying the same track', () => {
    const { createMediaElementSource } = setupAudioContextMocks();

    const mgr = new AudioManager();
    const audio = { play: vi.fn(), pause: vi.fn(), currentTime: 0 };
    mgr.queue = [{ audio, name: 't', path: 'p', duration: 0, source: null }];

    mgr.playTrack(0);
    mgr.playTrack(0);

    expect(createMediaElementSource).toHaveBeenCalledTimes(1);
  });
});
