/** @vitest-environment jsdom */
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/audio-manager.js', () => ({
  AudioManager: vi.fn().mockImplementation(() => ({
    ctx: { sampleRate: 44100, state: 'running' },
    getAnalyser: vi.fn(),
    getChordAnalyser: vi.fn(),
    getCurrentRms: vi.fn(() => 0),
    setVolume: vi.fn(),
    toggleShuffle: vi.fn(),
    toggleRepeat: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    getCurrentSource: vi.fn(() => ({ currentTime: 0, duration: 0, paused: true })),
    on: vi.fn(),
    addFilesToQueue: vi.fn(),
    playNext: vi.fn(),
    playPrev: vi.fn(),
    seek: vi.fn(),
    getFilters: vi.fn(() => []),
    setChordFftSize: vi.fn(),
    clearQueue: vi.fn(),
    getQueue: vi.fn(() => [])
  }))
}));

vi.mock('../src/js/visualizer.js', () => ({
  Visualizer: vi.fn().mockImplementation(() => ({ start: vi.fn(), draw: vi.fn(), fpsCap: 0, setMode: vi.fn() }))
}));

vi.mock('../src/js/chord-detector.js', () => ({
  ChordDetector: vi.fn().mockImplementation(() => ({
    setOnChord: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    getDiagnostics: vi.fn().mockReturnValue({ noiseFloor:0, activeBins:0, confidence:0, spectralClarity:0, dynamicGate:0 })
  }))
}));

import { Renderer } from '../src/js/renderer.js';

describe('Saved queues', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    window.electronAPI = {
      minimizeWindow: vi.fn(),
      maximizeWindow: vi.fn(),
      closeWindow: vi.fn(),
      selectAudioFiles: vi.fn(),
      pathsToFileUrls: vi.fn(async (paths) => paths.map(p => ({ path: p, name: p.split('/').pop(), url: `file://${p}` }))),
      checkPathsExist: vi.fn(async (paths) => paths.map((_, i) => i % 2 === 0)) // true,false,true,...
    };
    document.body.innerHTML = `
      <button id="add-files-btn"></button>
      <button id="clear-queue-btn"></button>
      <ul id="queue"></ul>
      <div id="current-track-name"></div>
      <div id="current-track-duration"></div>
      <div id="chord-readout"></div>
      <div id="diag"></div>
      <button id="play-pause-btn"></button>
      <span id="play-icon"></span>
      <span id="pause-icon"></span>
      <button id="next-btn"></button>
      <button id="prev-btn"></button>
      <input id="progress-bar" type="range" />
      <input id="volume-slider" type="range" />
      <button id="shuffle-btn"></button>
      <button id="repeat-btn"></button>
      <button id="toggle-eq-btn"></button>
      <button id="toggle-chords-btn"></button>
      <div id="eq-controls"></div>
      <button id="dark-mode-toggle"></button>
      <button id="minimize-btn"></button>
      <button id="maximize-btn"></button>
      <button id="close-btn"></button>
      <canvas id="visualizer"></canvas>
      <button id="app-menu-btn"></button>
      <div id="app-menu"></div>
      <div id="queue-save-modal" class="hidden"></div>
      <input id="queue-name-input" />
      <button id="queue-save-confirm"></button>
      <button id="queue-save-cancel"></button>
    `;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({});
  });

  it('loads a saved queue and skips missing files', async () => {
    const r = new Renderer();
    // Seed a saved queue of 3 items
    localStorage.setItem('savedQueues', JSON.stringify({
      Test: { items: [
        { path: '/p/a.mp3', name: 'a' },
        { path: '/p/b.mp3', name: 'b' },
        { path: '/p/c.mp3', name: 'c' }
      ] }
    }));

    // Load
    await r.loadQueueByName('Test');
    // PathsExist true,false,true -> addFilesToQueue should be called with 2 items
    const am = r.audioManager;
    expect(am.clearQueue).toHaveBeenCalledTimes(1);
    expect(am.addFilesToQueue).toHaveBeenCalledTimes(1);
    const args = am.addFilesToQueue.mock.calls[0][0];
    expect(args.length).toBe(2);
    expect(args[0].path).toBe('/p/a.mp3');
    expect(args[1].path).toBe('/p/c.mp3');
  });
});

