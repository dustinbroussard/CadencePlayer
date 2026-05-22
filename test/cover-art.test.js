/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const currentTrack = {
  path: '/music/example.mp3',
  name: 'example.mp3',
  meta: {}
};

const embeddedCover = {
  coverArt: {
    url: 'data:image/png;base64,ZW1iZWRkZWQ=',
    source: 'embedded',
    placeholder: false
  }
};

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
    getCurrentTrack: vi.fn(() => currentTrack),
    getCurrentIndex: vi.fn(() => 0),
    getQueue: vi.fn(() => [currentTrack])
  }))
}));

vi.mock('../src/js/visualizer.js', () => ({
  Visualizer: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    draw: vi.fn(),
    fpsCap: 0,
    setMode: vi.fn(),
    setCoverArt: vi.fn(),
    setTheme: vi.fn(),
    setConfig: vi.fn()
  }))
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

describe('Cover art behavior', () => {
  beforeEach(() => {
    currentTrack.meta = structuredClone(embeddedCover);
    localStorage.clear();
    document.body.className = '';
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    window.electronAPI = {
      minimizeWindow: vi.fn(),
      maximizeWindow: vi.fn(),
      closeWindow: vi.fn(),
      selectAudioFiles: vi.fn(),
      writeMetadata: vi.fn(),
      readMetadata: vi.fn(async () => ({ success: true, tags: structuredClone(embeddedCover) })),
      selectCoverArtFile: vi.fn(),
      uploadCustomCover: vi.fn(async () => ({
        success: true,
        coverArt: {
          url: 'app-data://custom',
          source: 'override',
          placeholder: false
        }
      })),
      clearCustomCover: vi.fn(async () => ({ success: true }))
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
      <button id="visual-mode-btn"></button>
      <button id="visual-settings-btn"></button>
      <div id="viz-controls"></div>
      <div id="video-container"></div>
      <div id="video-overlay"></div>
      <button id="video-playpause"></button>
      <span id="video-play-icon"></span>
      <span id="video-pause-icon"></span>
      <input id="video-seek" type="range" />
      <button id="video-mode-chip"></button>
      <span id="video-chip-text"></span>
      <button id="toggle-chords-btn"></button>
      <div id="eq-controls"></div>
      <button id="dark-mode-toggle"></button>
      <button id="minimize-btn"></button>
      <button id="maximize-btn"></button>
      <button id="close-btn"></button>
      <div id="visualizer-container">
        <canvas id="visualizer"></canvas>
        <div id="cover-art-stage">
          <button id="cover-art-cta" class="hidden"></button>
          <div id="cover-drop-zone" class="hidden"></div>
          <div class="cover-frame is-active"><img class="cover-art-image" /></div>
          <div class="cover-frame"><img class="cover-art-image" /></div>
        </div>
      </div>
    `;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({});
  });

  it('uses resolved cover art url', () => {
    const r = new Renderer();

    expect(r.getCoverArtDataUrl(currentTrack)).toBe('data:image/png;base64,ZW1iZWRkZWQ=');
  });

  it('removes a custom cover and reloads metadata art', async () => {
    currentTrack.meta.coverArt = {
      url: 'app-data://custom',
      source: 'override',
      placeholder: false
    };
    const r = new Renderer();
    await r.removeCustomCoverArt();

    expect(window.electronAPI.clearCustomCover).toHaveBeenCalledWith(currentTrack.path);
    expect(r.visualizer.setCoverArt).toHaveBeenCalledWith('data:image/png;base64,ZW1iZWRkZWQ=');
  });

  it('redraws immediately when switching into cover mode', () => {
    localStorage.setItem('vizMode', 'particles');

    const r = new Renderer();
    r.cycleVisualization();

    expect(r.visualizer.setMode).toHaveBeenCalledWith('cover');
    expect(r.visualizer.draw).toHaveBeenCalled();
  });
});
