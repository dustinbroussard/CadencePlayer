import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Visualizer } from '../src/js/visualizer.js';
import { FakeAnalyser } from './helpers/audio-context-mock.js';

describe('Visualizer', () => {
  let mockContext;
  let mockCanvas;
  let analyser;

  beforeEach(() => {
    vi.restoreAllMocks();

    const mockGradient = {
      addColorStop: vi.fn(),
    };

    mockContext = {
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      drawImage: vi.fn(),
      createRadialGradient: vi.fn(() => mockGradient),
      createLinearGradient: vi.fn(() => mockGradient),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      shadowBlur: 0,
      shadowColor: '',
      globalCompositeOperation: 'source-over',
    };

    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      clientWidth: 800,
      clientHeight: 600,
      offsetWidth: 800,
      offsetHeight: 600,
      style: {},
      width: 800,
      height: 600,
    };

    global.document.getElementById = vi.fn((id) => {
      if (id === 'my-canvas') return mockCanvas;
      return null;
    });

    global.document.createElement = vi.fn((tag) => {
      if (tag === 'canvas') {
        return {
          getContext: vi.fn(() => mockContext),
          width: 800,
          height: 600,
          style: {}
        };
      }
      return {};
    });

    global.window.devicePixelRatio = 2;
    global.window.addEventListener = vi.fn();

    analyser = new FakeAnalyser();
  });

  it('can be instantiated and resizes canvas', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    expect(visualizer.canvas).toBe(mockCanvas);
    expect(visualizer.canvasCtx).toBe(mockContext);
    expect(visualizer.cssWidth).toBe(800);
    expect(visualizer.cssHeight).toBe(600);
    expect(mockCanvas.width).toBe(1600);
    expect(mockCanvas.height).toBe(1200);
    expect(mockContext.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('supports mode switching', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    expect(visualizer.mode).toBe('orb');

    visualizer.setMode('bars');
    expect(visualizer.mode).toBe('bars');

    visualizer.setMode('invalid-mode');
    expect(visualizer.mode).toBe('orb');
  });

  it('supports theme changes', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    expect(visualizer.themeName).toBe('neon');

    visualizer.setTheme('sunset');
    expect(visualizer.themeName).toBe('sunset');

    visualizer.setTheme('invalid-theme');
    expect(visualizer.themeName).toBe('neon');
  });

  it('draws correct elements in orb mode', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    visualizer.setMode('orb');
    
    analyser.frequencyBinCount = 128;
    visualizer.draw();

    expect(mockContext.clearRect).toHaveBeenCalled();
    expect(mockContext.beginPath).toHaveBeenCalled();
    expect(mockContext.arc).toHaveBeenCalled();
    expect(mockContext.fill).toHaveBeenCalled();
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it('draws correct elements in bars mode', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    visualizer.setMode('bars');
    visualizer.draw();

    expect(mockContext.clearRect).toHaveBeenCalled();
    expect(mockContext.fillRect).toHaveBeenCalled();
  });

  it('draws correct elements in wave mode', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    visualizer.setMode('wave');
    visualizer.draw();

    expect(mockContext.clearRect).toHaveBeenCalled();
    expect(mockContext.beginPath).toHaveBeenCalled();
    expect(mockContext.moveTo).toHaveBeenCalled();
    expect(mockContext.lineTo).toHaveBeenCalled();
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it('draws correct elements in spectrogram mode', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    visualizer.setMode('spectrogram');
    visualizer.draw();

    expect(mockContext.clearRect).toHaveBeenCalled();
    expect(mockContext.drawImage).toHaveBeenCalled();
  });

  it('draws correct elements in particles mode', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    visualizer.setMode('particles');
    
    visualizer.draw();
    expect(mockContext.fillRect).toHaveBeenCalled();
    expect(mockContext.arc).toHaveBeenCalled();
    expect(mockContext.fill).toHaveBeenCalled();
  });

  it('draws correct elements in cover mode', () => {
    const visualizer = new Visualizer('my-canvas', analyser);
    visualizer.setMode('cover');
    visualizer.draw();

    expect(mockContext.clearRect).toHaveBeenCalled();
    expect(mockContext.fillRect).toHaveBeenCalled();
    expect(mockContext.arc).toHaveBeenCalled();
  });
});
