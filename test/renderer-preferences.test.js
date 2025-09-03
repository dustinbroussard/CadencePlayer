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

describe('Renderer preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    window.electronAPI = {
      minimizeWindow: vi.fn(),
      maximizeWindow: vi.fn(),
      closeWindow: vi.fn(),
      selectAudioFiles: vi.fn()
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

  it('applies saved preferences on load', () => {
    localStorage.setItem('volume', '0.4');
    localStorage.setItem('darkMode', 'true');
    localStorage.setItem('chordsEnabled', 'false');
    localStorage.setItem('chordMode', 'accurate');
    const r = new Renderer();
    expect(r.volumeSlider.value).toBe('0.4');
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(r.chordsEnabled).toBe(false);
    expect(r.chordMode).toBe('accurate');
  });

  it('persists changes to preferences', () => {
    const r = new Renderer();
    r.volumeSlider.value = '0.7';
    r.volumeSlider.dispatchEvent(new Event('input'));
    expect(localStorage.getItem('volume')).toBe('0.7');

    expect(document.body.classList.contains('dark-mode')).toBe(false);
    r.toggleDarkMode();
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');

    r.toggleChords();
    expect(localStorage.getItem('chordsEnabled')).toBe('false');

    r.cycleChordMode();
    expect(localStorage.getItem('chordMode')).toBe(r.chordMode);
  });
});
