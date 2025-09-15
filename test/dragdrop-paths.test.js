/** @vitest-environment jsdom */
import { beforeEach, describe, it, expect, vi } from 'vitest';

// Mock modules used by Renderer
vi.mock('../src/js/audio-manager.js', () => ({
  AudioManager: vi.fn().mockImplementation(() => ({
    ctx: { sampleRate: 44100, state: 'running' },
    getAnalyser: vi.fn(),
    getChordAnalyser: vi.fn(),
    getCurrentRms: vi.fn(() => 0.05),
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
  }))
}));

vi.mock('../src/js/visualizer.js', () => ({
  Visualizer: vi.fn().mockImplementation(() => ({ start: vi.fn(), draw: vi.fn(), fpsCap: 0 }))
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
import { AudioManager } from '../src/js/audio-manager.js';

describe('Drag-and-drop path normalization', () => {
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
      pathsToFileUrls: vi.fn(async (paths) => paths.map(p => ({ path: p, name: p.split('/').pop(), url: `file://${p}` })))
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
    `;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({});
  });

  it('uses main-process API to normalize dropped file paths', async () => {
    new Renderer();
    const mgr = AudioManager.mock.results[0].value; // instance used by Renderer

    // Construct a synthetic drop event with mixed files
    const dropEvent = new Event('drop');
    const files = [
      { path: '/music/test1.mp3', name: 'test1.mp3', type: 'audio/mp3' },
      { path: '/music/test2.wav', name: 'test2.wav', type: 'audio/wav' },
      { path: '/docs/readme.txt', name: 'readme.txt', type: 'text/plain' }
    ];
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files },
      writable: false
    });

    document.body.dispatchEvent(dropEvent);

    // Await microtasks to allow async handler to complete
    await Promise.resolve();

    expect(window.electronAPI.pathsToFileUrls).toHaveBeenCalledTimes(1);
    const calledWith = window.electronAPI.pathsToFileUrls.mock.calls[0][0];
    expect(calledWith).toEqual(['/music/test1.mp3', '/music/test2.wav']);

    expect(mgr.addFilesToQueue).toHaveBeenCalledTimes(1);
    const normalized = mgr.addFilesToQueue.mock.calls[0][0];
    expect(normalized[0]).toEqual({ path: '/music/test1.mp3', name: 'test1.mp3', url: 'file:///music/test1.mp3' });
  });
});
